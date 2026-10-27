// ======================================================================
// Planner: Geheimbereich (geheimes Zeichen, PIN, Sperre)
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================
//
// Geheime Notizen (note.secret) erscheinen in keiner Liste, Suche oder Zählung.
// Sie öffnen sich nur im Geheimbereich. Den erreichst du auf zwei Wegen:
//   1) Du zeichnest dein geheimes Zeichen mit dem Finger im Kopfbereich des Planners.
//   2) Du hältst in den Einstellungen die Versionszeile gedrückt und gibst deine PIN ein.
// Das ist ein Schutz vor neugierigen Blicken, keine Verschlüsselung: Die Daten liegen im Klartext im Speicher.

const SECRET_LOCK_MS = 30000;
let secretUnlocked = false;
let secretTimer = null;

const secretConfigured = () => !!(planner.secret && planner.secret.templates.length);

// ---- Formen vergleichen (nach dem "$1"-Verfahren: gleiche Punktzahl, Größe und Lage vereinheitlichen) ----

const SEC_N = 64;
function pathLen(pts) { let d = 0; for (let i = 1; i < pts.length; i++) d += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return d; }
function resamplePath(pts, n) {
  const I = pathLen(pts) / (n - 1);
  if (!(I > 0)) return null;
  const src = pts.map(p => p.slice()), out = [src[0].slice()];
  let D = 0;
  for (let i = 1; i < src.length; i++) {
    const d = Math.hypot(src[i][0] - src[i - 1][0], src[i][1] - src[i - 1][1]);
    if (D + d >= I && d > 0) {
      const t = (I - D) / d;
      const q = [src[i - 1][0] + t * (src[i][0] - src[i - 1][0]), src[i - 1][1] + t * (src[i][1] - src[i - 1][1])];
      out.push(q); src.splice(i, 0, q); D = 0;
    } else D += d;
  }
  while (out.length < n) out.push(src[src.length - 1].slice());
  return out.slice(0, n);
}
// Ergebnis: 64 Punkte in einem Einheitsquadrat, oder null, wenn die Spur zu kurz oder zu flach ist
function normalizeStroke(pts) {
  if (!pts || pts.length < 8 || pathLen(pts) < 60) return null;
  const r = resamplePath(pts, SEC_N);
  if (!r) return null;
  const xs = r.map(p => p[0]), ys = r.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const w = x1 - x0, h = y1 - y0;
  if (w < 28 || h < 28 || w / h > 3 || h / w > 3) return null;
  return r.map(p => [(p[0] - x0) / w, (p[1] - y0) / h]);
}
function strokeDist(a, b) { let d = 0; for (let i = 0; i < a.length; i++) d += Math.hypot(a[i][0] - b[i][0], a[i][1] - b[i][1]); return d / a.length; }
// Abstand zu einer Vorlage; nur vorwärts oder rückwärts gezeichnet, kein verschobener Startpunkt (sonst passen zu viele Formen)
function bestDist(n, t) { return Math.min(strokeDist(n, t), strokeDist(n, t.slice().reverse())); }
const SEC_MAX_THR = 0.12;
function matchesSecret(pts) {
  if (!secretConfigured()) return false;
  const n = normalizeStroke(pts);
  if (!n) return false;
  return planner.secret.templates.some(t => bestDist(n, t) <= Math.min(planner.secret.thr, SEC_MAX_THR));
}

// ---- Zeichnen erfassen (Kopfbereich und Zeichenfläche im Einrichten-Fenster) ----

// Meldet eine Spur, sobald der Finger länger als 14 px gezogen wurde. Kurze Tipps bleiben normale Klicks.
function captureStrokes(el, handlers) {
  let pts = null, id = null, drawing = false, start = null;
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (handlers.enabled && !handlers.enabled(e)) return;
    pts = [[e.clientX, e.clientY]]; start = pts[0]; id = e.pointerId; drawing = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (!pts || e.pointerId !== id) return;
    pts.push([e.clientX, e.clientY]);
    if (!drawing && Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 14) {
      drawing = true;
      try { el.setPointerCapture(id); } catch (err) { /* nicht kritisch */ }
      if (handlers.begin) handlers.begin(pts);
    } else if (drawing && handlers.move) handlers.move(pts);
  });
  const end = (e) => {
    if (!pts || e.pointerId !== id) return;
    const done = drawing, p = pts;
    pts = null; drawing = false;
    if (done) {
      el._swallowClick = Date.now();
      if (handlers.end) handlers.end(p);
    }
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  // Nach einer Zeichnung soll kein Knopf darunter ausgelöst werden
  el.addEventListener('click', (e) => { if (el._swallowClick && Date.now() - el._swallowClick < 350) { e.stopPropagation(); e.preventDefault(); } }, true);
}

// Spur über der ganzen Seite (verblasst von selbst)
const trailCanvas = document.createElement('canvas');
trailCanvas.id = 'gestureTrail';
document.body.appendChild(trailCanvas);
let trailFade = null;
function drawTrail(pts) {
  const c = trailCanvas, dpr = window.devicePixelRatio || 1;
  if (c.width !== Math.round(innerWidth * dpr) || c.height !== Math.round(innerHeight * dpr)) { c.width = Math.round(innerWidth * dpr); c.height = Math.round(innerHeight * dpr); }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, innerWidth, innerHeight);
  g.lineWidth = 3; g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--sage').trim() || '#fff';
  g.shadowColor = g.strokeStyle; g.shadowBlur = 8;
  g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.stroke();
  trailCanvas.style.transition = 'none'; trailCanvas.style.opacity = '0.7';
}
function fadeTrail() {
  clearTimeout(trailFade);
  trailCanvas.style.transition = 'opacity .5s'; trailCanvas.style.opacity = '0';
}

captureStrokes(document.querySelector('header'), {
  enabled: () => currentView === 'planner' && !secretUnlocked && secretConfigured() && !openDialogs.length,
  begin: drawTrail, move: drawTrail,
  end: (pts) => {
    fadeTrail();
    if (matchesSecret(pts)) openSecret();
  }
});

// ---- Öffnen und Sperren ----

function armSecretTimer() {
  clearTimeout(secretTimer);
  secretTimer = setTimeout(() => { if (openDialogs.length) armSecretTimer(); else lockSecret(); }, SECRET_LOCK_MS);
}
function openSecret() {
  secretUnlocked = true;
  if (typeof navigator.vibrate === 'function') { try { navigator.vibrate(35); } catch (e) { /* nicht kritisch */ } }
  plannerState.tab = 'secret';
  if (currentView !== 'planner') setView('planner'); else renderPlanner();
  window.scrollTo(0, 0);
  armSecretTimer();
}
function lockSecret() {
  clearTimeout(secretTimer);
  const was = secretUnlocked;
  secretUnlocked = false;
  if (was && plannerState.tab === 'secret') { plannerState.tab = 'notes'; habitInput.value = ''; if (currentView === 'planner') renderPlanner(); }
}
['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, () => { if (secretUnlocked) armSecretTimer(); }, true));
document.addEventListener('visibilitychange', () => { if (document.hidden) lockSecret(); });

function renderSecretHtml() {
  const list = planner.notes.filter(n => n.secret).sort((a, b) => (b.pinned - a.pinned) || (b.updated - a.updated));
  return '<div class="secret-bar"><span class="secret-lock"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg> Geheimbereich</span>'
    + '<button type="button" class="tool-btn" data-act="s-lock">Sperren</button></div>'
    + (list.length ? '<div class="note-list">' + list.map(noteCardHtml).join('') + '</div>'
      : '<div class="empty-state"><div class="big">Noch keine geheimen Notizen</div>Schreibe unten einen Titel und tippe auf Enter, oder nutze das Plus. Der Bereich sperrt sich nach 30 Sekunden Ruhe von selbst.</div>');
}
plannerEl.addEventListener('click', (e) => { if (e.target.closest('[data-act="s-lock"]')) lockSecret(); });

// ---- PIN ----

async function hashPin(salt, pin) {
  const text = salt + ':' + pin;
  if (window.crypto && crypto.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  let h = 5381; for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return ('00000000' + h.toString(16)).slice(-8);
}
const newSalt = () => Array.from(crypto.getRandomValues ? crypto.getRandomValues(new Uint8Array(8)) : [1, 2, 3, 4, 5, 6, 7, 8]).map(b => b.toString(16).padStart(2, '0')).join('');

const pinSheet = document.getElementById('pinSheet');
const pinInput = document.getElementById('pinInput'), pinMsg = document.getElementById('pinMsg');
let pinFails = 0, pinBlockedUntil = 0;
function openPinSheet() {
  if (!secretConfigured() || !planner.secret.pin) return;
  pinInput.value = ''; pinMsg.textContent = '';
  pinSheet.showModal();
}
document.getElementById('pinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (Date.now() < pinBlockedUntil) { pinMsg.textContent = 'Zu viele Versuche. Warte kurz.'; return; }
  const h = await hashPin(planner.secret.pin.salt, pinInput.value);
  if (h === planner.secret.pin.hash) {
    pinFails = 0; pinSheet.close();
    if (settingsEl.open) settingsEl.close();
    openSecret();
  } else {
    pinFails++; pinInput.value = '';
    if (pinFails >= 3) { pinBlockedUntil = Date.now() + 30000; pinFails = 0; pinMsg.textContent = 'Zu viele Versuche. Warte 30 Sekunden.'; }
    else pinMsg.textContent = 'Falsche PIN.';
  }
});
document.getElementById('pinCancel').addEventListener('click', () => pinSheet.close());

// Versionszeile in den Einstellungen lange gedrückt halten = PIN-Eingabe
(function () {
  const el = document.getElementById('appVersion');
  let t = null;
  const stop = () => { clearTimeout(t); t = null; };
  el.addEventListener('pointerdown', () => { stop(); t = setTimeout(() => { t = null; openPinSheet(); }, 1200); });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => el.addEventListener(ev, stop));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
})();

// ---- Einrichten: Zeichen aufnehmen (3 Mal) und PIN festlegen ----

const secretSheet = document.getElementById('secretSheet');
const secPad = document.getElementById('secPad');
let sec = null; // { mode: 'new'|'redraw'|'pin', step: 'draw'|'pin', samples: [], templates, thr }

function drawPad(pts) {
  const g = secPad.getContext('2d'), r = secPad.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
  if (secPad.width !== Math.round(r.width * dpr)) { secPad.width = Math.round(r.width * dpr); secPad.height = Math.round(r.height * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, r.width, r.height);
  if (!pts) return;
  g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
  g.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--sage').trim();
  g.beginPath(); pts.forEach((p, i) => { const x = p[0] - r.left, y = p[1] - r.top; i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
}
function drawSecretSheet() {
  const drawing = sec.step === 'draw';
  document.getElementById('secDraw').hidden = !drawing;
  document.getElementById('secPin').hidden = drawing;
  document.getElementById('secTitle').textContent = drawing ? 'Dein geheimes Zeichen' : 'Deine PIN';
  if (drawing) {
    document.getElementById('secHint').textContent = 'Zeichne dein Zeichen in einem Zug, so wie du es später auch machen willst (z. B. ein Herz). Du brauchst es dreimal. Start und Richtung zählen mit.';
    document.getElementById('secDots').innerHTML = [0, 1, 2].map(i => '<span class="sec-dot' + (i < sec.samples.length ? ' on' : '') + '"></span>').join('');
    drawPad(null);
  }
}
function openSecretSetup(mode) {
  sec = { mode, step: mode === 'pin' ? 'pin' : 'draw', samples: [] };
  document.getElementById('secMsg').textContent = '';
  document.getElementById('secPin1').value = ''; document.getElementById('secPin2').value = '';
  if (settingsEl.open) settingsEl.close();
  drawSecretSheet();
  secretSheet.showModal();
}
captureStrokes(secPad, {
  enabled: () => sec && sec.step === 'draw',
  begin: drawPad, move: drawPad,
  end: (pts) => {
    const msg = document.getElementById('secMsg');
    const n = normalizeStroke(pts);
    if (!n) { msg.textContent = 'Das war zu kurz oder zu flach. Zeichne etwas, das etwa so hoch wie breit ist.'; setTimeout(() => drawPad(null), 500); return; }
    msg.textContent = '';
    sec.samples.push(n);
    drawSecretSheet();
    if (sec.samples.length < 3) { drawPad(pts); setTimeout(() => drawPad(null), 350); return; }
    // Drei Zeichnungen müssen einander ähnlich genug sein
    const ds = [strokeDist(sec.samples[0], sec.samples[1]), strokeDist(sec.samples[0], sec.samples[2]), strokeDist(sec.samples[1], sec.samples[2])];
    const worst = Math.max(...ds);
    if (worst > 0.14) { sec.samples = []; msg.textContent = 'Die drei Zeichnungen waren zu verschieden. Versuche es noch einmal, möglichst gleich.'; drawSecretSheet(); return; }
    sec.thr = Math.max(0.08, Math.min(SEC_MAX_THR, worst * 1.3 + 0.02));
    if (sec.mode === 'redraw') { saveSecret(sec.samples, sec.thr, planner.secret && planner.secret.pin); finishSecretSetup('Neues Zeichen gespeichert.'); }
    else { sec.step = 'pin'; drawSecretSheet(); }
  }
});
document.getElementById('secRestart').addEventListener('click', () => { sec.samples = []; document.getElementById('secMsg').textContent = ''; drawSecretSheet(); });

function saveSecret(templates, thr, pin) {
  planner.secret = { templates, thr };
  if (pin) planner.secret.pin = pin;
  savePlanner();
}
function finishSecretSetup(text) {
  if (secretSheet.open) secretSheet.close();
  sec = null;
  showToast(text, 3000);
  renderPlanner();
}
document.getElementById('secPinForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const a = document.getElementById('secPin1').value, b = document.getElementById('secPin2').value, msg = document.getElementById('secMsg');
  if (!/^\d{3}$/.test(a)) { msg.textContent = 'Die PIN braucht genau 3 Ziffern.'; return; }
  if (a !== b) { msg.textContent = 'Die beiden PINs sind verschieden.'; return; }
  const salt = newSalt(), pin = { salt, hash: await hashPin(salt, a) };
  if (sec.mode === 'pin') { planner.secret.pin = pin; savePlanner(); finishSecretSetup('PIN geändert.'); }
  else { saveSecret(sec.samples, sec.thr, pin); finishSecretSetup('Geheimbereich eingerichtet. Zeichne dein Zeichen im Kopf des Planners.'); }
});
document.getElementById('secCancel').addEventListener('click', () => { if (secretSheet.open) secretSheet.close(); });
document.getElementById('secCancel2').addEventListener('click', () => { if (secretSheet.open) secretSheet.close(); });
secretSheet.addEventListener('close', () => { sec = null; });

// ---- Einstellungen: Eintrag nur sichtbar, wenn nichts eingerichtet ist oder der Geheimbereich offen ist ----

const secretSettings = document.getElementById('secretSettings');
function updateSecretSettings() {
  const conf = secretConfigured();
  secretSettings.hidden = currentView !== 'planner' || (conf && !secretUnlocked);
  document.getElementById('secSetupBtn').hidden = conf;
  document.getElementById('secManage').hidden = !conf;
}
document.getElementById('settingsBtn').addEventListener('click', updateSecretSettings);
document.getElementById('secSetupBtn').addEventListener('click', () => openSecretSetup('new'));
document.getElementById('secRedraw').addEventListener('click', () => openSecretSetup('redraw'));
document.getElementById('secChangePin').addEventListener('click', () => openSecretSetup('pin'));
document.getElementById('secOff').addEventListener('click', function () {
  if (!twoStep(this, 'Wirklich auflösen?')) return;
  planner.notes.forEach(n => { n.secret = false; });
  delete planner.secret;
  savePlanner(); lockSecret();
  if (settingsEl.open) settingsEl.close();
  renderPlanner();
  showToast('Geheimbereich aufgelöst. Die Notizen sind jetzt normale Notizen.', 3500);
});
