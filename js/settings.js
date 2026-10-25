// ======================================================================
// Einstellungen (Schalter, Reihenfolge per Drag and drop)
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================

// ======================================================================
// 7) Einstellungen
// ======================================================================

// Einstellungen liegen getrennt von den Gewohnheiten im Speicher.
const SETTINGS_KEY = 'maximize-settings';
let settings = { showWeek: true, sound: true, vibrate: true, lastBackup: null };

function loadSettings() {
  const parsed = readJson(SETTINGS_KEY);
  if (!parsed || typeof parsed !== 'object') return;
  if (typeof parsed.showWeek === 'boolean') settings.showWeek = parsed.showWeek;
  if (typeof parsed.sound === 'boolean') settings.sound = parsed.sound;
  if (typeof parsed.vibrate === 'boolean') settings.vibrate = parsed.vibrate;
  if (typeof parsed.lastBackup === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.lastBackup)) settings.lastBackup = parsed.lastBackup;
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* nicht kritisch */ }
}

const settingsEl = document.getElementById('settings');
const orderList = document.getElementById('orderList');
const weekSwitch = document.getElementById('weekSwitch');

const HANDLE_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 8h14M5 12h14M5 16h14"/></svg>';

// Baut die Liste für die Reihenfolge. focusId: Welcher Griff soll danach den Fokus bekommen?
function renderOrderList(focusId) {
  if (habits.length === 0) {
    orderList.innerHTML = '<li class="order-empty">Noch keine Gewohnheiten.</li>';
    return;
  }
  orderList.innerHTML = habits.map(h =>
    '<li data-id="' + h.id + '">'
    + '<span class="order-name">' + escapeHtml(h.name) + '</span>'
    + '<button type="button" class="handle" aria-label="' + escapeHtml(h.name) + ' verschieben. Mit Pfeiltaste nach oben oder unten bewegen.">' + HANDLE_ICON + '</button></li>'
  ).join('');
  if (focusId) {
    const handle = orderList.querySelector('li[data-id="' + focusId + '"] .handle');
    if (handle) handle.focus();
  }
}

// Zeile "Datensicherung": zeigt, wann zuletzt gesichert wurde, und erinnert nach 30 Tagen
function updateBackupInfo() {
  const el = document.getElementById('backupInfo');
  const hasData = habits.length > 0 || gym.workouts.length > 0;
  let text = 'Daten als Datei sichern oder wiederherstellen';
  if (settings.lastBackup) {
    text = 'Letzte Sicherung: ' + longDate(settings.lastBackup);
    const days = Math.round((parseDate(todayStr()) - parseDate(settings.lastBackup)) / 86400000);
    if (hasData && days > 30) text += ' (Zeit für eine neue)';
  } else if (hasData) {
    text = 'Noch keine Sicherung erstellt';
  }
  el.textContent = text;
}

function renderSettings() {
  updateBackupInfo();
  weekSwitch.setAttribute('aria-checked', String(settings.showWeek));
  document.getElementById('soundSwitch').setAttribute('aria-checked', String(settings.sound));
  document.getElementById('vibSwitch').setAttribute('aria-checked', String(settings.vibrate));
  renderOrderList();
}

document.getElementById('settingsBtn').addEventListener('click', () => {
  settingsEl.querySelectorAll('details').forEach(d => { d.open = false; });
  document.getElementById('status').textContent = '';
  document.getElementById('csvStatus').textContent = '';
  // Zeilen mit data-area gehören nur zu einem Bereich (Habits oder Gym) und erscheinen nur dort
  settingsEl.querySelectorAll('[data-area]').forEach(el => { el.hidden = el.dataset.area !== currentView; });
  renderSettings();
  settingsEl.showModal();
  document.getElementById('settingsTitle').focus({ preventScroll: true });
});

document.getElementById('settingsDone').addEventListener('click', () => settingsEl.close());
settingsEl.addEventListener('click', (e) => { if (e.target === settingsEl) settingsEl.close(); });

// Die beiden Schalter für Ton und Vibration im Gym-Bereich
[['soundSwitch', 'sound'], ['vibSwitch', 'vibrate']].forEach(([id, key]) => {
  const sw = document.getElementById(id);
  sw.addEventListener('click', () => {
    settings[key] = !settings[key];
    sw.setAttribute('aria-checked', String(settings[key]));
    saveSettings();
    // Ein Klick ist eine Nutzeraktion: So darf die Seite danach Ton abspielen und vibrieren
    if (settings[key] && key === 'sound') beep();
    if (settings[key] && key === 'vibrate' && navigator.vibrate) navigator.vibrate(120);
  });
});

weekSwitch.addEventListener('click', () => {
  settings.showWeek = !settings.showWeek;
  weekSwitch.setAttribute('aria-checked', String(settings.showWeek));
  saveSettings();
  render();
});

// --- Ziehen und Ablegen (Drag and drop) ---
// Wir benutzen "Pointer Events": Sie funktionieren mit Maus und Finger gleich.
// Beim Ziehen folgt die Zeile dem Finger (translateY). Die anderen Zeilen rücken
// um genau eine Zeilenhöhe zur Seite, damit eine Lücke entsteht. Erst beim Loslassen
// ändern wir die echte Reihenfolge in der Liste.
let drag = null;

function updateDrag() {
  const d = drag;
  const dy = (d.lastY - d.startY) + (settingsEl.scrollTop - d.startScroll);
  d.target = Math.max(0, Math.min(d.items.length - 1, Math.round(d.index + dy / d.rowH)));
  d.items.forEach((el, j) => {
    if (el === d.li) { el.style.transform = 'translateY(' + dy + 'px)'; return; }
    let shift = 0;
    if (d.index < d.target && j > d.index && j <= d.target) shift = -d.rowH;
    else if (d.index > d.target && j < d.index && j >= d.target) shift = d.rowH;
    el.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
  });
}

// Läuft bei jedem Bildschirm-Update, solange gezogen wird.
// Nahe am oberen/unteren Rand scrollt das Fenster automatisch mit.
function dragLoop() {
  if (!drag) return;
  const r = settingsEl.getBoundingClientRect();
  const edge = 48;
  if (drag.lastY < r.top + edge) settingsEl.scrollTop -= 8;
  else if (drag.lastY > r.bottom - edge) settingsEl.scrollTop += 8;
  updateDrag();
  drag.raf = requestAnimationFrame(dragLoop);
}

orderList.addEventListener('pointerdown', (e) => {
  const handle = e.target.closest('.handle');
  if (!handle || drag) return;
  const li = handle.closest('li');
  const items = Array.from(orderList.children);
  const rowH = items.length > 1
    ? items[1].getBoundingClientRect().top - items[0].getBoundingClientRect().top
    : li.offsetHeight;
  drag = {
    li, items, rowH,
    index: items.indexOf(li), target: items.indexOf(li),
    startY: e.clientY, lastY: e.clientY,
    startScroll: settingsEl.scrollTop,
    pointerId: e.pointerId, raf: 0
  };
  handle.setPointerCapture(e.pointerId); // alle weiteren Bewegungen kommen weiter bei diesem Griff an
  li.classList.add('dragging');
  e.preventDefault();
  dragLoop();
});

orderList.addEventListener('pointermove', (e) => {
  if (drag && e.pointerId === drag.pointerId) drag.lastY = e.clientY;
});

function endDrag(e) {
  if (!drag || e.pointerId !== drag.pointerId) return;
  cancelAnimationFrame(drag.raf);
  const { index, target, items, li } = drag;
  items.forEach(el => { el.style.transform = ''; });
  li.classList.remove('dragging');
  drag = null;
  if (target !== index) {
    const [moved] = habits.splice(index, 1);
    habits.splice(target, 0, moved);
    saveHabits();
    render();
  }
  renderOrderList();
}
orderList.addEventListener('pointerup', endDrag);
orderList.addEventListener('pointercancel', endDrag);

// Alternative ohne Maus/Finger: Griff mit Tab anwählen, dann Pfeil hoch/runter
orderList.addEventListener('keydown', (e) => {
  const handle = e.target.closest('.handle');
  if (!handle || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const id = handle.closest('li').dataset.id;
  const i = habits.findIndex(h => h.id === id);
  const j = i + (e.key === 'ArrowUp' ? -1 : 1);
  if (i < 0 || j < 0 || j >= habits.length) return;
  [habits[i], habits[j]] = [habits[j], habits[i]];
  saveHabits();
  render();
  renderOrderList(id);
});
