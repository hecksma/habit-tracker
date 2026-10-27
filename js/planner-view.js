// ======================================================================
// Planner: Anzeige und Bedienung (Aufgaben und Notizen)
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================

const plannerEl = document.getElementById('plannerContent');
const plannerState = { tab: 'tasks', q: '', filter: '', doneOpen: false };

const REPEAT_SVG = '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 3l3 3-3 3"/><path d="M4 11V9a3 3 0 0 1 3-3h13"/><path d="M7 21l-3-3 3-3"/><path d="M20 13v2a3 3 0 0 1-3 3H4"/></svg>';
const PIN_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" aria-hidden="true"><path d="M14.5 3.5l6 6-2.2.7-3.6 3.6.4 4.2-1.3 1.3-3.4-3.4-5 5-1-1 5-5-3.4-3.4 1.3-1.3 4.2.4 3.6-3.6z"/></svg>';

// ---- Hilfen ----

const prioLabel = (n) => n ? '!' : '';
function dueText(due, today) {
  if (!due) return '';
  const diff = Math.round((parseDate(due) - parseDate(today)) / 864e5);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  if (diff === -1) return 'Gestern';
  if (diff < 0) return 'vor ' + (-diff) + ' Tagen';
  return parseDate(due).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
}
function repeatText(r) {
  if (!r) return '';
  if (r.type === 'daily') return 'täglich';
  if (r.type === 'monthly') return 'monatlich';
  return r.days.map(d => DAY_LABELS[d]).join(' ');
}
function taskSort(a, b) {
  return (b.prio - a.prio) || ((a.due || '9') < (b.due || '9') ? -1 : (a.due || '9') > (b.due || '9') ? 1 : 0) || (a.created < b.created ? -1 : 1);
}

// Aufgaben nach Fälligkeit gruppieren
function groupTasks() {
  const today = todayStr(), week = fmt(addDays(new Date(), 7));
  const g = { overdue: [], today: [], soon: [], later: [], none: [], done: [] };
  planner.tasks.forEach(t => {
    if (t.done) g.done.push(t);
    else if (!t.due) g.none.push(t);
    else if (t.due < today) g.overdue.push(t);
    else if (t.due === today) g.today.push(t);
    else if (t.due <= week) g.soon.push(t);
    else g.later.push(t);
  });
  Object.keys(g).forEach(k => { if (k !== 'done') g[k].sort(taskSort); });
  g.done.sort((a, b) => (a.done < b.done ? 1 : a.done > b.done ? -1 : 0));
  return g;
}

function updatePlannerSubtitle() {
  const el = document.getElementById('plannerSubtitle');
  const g = groupTasks();
  const open = g.overdue.length + g.today.length + g.soon.length + g.later.length + g.none.length;
  const now = g.overdue.length + g.today.length;
  el.textContent = plannerState.tab === 'secret' ? 'Geheimbereich' : !planner.tasks.length ? 'Aufgaben und Notizen' : !open ? 'Alles erledigt' : open + ' offen' + (now ? ' · ' + now + ' heute' : '');
}

// ---- Aufgaben ----

function taskCardHtml(t, today) {
  const subsDone = t.subs.filter(s => s.done).length;
  const bits = [];
  if (t.prio) bits.push('<span class="tm prio">!</span>');
  if (t.due && !t.done) bits.push('<span class="tm' + (t.due < today ? ' late' : t.due === today ? ' now' : '') + '">' + dueText(t.due, today) + '</span>');
  if (t.repeat) bits.push('<span class="tm rep">' + REPEAT_SVG + ' ' + repeatText(t.repeat) + '</span>');
  if (t.subs.length) bits.push('<span class="tm">' + subsDone + '/' + t.subs.length + '</span>');
  if (t.label) bits.push('<span class="tm lbl">' + escapeHtml(t.label) + '</span>');
  if (t.note) bits.push('<span class="tm">Notiz</span>');
  return '<div class="task-card' + (t.done ? ' done' : '') + '" data-id="' + t.id + '">'
    + '<button type="button" class="check-btn' + (t.done ? ' done' : '') + '" data-act="t-check" data-id="' + t.id + '" aria-pressed="' + !!t.done + '" aria-label="' + escapeHtml(t.title) + ' ' + (t.done ? 'wieder öffnen' : 'erledigen') + '">' + CHECK_SVG + '</button>'
    + '<button type="button" class="task-main" data-act="t-open" data-id="' + t.id + '">'
    + '<span class="task-title">' + escapeHtml(t.title) + '</span>'
    + (bits.length ? '<span class="task-meta">' + bits.join('') + '</span>' : '')
    + '</button></div>';
}

function renderTasksHtml() {
  const g = groupTasks(), today = todayStr();
  const sec = (title, list, cls) => list.length
    ? '<h3 class="p-sec ' + (cls || '') + '">' + title + ' <small>' + list.length + '</small></h3><div class="task-list">' + list.map(t => taskCardHtml(t, today)).join('') + '</div>' : '';
  const open = g.overdue.length + g.today.length + g.soon.length + g.later.length + g.none.length;
  let h = '';
  if (!planner.tasks.length) {
    h = '<div class="empty-state"><div class="big">Noch keine Aufgaben</div>Schreibe unten eine Aufgabe und tippe auf Enter. Mit dem Plus legst du sie mit Datum, Wiederholung und Unteraufgaben an.</div>';
  } else {
    if (!open) h += '<div class="empty-state" style="margin-top:20px;"><div class="big">Alles erledigt</div>Keine offenen Aufgaben.</div>';
    h += sec('Überfällig', g.overdue, 'late') + sec('Heute', g.today) + sec('Demnächst', g.soon) + sec('Später', g.later) + sec('Ohne Datum', g.none);
    if (g.done.length) {
      h += '<details class="p-done" id="doneBox"' + (plannerState.doneOpen ? ' open' : '') + '><summary>Erledigt <small>' + g.done.length + '</small></summary>'
        + '<div class="task-list">' + g.done.slice(0, 25).map(t => taskCardHtml(t, today)).join('') + '</div>'
        + (g.done.length > 25 ? '<p class="hint">Die letzten 25 von ' + g.done.length + '.</p>' : '')
        + '<div class="start-row" style="justify-content:flex-start;"><button type="button" class="tool-btn" data-act="t-clear">Erledigte entfernen</button></div></details>';
    }
  }
  return h;
}

// ---- Notizen ----

function noteMatches(n) {
  if (n.secret) return false;
  if (plannerState.filter && n.label !== plannerState.filter) return false;
  const q = plannerState.q.trim().toLowerCase();
  if (!q) return true;
  return (n.title + ' ' + n.text + ' ' + (n.items || []).map(i => i.t).join(' ')).toLowerCase().indexOf(q) >= 0;
}

function noteCardHtml(n) {
  let body = '';
  if (n.items) {
    const open = n.items.filter(i => !i.done), done = n.items.length - open.length;
    body = open.slice(0, 3).map(i => '<span class="nl">○ ' + escapeHtml(i.t) + '</span>').join('')
      + (open.length > 3 ? '<span class="nl dim">+ ' + (open.length - 3) + ' weitere</span>' : '')
      + (!open.length && n.items.length ? '<span class="nl dim">Alles erledigt</span>' : '')
      + (done && open.length ? '<span class="nl dim">' + done + ' erledigt</span>' : '');
  } else if (n.text.trim()) {
    body = '<span class="np">' + escapeHtml(n.text.trim().slice(0, 400)) + '</span>';
  }
  return '<button type="button" class="note-card" data-act="n-open" data-id="' + n.id + '">'
    + '<span class="note-top"><span class="note-title">' + escapeHtml(n.title || (n.items ? 'Checkliste' : 'Notiz')) + '</span>'
    + (n.pinned ? '<span class="pin" aria-label="Angeheftet">' + PIN_SVG + '</span>' : '') + '</span>'
    + body + (n.label ? '<span class="task-meta"><span class="tm lbl">' + escapeHtml(n.label) + '</span></span>' : '')
    + '</button>';
}

function noteListHtml() {
  const list = planner.notes.filter(noteMatches).sort((a, b) => (b.pinned - a.pinned) || (b.updated - a.updated));
  if (!planner.notes.some(n => !n.secret)) return '<div class="empty-state"><div class="big">Noch keine Notizen</div>Für Ideen, Gedanken und Listen. Schreibe unten einen Titel und tippe auf Enter, oder nutze das Plus für Text, Checkliste und Label.</div>';
  if (!list.length) return '<p class="hint" style="text-align:center;margin-top:24px;">Keine Notiz gefunden.</p>';
  return '<div class="note-list">' + list.map(noteCardHtml).join('') + '</div>';
}

function renderNotesHtml() {
  const labels = planner.labels.filter(l => planner.notes.some(n => n.label === l && !n.secret));
  if (plannerState.filter && !labels.includes(plannerState.filter)) plannerState.filter = '';
  return '<input type="search" id="noteSearch" class="text-input note-search" placeholder="Suchen" maxlength="60" autocomplete="off" value="' + escapeHtml(plannerState.q) + '" aria-label="Notizen durchsuchen" />'
    + (labels.length ? '<div class="chips wrap note-filter">' + labels.map(l => '<button type="button" class="chip" data-act="n-filter" data-l="' + escapeHtml(l) + '" aria-pressed="' + (plannerState.filter === l) + '">' + escapeHtml(l) + '</button>').join('') + '</div>' : '')
    + '<div id="noteList">' + noteListHtml() + '</div>';
}

// ---- Gesamtansicht ----

function renderPlanner() {
  document.querySelectorAll('.planner-tabs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.ptab === plannerState.tab)));
  document.querySelector('.planner-tabs').hidden = plannerState.tab === 'secret';
  plannerEl.innerHTML = plannerState.tab === 'tasks' ? renderTasksHtml() : plannerState.tab === 'secret' ? renderSecretHtml() : renderNotesHtml();
  updatePlannerSubtitle();
  updatePlannerChrome();
}

// Eingabeleiste unten: gehört im Planner zur gerade gezeigten Ansicht
function updatePlannerChrome() {
  if (currentView !== 'planner') return;
  const tasks = plannerState.tab === 'tasks', secret = plannerState.tab === 'secret';
  if (secret) { habitInput.placeholder = 'Neue geheime Notiz'; habitInput.setAttribute('aria-label', 'Titel der neuen geheimen Notiz'); habitInput.maxLength = 80; return; }
  habitInput.placeholder = tasks ? 'Neue Aufgabe, z. B. \'Paket abholen\'' : 'Neue Notiz, z. B. \'Idee: …\'';
  habitInput.setAttribute('aria-label', tasks ? 'Titel der neuen Aufgabe' : 'Titel der neuen Notiz');
  habitInput.maxLength = tasks ? 120 : 80;
  document.getElementById('addBtn').setAttribute('aria-label', tasks ? 'Neue Aufgabe mit allen Einstellungen anlegen' : 'Neue Notiz mit allen Einstellungen anlegen');
}
function resetHabitChrome() {
  habitInput.placeholder = 'Neue Gewohnheit, z. B. \'Lesen\'';
  habitInput.setAttribute('aria-label', 'Name der neuen Gewohnheit');
  habitInput.maxLength = 40;
  document.getElementById('addBtn').setAttribute('aria-label', 'Neue Gewohnheit mit allen Einstellungen anlegen');
}

function setPlannerTab(tab) {
  plannerState.tab = tab === 'notes' ? 'notes' : 'tasks';
  habitInput.value = '';
  renderPlanner();
}
document.querySelector('.planner-tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-ptab]');
  if (b) { setPlannerTab(b.dataset.ptab); window.scrollTo(0, 0); }
});

// ---- Schnell anlegen (Enter in der Leiste unten) und Plus ----

function plannerQuickAdd() {
  const title = habitInput.value.trim();
  if (!title) return;
  if (plannerState.tab === 'tasks') {
    planner.tasks.push({ id: newId(), title, note: '', due: null, prio: 0, label: '', subs: [], repeat: null, done: null, created: todayStr() });
  } else {
    planner.notes.unshift({ id: newId(), title, text: '', items: null, label: '', pinned: false, secret: plannerState.tab === 'secret', created: Date.now(), updated: Date.now() });
  }
  habitInput.value = '';
  savePlanner();
  renderPlanner();
}
function plannerPlus() { plannerState.tab === 'tasks' ? openTaskSheet(null) : openNoteSheet(null); }

// ---- Klicks in der Liste ----

plannerEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  if (act === 't-check') {
    const t = planner.tasks.find(x => x.id === b.dataset.id);
    if (!t) return;
    const today = todayStr();
    if (t.repeat) {
      t.due = nextDue(t, today);
      t.subs.forEach(s => { s.done = false; });
      showToast('Nächste Runde: ' + dueText(t.due, today));
    } else if (t.done) t.done = null;
    else t.done = today;
    savePlanner(); renderPlanner();
  } else if (act === 't-open') openTaskSheet(b.dataset.id);
  else if (act === 't-clear') {
    if (!twoStep(b, 'Wirklich entfernen?')) return;
    planner.tasks = planner.tasks.filter(t => !t.done);
    savePlanner(); renderPlanner();
  }
  else if (act === 'n-open') openNoteSheet(b.dataset.id);
  else if (act === 'n-filter') {
    plannerState.filter = plannerState.filter === b.dataset.l ? '' : b.dataset.l;
    renderPlanner();
  }
});
plannerEl.addEventListener('toggle', (e) => { if (e.target.id === 'doneBox') plannerState.doneOpen = e.target.open; }, true);
plannerEl.addEventListener('input', (e) => {
  if (e.target.id !== 'noteSearch') return;
  plannerState.q = e.target.value;
  document.getElementById('noteList').innerHTML = noteListHtml();
});

// ======================================================================
// Aufgabe: Fenster
// ======================================================================

const taskSheet = document.getElementById('taskSheet');
const tkTitle = document.getElementById('tkTitle');
let tk = null; // Entwurf der Aufgabe im Fenster

function newTaskDraft(title) {
  return { id: null, title: title || '', note: '', due: null, prio: 0, label: '', subs: [], repeat: null, done: null, created: todayStr(), newLabel: false };
}

function openTaskSheet(id) {
  const t = id ? planner.tasks.find(x => x.id === id) : null;
  if (id && !t) return;
  tk = t ? JSON.parse(JSON.stringify(t)) : newTaskDraft(habitInput.value.trim());
  tk.isNew = !t;
  document.getElementById('tkHead').textContent = t ? 'Aufgabe bearbeiten' : 'Neue Aufgabe';
  tkTitle.value = tk.title;
  document.getElementById('tkNote').value = tk.note;
  document.getElementById('tkMsg').textContent = '';
  document.getElementById('tkDelete').hidden = !t;
  disarm(document.getElementById('tkDelete'));
  drawTaskSheet();
  taskSheet.showModal();
}

function dueChoices() {
  const today = new Date();
  const nextMon = addDays(weekStart(today), 7);
  return [['Heute', todayStr()], ['Morgen', fmt(addDays(today, 1))], ['Nächste Woche', fmt(nextMon)]];
}

function drawTaskSheet() {
  const dues = dueChoices();
  document.getElementById('tkDue').innerHTML = dues.map(([l, d]) => '<button type="button" class="chip" data-tk="due" data-d="' + d + '" aria-pressed="' + (tk.due === d) + '">' + l + '</button>').join('')
    + '<button type="button" class="chip" data-tk="due" data-d="" aria-pressed="' + (!tk.due) + '">Kein Datum</button>';
  const dateIn = document.getElementById('tkDate');
  dateIn.value = tk.due || '';
  document.getElementById('tkPrio').setAttribute('aria-pressed', String(!!tk.prio));
  document.getElementById('tkRepeat').querySelectorAll('button').forEach(b => {
    const type = tk.repeat ? tk.repeat.type : '';
    b.setAttribute('aria-pressed', String(b.dataset.rep === type));
  });
  const days = document.getElementById('tkDays');
  days.hidden = !(tk.repeat && tk.repeat.type === 'days');
  days.innerHTML = DAY_LABELS.map((l, i) => '<button type="button" class="chip" data-tk="day" data-i="' + i + '" aria-pressed="' + !!(tk.repeat && tk.repeat.days.includes(i)) + '">' + l + '</button>').join('');
  document.getElementById('tkRepHint').textContent = tk.repeat ? 'Beim Abhaken springt die Aufgabe auf das nächste Datum.' + (tk.due ? '' : ' Ohne Datum startet sie heute.') : '';
  drawLabelChips('tkLabels', tk, 'tk');
  document.getElementById('tkSubs').innerHTML = tk.subs.map((s, i) =>
    '<div class="sub-row"><button type="button" class="check-btn small' + (s.done ? ' done' : '') + '" data-tk="sub-check" data-i="' + i + '" aria-label="Unteraufgabe abhaken">' + CHECK_SVG + '</button>'
    + '<input type="text" class="text-input" data-tk="sub-text" data-i="' + i + '" maxlength="100" value="' + escapeHtml(s.t) + '" aria-label="Unteraufgabe" />'
    + '<button type="button" class="icon-btn small" data-tk="sub-del" data-i="' + i + '" aria-label="Unteraufgabe entfernen">×</button></div>').join('');
}

// Label-Auswahl für Aufgaben und Notizen: gleiche Bauweise, deshalb eine Funktion
function drawLabelChips(elId, obj, prefix) {
  const labels = planner.labels.slice();
  if (obj.label && !labels.includes(obj.label)) labels.push(obj.label);
  const el = document.getElementById(elId);
  el.innerHTML = labels.map(l => '<button type="button" class="chip" data-' + prefix + '="label" data-l="' + escapeHtml(l) + '" aria-pressed="' + (obj.label === l) + '">' + escapeHtml(l) + '</button>').join('')
    + (obj.newLabel
      ? '<span class="new-label"><input type="text" class="text-input" id="' + prefix + 'NewLabel" maxlength="20" placeholder="Name" aria-label="Neues Label" /><button type="button" class="btn primary" data-' + prefix + '="label-add">OK</button></span>'
      : '<button type="button" class="chip add" data-' + prefix + '="label-new">+ Neu</button>');
  if (obj.newLabel) { const i = document.getElementById(prefix + 'NewLabel'); if (i) i.focus(); }
}
function pickLabel(obj, l) { obj.label = obj.label === l ? '' : l; }
function addNewLabel(obj, prefix) {
  const i = document.getElementById(prefix + 'NewLabel');
  const v = i ? i.value.trim().slice(0, 20) : '';
  obj.newLabel = false;
  if (v) { const ex = planner.labels.find(l => l.toLowerCase() === v.toLowerCase()); obj.label = ex || v; }
}

taskSheet.addEventListener('click', (e) => {
  const b = e.target.closest('[data-tk]');
  if (!b) return;
  const a = b.dataset.tk;
  if (a === 'due') tk.due = b.dataset.d || null;
  else if (a === 'day') {
    const i = Number(b.dataset.i), r = tk.repeat;
    r.days = r.days.includes(i) ? r.days.filter(x => x !== i) : r.days.concat(i).sort();
  }
  else if (a === 'label') pickLabel(tk, b.dataset.l);
  else if (a === 'label-new') tk.newLabel = true;
  else if (a === 'label-add') addNewLabel(tk, 'tk');
  else if (a === 'sub-check') { const s = tk.subs[b.dataset.i]; s.done = !s.done; }
  else if (a === 'sub-del') tk.subs.splice(Number(b.dataset.i), 1);
  else return;
  drawTaskSheet();
});
document.getElementById('tkDate').addEventListener('change', (e) => { tk.due = e.target.value || null; drawTaskSheet(); });
document.getElementById('tkPrio').addEventListener('click', () => { tk.prio = tk.prio ? 0 : 1; drawTaskSheet(); });
document.getElementById('tkRepeat').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-rep]');
  if (!b) return;
  const t = b.dataset.rep;
  tk.repeat = !t ? null : { type: t, days: t === 'days' ? (tk.repeat && tk.repeat.type === 'days' ? tk.repeat.days : [weekdayIdx(new Date())]) : [] };
  drawTaskSheet();
});
taskSheet.addEventListener('input', (e) => {
  if (e.target.dataset.tk === 'sub-text') tk.subs[e.target.dataset.i].t = e.target.value;
});
document.getElementById('tkAddSub').addEventListener('click', () => {
  if (tk.subs.length >= 30) return;
  tk.subs.push({ id: newId(), t: '', done: false });
  drawTaskSheet();
  const ins = document.querySelectorAll('#tkSubs input'); if (ins.length) ins[ins.length - 1].focus();
});
// Enter in einem Label- oder Unteraufgaben-Feld speichert nicht die ganze Aufgabe
taskSheet.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.id === 'tkTitle') return;
  e.preventDefault();
  if (e.target.id === 'tkNewLabel') { addNewLabel(tk, 'tk'); drawTaskSheet(); }
  else if (e.target.dataset.tk === 'sub-text') document.getElementById('tkAddSub').click();
});

function closeTaskSheet() { if (taskSheet.open) taskSheet.close(); }
document.getElementById('tkCancel').addEventListener('click', closeTaskSheet);
document.getElementById('tkForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = tkTitle.value.trim();
  if (!title) { document.getElementById('tkMsg').textContent = 'Bitte gib einen Titel ein.'; tkTitle.focus(); return; }
  if (tk.repeat && tk.repeat.type === 'days' && !tk.repeat.days.length) { document.getElementById('tkMsg').textContent = 'Wähle mindestens einen Wochentag.'; return; }
  const d = {
    id: tk.id || newId(), title: title.slice(0, 120), note: document.getElementById('tkNote').value.trim().slice(0, 2000),
    due: tk.due || (tk.repeat ? todayStr() : null), prio: tk.prio, label: tk.label, subs: tk.subs.filter(s => s.t.trim()).map(s => ({ id: s.id, t: s.t.trim(), done: s.done })),
    repeat: tk.repeat, done: tk.repeat ? null : tk.done, created: tk.created
  };
  const i = planner.tasks.findIndex(x => x.id === d.id);
  if (i >= 0) planner.tasks[i] = d; else planner.tasks.push(d);
  if (d.label && !planner.labels.includes(d.label)) planner.labels.push(d.label);
  if (tk.isNew) habitInput.value = '';
  savePlanner(); renderPlanner(); closeTaskSheet();
});
document.getElementById('tkDelete').addEventListener('click', function () {
  if (!twoStep(this, 'Wirklich löschen?')) return;
  planner.tasks = planner.tasks.filter(x => x.id !== tk.id);
  savePlanner(); renderPlanner(); closeTaskSheet();
});

// ======================================================================
// Notiz: Fenster
// ======================================================================

const noteSheet = document.getElementById('noteSheet');
let nt = null;

function openNoteSheet(id) {
  const n = id ? planner.notes.find(x => x.id === id) : null;
  if (id && !n) return;
  nt = n ? JSON.parse(JSON.stringify(n)) : { id: null, title: habitInput.value.trim().slice(0, 80), text: '', items: null, label: '', pinned: false, newLabel: false, secret: plannerState.tab === 'secret' };
  nt.isNew = !n;
  document.getElementById('ntLabelField').hidden = !!nt.secret;
  document.getElementById('ntHead').textContent = n ? 'Notiz bearbeiten' : 'Neue Notiz';
  document.getElementById('ntTitle').value = nt.title;
  document.getElementById('ntText').value = nt.text;
  document.getElementById('ntMsg').textContent = '';
  document.getElementById('ntDelete').hidden = !n;
  disarm(document.getElementById('ntDelete'));
  drawNoteSheet();
  noteSheet.showModal();
}

function drawNoteSheet() {
  document.getElementById('ntPin').setAttribute('aria-pressed', String(!!nt.pinned));
  document.getElementById('ntList').setAttribute('aria-pressed', String(!!nt.items));
  document.getElementById('ntTextField').hidden = !!nt.items;
  document.getElementById('ntItemsField').hidden = !nt.items;
  if (nt.items) {
    document.getElementById('ntItems').innerHTML = nt.items.map((s, i) =>
      '<div class="sub-row"><button type="button" class="check-btn small' + (s.done ? ' done' : '') + '" data-nt="it-check" data-i="' + i + '" aria-label="Abhaken">' + CHECK_SVG + '</button>'
      + '<input type="text" class="text-input" data-nt="it-text" data-i="' + i + '" maxlength="100" value="' + escapeHtml(s.t) + '" aria-label="Eintrag" />'
      + '<button type="button" class="icon-btn small" data-nt="it-del" data-i="' + i + '" aria-label="Eintrag entfernen">×</button></div>').join('');
    document.getElementById('ntClearDone').hidden = !nt.items.some(s => s.done);
  }
  drawLabelChips('ntLabels', nt, 'nt');
}

noteSheet.addEventListener('click', (e) => {
  const b = e.target.closest('[data-nt]');
  if (!b) return;
  const a = b.dataset.nt;
  if (a === 'label') pickLabel(nt, b.dataset.l);
  else if (a === 'label-new') nt.newLabel = true;
  else if (a === 'label-add') addNewLabel(nt, 'nt');
  else if (a === 'it-check') { const s = nt.items[b.dataset.i]; s.done = !s.done; }
  else if (a === 'it-del') nt.items.splice(Number(b.dataset.i), 1);
  else return;
  drawNoteSheet();
});
noteSheet.addEventListener('input', (e) => {
  if (e.target.dataset.nt === 'it-text') nt.items[e.target.dataset.i].t = e.target.value;
});
function addNoteItem() {
  if (!nt.items || nt.items.length >= 300) return;
  nt.items.push({ id: newId(), t: '', done: false });
  drawNoteSheet();
  const ins = document.querySelectorAll('#ntItems input'); if (ins.length) ins[ins.length - 1].focus();
}
document.getElementById('ntAddItem').addEventListener('click', addNoteItem);
document.getElementById('ntClearDone').addEventListener('click', () => { nt.items = nt.items.filter(s => !s.done); drawNoteSheet(); });
noteSheet.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT' || e.target.id === 'ntTitle') return;
  e.preventDefault();
  if (e.target.id === 'ntNewLabel') { addNewLabel(nt, 'nt'); drawNoteSheet(); }
  else if (e.target.dataset.nt === 'it-text') addNoteItem();
});
document.getElementById('ntPin').addEventListener('click', () => { nt.pinned = !nt.pinned; drawNoteSheet(); });
// Zwischen Text und Checkliste wechseln, ohne etwas zu verlieren: Zeilen werden zu Einträgen und zurück
document.getElementById('ntList').addEventListener('click', () => {
  if (nt.items) {
    nt.text = nt.items.map(s => s.t).filter(Boolean).join('\n');
    document.getElementById('ntText').value = nt.text;
    nt.items = null;
  } else {
    const lines = document.getElementById('ntText').value.split('\n').map(s => s.trim()).filter(Boolean);
    nt.items = sanitizeSubs(lines.map(t => ({ t, done: false })), 300);
    if (!nt.items.length) nt.items = [{ id: newId(), t: '', done: false }];
    nt.text = '';
  }
  drawNoteSheet();
});

function closeNoteSheet() { if (noteSheet.open) noteSheet.close(); }
document.getElementById('ntCancel').addEventListener('click', closeNoteSheet);
document.getElementById('ntForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('ntTitle').value.trim().slice(0, 80);
  const text = nt.items ? '' : document.getElementById('ntText').value.slice(0, 10000);
  const items = nt.items ? nt.items.filter(s => s.t.trim()).map(s => ({ id: s.id, t: s.t.trim(), done: s.done })) : null;
  if (!title && !text.trim() && !(items && items.length)) { document.getElementById('ntMsg').textContent = 'Schreibe etwas hinein oder gib einen Titel ein.'; return; }
  const now = Date.now();
  const n = { id: nt.id || newId(), title, text, items, label: nt.secret ? '' : nt.label, pinned: nt.pinned, secret: !!nt.secret, created: nt.created || now, updated: now };
  const i = planner.notes.findIndex(x => x.id === n.id);
  if (i >= 0) { n.created = planner.notes[i].created; planner.notes[i] = n; } else planner.notes.unshift(n);
  if (n.label && !planner.labels.includes(n.label)) planner.labels.push(n.label);
  if (nt.isNew) habitInput.value = '';
  savePlanner(); renderPlanner(); closeNoteSheet();
});
document.getElementById('ntDelete').addEventListener('click', function () {
  if (!twoStep(this, 'Wirklich löschen?')) return;
  planner.notes = planner.notes.filter(x => x.id !== nt.id);
  savePlanner(); renderPlanner(); closeNoteSheet();
});

// ======================================================================
// Labels verwalten (Umbenennen, Löschen, Neu)
// ======================================================================

const labelSheet = document.getElementById('labelSheet');
const labelUse = (l) => planner.tasks.filter(t => t.label === l).length + planner.notes.filter(n => n.label === l).length;

function drawLabelSheet() {
  document.getElementById('lbList').innerHTML = planner.labels.length
    ? planner.labels.map((l, i) => '<div class="lb-row"><input type="text" class="text-input" data-lb="name" data-i="' + i + '" maxlength="20" value="' + escapeHtml(l) + '" aria-label="Label umbenennen" />'
      + '<small>' + labelUse(l) + '×</small><button type="button" class="btn danger" data-lb="del" data-i="' + i + '">Löschen</button></div>').join('')
    : '<p class="hint">Noch keine Labels. Lege hier eins an oder direkt in einer Aufgabe oder Notiz.</p>';
}
document.getElementById('labelsBtn').addEventListener('click', () => {
  document.getElementById('lbMsg').textContent = '';
  document.getElementById('lbNew').value = '';
  drawLabelSheet();
  labelSheet.showModal();
});

function renameLabel(from, to) {
  to = to.trim().slice(0, 20);
  const msg = document.getElementById('lbMsg');
  if (!to || to === from) { msg.textContent = ''; return false; }
  const clash = planner.labels.find(l => l !== from && l.toLowerCase() === to.toLowerCase());
  if (clash) to = clash; // gleicher Name: beide Labels werden eins
  planner.tasks.forEach(t => { if (t.label === from) t.label = to; });
  planner.notes.forEach(n => { if (n.label === from) n.label = to; });
  planner.labels = clash ? planner.labels.filter(l => l !== from) : planner.labels.map(l => (l === from ? to : l));
  if (plannerState.filter === from) plannerState.filter = to;
  msg.textContent = clash ? 'Es gab dieses Label schon, beide sind jetzt eins.' : '';
  savePlanner(); renderPlanner();
  return true;
}
labelSheet.addEventListener('change', (e) => {
  if (e.target.dataset.lb !== 'name') return;
  const from = planner.labels[e.target.dataset.i];
  if (from !== undefined) { renameLabel(from, e.target.value); drawLabelSheet(); }
});
labelSheet.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-lb="del"]');
  if (!b) return;
  if (!twoStep(b, 'Wirklich?')) return;
  document.getElementById('lbMsg').textContent = '';
  const l = planner.labels[b.dataset.i];
  planner.tasks.forEach(t => { if (t.label === l) t.label = ''; });
  planner.notes.forEach(n => { if (n.label === l) n.label = ''; });
  planner.labels = planner.labels.filter(x => x !== l);
  if (plannerState.filter === l) plannerState.filter = '';
  savePlanner(); renderPlanner(); drawLabelSheet();
});
function addLabelFromSheet() {
  const inp = document.getElementById('lbNew'), v = inp.value.trim().slice(0, 20);
  if (!v) return;
  document.getElementById('lbMsg').textContent = '';
  if (!planner.labels.some(l => l.toLowerCase() === v.toLowerCase()) && planner.labels.length < 30) { planner.labels.push(v); savePlanner(); }
  inp.value = ''; drawLabelSheet();
}
document.getElementById('lbAdd').addEventListener('click', addLabelFromSheet);
document.getElementById('lbNew').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addLabelFromSheet(); } });
