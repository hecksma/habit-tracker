// ======================================================================
// Gym: laufendes Training, Pausen-Timer, Routinen-Editor
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================

// ======================================================================
// 10b) Gym: laufendes Training
// ======================================================================
//
// Das laufende Training liegt in einem eigenen Speicherplatz und wird nach jeder Änderung
// gesichert. Schließt du die App mitten im Training, geht es danach genau da weiter.
// Erst "Training beenden" macht daraus einen Eintrag im Verlauf.
//   active = { name, routineId, start, restEnd, restTotal,
//              entries: [{ exerciseId, sets: [{ kg, reps, pk, pr, done }] }] }
// kg und reps bleiben als Text, so wie du sie tippst. Umgerechnet wird erst beim Beenden.
// pk und pr sind die Vorschläge vom letzten Mal. Sie erscheinen nur blass im leeren Feld.
// Tippst du nichts ein und hakst den Satz ab, gelten die Vorschläge als eingetragen.

const ACTIVE_KEY = 'maximize-gym-active';
let active = null;
let restAlerted = true;
let lastBuzz = null;       // Welche Countdown-Sekunde hat zuletzt vibriert?
let ticker = null;
let audioCtx = null;
let wakeLock = null;

function sanitizeActive(a) {
  if (!a || typeof a !== 'object') return null;
  const start = numOrNull(a.start, 0, 4e12);
  if (start === null) return null;
  const txt = v => (typeof v === 'string' ? v.slice(0, 8) : '');
  const entries = (Array.isArray(a.entries) ? a.entries : []).slice(0, 60)
    .filter(en => en && exById(en.exerciseId))
    .map(en => ({ exerciseId: en.exerciseId, sets: (Array.isArray(en.sets) ? en.sets : []).slice(0, 60)
      .map(st => ({ kg: txt(st && st.kg), reps: txt(st && st.reps), pk: txt(st && st.pk), pr: txt(st && st.pr), done: !!(st && st.done === true) })) }));
  return {
    name: (typeof a.name === 'string' && a.name.trim()) ? a.name.trim().slice(0, 60) : 'Training',
    routineId: (typeof a.routineId === 'string' && ID_RE.test(a.routineId)) ? a.routineId : null,
    start, entries,
    restEnd: numOrNull(a.restEnd, 0, 4e12),
    restTotal: numOrNull(a.restTotal, 0, 3600)
  };
}

function loadActive() {
  const raw = readJson(ACTIVE_KEY);
  active = raw ? sanitizeActive(raw) : null;
  if (active) {
    restAlerted = !active.restEnd || active.restEnd <= Date.now();
    holdScreen();
    ensureTicker();
  } else {
    releaseScreen();
  }
}

function saveActive() {
  try {
    if (active) localStorage.setItem(ACTIVE_KEY, JSON.stringify(active));
    else localStorage.removeItem(ACTIVE_KEY);
  } catch (e) { /* nicht kritisch */ }
}

// Ein Eintrag für eine Übung, vorausgefüllt mit den Werten vom letzten Mal
function makeEntry(exId, count) {
  const last = lastSets(exId);
  const n = count || last.length || 3;
  const sets = [];
  for (let i = 0; i < n; i++) {
    const base = last[i] || last[last.length - 1] || null;
    sets.push({
      kg: '', reps: '',
      pk: base && base.kg !== null ? numText(base.kg) : '',
      pr: base && base.reps !== null ? String(base.reps) : '',
      done: false
    });
  }
  return { exerciseId: exId, sets };
}

function startWorkout(routine) {
  if (active) return; // es läuft immer nur ein Training
  gymState.page = 'workout';
  active = {
    name: routine ? routine.name : 'Training',
    routineId: routine ? routine.id : null,
    start: Date.now(), restEnd: null, restTotal: null,
    entries: routine ? routine.items.filter(it => exById(it.exerciseId)).map(it => makeEntry(it.exerciseId, it.sets)) : []
  };
  saveActive();
  prepareAudio();
  holdScreen();
  ensureTicker();
  renderGym();
  window.scrollTo(0, 0);
}

function renderActive(el) {
  document.getElementById('gymSubtitle').hidden = currentView !== 'gym';
  let html = '<div class="start-row" style="justify-content:flex-start;margin-top:18px;"><button type="button" class="tool-btn" data-act="wk-home">‹ Übersicht</button></div>'
    + '<div class="stats-title" style="margin-top:16px;">' + escapeHtml(active.name) + '</div>';
  active.entries.forEach((en, i) => {
    const ex = exById(en.exerciseId);
    const last = lastSets(en.exerciseId);
    html += '<div class="wk-ex"><div class="wk-ex-head"><button type="button" class="ex-link" data-act="open-ex" data-id="' + en.exerciseId + '">' + escapeHtml(ex ? ex.name : 'Übung') + '<span aria-hidden="true">›</span></button>'
      + '<button type="button" class="x-btn" data-act="rm-ex" data-ex="' + i + '" aria-label="Übung entfernen">✕</button></div>'
      + '<div class="set-head"><span>Satz</span><span>Letztes Mal</span><span>kg</span><span>Wdh.</span><span></span></div>';
    en.sets.forEach((st, j) => {
      const prev = last[j] || last[last.length - 1];
      const prevTxt = prev ? ((prev.kg !== null && prev.reps !== null) ? numText(prev.kg) + ' × ' + prev.reps : setText(prev)) : '–';
      html += '<div class="set-row' + (st.done ? ' done' : '') + '"><span class="set-no">' + (j + 1) + '</span>'
        + '<span class="set-prev">' + prevTxt + '</span>'
        + '<input class="num-input" inputmode="decimal" data-f="kg" data-ex="' + i + '" data-set="' + j + '" value="' + escapeHtml(st.kg) + '" placeholder="' + escapeHtml(st.pk || '') + '" aria-label="Gewicht in kg, Satz ' + (j + 1) + '" />'
        + '<input class="num-input" inputmode="numeric" data-f="reps" data-ex="' + i + '" data-set="' + j + '" value="' + escapeHtml(st.reps) + '" placeholder="' + escapeHtml(st.pr || '') + '" aria-label="Wiederholungen, Satz ' + (j + 1) + '" />'
        + '<button type="button" class="set-check" data-act="toggle-set" data-ex="' + i + '" data-set="' + j + '" aria-pressed="' + st.done + '" aria-label="Satz ' + (j + 1) + ' abgeschlossen">✓</button></div>';
    });
    html += '<div class="wk-ex-actions"><button type="button" class="tool-btn" data-act="add-set" data-ex="' + i + '">+ Satz</button>'
      + '<button type="button" class="tool-btn" data-act="del-set" data-ex="' + i + '"' + (en.sets.length < 2 ? ' disabled' : '') + '>− Satz</button></div></div>';
  });
  html += '<div class="action-row"><button type="button" class="tool-btn" data-act="add-ex">+ Übung hinzufügen</button></div>'
    + '<div class="end-row"><button type="button" class="btn danger" data-act="discard">Verwerfen</button><span class="spacer"></span>'
    + '<button type="button" class="btn primary" data-act="finish">Training beenden</button></div>';
  el.innerHTML = html;
}

function activeSummary() {
  let done = 0, total = 0;
  active.entries.forEach(en => en.sets.forEach(st => { total++; if (st.done) done++; }));
  return clock(Date.now() - active.start) + ' · ' + done + ' von ' + total + ' Sätzen';
}

function updateActiveSubtitle() {
  if (!active) return;
  const text = activeSummary();
  // Hinweis-Banner auf der Startseite (falls sichtbar)
  const rb = document.getElementById('runSub');
  if (rb && rb.textContent !== text) rb.textContent = text;
  // Untertitel nur im Training selbst, sonst steht dort etwas anderes
  if (gymState.page !== 'workout') return;
  const sub = document.getElementById('gymSubtitle');
  if (sub.textContent !== text) sub.textContent = text; // nur schreiben, wenn sich etwas ändert
}

// ---- Pause ----

function startRest(sec) {
  active.restTotal = sec;
  active.restEnd = Date.now() + sec * 1000;
  restAlerted = false;
  lastBuzz = null;
}

function updateRestBar() {
  const bar = document.getElementById('restBar');
  const show = !!(active && active.restEnd && currentView === 'gym');
  bar.hidden = !show;
  if (!show) return;
  const left = active.restEnd - Date.now();
  document.getElementById('restTime').textContent = clock(Math.ceil(left / 1000) * 1000);
  document.getElementById('restLabel').textContent = left > 0 ? 'Pause' : 'Pause vorbei';
}

// Der Takt: alle 250 ms Anzeige auffrischen und prüfen, ob die Pause um ist.
// Wir rechnen mit dem Endzeitpunkt, nicht mit mitgezählten Sekunden. So stimmt die Zeit
// auch dann, wenn der Browser den Takt zwischendurch drosselt.
function tick() {
  if (!active) { clearInterval(ticker); ticker = null; updateRestBar(); return; }
  const now = Date.now();
  if (active.restEnd) {
    // Letzte drei Sekunden: pro Sekunde ein kurzes, leichtes Vibrieren
    const left = active.restEnd - now;
    if (!restAlerted && left > 0 && left <= 3000) {
      const sec = Math.ceil(left / 1000);
      if (sec !== lastBuzz) {
        lastBuzz = sec;
        if (settings.vibrate && navigator.vibrate) { try { navigator.vibrate(35); } catch (e) { /* egal */ } }
      }
    }
    if (now >= active.restEnd && !restAlerted) {
      restAlerted = true;
      // Nur melden, wenn die Pause gerade erst zu Ende ging, nicht lange nachträglich
      if (now - active.restEnd < 8000) alertRestOver();
    }
    if (now > active.restEnd + 6000) { active.restEnd = null; saveActive(); }
  }
  updateRestBar();
  updateActiveSubtitle();
}

function ensureTicker() { if (!ticker) ticker = setInterval(tick, 250); }

// ---- Ton und Vibration (nur am Ende der Pause) ----

// Ein AudioContext darf erst nach einer Berührung Ton machen. Deshalb wird er beim ersten
// Tippen (Training starten, Satz abhaken) vorbereitet und ruht danach, bis die Pause endet.
function ensureAudio() {
  if (audioCtx) return audioCtx;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) audioCtx = new AC();
  } catch (e) { /* ohne Ton geht es auch */ }
  return audioCtx;
}

function prepareAudio() {
  try {
    if (!ensureAudio()) return;
    // Aufwecken und kurz danach wieder ruhen lassen. Spielt in der Zwischenzeit ein Ton,
    // übernimmt playSound und setzt die Ruhezeit neu (gemeinsamer Zeitgeber).
    audioCtx.resume().then(() => scheduleSuspend(400)).catch(() => {});
  } catch (e) { /* ohne Ton geht es auch */ }
}

// Töne laufen über einen gemeinsamen Ablauf: Kontext wecken, Ton spielen, danach wieder ruhen
// lassen, damit Musik und andere Apps nicht gestört werden.
let suspendTimer = null;
function scheduleSuspend(ms) {
  clearTimeout(suspendTimer);
  suspendTimer = setTimeout(() => { try { audioCtx.suspend(); } catch (e) { /* egal */ } }, ms);
}
function playSound(build, ms) {
  if (!ensureAudio()) return;
  try {
    audioCtx.resume().then(() => {
      build(audioCtx, audioCtx.currentTime);
      scheduleSuspend(ms);
    }).catch(() => {});
  } catch (e) { /* ohne Ton geht es auch */ }
}

// Pausen-Ende: eine kurze Glocke wie im Boxring, dreimal schnell angeschlagen.
// Eine Glocke klingt metallisch, weil sie mehrere Töne gleichzeitig hat, die nicht zueinander passen.
// Jeder Teilton klingt schnell ab, die tiefen etwas länger.
function beep() {
  playSound((ctx, t0) => {
    const partials = [[1, 1, 0.9], [2.76, 0.65, 0.6], [5.4, 0.4, 0.35], [8.93, 0.22, 0.2]]; // Verhältnis, Lautstärke, Dauer
    [0, 0.2, 0.4].forEach(d => {
      partials.forEach(([ratio, vol, dur]) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.value = 1050 * ratio;
        gain.gain.setValueAtTime(0.0001, t0 + d);
        gain.gain.exponentialRampToValueAtTime(0.32 * vol, t0 + d + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, t0 + d + dur);
        osc.connect(gain).connect(ctx.destination);
        osc.start(t0 + d);
        osc.stop(t0 + d + dur + 0.02);
      });
    });
  }, 1700);
}

// Satz abgehakt: ein ganz kurzes, leises Klicken als Rückmeldung
function playTick() {
  if (!settings.sound) return;
  playSound((ctx, t0) => {
    const osc = ctx.createOscillator(), gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1500, t0);
    osc.frequency.exponentialRampToValueAtTime(900, t0 + 0.05);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.6, t0 + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.09);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.1);
  }, 400);
}

function alertRestOver() {
  if (settings.sound) beep();
  if (settings.vibrate && navigator.vibrate) { try { navigator.vibrate(700); } catch (e) { /* egal */ } }
}

// ---- Bildschirm anlassen ----

async function holdScreen() {
  if (!active || wakeLock || !navigator.wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
    wakeLock.addEventListener('release', () => { wakeLock = null; });
  } catch (e) { wakeLock = null; }
}

function releaseScreen() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden && active) { holdScreen(); tick(); }
});

// ---- Training beenden / verwerfen ----

function endWorkout() {
  active = null; saveActive(); releaseScreen(); restAlerted = true;
  gymState.page = 'home'; gymState.tab = 'train';
  renderGym(); updateRestBar();
  window.scrollTo(0, 0);
}

// Die Übungen des laufenden Trainings als Routinen-Einträge (nur Übungen mit abgehakten Sätzen)
function workoutItems() {
  return active.entries.filter(en => en.sets.some(s => s.done)).map(en => ({ exerciseId: en.exerciseId, sets: en.sets.length }));
}
function sameItems(a, b) {
  return a.length === b.length && a.every((it, i) => it.exerciseId === b[i].exerciseId && it.sets === b[i].sets);
}

document.getElementById('updNo').addEventListener('click', () => { document.getElementById('updSheet').close(); finishWorkout(false); });
document.getElementById('updYes').addEventListener('click', () => { document.getElementById('updSheet').close(); finishWorkout(true); });
document.getElementById('updSheet').addEventListener('click', (e) => { if (e.target.id === 'updSheet') e.target.close(); });

// Tageszeit für den Namen im Verlauf (nach dem Start des Trainings)
function partOfDay(hour) {
  if (hour >= 5 && hour < 11) return 'Morgens';
  if (hour >= 11 && hour < 16) return 'Mittags';
  if (hour >= 16 && hour < 22) return 'Abends';
  return 'Nachts';
}

function finishWorkout(updateRoutine) {
  const d = new Date(active.start);
  const entries = active.entries.map(en => ({
    exerciseId: en.exerciseId,
    sets: en.sets.filter(st => st.done).map(st => ({ kg: parseNum(st.kg), reps: parseNum(st.reps), sec: null, dist: null }))
  }));
  const w = {
    id: 'w' + active.start.toString(36) + Math.random().toString(36).slice(2, 6),
    date: fmt(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()),
    name: (active.name + ' ' + partOfDay(d.getHours())).slice(0, 60), routineId: active.routineId,
    durationSec: Math.round((Date.now() - active.start) / 1000), entries
  };
  const clean = sanitizeGym({ exercises: gym.exercises, routines: gym.routines, workouts: [w] });
  const before = JSON.stringify(gym);
  mergeGym({ exercises: [], routines: [], workouts: clean.workouts });
  if (updateRoutine) {
    const r = gym.routines.find(x => x.id === active.routineId);
    if (r) r.items = workoutItems();
  }
  if (!saveGym()) {
    gym = JSON.parse(before);
    alert('Der Speicher ist voll. Das Training bleibt offen, bitte sichere erst deine Daten.');
    return;
  }
  endWorkout();
}

// ---- Bedienung im Gym-Bereich ----

document.getElementById('gymContent').addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const ei = Number(b.dataset.ex), si = Number(b.dataset.set);
  const entry = active && active.entries[ei];
  if (act === 'more') { gymState.shown += 20; renderGym(); }
  else if (act === 'import') renderSettingsForGym();
  else if (act === 'resume') { gymState.page = 'workout'; renderGym(); window.scrollTo(0, 0); }
  else if (act === 'wk-home') { gymState.page = 'home'; renderGym(); window.scrollTo(0, 0); }
  else if (act === 'gcal-month') { shiftGymMonth(Number(b.dataset.dir)); }
  else if (act === 'gcal-day') { gymState.calSel = gymState.calSel === b.dataset.date ? null : b.dataset.date; renderGym(); }
  else if (act === 'start') { if (active) return; const r = gym.routines.find(x => x.id === b.dataset.id); if (r) startWorkout(r); }
  else if (act === 'start-empty') { if (!active) startWorkout(null); }
  else if (act === 'new-ex') openExSheet(null);
  else if (act === 'edit-ex') openExSheet(b.dataset.id);
  else if (act === 'new-routine') openRoutineSheet(null);
  else if (act === 'edit-routine') openRoutineSheet(b.dataset.id);
  else if (act === 'group-filter') { gymState.exGroup = b.dataset.g; renderGym(); }
  else if (act === 'open-ex') openExercise(b.dataset.id);
  else if (act === 'back') leaveExercise();
  else if (act === 'more-ex') { gymState.exShown = (gymState.exShown || 10) + 10; renderGym(); }
  else if (act === 'toggle-set' && entry && entry.sets[si]) {
    const st = entry.sets[si];
    st.done = !st.done;
    if (st.done) {
      // Nichts eingetippt? Dann gelten die Vorschläge vom letzten Mal
      if (!st.kg && st.pk) st.kg = st.pk;
      if (!st.reps && st.pr) st.reps = st.pr;
      playTick();
      const ex = exById(entry.exerciseId);
      startRest(ex && ex.rest ? ex.rest : 90);
    }
    saveActive(); renderGym();
  }
  else if (act === 'add-set' && entry) {
    const prev = entry.sets[entry.sets.length - 1];
    entry.sets.push({ kg: '', reps: '', pk: prev ? (prev.kg || prev.pk) : '', pr: prev ? (prev.reps || prev.pr) : '', done: false });
    saveActive(); renderGym();
  }
  else if (act === 'del-set' && entry && entry.sets.length > 1) { entry.sets.pop(); saveActive(); renderGym(); }
  else if (act === 'rm-ex' && entry) {
    if (entry.sets.some(s => s.done) && !twoStep(b, 'Entfernen?')) return;
    active.entries.splice(ei, 1); saveActive(); renderGym();
  }
  else if (act === 'add-ex') openPick();
  else if (act === 'discard') { if (twoStep(b, 'Wirklich verwerfen?')) endWorkout(); }
  else if (act === 'finish') {
    if (!active.entries.some(en => en.sets.some(s => s.done))) {
      if (twoStep(b, 'Nichts abgehakt. Verwerfen?')) endWorkout();
      return;
    }
    // Hast du gegenüber der Routine Übungen oder Satzzahlen geändert? Dann nachfragen.
    const r = active.routineId && gym.routines.find(x => x.id === active.routineId);
    if (r && !sameItems(r.items, workoutItems())) {
      document.getElementById('updText').textContent = 'Du hast Übungen oder Satzzahlen gegenüber der Routine "' + r.name + '" geändert. Soll die Routine künftig so aussehen?';
      document.getElementById('updSheet').showModal();
      document.getElementById('updTitle').focus({ preventScroll: true });
      return;
    }
    finishWorkout(false);
  }
});

// Beim Tippen in kg/Wdh. nur den Wert merken, ohne neu zu zeichnen (sonst verlierst du den Cursor)
document.getElementById('gymContent').addEventListener('input', (e) => {
  const inp = e.target.closest('.num-input');
  if (!inp || !active) return;
  const st = active.entries[Number(inp.dataset.ex)] && active.entries[Number(inp.dataset.ex)].sets[Number(inp.dataset.set)];
  if (st) { st[inp.dataset.f] = inp.value.slice(0, 8); saveActive(); }
});

// Tippst du in ein Zahlenfeld mit Inhalt, ist der Inhalt markiert: die neue Zahl ersetzt ihn direkt
document.getElementById('gymContent').addEventListener('focusin', (e) => {
  const inp = e.target.closest('.num-input');
  if (inp) setTimeout(() => { try { inp.select(); } catch (err) { /* egal */ } }, 0);
});

document.getElementById('gymContent').addEventListener('input', (e) => {
  if (e.target.id !== 'exFilter') return;
  gymState.exFilter = e.target.value;
  document.getElementById('exList').innerHTML = exercisesListHtml();
});

document.getElementById('exercisesBtn').addEventListener('click', () => {
  gymState.page = gymState.page === 'exercises' ? 'home' : 'exercises';
  gymState.tab = 'train';
  renderGym();
  window.scrollTo(0, 0);
});

document.getElementById('restBar').addEventListener('click', (e) => {
  const b = e.target.closest('[data-rest]');
  if (!b || !active || !active.restEnd) return;
  const now = Date.now();
  if (b.dataset.rest === 'skip') { active.restEnd = null; restAlerted = true; }
  else if (b.dataset.rest === 'plus') {
    active.restEnd = Math.max(active.restEnd, now) + 15000; restAlerted = false; lastBuzz = null;
  } else {
    active.restEnd = Math.max(now + 1000, active.restEnd - 15000);
  }
  saveActive(); updateRestBar();
});

// ---- Übung anlegen / bearbeiten ----

const exSheet = document.getElementById('exSheet');
let exCtx = null;

function showExRest() { document.getElementById('exRestValue').textContent = clock(exCtx.rest * 1000); }

// Die Auswahl der Muskelgruppe: ein Tipp wählt, ein zweiter Tipp auf dieselbe Gruppe nimmt die Wahl zurück
function renderExGroups() {
  document.getElementById('exGroups').innerHTML = MUSCLE_GROUPS.map(g =>
    '<button type="button" class="chip" data-g="' + g + '" aria-pressed="' + (exCtx.group === g) + '">' + g + '</button>').join('');
}

document.getElementById('exGroups').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b || !exCtx) return;
  exCtx.group = exCtx.group === b.dataset.g ? null : b.dataset.g;
  renderExGroups();
});

function openExSheet(id, after) {
  const ex = id ? exById(id) : null;
  exCtx = { id: ex ? ex.id : null, rest: ex && ex.rest ? ex.rest : 90, group: ex ? ex.group : null, after: after || null };
  renderExGroups();
  document.getElementById('exTitle').textContent = ex ? 'Übung bearbeiten' : 'Neue Übung';
  document.getElementById('exName').value = ex ? ex.name : '';
  document.getElementById('exMsg').textContent = '';
  showExRest();
  exSheet.showModal();
  document.getElementById('exTitle').focus({ preventScroll: true });
}

document.getElementById('exRestMinus').addEventListener('click', () => { exCtx.rest = Math.max(15, exCtx.rest - 15); showExRest(); });
document.getElementById('exRestPlus').addEventListener('click', () => { exCtx.rest = Math.min(600, exCtx.rest + 15); showExRest(); });
document.getElementById('exCancel').addEventListener('click', () => exSheet.close());
exSheet.addEventListener('click', (e) => { if (e.target === exSheet) exSheet.close(); });

document.getElementById('exForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('exName').value.trim().slice(0, 60);
  const msg = document.getElementById('exMsg');
  if (!name) { msg.textContent = 'Bitte gib einen Namen ein.'; return; }
  if (gym.exercises.some(x => x.id !== exCtx.id && x.name.toLowerCase() === name.toLowerCase())) {
    msg.textContent = 'Eine Übung mit diesem Namen gibt es schon.'; return;
  }
  const before = JSON.stringify(gym);
  let id = exCtx.id;
  if (id) { const ex = exById(id); ex.name = name; ex.rest = exCtx.rest; ex.group = exCtx.group; }
  else {
    id = 'e' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    gym.exercises.push({ id, name, rest: exCtx.rest, group: exCtx.group });
  }
  if (!saveGym()) { gym = JSON.parse(before); msg.textContent = 'Der Speicher ist voll.'; return; }
  exSheet.close();
  if (exCtx.after) exCtx.after(id);
  renderGym();
});

// ---- Übung zum laufenden Training hinzufügen ----

const pickSheet = document.getElementById('pickSheet');

let pickGroup = '';
function renderPick() {
  const q = document.getElementById('pickFilter').value.trim().toLowerCase();
  document.getElementById('pickGroups').innerHTML = ['', ...MUSCLE_GROUPS].map(g =>
    '<button type="button" class="chip" data-g="' + g + '" aria-pressed="' + (pickGroup === g) + '">' + (g || 'Alle') + '</button>').join('');
  const list = gym.exercises.filter(e => e.name.toLowerCase().includes(q) && (!pickGroup || e.group === pickGroup)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  document.getElementById('pickList').innerHTML = list.length
    ? list.map(e => '<button type="button" class="ex-row" data-id="' + e.id + '"><span><span class="ex-name">' + escapeHtml(e.name) + '</span>' + (e.group ? '<span class="log-sub">' + e.group + '</span>' : '') + '</span></button>').join('')
    : '<p class="hint">Nichts gefunden. Mit "Neue Übung" legst du sie an.</p>';
}

let pickCb = null;
function openPick(cb) {
  pickCb = cb || addToWorkout;
  document.getElementById('pickFilter').value = '';
  pickGroup = '';
  renderPick();
  pickSheet.showModal();
  document.getElementById('pickTitle').focus({ preventScroll: true });
}

function addToWorkout(exId) {
  if (!active) return;
  active.entries.push(makeEntry(exId, null));
  saveActive(); renderGym();
}

document.getElementById('pickFilter').addEventListener('input', renderPick);
document.getElementById('pickGroups').addEventListener('click', (e) => {
  const b = e.target.closest('.chip');
  if (!b) return;
  pickGroup = b.dataset.g;
  renderPick();
});
document.getElementById('pickList').addEventListener('click', (e) => {
  const b = e.target.closest('.ex-row');
  if (!b) return;
  pickSheet.close();
  pickCb(b.dataset.id);
});
document.getElementById('pickNew').addEventListener('click', () => { pickSheet.close(); openExSheet(null, pickCb); });
document.getElementById('pickCancel').addEventListener('click', () => pickSheet.close());
pickSheet.addEventListener('click', (e) => { if (e.target === pickSheet) pickSheet.close(); });

// ---- Routine anlegen / bearbeiten ----

const routineSheet = document.getElementById('routineSheet');
let rCtx = null;

function renderRoutineItems() {
  const box = document.getElementById('routineItems');
  if (!rCtx.items.length) { box.innerHTML = '<p class="ritems-empty">Noch keine Übungen.</p>'; return; }
  const n = rCtx.items.length;
  box.innerHTML = rCtx.items.map((it, i) => {
    const ex = exById(it.exerciseId);
    return '<div class="ritem"><div class="ritem-name">' + escapeHtml(ex ? ex.name : 'Übung') + '</div><div class="ritem-ctl">'
      + '<button type="button" data-r="minus" data-i="' + i + '" aria-label="Weniger Sätze"' + (it.sets <= 1 ? ' disabled' : '') + '>−</button>'
      + '<span class="n">' + it.sets + (it.sets === 1 ? ' Satz' : ' Sätze') + '</span>'
      + '<button type="button" data-r="plus" data-i="' + i + '" aria-label="Mehr Sätze"' + (it.sets >= 20 ? ' disabled' : '') + '>+</button>'
      + '<span class="spacer"></span>'
      + '<button type="button" data-r="up" data-i="' + i + '" aria-label="Nach oben"' + (i === 0 ? ' disabled' : '') + '>↑</button>'
      + '<button type="button" data-r="down" data-i="' + i + '" aria-label="Nach unten"' + (i === n - 1 ? ' disabled' : '') + '>↓</button>'
      + '<button type="button" data-r="rm" data-i="' + i + '" aria-label="Entfernen">✕</button></div></div>';
  }).join('');
}

function openRoutineSheet(id) {
  const r = id ? gym.routines.find(x => x.id === id) : null;
  rCtx = { id: r ? r.id : null, items: r ? r.items.map(it => ({ exerciseId: it.exerciseId, sets: it.sets })) : [] };
  document.getElementById('routineTitle').textContent = r ? 'Routine bearbeiten' : 'Neue Routine';
  document.getElementById('routineName').value = r ? r.name : '';
  document.getElementById('routineMsg').textContent = '';
  const del = document.getElementById('routineDelete');
  disarm(del);
  del.hidden = !r;
  renderRoutineItems();
  routineSheet.showModal();
  document.getElementById('routineTitle').focus({ preventScroll: true });
}

document.getElementById('routineItems').addEventListener('click', (e) => {
  const b = e.target.closest('[data-r]');
  if (!b) return;
  const i = Number(b.dataset.i), items = rCtx.items, a = b.dataset.r;
  if (a === 'minus') items[i].sets = Math.max(1, items[i].sets - 1);
  else if (a === 'plus') items[i].sets = Math.min(20, items[i].sets + 1);
  else if (a === 'rm') items.splice(i, 1);
  else if (a === 'up' && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
  else if (a === 'down' && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
  renderRoutineItems();
});

document.getElementById('routineAddEx').addEventListener('click', () => {
  openPick((exId) => { rCtx.items.push({ exerciseId: exId, sets: Math.max(1, lastSets(exId).length || 3) }); renderRoutineItems(); });
});

document.getElementById('routineDelete').addEventListener('click', (e) => {
  const b = e.currentTarget;
  if (!twoStep(b, 'Wirklich löschen?')) return;
  const before = JSON.stringify(gym);
  gym.routines = gym.routines.filter(r => r.id !== rCtx.id);
  if (!saveGym()) { gym = JSON.parse(before); document.getElementById('routineMsg').textContent = 'Der Speicher ist voll.'; return; }
  routineSheet.close();
  renderGym();
});

document.getElementById('routineCancel').addEventListener('click', () => routineSheet.close());
routineSheet.addEventListener('click', (e) => { if (e.target === routineSheet) routineSheet.close(); });

document.getElementById('routineForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('routineName').value.trim().slice(0, 40);
  const msg = document.getElementById('routineMsg');
  if (!name) { msg.textContent = 'Bitte gib einen Namen ein.'; return; }
  if (gym.routines.some(r => r.id !== rCtx.id && r.name.toLowerCase() === name.toLowerCase())) { msg.textContent = 'Eine Routine mit diesem Namen gibt es schon.'; return; }
  if (!rCtx.items.length) { msg.textContent = 'Füge mindestens eine Übung hinzu.'; return; }
  const before = JSON.stringify(gym);
  if (rCtx.id) { const r = gym.routines.find(x => x.id === rCtx.id); r.name = name; r.items = rCtx.items; }
  else gym.routines.push({ id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, items: rCtx.items });
  if (!saveGym()) { gym = JSON.parse(before); msg.textContent = 'Der Speicher ist voll.'; return; }
  routineSheet.close();
  renderGym();
});

// Öffnet die Einstellungen direkt beim Import
function renderSettingsForGym() {
  document.getElementById('settingsBtn').click();
  document.getElementById('csvDetails').open = true;
}
