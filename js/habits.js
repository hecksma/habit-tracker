// ======================================================================
// Habits: Plan und Serie, Laden/Speichern, Anzeige, Aktionen, Bearbeiten-Fenster
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================

// ======================================================================
// 2) Plan und Serie
// ======================================================================

// Jede Gewohnheit hat einen Plan (schedule). Es gibt zwei Arten:
//   { type: 'days',   days: [0, 2, 4] }  → feste Wochentage (0 = Mo ... 6 = So)
//   { type: 'weekly', times: 3 }          → so oft pro Woche, egal an welchen Tagen
// Ältere Gewohnheiten haben noch keinen Plan und gelten als "täglich".
function getSchedule(h) {
  const s = h && h.schedule;
  if (s && s.type === 'weekly' && Number.isInteger(s.times) && s.times >= 1 && s.times <= 7) {
    return { type: 'weekly', times: s.times };
  }
  if (s && s.type === 'days' && Array.isArray(s.days) && s.days.length > 0
      && s.days.every(n => Number.isInteger(n) && n >= 0 && n <= 6)) {
    return { type: 'days', days: Array.from(new Set(s.days)).sort((a, b) => a - b) };
  }
  return { type: 'days', days: ALL_DAYS.slice() };
}

// Der erste Tag, ab dem Tage zählen. Davor wird nichts als "verpasst" gewertet.
function firstDay(h) {
  const sorted = (h.completions || []).slice().sort();
  const candidates = [h.createdAt, sorted[0]]
    .filter(x => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x))
    .sort();
  return candidates[0] || todayStr();
}

// Berechnet die Serie. Wir laufen Tag für Tag rückwärts von heute.
//
// Feste Tage:
//   - Ein erledigter Tag zählt +1 (auch ein Bonus-Tag, der nicht geplant war).
//   - Ein nicht geplanter, nicht erledigter Tag wird übersprungen.
//   - Ein geplanter, verpasster Tag ist pro Kalenderwoche einmal erlaubt (Joker).
//     Beim zweiten verpassten Tag in derselben Woche endet die Serie.
//   - Heute zählt noch nicht als verpasst, der Tag ist ja noch nicht vorbei.
//
// X-mal pro Woche:
//   - Die Serie zählt Wochen (Mo bis So), in denen das Ziel erreicht wurde.
//   - Die laufende Woche und die Startwoche der Gewohnheit brechen nie ab.
function computeStreak(h, today) {
  today = today || todayStr();
  const sched = getSchedule(h);
  const done = new Set(h.completions || []);
  const first = firstDay(h);
  const t = parseDate(today);
  let streak = 0;

  if (sched.type === 'weekly') {
    const thisWeek = weekStart(t);
    for (let i = 0; i < 600; i++) {
      const ws = addDays(thisWeek, -7 * i);
      if (fmt(addDays(ws, 6)) < first) break;
      let count = 0;
      for (let k = 0; k < 7; k++) if (done.has(fmt(addDays(ws, k)))) count++;
      if (count >= sched.times) streak++;
      else if (i === 0 || fmt(ws) <= first) continue;
      else break;
    }
    return { value: streak, unit: 'weeks', jokerUsed: false };
  }

  const joker = {};
  for (let i = 0; i < 4000; i++) {
    const day = addDays(t, -i);
    const key = fmt(day);
    if (key < first) break;
    if (done.has(key)) { streak++; continue; }
    if (!sched.days.includes(weekdayIdx(day))) continue;
    if (i === 0) continue;
    const wk = fmt(weekStart(day));
    if (!joker[wk]) { joker[wk] = true; continue; }
    break;
  }
  return { value: streak, unit: 'days', jokerUsed: !!joker[fmt(weekStart(t))] };
}

// Wie oft wurde die Gewohnheit in der Woche von "today" erledigt?
function countThisWeek(h, today) {
  const done = new Set(h.completions || []);
  const ws = weekStart(parseDate(today));
  let n = 0;
  for (let k = 0; k < 7; k++) if (done.has(fmt(addDays(ws, k)))) n++;
  return n;
}

// Ist die Gewohnheit heute "dran"? Wird für die Zeile oben (z. B. "2 von 3") gebraucht.
function isDueToday(h, today) {
  const sched = getSchedule(h);
  const doneToday = (h.completions || []).includes(today);
  if (sched.type === 'days') return sched.days.includes(weekdayIdx(parseDate(today))) || doneToday;
  return doneToday || countThisWeek(h, today) < sched.times;
}

function planText(h, today) {
  const sched = getSchedule(h);
  if (sched.type === 'weekly') {
    return countThisWeek(h, today) + ' von ' + sched.times + ' diese Woche';
  }
  if (sched.days.length === 7) return 'Täglich';
  return sched.days.map(i => DAY_LABELS[i]).join(' ');
}

// ======================================================================
// 3) Laden und Speichern
// ======================================================================

// localStorage speichert nur Text, deshalb wandeln wir die Liste mit JSON.stringify in Text um
// (beim Speichern) und mit JSON.parse zurück in eine Liste (beim Laden).
// try/catch fängt Fehler ab, damit die App nicht abstürzt, falls der Speicher nicht verfügbar ist.
function loadHabits() {
  let parsed = readJson(STORAGE_KEY);
  if (parsed === null) parsed = readJson(LEGACY_STORAGE_KEY);
  habits = Array.isArray(parsed) ? parsed.filter(isValidHabit) : [];
  // Wurden Einträge als ungültig aussortiert, heben wir die Originaldaten auf, bevor sie überschrieben werden
  if (Array.isArray(parsed) && habits.length !== parsed.length) quarantine(STORAGE_KEY);
  loaded = true;
  render();
}

function saveHabits() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(habits));
  } catch (e) {
    contentEl.insertAdjacentHTML('afterbegin', '<div class="error-banner">Speichern fehlgeschlagen. Bitte erneut versuchen.</div>');
  }
}

// ======================================================================
// 4) Anzeige
// ======================================================================

function renderCard(h, today) {
  const done = new Set(h.completions || []);
  const sched = getSchedule(h);
  const isDone = done.has(today);
  const streak = computeStreak(h, today);
  const unitText = streak.unit === 'weeks'
    ? (streak.value === 1 ? 'Woche Serie' : 'Wochen Serie')
    : (streak.value === 1 ? 'Tag Serie' : 'Tage Serie');

  // Die sieben Tage der aktuellen Woche (Montag bis Sonntag)
  const ws = weekStart(parseDate(today));
  let cells = '';
  for (let k = 0; k < 7; k++) {
    const d = addDays(ws, k);
    const key = fmt(d);
    const checked = done.has(key);
    const planned = sched.type === 'weekly' ? true : sched.days.includes(k);
    const classes = ['day'];
    if (checked) classes.push('checked');
    if (key === today) classes.push('today');
    if (!planned) classes.push('off');
    const label = DAY_LABELS[k] + ' ' + d.getDate() + '.' + (d.getMonth() + 1) + '.: ' + (checked ? 'erledigt' : 'offen');
    cells += '<button type="button" class="' + classes.join(' ') + '" data-action="toggle-day" data-id="' + h.id + '" data-date="' + key + '"'
      + ' aria-label="' + label + '" aria-pressed="' + checked + '"' + (key > today ? ' disabled' : '') + '>'
      + '<span class="day-label">' + DAY_LABELS[k] + '</span><span class="dot"></span></button>';
  }

  // Name einmal maskieren und überall verwenden
  const safeName = escapeHtml(h.name);

  return '<div class="habit-card ' + (isDone ? 'done' : '') + '">'
    + '<div class="habit-top">'
    +   '<button type="button" class="check-btn ' + (isDone ? 'done' : '') + '" data-action="toggle-day" data-id="' + h.id + '" data-date="' + today + '"'
    +     ' aria-label="' + safeName + ' heute ' + (isDone ? 'zurücknehmen' : 'erledigen') + '">' + (isDone ? '✓' : '') + '</button>'
    +   '<div class="habit-info">'
    +     '<p class="habit-name">' + safeName + '</p>'
    +     '<div class="meta"><span class="streak"><span class="streak-num">' + streak.value + '</span> ' + unitText + '</span>'
    +       '<span class="plan">' + planText(h, today) + '</span>'
    +       (streak.jokerUsed ? '<span class="joker">Joker genutzt</span>' : '') + '</div>'
    +   '</div>'
    +   '<button type="button" class="edit-btn" data-action="edit" data-id="' + h.id + '" aria-label="' + safeName + ' bearbeiten">⋯</button>'
    + '</div>'
    + (settings.showWeek ? '<div class="week">' + cells + '</div>' : '')
    + '</div>';
}

function render() {
  if (!loaded) {
    contentEl.innerHTML = '<div class="loading">Lade deine Daten …</div>';
    return;
  }

  const today = todayStr();

  // Ist die Statistik offen, zeichnen wir die statt der Tagesliste (siehe Abschnitt "Statistik")
  if (habitsTab === 'stats') { renderStats(); return; }

  if (habits.length === 0) {
    subtitleEl.textContent = 'Lege unten deine erste Gewohnheit an.';
    contentEl.innerHTML = '<div class="empty-state"><div class="big">Noch keine Gewohnheiten</div>Füge unten deine erste hinzu.</div>';
    return;
  }

  const due = habits.filter(h => isDueToday(h, today));
  const doneCount = due.filter(h => (h.completions || []).includes(today)).length;
  subtitleEl.textContent = due.length === 0
    ? 'Heute ist nichts geplant.'
    : doneCount + ' von ' + due.length + ' heute erledigt';

  contentEl.innerHTML = '<div class="habit-list">' + habits.map(h => renderCard(h, today)).join('') + '</div>';
}

// ======================================================================
// 5) Aktionen
// ======================================================================

// Erledigt-Status eines Tages umschalten (heute oder ein vergangener Tag zum Nachtragen)
function toggleDay(id, date) {
  const habit = habits.find(h => h.id === id);
  if (!habit || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayStr()) return;
  habit.completions = habit.completions || [];
  const idx = habit.completions.indexOf(date);
  if (idx >= 0) habit.completions.splice(idx, 1);
  else habit.completions.push(date);
  render();
  saveHabits();
}

// "Event Delegation": Statt jedem Button einen eigenen Klick-Handler zu geben,
// hören wir einmal auf den ganzen Bereich und schauen, auf welchen Button geklickt wurde.
// Welche Aktion gemeint ist, steht im Attribut data-action des Buttons.
contentEl.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const action = btn.dataset.action;
  if (action === 'toggle-day') toggleDay(btn.dataset.id, btn.dataset.date);
  if (action === 'edit') openSheet(btn.dataset.id);
});

addForm.addEventListener('submit', function(e) {
  e.preventDefault();
  const name = habitInput.value.trim();
  if (!name) return;
  habits.push({
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: name,
    createdAt: todayStr(),
    schedule: { type: 'days', days: ALL_DAYS.slice() },
    completions: []
  });
  habitInput.value = '';
  render();
  saveHabits();
});

// ======================================================================
// 6) Bearbeiten-Fenster
// ======================================================================

const sheetEl = document.getElementById('sheet');
const sheetForm = document.getElementById('sheetForm');
const sheetName = document.getElementById('sheetName');
const sheetMsg = document.getElementById('sheetMsg');
const chipsEl = document.getElementById('chips');
const deleteBtn = document.getElementById('deleteBtn');
let sheet = null; // Zwischenstand, solange das Fenster offen ist

// Die sieben Tages-Knöpfe einmalig erzeugen
DAY_LABELS.forEach((label, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip';
  b.textContent = label;
  b.dataset.day = i;
  chipsEl.appendChild(b);
});

function openSheet(id) {
  const h = habits.find(x => x.id === id);
  if (!h) return;
  const s = getSchedule(h);
  sheet = {
    id: id,
    mode: s.type,
    days: new Set(s.type === 'days' ? s.days : ALL_DAYS),
    times: s.type === 'weekly' ? s.times : 3,
  };
  sheetName.value = h.name;
  disarm(deleteBtn);
  sheetMsg.textContent = '';
  renderSheet();
  sheetEl.showModal();
  // Fokus auf die Überschrift, nicht aufs Namensfeld: so öffnet sich keine Tastatur
  document.getElementById('sheetTitle').focus({ preventScroll: true });
}

function renderSheet() {
  if (!sheet) return;
  document.querySelectorAll('#planSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === sheet.mode)));
  document.getElementById('daysPane').hidden = sheet.mode !== 'days';
  document.getElementById('weeklyPane').hidden = sheet.mode !== 'weekly';
  chipsEl.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(sheet.days.has(Number(c.dataset.day)))));
  document.getElementById('timesValue').textContent = sheet.times;
  document.getElementById('timesMinus').disabled = sheet.times <= 1;
  document.getElementById('timesPlus').disabled = sheet.times >= 7;
  document.getElementById('planHint').textContent = sheet.mode === 'days'
    ? 'Ein verpasster Tag pro Woche ist erlaubt (Joker). Beim zweiten verpassten Tag in einer Woche endet die Serie.'
    : 'Die Serie zählt Wochen, in denen du dein Ziel erreichst. Welche Tage du wählst, ist egal.';
}

function closeSheet() {
  sheet = null;
  if (sheetEl.open) sheetEl.close();
}

document.getElementById('planSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (!b || !sheet) return;
  sheet.mode = b.dataset.mode;
  renderSheet();
});

chipsEl.addEventListener('click', (e) => {
  const c = e.target.closest('.chip');
  if (!c || !sheet) return;
  const day = Number(c.dataset.day);
  if (sheet.days.has(day)) sheet.days.delete(day); else sheet.days.add(day);
  sheetMsg.textContent = '';
  renderSheet();
});

document.getElementById('timesMinus').addEventListener('click', () => { if (sheet && sheet.times > 1) { sheet.times--; renderSheet(); } });
document.getElementById('timesPlus').addEventListener('click', () => { if (sheet && sheet.times < 7) { sheet.times++; renderSheet(); } });

// Löschen braucht zwei Klicks, damit nichts aus Versehen verschwindet
deleteBtn.addEventListener('click', () => {
  if (!sheet) return;
  if (!twoStep(deleteBtn, 'Wirklich löschen?')) return;
  habits = habits.filter(h => h.id !== sheet.id);
  render();
  saveHabits();
  closeSheet();
});

document.getElementById('cancelBtn').addEventListener('click', closeSheet);

// Klick auf den abgedunkelten Hintergrund schließt das Fenster
sheetEl.addEventListener('click', (e) => { if (e.target === sheetEl) closeSheet(); });
sheetEl.addEventListener('close', () => { sheet = null; });

sheetForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!sheet) return;
  const name = sheetName.value.trim();
  if (!name) { sheetMsg.textContent = 'Gib der Gewohnheit einen Namen.'; return; }
  if (sheet.mode === 'days' && sheet.days.size === 0) { sheetMsg.textContent = 'Wähle mindestens einen Tag.'; return; }
  const h = habits.find(x => x.id === sheet.id);
  if (!h) { closeSheet(); return; }
  h.name = name;
  h.schedule = sheet.mode === 'days'
    ? { type: 'days', days: Array.from(sheet.days).sort((a, b) => a - b) }
    : { type: 'weekly', times: sheet.times };
  render();
  saveHabits();
  closeSheet();
});
