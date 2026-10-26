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

// Jede Gewohnheit hat eine Art (kind):
//   'do'     → etwas tun (Standard, wie bisher)
//   'avoid'  → etwas vermeiden (z. B. Rauchen): ein Haken heißt "heute durchgehalten"
//   'amount' → eine Menge pro Tag (z. B. 3 Liter Wasser): erreicht man das Ziel, gilt der Tag als geschafft
// Für Serie und Statistik zählt bei allen Arten dieselbe Liste "completions" (geschaffte Tage).
// Bei 'amount' steht die Menge je Tag zusätzlich in "amounts" ({ '2026-10-26': 1.5 }).
function kindOf(h) { return h && (h.kind === 'avoid' || h.kind === 'amount') ? h.kind : 'do'; }
function getAmount(h) {
  const a = (h && h.amount) || {};
  const target = Number.isFinite(a.target) && a.target > 0 ? a.target : 1;
  const step = Number.isFinite(a.step) && a.step > 0 ? a.step : 1;
  const unit = typeof a.unit === 'string' ? a.unit.slice(0, 12) : '';
  return { target, step, unit };
}
function amountOn(h, date) {
  const v = h && h.amounts && h.amounts[date];
  return Number.isFinite(v) && v > 0 ? v : 0;
}
const numFmt = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });
function amountText(h, v) { const a = getAmount(h); return numFmt.format(v) + (a.unit ? ' ' + a.unit : ''); }
// Setzt die Menge eines Tages und gleicht den "geschafft"-Status mit dem Ziel ab
function setAmount(h, date, v) {
  v = Math.max(0, Math.round(v * 1000) / 1000);
  h.amounts = h.amounts || {};
  if (v > 0) h.amounts[date] = v; else delete h.amounts[date];
  syncAmountDay(h, date);
}
function syncAmountDay(h, date) {
  h.completions = h.completions || [];
  const reached = amountOn(h, date) >= getAmount(h).target - 1e-9;
  const i = h.completions.indexOf(date);
  if (reached && i < 0) h.completions.push(date);
  if (!reached && i >= 0) h.completions.splice(i, 1);
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
    if (kindOf(h) === 'avoid') break; // Vermeiden: kein Joker, ein verpasster Tag beendet die Serie
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
    return countThisWeek(h, today) + '/' + sched.times;
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

// Haken-Symbol im Stil der übrigen Symbole (Linie, abgerundete Enden)
const CHECK_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7.2 13.2l2.8 2.8L18.2 7.8"/></svg>';

// Warnung für Gewohnheiten mit "X mal pro Woche": Wird es eng, sagt eine kleine Markierung Bescheid.
//  - 'must': Es bleiben genau so viele Tage wie nötige Einheiten, ab jetzt zählt jeder Tag
//  - 'today': Heute ist der letzte Tag, an dem es noch klappt
//  - 'lost': Das Wochenziel ist nicht mehr zu schaffen
// Ist heute schon erledigt, zählen nur die Tage danach.
function weekWarning(h, today) {
  const sched = getSchedule(h);
  if (sched.type !== 'weekly') return null;
  const needed = sched.times - countThisWeek(h, today);
  if (needed <= 0) return null;
  const t = parseDate(today);
  const doneToday = (h.completions || []).includes(today);
  const left = 7 - weekdayIdx(t) - (doneToday ? 1 : 0); // übrige Tage, an denen noch etwas zählen kann
  if (needed > left) return { kind: 'lost', text: 'Ziel verfehlt', tip: 'Das Wochenziel ist nicht mehr zu schaffen' };
  if (needed < left) return null;
  if (left === 1) return { kind: 'today', text: doneToday ? 'Morgen nötig' : 'Heute nötig', tip: 'Heute ist der letzte Tag, an dem das Wochenziel noch klappt' };
  return { kind: 'must', text: 'Jeden Tag nötig', tip: 'Für das Wochenziel zählt ab jetzt jeder Tag' };
}
function warnTag(h, today) {
  const w = weekWarning(h, today);
  if (!w) return '';
  // Dringend: nur ein Ausrufezeichen (ein Tipp erklärt es). "Ziel verfehlt" bleibt als kurzer Text.
  const inner = w.kind === 'lost' ? '<span class="warn-ex" aria-hidden="true">!</span>' + w.text : '<span class="warn-ex" aria-hidden="true">!</span>';
  return '<button type="button" class="warn-tag ' + w.kind + '" data-action="warn-info" data-tip="' + escapeHtml(w.text + ': ' + w.tip) + '" aria-label="' + escapeHtml(w.text + '. ' + w.tip) + '">' + inner + '</button>';
}

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
  const kind = kindOf(h);
  if (kind === 'amount') return renderAmountCard(h, today, streak, unitText, cells, safeName);

  return '<div class="habit-card ' + (isDone ? 'done' : '') + '">'
    + '<div class="habit-top">'
    +   '<button type="button" class="check-btn ' + (isDone ? 'done' : '') + '" data-action="toggle-day" data-id="' + h.id + '" data-date="' + today + '"'
    +     ' aria-label="' + safeName + (kind === 'avoid' ? (isDone ? ' heute: durchgehalten, zurücknehmen' : ' heute durchgehalten') : ' heute ' + (isDone ? 'zurücknehmen' : 'erledigen')) + '">' + CHECK_SVG + '</button>'
    +   '<div class="habit-info">'
    +     '<div class="name-row"><p class="habit-name">' + safeName + '</p>' + warnTag(h, today) + '</div>'
    +     '<div class="meta"><span class="streak"><span class="streak-num">' + streak.value + '</span> ' + unitText + '</span>'
    +       '<span class="plan">' + planText(h, today) + '</span>'
    +       (streak.jokerUsed ? '<span class="joker">Joker genutzt</span>' : '') + '</div>'
    +   '</div>'
    +   '<button type="button" class="edit-btn" data-action="edit" data-id="' + h.id + '" aria-label="' + safeName + ' bearbeiten">⋯</button>'
    + '</div>'
    + (settings.showWeek ? '<div class="week">' + cells + '</div>' : '')
    + '</div>';
}

function renderAmountCard(h, today, streak, unitText, cells, safeName) {
  const a = getAmount(h);
  const v = amountOn(h, today);
  const pct = Math.min(100, Math.round(100 * v / a.target));
  const isDone = v >= a.target - 1e-9;
  return '<div class="habit-card amount ' + (isDone ? 'done' : '') + '">'
    + '<div class="habit-top">'
    +   '<span class="amount-ring" style="--p:' + pct + '" aria-hidden="true"><span>' + (isDone ? CHECK_SVG : pct + '%') + '</span></span>'
    +   '<div class="habit-info">'
    +     '<div class="name-row"><p class="habit-name">' + safeName + '</p>' + warnTag(h, today) + '</div>'
    +     '<div class="meta"><span class="streak"><span class="streak-num">' + streak.value + '</span> ' + unitText + '</span>'
    +       '<span class="plan">' + planText(h, today) + '</span>'
    +       (streak.jokerUsed ? '<span class="joker">Joker genutzt</span>' : '') + '</div>'
    +   '</div>'
    +   '<button type="button" class="edit-btn" data-action="edit" data-id="' + h.id + '" aria-label="' + safeName + ' bearbeiten">⋯</button>'
    + '</div>'
    + '<div class="amount-row">'
    +   '<button type="button" class="amt-btn" data-action="amt-add" data-id="' + h.id + '" data-sign="-1" aria-label="Eine Stufe weniger"' + (v <= 0 ? ' disabled' : '') + '>−</button>'
    +   '<button type="button" class="amt-val" data-action="amt-open" data-id="' + h.id + '" data-date="' + today + '" aria-label="Menge heute eingeben">'
    +     '<b>' + numFmt.format(v) + '</b> von ' + amountText(h, a.target) + '</button>'
    +   '<button type="button" class="amt-btn plus" data-action="amt-add" data-id="' + h.id + '" data-sign="1" aria-label="Eine Stufe mehr">+' + numFmt.format(a.step) + '</button>'
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
  if (kindOf(habit) === 'amount') { openAmountSheet(id, date); return; }
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
  if (action === 'warn-info') showToast('<b>' + escapeHtml(btn.dataset.tip) + '</b>', 3500);
  if (action === 'amt-add') {
    const hb = habits.find(x => x.id === btn.dataset.id);
    if (!hb) return;
    setAmount(hb, todayStr(), amountOn(hb, todayStr()) + Number(btn.dataset.sign) * getAmount(hb).step);
    render(); saveHabits();
  }
  if (action === 'amt-open') openAmountSheet(btn.dataset.id, btn.dataset.date);
});

// Der Plus-Knopf öffnet die ausführliche Anlage (mit dem schon getippten Namen); Enter legt schnell nur den Namen an
document.getElementById('addBtn').addEventListener('click', () => openSheet(null));

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
const amtTarget = document.getElementById('amtTarget');
const amtUnit = document.getElementById('amtUnit');
const amtStep = document.getElementById('amtStep');
function parseAmountNum(t) { const n = Number(String(t).trim().replace(',', '.')); return Number.isFinite(n) ? n : NaN; }
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

// id = null: neue Gewohnheit mit allen Einstellungen anlegen (wird erst beim Speichern wirklich angelegt)
function newHabitDraft(name) {
  return {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
    name: name,
    createdAt: todayStr(),
    schedule: { type: 'days', days: ALL_DAYS.slice() },
    completions: []
  };
}

function openSheet(id) {
  const isNew = id === null;
  const h = isNew ? newHabitDraft(habitInput.value.trim()) : habits.find(x => x.id === id);
  if (!h) return;
  document.getElementById('sheetTitle').textContent = isNew ? 'Neue Gewohnheit' : 'Gewohnheit bearbeiten';
  deleteBtn.hidden = isNew;
  const s = getSchedule(h);
  sheet = {
    id: h.id,
    isNew: isNew,
    draft: isNew ? h : null,
    mode: s.type,
    days: new Set(s.type === 'days' ? s.days : ALL_DAYS),
    times: s.type === 'weekly' ? s.times : 3,
    kind: kindOf(h),
  };
  const am = getAmount(h);
  amtTarget.value = h.amount ? numFmt.format(am.target) : '';
  amtUnit.value = h.amount ? am.unit : '';
  amtStep.value = h.amount ? numFmt.format(am.step) : '';
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
  document.querySelectorAll('#kindSeg button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.kind === sheet.kind)));
  document.getElementById('amountPane').hidden = sheet.kind !== 'amount';
  document.getElementById('kindHint').textContent = sheet.kind === 'avoid'
    ? 'Du hakst jeden Tag ab, an dem du durchgehalten hast (z. B. nicht geraucht).'
    : sheet.kind === 'amount'
      ? 'Du zählst über den Tag eine Menge hoch. Mit Erreichen des Ziels gilt der Tag als geschafft.'
      : 'Du hakst jeden Tag ab, an dem du es getan hast.';
  document.getElementById('daysPane').hidden = sheet.mode !== 'days';
  document.getElementById('weeklyPane').hidden = sheet.mode !== 'weekly';
  chipsEl.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', String(sheet.days.has(Number(c.dataset.day)))));
  document.getElementById('timesValue').textContent = sheet.times;
  document.getElementById('timesMinus').disabled = sheet.times <= 1;
  document.getElementById('timesPlus').disabled = sheet.times >= 7;
  document.getElementById('planHint').textContent = sheet.mode === 'days' && sheet.kind === 'avoid'
    ? 'Bei „Vermeiden“ gibt es keinen Joker: Ein Tag ohne Haken beendet die Serie.'
    : sheet.mode === 'days'
    ? 'Ein verpasster Tag pro Woche ist erlaubt (Joker). Beim zweiten verpassten Tag in einer Woche endet die Serie.'
    : 'Die Serie zählt Wochen, in denen du dein Ziel erreichst. Welche Tage du wählst, ist egal.';
}

function closeSheet() {
  sheet = null;
  if (sheetEl.open) sheetEl.close();
}

document.getElementById('kindSeg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-kind]');
  if (!b || !sheet) return;
  sheet.kind = b.dataset.kind;
  sheetMsg.textContent = '';
  renderSheet();
});
document.getElementById('amtPresets').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-t]');
  if (!b) return;
  amtTarget.value = b.dataset.t; amtUnit.value = b.dataset.u; amtStep.value = b.dataset.s;
});

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
  const h = sheet.isNew ? sheet.draft : habits.find(x => x.id === sheet.id);
  if (!h) { closeSheet(); return; }
  let amount = null;
  if (sheet.kind === 'amount') {
    const target = parseAmountNum(amtTarget.value), step = parseAmountNum(amtStep.value), unit = amtUnit.value.trim().slice(0, 12);
    if (!(target > 0) || target > 1000000) { sheetMsg.textContent = 'Gib ein Tagesziel über 0 an.'; return; }
    if (!(step > 0) || step > target) { sheetMsg.textContent = 'Die Schrittgröße muss über 0 liegen und darf das Ziel nicht übersteigen.'; return; }
    amount = { target, step, unit };
  }
  h.name = name;
  h.kind = sheet.kind;
  if (amount) {
    h.amount = amount;
    // Bei geändertem Ziel die geschafften Tage neu bewerten
    h.amounts = h.amounts || {};
    Object.keys(h.amounts).forEach(d => syncAmountDay(h, d));
  }
  h.schedule = sheet.mode === 'days'
    ? { type: 'days', days: Array.from(sheet.days).sort((a, b) => a - b) }
    : { type: 'weekly', times: sheet.times };
  if (sheet.isNew) { habits.push(h); habitInput.value = ''; }
  render();
  saveHabits();
  closeSheet();
});


// ======================================================================
// 7) Menge eintragen (für heute oder einen früheren Tag)
// ======================================================================

const amountSheetEl = document.getElementById('amountSheet');
const amountInput = document.getElementById('amountInput');
const amountMsg = document.getElementById('amountMsg');
let amountCtx = null;

function openAmountSheet(id, date) {
  const h = habits.find(x => x.id === id);
  if (!h || kindOf(h) !== 'amount') return;
  amountCtx = { id, date };
  const a = getAmount(h);
  document.getElementById('amountTitle').textContent = h.name;
  document.getElementById('amountDate').textContent = date === todayStr() ? 'Heute' : longDate(date);
  document.getElementById('amountUnit').textContent = a.unit || '';
  const v = amountOn(h, date);
  amountInput.value = v ? numFmt.format(v) : '';
  amountMsg.textContent = '';
  amountSheetEl.showModal();
  document.getElementById('amountTitle').focus({ preventScroll: true });
}
document.getElementById('amountCancel').addEventListener('click', () => amountSheetEl.close());
amountSheetEl.addEventListener('click', (e) => { if (e.target === amountSheetEl) amountSheetEl.close(); });
document.getElementById('amountForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!amountCtx) return;
  const h = habits.find(x => x.id === amountCtx.id);
  const t = amountInput.value.trim();
  const v = t === '' ? 0 : parseAmountNum(t);
  if (!h) { amountSheetEl.close(); return; }
  if (!(v >= 0) || v > 1000000) { amountMsg.textContent = 'Bitte gib eine Zahl ein (0 oder mehr).'; return; }
  setAmount(h, amountCtx.date, v);
  render(); saveHabits();
  amountSheetEl.close();
});
