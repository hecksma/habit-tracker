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

// Alle Sessions einer Übung, neueste zuerst: { date, sets, top } (top = schwerster Satz in kg)
function exerciseSessions(exId) {
  const out = [];
  for (let i = gym.workouts.length - 1; i >= 0; i--) {
    const w = gym.workouts[i];
    const en = w.entries.find(x => x.exerciseId === exId);
    if (!en) continue;
    const kgs = en.sets.map(s => s.kg).filter(v => v !== null);
    out.push({ date: w.date, sets: en.sets, top: kgs.length ? Math.max.apply(null, kgs) : null });
  }
  return out;
}

const shortDate = d => parseDate(d.slice(0, 10)).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });

function renderGym() {
  const el = document.getElementById('gymContent');
  updateGymNav();
  if (active) { renderActive(el); updateActiveSubtitle(); updateRestBar(); return; }
  if (gymState.page === 'exercises') { renderExercisesPage(el); return; }
  if (gymState.page === 'exercise' && exById(gymState.exId)) { renderExerciseDetail(el); return; }
  gymState.page = 'home';

  const sub = document.getElementById('gymSubtitle');
  const names = new Map(gym.exercises.map(e => [e.id, e.name]));
  const sorted = gym.workouts.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  if (sorted.length) {
    const first = parseDate(sorted[sorted.length - 1].date.slice(0, 10));
    sub.textContent = sorted.length + ' Trainings seit ' + first.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  } else {
    sub.textContent = 'Noch keine Trainings.';
  }

  let html = '';
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
      + '<div class="start-row"><button type="button" class="btn primary" data-act="start" data-id="' + r.id + '">Starten</button></div></div>';
  }).join('');
  html += '<div class="start-row"><button type="button" class="tool-btn" data-act="new-routine">+ Routine erstellen</button></div>';

  html += '<div class="stats-title">Ohne Routine</div>'
    + '<div class="start-row"><button type="button" class="btn" data-act="start-empty">Leeres Training starten</button></div>';

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
  b.hidden = !(currentView === 'gym' && !active);
  b.setAttribute('aria-pressed', String(gymState.page !== 'home'));
}

// ---- Übungen: eigene Seite im Gym-Bereich ----

function exercisesListHtml() {
  const q = (gymState.exFilter || '').trim().toLowerCase();
  const list = gym.exercises.filter(e => e.name.toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, 'de'));
  if (!list.length) return '<p class="hint">' + (gym.exercises.length ? 'Nichts gefunden.' : 'Noch keine Übungen. Lege deine erste an.') + '</p>';
  return list.map(e => {
    const last = exerciseSessions(e.id)[0];
    return '<button type="button" class="ex-row" data-act="open-ex" data-id="' + e.id + '"><span>' + escapeHtml(e.name)
      + '</span><span>' + (last && last.top !== null ? numText(last.top) + ' kg' : '–') + '</span></button>';
  }).join('');
}

function renderExercisesPage(el) {
  document.getElementById('gymSubtitle').textContent = gym.exercises.length + ' Übungen';
  el.innerHTML = '<div class="stats-title" style="margin-top:20px;">Übungen</div>'
    + '<div class="action-row" style="margin-top:0;"><button type="button" class="tool-btn" data-act="new-ex">+ Neue Übung</button></div>'
    + '<input type="search" id="exFilter" class="text-input" placeholder="Übung suchen" aria-label="Übung suchen" value="' + escapeHtml(gymState.exFilter || '') + '" style="margin:0 0 6px;" />'
    + '<div id="exList">' + exercisesListHtml() + '</div>';
}

function chartSvg(points) {
  // points: Gewicht je Session, älteste zuerst
  const W = 320, H = 110, L = 34, R = 8, T = 10, B = 18;
  const min = Math.min.apply(null, points), max = Math.max.apply(null, points);
  const lo = min === max ? min - 1 : min, hi = min === max ? max + 1 : max;
  const x = i => points.length === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (points.length - 1);
  const y = v => T + (hi - v) * (H - T - B) / (hi - lo);
  const pts = points.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ');
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Schwerster Satz der letzten Sessions in kg">'
    + '<text x="0" y="' + (T + 4) + '" fill="var(--ink-dim)" font-size="10">' + numText(hi) + '</text>'
    + '<text x="0" y="' + (H - B + 4) + '" fill="var(--ink-dim)" font-size="10">' + numText(lo) + '</text>'
    + '<line x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '" stroke="var(--border)"/>'
    + '<polyline points="' + pts + '" fill="none" stroke="var(--amber)" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
    + points.map((v, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3" fill="var(--amber)"/>').join('')
    + '</svg>';
}

function renderExerciseDetail(el) {
  const ex = exById(gymState.exId);
  const sessions = exerciseSessions(ex.id);
  document.getElementById('gymSubtitle').textContent = sessions.length + ' Sessions';
  const tops = sessions.filter(s => s.top !== null);
  const best = tops.length ? tops.reduce((a, b) => (b.top > a.top ? b : a)) : null;
  let html = '<div class="start-row" style="justify-content:space-between;margin-top:18px;">'
    + '<button type="button" class="tool-btn" data-act="back">‹ Übungen</button>'
    + '<button type="button" class="tool-btn" data-act="edit-ex" data-id="' + ex.id + '">Bearbeiten</button></div>'
    + '<div class="stats-title" style="margin-top:16px;">' + escapeHtml(ex.name) + '</div>'
    + '<div class="stat-grid">'
    + '<div class="stat-card"><div class="stat-value">' + (best ? numText(best.top) + ' kg' : '–') + '</div><div class="stat-label">Bestes Gewicht</div><div class="stat-sub">' + (best ? shortDate(best.date) : 'noch keine Daten') + '</div></div>'
    + '<div class="stat-card"><div class="stat-value">' + (tops[0] ? numText(tops[0].top) + ' kg' : '–') + '</div><div class="stat-label">Zuletzt</div><div class="stat-sub">' + (sessions[0] ? shortDate(sessions[0].date) : 'noch nie trainiert') + '</div></div>'
    + '</div>';
  if (tops.length >= 2) {
    html += '<div class="stats-title">Verlauf (schwerster Satz)</div>' + chartSvg(tops.slice(0, 12).reverse().map(s => s.top));
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
