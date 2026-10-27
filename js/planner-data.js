// ======================================================================
// Planner: Daten (Aufgaben und Notizen)
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================

const PLANNER_KEY = 'maximize-planner';

// planner.tasks: { id, title, note, due ('2026-10-27' oder null), prio (0/1), label, subs[{id,t,done}],
//                  repeat (null oder {type:'daily'|'days'|'monthly', days[]}), done (Datum oder null), created }
// planner.notes: { id, title, text, label, pinned, items (null oder [{id,t,done}] bei Checklisten), created, updated }
// planner.labels: Liste der Labels, die für Aufgaben und Notizen zur Wahl stehen
let planner = { tasks: [], notes: [], labels: [] };

const P_DATE = /^\d{4}-\d{2}-\d{2}$/;
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const cleanStr = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

function sanitizeSubs(list, max) {
  const out = [], seen = new Set();
  (Array.isArray(list) ? list : []).forEach(s => {
    if (!s || typeof s.t !== 'string' || !s.t.trim() || out.length >= max) return;
    let id = typeof s.id === 'string' && ID_RE.test(s.id) ? s.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    out.push({ id, t: s.t.trim().slice(0, 100), done: !!s.done });
  });
  return out;
}

function sanitizeRepeat(r) {
  if (!r || typeof r !== 'object') return null;
  if (r.type === 'daily') return { type: 'daily', days: [] };
  if (r.type === 'monthly') return { type: 'monthly', days: [] };
  if (r.type === 'days') {
    const days = Array.from(new Set((Array.isArray(r.days) ? r.days : []).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))).sort();
    return days.length ? { type: 'days', days } : null;
  }
  return null;
}

// Geheimes Zeichen: gespeicherte Zeichnungen (je 64 Punkte), Toleranz und PIN (nur als Hash)
function sanitizeSecret(sc) {
  if (!sc || typeof sc !== 'object' || !Array.isArray(sc.templates)) return null;
  const templates = sc.templates.slice(0, 5).filter(t => Array.isArray(t) && t.length === 64
    && t.every(p => Array.isArray(p) && p.length === 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) && p[0] > -1 && p[0] < 2 && p[1] > -1 && p[1] < 2));
  if (!templates.length) return null;
  const out = { templates, thr: Number.isFinite(sc.thr) ? Math.max(0.1, Math.min(0.3, sc.thr)) : 0.16 };
  if (sc.pin && typeof sc.pin.salt === 'string' && /^[0-9a-f]{8,64}$/.test(sc.pin.salt) && typeof sc.pin.hash === 'string' && /^[0-9a-f]{8,64}$/.test(sc.pin.hash)) out.pin = { salt: sc.pin.salt, hash: sc.pin.hash };
  return out;
}

function sanitizePlanner(raw) {
  const out = { tasks: [], notes: [], labels: [] };
  if (!raw || typeof raw !== 'object') return out;
  const labels = new Set();
  const addLabel = (l) => { if (l && labels.size < 30) labels.add(l); return l; };
  (Array.isArray(raw.labels) ? raw.labels : []).forEach(l => addLabel(cleanStr(l, 20)));
  const ids = new Set();
  (Array.isArray(raw.tasks) ? raw.tasks : []).forEach(t => {
    if (!t || typeof t.title !== 'string' || !t.title.trim() || out.tasks.length >= 3000) return;
    let id = typeof t.id === 'string' && ID_RE.test(t.id) ? t.id : newId();
    if (ids.has(id)) id = newId();
    ids.add(id);
    const repeat = sanitizeRepeat(t.repeat);
    out.tasks.push({
      id,
      title: t.title.trim().slice(0, 120),
      note: cleanStr(t.note, 2000),
      due: typeof t.due === 'string' && P_DATE.test(t.due) ? t.due : null,
      prio: t.prio ? 1 : 0,
      label: addLabel(cleanStr(t.label, 20)),
      subs: sanitizeSubs(t.subs, 30),
      repeat,
      done: !repeat && typeof t.done === 'string' && P_DATE.test(t.done) ? t.done : null,
      created: typeof t.created === 'string' && P_DATE.test(t.created) ? t.created : todayStr()
    });
  });
  (Array.isArray(raw.notes) ? raw.notes : []).forEach(n => {
    if (!n || out.notes.length >= 3000) return;
    const items = Array.isArray(n.items) ? sanitizeSubs(n.items, 300) : null;
    const title = cleanStr(n.title, 80), text = typeof n.text === 'string' ? n.text.slice(0, 10000) : '';
    if (!title && !text.trim() && !(items && items.length)) return;
    let id = typeof n.id === 'string' && ID_RE.test(n.id) ? n.id : newId();
    if (ids.has(id)) id = newId();
    ids.add(id);
    out.notes.push({
      id, title, text, items,
      label: addLabel(cleanStr(n.label, 20)),
      pinned: !!n.pinned,
      secret: !!n.secret,
      created: Number.isFinite(n.created) ? n.created : Date.now(),
      updated: Number.isFinite(n.updated) ? n.updated : Date.now()
    });
  });
  out.labels = Array.from(labels);
  const sc = sanitizeSecret(raw.secret);
  if (sc) out.secret = sc;
  // Erledigte Aufgaben, die älter als ein halbes Jahr sind, räumen wir auf
  const limit = fmt(addDays(new Date(), -183));
  out.tasks = out.tasks.filter(t => !t.done || t.done >= limit);
  return out;
}

function loadPlanner() {
  const raw = readJson(PLANNER_KEY);
  planner = sanitizePlanner(raw);
  if (raw && typeof raw === 'object' && Array.isArray(raw.tasks) && raw.tasks.length > planner.tasks.length) {
    // Etwas wurde beim Einlesen verworfen: vorher eine Kopie aufheben
    quarantine(PLANNER_KEY);
  }
}
function savePlanner() {
  try { localStorage.setItem(PLANNER_KEY, JSON.stringify(planner)); return true; } catch (e) { return false; }
}

// Labels, die weder eine Aufgabe noch eine Notiz nutzt, verschwinden von selbst
function pruneLabels() {
  const used = new Set();
  planner.tasks.forEach(t => { if (t.label) used.add(t.label); });
  planner.notes.forEach(n => { if (n.label) used.add(n.label); });
  planner.labels = planner.labels.filter(l => used.has(l));
}

// ---- Wiederholungen ----

// Das nächste Fälligkeitsdatum nach dem Erledigen. Basis ist das spätere von "heute" und "bisher fällig":
// Wer eine überfällige Aufgabe heute abhakt, bekommt die nächste Runde ab morgen, nicht rückwirkend.
function nextDue(task, today) {
  const r = task.repeat;
  if (!r) return null;
  const base = task.due && task.due > today ? task.due : today;
  const b = parseDate(base);
  if (r.type === 'daily') return fmt(addDays(b, 1));
  if (r.type === 'days') {
    for (let i = 1; i <= 7; i++) {
      const d = addDays(b, i);
      if (r.days.includes(weekdayIdx(d))) return fmt(d);
    }
  }
  if (r.type === 'monthly') {
    const dom = parseDate(task.due || today).getDate();
    const first = new Date(b.getFullYear(), b.getMonth() + 1, 1, 12);
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0, 12).getDate();
    return fmt(new Date(first.getFullYear(), first.getMonth(), Math.min(dom, last), 12));
  }
  return fmt(addDays(b, 1));
}

// Zusammenführen beim Wiederherstellen: nichts überschreiben, gleiche IDs gelten als vorhanden
function mergePlanner(incoming) {
  const have = new Set(planner.tasks.map(t => t.id).concat(planner.notes.map(n => n.id)));
  let tasks = 0, notes = 0;
  incoming.tasks.forEach(t => { if (!have.has(t.id)) { planner.tasks.push(t); have.add(t.id); tasks++; } });
  incoming.notes.forEach(n => { if (!have.has(n.id)) { planner.notes.push(n); have.add(n.id); notes++; } });
  incoming.labels.forEach(l => { if (!planner.labels.includes(l)) planner.labels.push(l); });
  if (!planner.secret && incoming.secret) planner.secret = incoming.secret;
  return { tasks, notes };
}
