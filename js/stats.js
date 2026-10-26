// ======================================================================
// Habits: Statistik
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================

// ======================================================================
// 8) Statistik
// ======================================================================

const statsEl = document.getElementById('stats');
const PERIODS = { 7: '7 Tage', 30: '30 Tage', 365: 'Jahr' };
// Merkt sich, was du in der Statistik gewählt hast, damit es beim Neuzeichnen erhalten bleibt
const statsState = { period: 30, kind: 'do', openId: null, month: {} };

// Die Eingabeleiste unten gibt es nur im Habit-Bereich und nur in der Tagesliste.
function updateChrome() {
  document.querySelector('.add-bar').hidden = !((currentView === 'habits' && habitsTab === 'today') || currentView === 'planner');
  if (typeof updateRestBar === 'function') updateRestBar();
  if (typeof updateGymNav === 'function') updateGymNav();
}

function setHabitsTab(tab) {
  habitsTab = tab === 'stats' ? 'stats' : 'today';
  document.querySelectorAll('.habits-tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === habitsTab)));
  contentEl.hidden = habitsTab !== 'today';
  statsEl.hidden = habitsTab !== 'stats';
  updateChrome();
  render();
}

document.querySelector('.habits-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (b) setHabitsTab(b.dataset.tab);
});

// --- Kennzahlen ---
//
// "Geplant" und "erledigt" sind die Grundlage fast aller Zahlen:
//  - Feste Tage: Jeder geplante Tag zählt als geplant. Ein erledigter geplanter Tag zählt als erledigt.
//    Ein erledigter Tag, der nicht geplant war, ist ein Bonus und fließt nur in "Erledigt gesamt" ein.
//    Heute zählt nur, wenn es schon erledigt ist (der Tag läuft ja noch).
//  - Mal pro Woche: Jede Woche zählt mit ihrem Ziel (z. B. 3) als geplant, erledigt zählt
//    höchstens das Ziel. Die laufende Woche und die Startwoche zählen nur, wenn das Ziel erreicht ist.
//
// fromStr/toStr begrenzen den Zeitraum. Vor dem ersten Tag der Gewohnheit wird nichts gezählt.
function habitStats(h, fromStr, today, toStr) {
  const sched = getSchedule(h);
  const done = doneSet(h);
  const first = firstDay(h);
  const start = fromStr > first ? fromStr : first;
  const end = toStr && toStr < today ? toStr : today;
  const r = { planned: 0, done: 0, bonus: 0, total: 0, byWeekday: ALL_DAYS.map(() => ({ planned: 0, done: 0 })) };
  if (start > end) return r;
  const s = parseDate(start);

  if (sched.type === 'days') {
    for (let d = s; fmt(d) <= end; d = addDays(d, 1)) {
      const key = fmt(d), idx = weekdayIdx(d), isDone = done.has(key);
      if (sched.days.includes(idx)) {
        if (key === today && !isDone) continue;
        r.planned++; r.byWeekday[idx].planned++;
        if (isDone) { r.done++; r.byWeekday[idx].done++; }
      } else if (isDone) {
        r.bonus++;
      }
    }
    r.total = r.done + r.bonus;
    return r;
  }

  const thisWeek = fmt(weekStart(parseDate(today)));
  const firstWeek = fmt(weekStart(parseDate(first)));
  const lastWeek = fmt(weekStart(parseDate(end)));
  for (let ws = weekStart(s); fmt(ws) <= lastWeek; ws = addDays(ws, 7)) {
    let count = 0;
    for (let k = 0; k < 7; k++) if (done.has(fmt(addDays(ws, k)))) count++;
    const wk = fmt(ws);
    if ((wk === thisWeek || wk === firstWeek) && count < sched.times) continue;
    r.planned += sched.times;
    r.done += Math.min(count, sched.times);
  }
  for (let d = s; fmt(d) <= end; d = addDays(d, 1)) if (done.has(fmt(d))) r.total++;
  return r;
}

// Längste Serie, die es je gab: Wir fragen für jeden Tag seit Beginn, wie lang die Serie
// an diesem Tag war, und nehmen den größten Wert.
function bestStreak(h, today) {
  let best = 0;
  for (let d = parseDate(firstDay(h)); fmt(d) <= today; d = addDays(d, 1)) {
    const v = computeStreak(h, fmt(d)).value;
    if (v > best) best = v;
  }
  return best;
}

// Alle Habits zusammen für einen Zeitraum
function overallStats(fromStr, today, list) {
  list = list || habits;
  const o = { planned: 0, done: 0, total: 0, byWeekday: ALL_DAYS.map(() => ({ planned: 0, done: 0 })), perfect: 0, planDays: 0, perHabit: [] };
  list.forEach(h => {
    const s = habitStats(h, fromStr, today);
    o.perHabit.push({ h, s });
    o.planned += s.planned; o.done += s.done; o.total += s.total;
    if (getSchedule(h).type === 'days') {
      s.byWeekday.forEach((x, i) => { o.byWeekday[i].planned += x.planned; o.byWeekday[i].done += x.done; });
    }
  });

  // "Alles geschafft": Tage, an denen alle geplanten Habits (mit festen Tagen) erledigt wurden
  const fixed = list.filter(h => getSchedule(h).type === 'days')
    .map(h => ({ days: getSchedule(h).days, done: doneSet(h), first: firstDay(h) }));
  for (let d = parseDate(fromStr); fmt(d) <= today; d = addDays(d, 1)) {
    const key = fmt(d), idx = weekdayIdx(d);
    const due = fixed.filter(x => x.first <= key && x.days.includes(idx));
    if (due.length === 0) continue;
    const all = due.every(x => x.done.has(key));
    if (key === today && !all) continue;
    o.planDays++;
    if (all) o.perfect++;
  }
  return o;
}

// Quote der letzten n Wochen (Mo bis So), alle Habits zusammen
function weeklyTrend(today, n, list) {
  list = list || habits;
  const thisWs = weekStart(parseDate(today));
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const ws = addDays(thisWs, -7 * i);
    let planned = 0, done = 0;
    list.forEach(h => {
      const s = habitStats(h, fmt(ws), today, fmt(addDays(ws, 6)));
      planned += s.planned; done += s.done;
    });
    out.push({ ws, planned, done });
  }
  return out;
}

// --- Darstellung ---

function pctText(done, planned) { return planned > 0 ? Math.round(100 * done / planned) + ' %' : '–'; }

// Einfache Balkengrafik aus HTML und CSS (keine Bibliothek nötig)
function barChart(items) {
  return '<div class="chart" role="img" aria-label="Balkendiagramm">' + items.map(it => {
    const has = it.planned > 0;
    const pct = has ? Math.round(100 * it.done / it.planned) : 0;
    const tip = it.tip ? ' data-tip="' + escapeHtml(it.tip) + '" tabindex="0" role="button" aria-label="' + escapeHtml(it.tip) + '"' : '';
    return '<div class="bar-col' + (has ? '' : ' empty') + '"' + tip + '>'
      + '<span class="bar-val">' + (has ? pct : '–') + '</span>'
      + '<span class="bar-track"><span class="bar" style="height:' + (has ? Math.max(pct, 2) : 2) + '%"></span></span>'
      + '<span class="bar-label">' + it.label + '</span></div>';
  }).join('') + '</div>';
}

const DAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];

// Text für die Infoblase: "Montag: 3 von 4 (75 %)"
function barTip(prefix, done, planned) {
  return prefix + ': ' + (planned > 0 ? done + ' von ' + planned + ' (' + Math.round(100 * done / planned) + ' %)' : 'nichts geplant');
}

function weekdayChart(byWeekday) {
  return barChart(byWeekday.map((x, i) => ({ label: DAY_LABELS[i], planned: x.planned, done: x.done, tip: barTip(DAY_LONG[i], x.done, x.planned) })));
}

function longDate(str) {
  return parseDate(str).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Welche Arten gibt es gerade? Die Statistik zeigt immer nur eine Art, damit die Grafiken übersichtlich bleiben.
const KIND_NAMES = { do: 'Tun', avoid: 'Vermeiden', amount: 'Menge' };
const KIND_TEXT = {
  do:     { done: 'erledigt', total: 'Erledigt gesamt', perfect: 'Alles geschafft', totalSub: 'Abhakungen im Zeitraum', quote: 'geplant erledigt', all: 'Insgesamt erledigt' },
  avoid:  { done: 'durchgehalten', total: 'Durchgehalten gesamt', perfect: 'Alles durchgehalten', totalSub: 'Haken im Zeitraum', quote: 'geplant durchgehalten', all: 'Insgesamt durchgehalten' },
  amount: { done: 'Ziel erreicht', total: 'Ziel erreicht', perfect: 'Alle Ziele erreicht', totalSub: 'Tage mit erreichtem Ziel', quote: 'geplant Ziel erreicht', all: 'Tage mit erreichtem Ziel' }
};
function statsKinds() { return ['do', 'avoid', 'amount'].filter(k => habits.some(h => kindOf(h) === k)); }

// Mengen: Kennzahlen im Zeitraum
function amountStats(h, fromStr, today) {
  const first = firstDay(h);
  const start = fromStr > first ? fromStr : first;
  let sum = 0, days = 0, reached = 0, best = 0;
  const tgt = getAmount(h).target;
  Object.keys(h.amounts || {}).forEach(d => { const v = amountOn(h, d); if (v > best) best = v; });
  for (let d = parseDate(start); fmt(d) <= today; d = addDays(d, 1)) {
    const key = fmt(d), v = amountOn(h, key);
    if (key === today && v === 0) continue; // heute läuft noch
    sum += v; days++;
    if (v >= tgt - 1e-9) reached++;
  }
  return { avg: days ? sum / days : 0, days, reached, best };
}

// Balken der Menge mit Zielstrich: 7 und 30 Tage täglich, ein Jahr als Monatsdurchschnitt
function amountChart(h, today, period) {
  const a = getAmount(h), first = firstDay(h);
  const items = [];
  if (period === 365) {
    const t = parseDate(today);
    for (let i = 11; i >= 0; i--) {
      const ms = new Date(t.getFullYear(), t.getMonth() - i, 1, 12), me = new Date(t.getFullYear(), t.getMonth() - i + 1, 0, 12);
      let sum = 0, n = 0;
      for (let d = ms; d <= me && fmt(d) <= today; d = addDays(d, 1)) { if (fmt(d) < first) continue; sum += amountOn(h, fmt(d)); n++; }
      const label = ms.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '');
      items.push({ v: n ? sum / n : 0, label, tip: ms.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }) + ': Ø ' + amountText(h, n ? sum / n : 0) + ' pro Tag' });
    }
  } else {
    for (let i = period - 1; i >= 0; i--) {
      const d = addDays(parseDate(today), -i), key = fmt(d);
      const v = amountOn(h, key);
      items.push({ v, label: (period === 7 || d.getDate() % 5 === 0) ? d.getDate() + '.' : '', tip: longDate(key) + ': ' + amountText(h, v) });
    }
  }
  const max = Math.max(a.target * 1.25, ...items.map(x => x.v));
  const goalPct = Math.round(100 * a.target / max);
  return '<div class="chart goal-chart' + (period === 30 ? ' dense' : '') + '" role="img" aria-label="Menge pro Tag" style="--goal:' + goalPct + '%">' + items.map(x => {
    const pct = Math.max(Math.round(100 * x.v / max), x.v > 0 ? 3 : 2);
    return '<div class="bar-col" data-tip="' + escapeHtml(x.tip) + '" tabindex="0" role="button" aria-label="' + escapeHtml(x.tip) + '">'
      + '<span class="bar-val">' + (period === 30 ? '' : (x.v ? numFmt.format(Math.round(x.v * 10) / 10) : '')) + '</span>'
      + '<span class="bar-track"><span class="bar' + (x.v >= a.target - 1e-9 ? '' : ' under') + '" style="height:' + pct + '%"></span></span>'
      + '<span class="bar-label">' + x.label + '</span></div>';
  }).join('') + '</div>';
}

// Monatskalender einer Gewohnheit: antippen trägt einen Tag nach oder nimmt ihn zurück
function renderCalendar(h, today) {
  const sched = getSchedule(h);
  const done = doneSet(h);
  const avoid = kindOf(h) === 'avoid', first = firstDay(h);
  const cur = today.slice(0, 7);
  const firstMonth = firstDay(h).slice(0, 7);
  let ym = statsState.month[h.id] || cur;
  if (ym > cur) ym = cur;
  if (ym < firstMonth) ym = firstMonth;
  const [y, m] = ym.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1, 12);
  const daysInMonth = new Date(y, m, 0).getDate();
  const label = monthStart.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

  let cells = DAY_LABELS.map(l => '<span class="cal-wd">' + l + '</span>').join('');
  for (let i = 0; i < weekdayIdx(monthStart); i++) cells += '<span></span>';
  for (let n = 1; n <= daysInMonth; n++) {
    const d = new Date(y, m - 1, n, 12);
    const key = fmt(d);
    const checked = done.has(key);
    const planned = sched.type === 'weekly' ? true : sched.days.includes(weekdayIdx(d));
    const cls = ['cal-day'];
    const isAmt = kindOf(h) === 'amount', av = isAmt ? amountOn(h, key) : 0;
    const slip = avoid && isSlip(h, key);
    if (checked) cls.push('checked');
    else if (av > 0) cls.push('partial');
    if (slip) cls.push('slip');
    if (key === today) cls.push('today');
    if (!planned || (avoid && key < first)) cls.push('off');
    const style = !checked && av > 0 ? ' style="--fill:' + Math.round(100 * av / getAmount(h).target) + '%"' : '';
    const state = isAmt ? amountText(h, av) : avoid ? (slip ? 'Rückfall' : 'sauber') : (checked ? 'erledigt' : 'offen');
    cells += '<button type="button" class="' + cls.join(' ') + '"' + style + ' data-action="toggle-day" data-id="' + h.id + '" data-date="' + key + '"'
      + ' aria-label="' + n + '. ' + label + ': ' + state + '" aria-pressed="' + (avoid ? slip : checked) + '"' + (key > today ? ' disabled' : '') + '>' + n + '</button>';
  }

  return '<div class="cal-head">'
    + '<button type="button" class="cal-nav" data-action="month" data-id="' + h.id + '" data-dir="-1" aria-label="Vorheriger Monat"' + (ym <= firstMonth ? ' disabled' : '') + '>‹</button>'
    + '<span>' + label + '</span>'
    + '<button type="button" class="cal-nav" data-action="month" data-id="' + h.id + '" data-dir="1" aria-label="Nächster Monat"' + (ym >= cur ? ' disabled' : '') + '>›</button>'
    + '</div><div class="cal">' + cells + '</div>';
}

function renderHabitStats(h, s, today) {
  const sched = getSchedule(h);
  const streak = computeStreak(h, today);
  const best = bestStreak(h, today);
  const unit = streak.unit === 'weeks' ? 'Wochen' : 'Tage';
  const hasWeekdays = sched.type === 'days' && s.byWeekday.some(x => x.planned > 0);
  const kind = kindOf(h), T = KIND_TEXT[kind];
  let grid, amtBlock = '';
  if (kind === 'amount') {
    const from = fmt(addDays(parseDate(today), -(statsState.period - 1)));
    const as = amountStats(h, from, today);
    grid = '<div><div class="mini-label">Aktuelle Serie</div><div class="mini-value">' + streak.value + ' ' + unit + '</div></div>'
      + '<div><div class="mini-label">Rekord-Serie</div><div class="mini-value">' + best + ' ' + unit + '</div></div>'
      + '<div><div class="mini-label">Ø pro Tag</div><div class="mini-value">' + amountText(h, Math.round(as.avg * 10) / 10) + '</div></div>'
      + '<div><div class="mini-label">Beste Tagesmenge</div><div class="mini-value">' + amountText(h, as.best) + '</div></div>'
      + '<div><div class="mini-label">Ziel erreicht</div><div class="mini-value">' + as.reached + ' von ' + as.days + ' Tagen</div></div>'
      + '<div><div class="mini-label">Dabei seit</div><div class="mini-value">' + longDate(firstDay(h)) + '</div></div>';
    amtBlock = '<div class="stats-title">Menge (Ziel: ' + amountText(h, getAmount(h).target) + ')</div>' + amountChart(h, today, statsState.period);
  } else if (kind === 'avoid') {
    const from = fmt(addDays(parseDate(today), -(statsState.period - 1)));
    const slips = (h.slips || []).filter(d => d >= firstDay(h) && d <= today).sort();
    const inPeriod = slips.filter(d => d >= from).length;
    grid = '<div><div class="mini-label">Aktuelle Serie</div><div class="mini-value">' + streak.value + ' ' + unit + '</div></div>'
      + '<div><div class="mini-label">Rekord-Serie</div><div class="mini-value">' + best + ' ' + unit + '</div></div>'
      + '<div><div class="mini-label">Rückfälle im Zeitraum</div><div class="mini-value">' + inPeriod + 'x</div></div>'
      + '<div><div class="mini-label">Rückfälle gesamt</div><div class="mini-value">' + slips.length + 'x</div></div>'
      + '<div><div class="mini-label">Letzter Rückfall</div><div class="mini-value">' + (slips.length ? longDate(slips[slips.length - 1]) : '–') + '</div></div>'
      + '<div><div class="mini-label">Dabei seit</div><div class="mini-value">' + longDate(firstDay(h)) + '</div></div>';
  } else {
    grid = '<div><div class="mini-label">Aktuelle Serie</div><div class="mini-value">' + streak.value + ' ' + unit + '</div></div>'
      + '<div><div class="mini-label">Rekord-Serie</div><div class="mini-value">' + best + ' ' + unit + '</div></div>'
      + '<div><div class="mini-label">' + T.all + '</div><div class="mini-value">' + doneSet(h).size + 'x</div></div>'
      + '<div><div class="mini-label">Dabei seit</div><div class="mini-value">' + longDate(firstDay(h)) + '</div></div>';
  }
  return '<details class="stat-habit" data-id="' + h.id + '" name="stat-habit"' + (statsState.openId === h.id ? ' open' : '') + '>'
    + '<summary><span class="sh-name">' + escapeHtml(h.name) + '</span>'
    + '<span class="sh-pct">' + pctText(s.done, s.planned) + '</span><span class="chevron" aria-hidden="true"></span></summary>'
    + '<div class="sh-body">'
    +   '<div class="mini-grid">' + grid + '</div>' + amtBlock
    +   (hasWeekdays ? '<div class="stats-title">Wochentage</div>' + weekdayChart(s.byWeekday) : '')
    +   '<div class="stats-title">Kalender</div>' + renderCalendar(h, today)
    + '</div></details>';
}

function renderStats() {
  const today = todayStr();
  const kinds = statsKinds();
  if (!kinds.includes(statsState.kind)) statsState.kind = kinds[0] || 'do';
  const list = habits.filter(h => kindOf(h) === statsState.kind);
  const T = KIND_TEXT[statsState.kind];
  if (habits.length === 0) {
    subtitleEl.textContent = 'Noch keine Daten.';
    statsEl.innerHTML = '<div class="empty-state"><div class="big">Noch keine Statistik</div>Lege Gewohnheiten an und hake sie ab. Dann erscheinen hier deine Zahlen.</div>';
    return;
  }

  const period = statsState.period;
  const from = fmt(addDays(parseDate(today), -(period - 1)));
  const o = overallStats(from, today, list);
  subtitleEl.textContent = 'Auswertung: ' + (period === 365 ? 'letztes Jahr' : 'letzte ' + PERIODS[period]);

  // Stabilstes Habit: höchste Quote, aber erst ab 3 geplanten Einheiten, sonst ist die Zahl zufällig
  let best = null;
  o.perHabit.forEach(x => {
    if (x.s.planned < 3) return;
    const ratio = x.s.done / x.s.planned;
    if (!best || ratio > best.ratio || (ratio === best.ratio && x.s.planned > best.planned)) best = { name: x.h.name, ratio, planned: x.s.planned };
  });

  const periodSeg = '<div class="seg" id="periodSeg" role="group" aria-label="Zeitraum" style="margin-top:16px;">'
    + Object.keys(PERIODS).map(k => '<button type="button" data-action="period" data-value="' + k + '" aria-pressed="' + (Number(k) === period) + '">' + PERIODS[k] + '</button>').join('')
    + '</div>';

  const cards = '<div class="stat-grid">'
    + '<div class="stat-card"><div class="stat-value">' + pctText(o.done, o.planned) + '</div><div class="stat-label">Quote</div><div class="stat-sub">' + (o.planned ? o.done + ' von ' + o.planned + ' ' + T.quote : 'noch nichts geplant') + '</div></div>'
    + '<div class="stat-card"><div class="stat-value">' + o.perfect + '</div><div class="stat-label">' + T.perfect + '</div><div class="stat-sub">' + (o.planDays ? 'an ' + o.perfect + ' von ' + o.planDays + ' Tagen' : 'noch keine Tage') + '</div></div>'
    + '<div class="stat-card"><div class="stat-value">' + o.total + '</div><div class="stat-label">' + T.total + '</div><div class="stat-sub">' + T.totalSub + '</div></div>'
    + '<div class="stat-card"><div class="stat-value small">' + (best ? escapeHtml(best.name) : '–') + '</div><div class="stat-label">Stabilstes Habit</div><div class="stat-sub">' + (best ? Math.round(best.ratio * 100) + ' % Quote' : 'ab 3 geplanten Einheiten') + '</div></div>'
    + '</div>';

  const trend = weeklyTrend(today, 12, list).map((w, i, arr) => ({
    label: (i % 3 === 2 || i === arr.length - 1) ? w.ws.getDate() + '.' + (w.ws.getMonth() + 1) + '.' : '',
    planned: w.planned, done: w.done,
    tip: barTip('Woche ab ' + w.ws.getDate() + '.' + (w.ws.getMonth() + 1) + '.', w.done, w.planned)
  }));

  const kindSeg = kinds.length > 1
    ? '<div class="seg" id="statKindSeg" role="group" aria-label="Art der Gewohnheiten" style="margin-top:16px;">'
      + kinds.map(k => '<button type="button" data-action="stat-kind" data-value="' + k + '" aria-pressed="' + (k === statsState.kind) + '">' + KIND_NAMES[k] + '</button>').join('') + '</div>'
    : '';

  statsEl.innerHTML = kindSeg + periodSeg + cards
    + '<div class="stats-title">Wochentage</div>' + weekdayChart(o.byWeekday)
    + '<p class="stats-note">Quote in Prozent. Es zählen nur Gewohnheiten mit festen Tagen.</p>'
    + '<div class="stats-title">Letzte 12 Wochen</div>' + barChart(trend)
    + '<p class="stats-note">Quote pro Woche (Mo bis So), Datum = Wochenbeginn. Die laufende Woche zählt nur bisher gewertete Tage.</p>'
    + '<div class="stats-title">Gewohnheiten</div>'
    + o.perHabit.map(x => renderHabitStats(x.h, x.s, today)).join('');
}

// Ein Klick-Handler für die ganze Statistik (siehe "Event Delegation" weiter oben)
statsEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]');
  if (!b) return;
  const a = b.dataset.action;
  if (a === 'stat-kind' && KIND_NAMES[b.dataset.value]) {
    statsState.kind = b.dataset.value; statsState.openId = null;
    renderStats();
  } else if (a === 'period' && PERIODS[b.dataset.value]) {
    statsState.period = Number(b.dataset.value);
    renderStats();
  } else if (a === 'toggle-day') {
    toggleDay(b.dataset.id, b.dataset.date);
  } else if (a === 'month') {
    const h = habits.find(x => x.id === b.dataset.id);
    if (!h) return;
    const [y, m] = (statsState.month[h.id] || todayStr().slice(0, 7)).split('-').map(Number);
    const d = new Date(y, m - 1 + Number(b.dataset.dir), 1, 12);
    statsState.month[h.id] = d.getFullYear() + '-' + pad(d.getMonth() + 1);
    renderStats();
  }
});

// Merkt sich, welche Gewohnheit aufgeklappt ist ("toggle" läuft nicht nach oben, deshalb capture = true)
statsEl.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!d.matches || !d.matches('details[data-id]')) return;
  if (d.open) statsState.openId = d.dataset.id;
  else if (statsState.openId === d.dataset.id) statsState.openId = null;
}, true);
