// ======================================================================
// Gym: Anzeige (Startseite, Übungen, Verlauf)
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================

// ======================================================================
// 10) Gym: Anzeige
// ======================================================================

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

function setText(set) {
  const parts = [];
  if (set.kg !== null && set.reps !== null) parts.push(nf.format(set.kg) + ' kg × ' + set.reps);
  else if (set.reps !== null) parts.push(set.reps + ' Wdh.');
  else if (set.kg !== null) parts.push(nf.format(set.kg) + ' kg');
  if (set.sec !== null && set.sec > 0) parts.push(Math.round(set.sec / 60) + ' Min');
  if (set.dist !== null && set.dist > 0) parts.push(nf.format(set.dist / 1000) + ' km');
  return parts.join(', ') || '–';
}

function workoutDateText(w) {
  const d = parseDate(w.date.slice(0, 10));
  return d.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function renderWorkout(w, names) {
  const mins = w.durationSec ? Math.round(w.durationSec / 60) + ' Min, ' : '';
  return '<details class="stat-habit">'
    + '<summary><span class="log-summary-text"><span class="log-title">' + escapeHtml(w.name) + '</span>'
    + '<span class="log-sub">' + workoutDateText(w) + ', ' + mins + w.entries.length + ' Übungen</span></span>'
    + '<span class="chevron" aria-hidden="true"></span></summary>'
    + '<div class="sh-body">' + w.entries.map(en =>
        '<div class="log-ex"><div class="log-ex-name">' + escapeHtml(names.get(en.exerciseId) || 'Übung') + '</div>'
        + '<div class="set-chips">' + en.sets.map(st => '<span class="set-chip">' + setText(st) + '</span>').join('') + '</div></div>'
      ).join('') + '</div></details>';
}

// --- Hilfen für Übungen und Zahlen ---

const exById = id => gym.exercises.find(e => e.id === id);
const numText = n => String(n).replace('.', ',');           // 47.5 -> "47,5"
const parseNum = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
const clock = ms => {                                       // 83000 -> "1:23", ab einer Stunde "1:02:03"
  const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), sec = t % 60;
  return (h ? h + ':' + pad(m) : m) + ':' + pad(sec);
};

// Die Sätze, die du bei dieser Übung zuletzt gemacht hast (leer, wenn es noch keine gibt)
function lastSets(exId) {
  for (let i = gym.workouts.length - 1; i >= 0; i--) {
    const en = gym.workouts[i].entries.find(x => x.exerciseId === exId);
    if (en) return en.sets;
  }
  return [];
}

function lastDone(routineId) {
  let best = null;
  gym.workouts.forEach(w => { if (w.routineId === routineId && (!best || w.date > best.date)) best = w; });
  return best;
}

const PENCIL_ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg>';

// Alle Sessions einer Übung, neueste zuerst: { date, name, sets, top, topReps } (top = schwerster Satz in kg)
function exerciseSessions(exId) {
  const out = [];
  for (let i = gym.workouts.length - 1; i >= 0; i--) {
    const w = gym.workouts[i];
    const en = w.entries.find(x => x.exerciseId === exId);
    if (!en) continue;
    const kgs = en.sets.map(s => s.kg).filter(v => v !== null);
    const top = kgs.length ? Math.max.apply(null, kgs) : null;
    // Wiederholungen des schwersten Satzes (bei Gleichstand die höchste Zahl)
    const reps = en.sets.filter(s => s.kg === top && s.reps !== null).map(s => s.reps);
    out.push({ date: w.date, name: w.name, sets: en.sets, top, topReps: reps.length ? Math.max.apply(null, reps) : null });
  }
  return out;
}

const shortDate = d => parseDate(d.slice(0, 10)).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

function renderGym() {
  const el = document.getElementById('gymContent');
  updateGymNav();
  // Eine Übungsseite kann auch während eines Trainings geöffnet sein (Tipp auf den Übungsnamen)
  if (gymState.page === 'exercise' && exById(gymState.exId)) { renderExerciseDetail(el); return; }
  if (gymState.page === 'workout' && active) { renderActive(el); updateActiveSubtitle(); updateRestBar(); return; }
  if (gymState.page === 'workout') gymState.page = 'home';
  if (gymState.page === 'exercises') { renderExercisesPage(el); return; }
  gymState.page = 'home';
  if (gymState.tab === 'stats') { renderGymStats(el); return; }

  const sub = document.getElementById('gymSubtitle');
  const names = new Map(gym.exercises.map(e => [e.id, e.name]));
  const sorted = gym.workouts.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  if (sorted.length) {
    const first = parseDate(sorted[sorted.length - 1].date.slice(0, 10));
    sub.textContent = sorted.length + ' Trainings seit ' + first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  } else {
    sub.textContent = 'Noch keine Trainings.';
  }

  let html = runBannerHtml();
  if (!gym.workouts.length && !gym.routines.length && !gym.exercises.length) {
    html += '<div class="empty-state" style="padding:28px 10px 8px;"><div class="big">Noch keine Trainingsdaten</div>'
      + 'Du kannst Routinen und Übungen selbst anlegen oder deinen bisherigen Verlauf aus einer CSV-Datei übernehmen.'
      + '<div class="more-row"><button type="button" class="btn" data-act="import">Trainingsdaten importieren</button></div></div>';
  }

  html += '<div class="stats-title" style="margin-top:20px;">Routinen</div>';
  html += gym.routines.map(r => {
    const done = lastDone(r.id);
    return '<div class="routine-card"><div class="routine-head"><p class="routine-name">' + escapeHtml(r.name) + '</p>'
      + '<button type="button" class="icon-btn small" data-act="edit-routine" data-id="' + r.id + '" aria-label="Routine ' + escapeHtml(r.name) + ' bearbeiten">' + PENCIL_ICON + '</button></div>'
      + '<p class="routine-sub">' + r.items.length + ' Übungen: ' + escapeHtml(r.items.map(it => names.get(it.exerciseId) || 'Übung').join(', ')) + '</p>'
      + '<p class="routine-last">' + (done ? 'Zuletzt: ' + workoutDateText(done) : 'Noch nicht trainiert') + '</p>'
      + '<div class="start-row"><button type="button" class="btn primary" data-act="start" data-id="' + r.id + '"' + (active ? ' disabled' : '') + '>Starten</button></div></div>';
  }).join('');
  html += '<div class="start-row"><button type="button" class="tool-btn" data-act="new-routine">+ Routine erstellen</button></div>';

  html += '<div class="stats-title">Ohne Routine</div>'
    + '<div class="start-row"><button type="button" class="btn" data-act="start-empty"' + (active ? ' disabled' : '') + '>Leeres Training starten</button></div>';

  if (sorted.length) {
    html += '<div class="stats-title">Verlauf</div>' + sorted.slice(0, gymState.shown).map(w => renderWorkout(w, names)).join('');
    if (sorted.length > gymState.shown) {
      html += '<div class="more-row"><button type="button" class="tool-btn" data-act="more">Mehr anzeigen (' + (sorted.length - gymState.shown) + ' weitere)</button></div>';
    }
  }
  el.innerHTML = html;
}

// Der Knopf oben neben den Einstellungen: Übungen öffnen / zurück zur Startseite
function updateGymNav() {
  const b = document.getElementById('exercisesBtn');
  b.hidden = !(currentView === 'gym' && gymState.page !== 'workout');
  b.setAttribute('aria-pressed', String(gymState.page === 'exercises'));
  // Der Umschalter Training / Statistik gehört nur zur Startseite
  const tabs = document.getElementById('gymTabs');
  tabs.hidden = gymState.page !== 'home';
  tabs.querySelectorAll('button').forEach(t => t.setAttribute('aria-pressed', String(t.dataset.gtab === gymState.tab)));
}

// Hinweis oben, solange ein Training läuft: ein Tipp führt zurück ins Training
function runBannerHtml() {
  if (!active) return '';
  return '<button type="button" class="run-banner" data-act="resume"><span><span class="rb-title"><span class="dot"></span>Training läuft: ' + escapeHtml(active.name) + '</span><br />'
    + '<span class="rb-sub" id="runSub">' + escapeHtml(activeSummary()) + '</span></span><span class="rb-go">Zurück ›</span></button>';
}

// ---- Übungen: eigene Seite im Gym-Bereich ----

function exercisesListHtml() {
  const q = (gymState.exFilter || '').trim().toLowerCase();
  const g = gymState.exGroup;
  const list = gym.exercises.filter(e => e.name.toLowerCase().includes(q) && (!g || e.group === g)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  if (!list.length) return '<p class="hint">' + (gym.exercises.length ? 'Nichts gefunden.' : 'Noch keine Übungen. Lege deine erste an.') + '</p>';
  return list.map(e => {
    const last = exerciseSessions(e.id)[0];
    return '<button type="button" class="ex-row" data-act="open-ex" data-id="' + e.id + '"><span><span class="ex-name">' + escapeHtml(e.name) + '</span>'
      + (e.group ? '<span class="log-sub">' + e.group + '</span>' : '') + '</span><span>' + (last && last.top !== null ? numText(last.top) + ' kg' : '–') + '</span></button>';
  }).join('');
}

function renderExercisesPage(el) {
  document.getElementById('gymSubtitle').textContent = gym.exercises.length + ' Übungen';
  el.innerHTML = '<div class="stats-title" style="margin-top:20px;">Übungen</div>'
    + '<div class="action-row" style="margin-top:0;"><button type="button" class="tool-btn" data-act="new-ex">+ Neue Übung</button></div>'
    + '<input type="search" id="exFilter" class="text-input" placeholder="Übung suchen" aria-label="Übung suchen" value="' + escapeHtml(gymState.exFilter || '') + '" style="margin:0 0 6px;" />'
    + '<div class="chips wrap" id="exGroupFilter" role="group" aria-label="Muskelgruppe filtern" style="margin:6px 0 10px;">'
    + ['', ...MUSCLE_GROUPS].map(g => '<button type="button" class="chip" data-act="group-filter" data-g="' + g + '" aria-pressed="' + ((gymState.exGroup || '') === g) + '">' + (g || 'Alle') + '</button>').join('')
    + '</div>'
    + '<div id="exList">' + exercisesListHtml() + '</div>';
}

// Liniendiagramm. points: Sessions (älteste zuerst) mit { date, name, top, topReps }.
// Antippen oder Darüberwischen zeigt den genauen Wert (siehe Block "Diagramm antippen" unten).
function chartSvg(points) {
  const W = 320, H = 118, L = 34, R = 10, T = 10, B = 26;
  const vals = points.map(p => p.top);
  const min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  const lo = min === max ? min - 1 : min, hi = min === max ? max + 1 : max;
  const n = points.length;
  const x = i => n === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (n - 1);
  const y = v => T + (hi - v) * (H - T - B) / (hi - lo);
  const pts = points.map((p, i) => x(i).toFixed(1) + ',' + y(p.top).toFixed(1)).join(' ');
  // Beschriftung der Achse: Datum (Tag.Monat.) unter jedem 1., 2. oder 3. Punkt, je nach Anzahl,
  // vom neuesten Punkt aus gezählt, damit nichts übereinanderliegt
  const every = n <= 6 ? 1 : n <= 9 ? 2 : 3;
  const labels = points.map((p, i) => {
    if ((n - 1 - i) % every !== 0) return '';
    const d = parseDate(p.date.slice(0, 10));
    return '<text x="' + x(i).toFixed(1) + '" y="' + (H - 8) + '" fill="var(--ink-dim)" font-size="9.5" text-anchor="middle">' + d.getDate() + '.' + (d.getMonth() + 1) + '.</text>';
  }).join('');
  return '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Schwerster Satz der letzten Sessions in kg. Antippen zeigt Werte.">'
    + '<text x="0" y="' + (T + 4) + '" fill="var(--ink-dim)" font-size="10">' + numText(hi) + '</text>'
    + '<text x="0" y="' + (H - B + 4) + '" fill="var(--ink-dim)" font-size="10">' + numText(lo) + '</text>'
    + '<line x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '" stroke="var(--border)"/>'
    + labels
    + '<polyline points="' + pts + '" fill="none" stroke="var(--amber)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
    + points.map((p, i) => {
      const tip = shortDate(p.date) + ' · ' + p.name + ' · ' + numText(p.top) + ' kg' + (p.topReps !== null ? ' × ' + p.topReps : '');
      return '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(p.top).toFixed(1) + '" r="3" fill="var(--amber)" data-tip="' + escapeHtml(tip) + '"/>';
    }).join('')
    + '</svg>';
}

// ---- Diagramm antippen ----
// Beim Tippen oder Wischen über ein Liniendiagramm wird der nächstliegende Punkt hervorgehoben
// und sein Wert in einer Infoblase gezeigt (showTip steht in core.js).
let scrubbing = null;

function selectChartPoint(svg, clientX) {
  const rect = svg.getBoundingClientRect();
  const k = rect.width / 320; // das Diagramm ist skaliert: viewBox-Breite 320
  let best = null, bestDist = Infinity;
  svg.querySelectorAll('circle[data-tip]').forEach(c => {
    const d = Math.abs(rect.left + Number(c.getAttribute('cx')) * k - clientX);
    if (d < bestDist) { bestDist = d; best = c; }
  });
  if (!best) return;
  svg.querySelectorAll('circle.sel').forEach(c => c.classList.remove('sel'));
  best.classList.add('sel');
  showTip(best.dataset.tip, rect.left + Number(best.getAttribute('cx')) * k, rect.top + Number(best.getAttribute('cy')) * k - 4);
}

document.addEventListener('pointerdown', (e) => {
  const svg = e.target.closest && e.target.closest('.chart-svg');
  if (!svg) return;
  scrubbing = svg;
  selectChartPoint(svg, e.clientX);
});
document.addEventListener('pointermove', (e) => { if (scrubbing) selectChartPoint(scrubbing, e.clientX); });
['pointerup', 'pointercancel'].forEach(t => document.addEventListener(t, () => { scrubbing = null; }));

// Zurück von einer Übungsseite: ins Training (falls eines läuft) oder zur Übungsliste, an der alten Scroll-Position
function leaveExercise() {
  gymState.page = (gymState.backPage === 'workout' && active) ? 'workout' : 'exercises';
  renderGym();
  window.scrollTo(0, gymState.backScroll || 0);
}

function openExercise(id) {
  gymState.backScroll = window.scrollY;
  gymState.backPage = gymState.page === 'workout' ? 'workout' : 'exercises';
  gymState.page = 'exercise';
  gymState.exId = id;
  gymState.exShown = 10;
  renderGym();
  window.scrollTo(0, 0);
}

function renderExerciseDetail(el) {
  const ex = exById(gymState.exId);
  const sessions = exerciseSessions(ex.id);
  document.getElementById('gymSubtitle').textContent = sessions.length + ' Sessions';
  const tops = sessions.filter(s => s.top !== null);
  const best = tops.length ? tops.reduce((a, b) => (b.top > a.top ? b : a)) : null;
  let html = '<div class="start-row" style="justify-content:space-between;margin-top:18px;">'
    + '<button type="button" class="tool-btn" data-act="back">' + (gymState.backPage === 'workout' && active ? '‹ Training' : '‹ Übungen') + '</button>'
    + '<button type="button" class="tool-btn" data-act="edit-ex" data-id="' + ex.id + '">Bearbeiten</button></div>'
    + '<div class="stats-title" style="margin-top:16px;margin-bottom:2px;">' + escapeHtml(ex.name) + '</div>'
    + '<p class="routine-last" style="margin:0 0 12px;">' + (ex.group || 'Keine Muskelgruppe') + (ex.rest ? ' · Pause ' + clock(ex.rest * 1000) : '') + '</p>'
    + '<div class="stat-grid">'
    + '<div class="stat-card"><div class="stat-value">' + (best ? numText(best.top) + ' kg' : '–') + '</div><div class="stat-label">Bestes Gewicht</div><div class="stat-sub">' + (best ? shortDate(best.date) : 'noch keine Daten') + '</div></div>'
    + '<div class="stat-card"><div class="stat-value">' + (tops[0] ? numText(tops[0].top) + ' kg' : '–') + '</div><div class="stat-label">Zuletzt</div><div class="stat-sub">' + (sessions[0] ? shortDate(sessions[0].date) : 'noch nie trainiert') + '</div></div>'
    + '</div>';
  if (tops.length >= 2) {
    html += '<div class="stats-title">Verlauf (schwerster Satz)</div><p class="stats-note" style="margin:-6px 2px 8px;">Tippe auf das Diagramm, um die Werte zu sehen.</p>' + chartSvg(tops.slice(0, 12).reverse());
  }
  if (sessions.length) {
    html += '<div class="stats-title">Letzte Sessions</div>' + sessions.slice(0, gymState.exShown || 10).map(s =>
      '<div class="wk-ex"><div class="log-ex-name">' + shortDate(s.date) + '</div><div class="set-chips">'
      + s.sets.map(st => '<span class="set-chip">' + setText(st) + '</span>').join('') + '</div></div>').join('');
    if (sessions.length > (gymState.exShown || 10)) {
      html += '<div class="more-row"><button type="button" class="tool-btn" data-act="more-ex">Mehr anzeigen</button></div>';
    }
  }
  el.innerHTML = html;
}


// ======================================================================
// 10c) Gym: Statistik (Kalender, Zahlen, Wochen, Muskelgruppen)
// ======================================================================

// Trainings pro Tag: { 'YYYY-MM-DD': [Workout, ...] }
function workoutsByDay() {
  const map = {};
  gym.workouts.forEach(w => { (map[w.date.slice(0, 10)] = map[w.date.slice(0, 10)] || []).push(w); });
  return map;
}

function shiftGymMonth(dir) {
  const cur = todayStr().slice(0, 7);
  const [y, m] = (gymState.calMonth || cur).split('-').map(Number);
  const d = new Date(y, m - 1 + dir, 1, 12);
  gymState.calMonth = d.getFullYear() + '-' + pad(d.getMonth() + 1);
  gymState.calSel = null;
  renderGym();
}

function gymCalendarHtml(byDay, today) {
  const cur = today.slice(0, 7);
  const firstKey = Object.keys(byDay).sort()[0];
  const firstMonth = firstKey ? firstKey.slice(0, 7) : cur;
  let ym = gymState.calMonth || cur;
  if (ym > cur) ym = cur;
  if (ym < firstMonth) ym = firstMonth;
  gymState.calMonth = ym;
  const [y, m] = ym.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1, 12);
  const daysInMonth = new Date(y, m, 0).getDate();
  const label = monthStart.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  let cells = DAY_LABELS.map(l => '<span class="cal-wd">' + l + '</span>').join('');
  for (let i = 0; i < weekdayIdx(monthStart); i++) cells += '<span></span>';
  let count = 0;
  for (let n = 1; n <= daysInMonth; n++) {
    const key = fmt(new Date(y, m - 1, n, 12));
    const trained = !!byDay[key];
    if (trained) count++;
    const cls = ['cal-day'];
    if (trained) cls.push('trained');
    if (key === today) cls.push('today');
    if (key === gymState.calSel) cls.push('sel');
    cells += '<button type="button" class="' + cls.join(' ') + '" data-act="gcal-day" data-date="' + key + '"'
      + ' aria-label="' + n + '. ' + label + ': ' + (trained ? 'Training' : 'kein Training') + '"' + (key > today ? ' disabled' : '') + '>' + n + '</button>';
  }
  let html = '<div class="cal-head">'
    + '<button type="button" class="cal-nav" data-act="gcal-month" data-dir="-1" aria-label="Vorheriger Monat"' + (ym <= firstMonth ? ' disabled' : '') + '>‹</button>'
    + '<span>' + label + ' · ' + count + (count === 1 ? ' Training' : ' Trainings') + '</span>'
    + '<button type="button" class="cal-nav" data-act="gcal-month" data-dir="1" aria-label="Nächster Monat"' + (ym >= cur ? ' disabled' : '') + '>›</button>'
    + '</div><div class="cal">' + cells + '</div>';
  // Angetippter Tag: die Trainings dieses Tages
  if (gymState.calSel) {
    const names = new Map(gym.exercises.map(e => [e.id, e.name]));
    const list = byDay[gymState.calSel] || [];
    html += '<div class="day-list">' + (list.length
      ? list.map(w => renderWorkout(w, names)).join('')
      : '<p class="hint">Am ' + longDate(gymState.calSel) + ' war kein Training.</p>') + '</div>';
  }
  return html;
}

// Balken: Trainings pro Woche. Gleiche Optik wie die Balken bei den Habits.
function weekBarsHtml(items) {
  const max = Math.max(1, ...items.map(i => i.count));
  return '<div class="chart" role="img" aria-label="Trainings pro Woche">' + items.map(it => {
    const tip = it.tip ? ' data-tip="' + escapeHtml(it.tip) + '" tabindex="0" role="button" aria-label="' + escapeHtml(it.tip) + '"' : '';
    return '<div class="bar-col' + (it.count ? '' : ' empty') + '"' + tip + '>'
      + '<span class="bar-val">' + it.count + '</span>'
      + '<span class="bar-track"><span class="bar" style="height:' + Math.max(Math.round(100 * it.count / max), 2) + '%"></span></span>'
      + '<span class="bar-label">' + it.label + '</span></div>';
  }).join('') + '</div>';
}

function renderGymStats(el) {
  const sub = document.getElementById('gymSubtitle');
  if (!gym.workouts.length) {
    sub.textContent = 'Noch keine Trainings.';
    el.innerHTML = '<div class="empty-state"><div class="big">Noch keine Statistik</div>Sobald du ein Training beendet hast, siehst du hier deinen Kalender und deine Zahlen.</div>';
    return;
  }
  const today = todayStr();
  const todayD = parseDate(today);
  const byDay = workoutsByDay();
  const days = Object.keys(byDay);
  sub.textContent = gym.workouts.length + ' Trainings an ' + days.length + ' Tagen';

  // Wochen (Montag als Start), in denen trainiert wurde
  const weeks = new Set(days.map(k => fmt(weekStart(parseDate(k)))));
  const thisWeek = weekStart(todayD);
  let streak = 0, w = weeks.has(fmt(thisWeek)) ? thisWeek : addDays(thisWeek, -7);
  while (weeks.has(fmt(w))) { streak++; w = addDays(w, -7); }

  // Letzte 12 Wochen
  const items = [];
  for (let i = 11; i >= 0; i--) {
    const ws = addDays(thisWeek, -7 * i), key = fmt(ws), we = fmt(addDays(ws, 6));
    const count = days.filter(k => k >= key && k <= we).length;
    const lbl = ws.getDate() + '.' + (ws.getMonth() + 1) + '.';
    items.push({ count, label: i % 2 === 0 ? lbl : '', tip: 'Woche ab ' + lbl + ': ' + count + (count === 1 ? ' Training' : ' Trainings') });
  }
  const first = days.slice().sort()[0];
  const weeksSince = Math.max(1, Math.min(12, Math.floor((thisWeek - weekStart(parseDate(first))) / 6048e5) + 1));
  const avg = items.reduce((a, b) => a + b.count, 0) / weeksSince;
  const monthKey = today.slice(0, 7);
  const thisMonth = days.filter(k => k.slice(0, 7) === monthKey).length;

  // Sätze pro Muskelgruppe in den letzten 30 Tagen
  const since = fmt(addDays(todayD, -29));
  const perGroup = {};
  gym.workouts.forEach(wk => {
    if (wk.date.slice(0, 10) < since) return;
    wk.entries.forEach(en => {
      const ex = exById(en.exerciseId);
      const g = (ex && ex.group) || 'Ohne Gruppe';
      perGroup[g] = (perGroup[g] || 0) + en.sets.length;
    });
  });
  const groups = Object.keys(perGroup).sort((a, b) => perGroup[b] - perGroup[a]);
  const gmax = groups.length ? perGroup[groups[0]] : 1;

  el.innerHTML = '<div class="stats-title" style="margin-top:20px;">Kalender</div>' + gymCalendarHtml(byDay, today)
    + '<div class="stats-title">Zahlen</div><div class="stat-grid">'
    + '<div class="stat-card"><div class="stat-value">' + gym.workouts.length + '</div><div class="stat-label">Trainings gesamt</div></div>'
    + '<div class="stat-card"><div class="stat-value">' + thisMonth + '</div><div class="stat-label">Tage diesen Monat</div></div>'
    + '<div class="stat-card"><div class="stat-value">' + nf.format(Math.round(avg * 10) / 10) + '</div><div class="stat-label">Ø pro Woche</div><div class="stat-sub">letzte ' + weeksSince + ' Wochen</div></div>'
    + '<div class="stat-card"><div class="stat-value">' + streak + '</div><div class="stat-label">Wochen in Folge</div><div class="stat-sub">mit mindestens 1 Training</div></div>'
    + '</div>'
    + '<div class="stats-title">Trainingstage pro Woche</div>' + weekBarsHtml(items)
    + '<div class="stats-title">Sätze pro Muskelgruppe</div><p class="stats-note" style="margin:-6px 2px 8px;">Letzte 30 Tage</p>'
    + (groups.length ? groups.map(g => '<div class="grp-row"><span>' + escapeHtml(g) + '</span><span class="grp-bar"><span style="width:' + Math.max(Math.round(100 * perGroup[g] / gmax), 3) + '%"></span></span><span class="grp-num">' + perGroup[g] + '</span></div>').join('')
        : '<p class="hint">In den letzten 30 Tagen war kein Training.</p>');
}

// Umschalter Training / Statistik
document.getElementById('gymTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-gtab]');
  if (!b) return;
  gymState.tab = b.dataset.gtab === 'stats' ? 'stats' : 'train';
  renderGym();
  window.scrollTo(0, 0);
});
