// ======================================================================
// Navigation: Bereiche, Zurück-Geste, Eingabefelder
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================

// ======================================================================
// 12) Bereiche (untere Leiste)
// ======================================================================

// Jeder Bereich hat einen Titel und einen Abschnitt in der Seite (#view-<name>).
// Einen neuen Bereich später ergänzt du hier, im HTML und in der Leiste unten.
const VIEW_KEY = 'maximize-view';
const VIEWS = {
  habits: { title: 'Deine Gewohnheiten' },
  gym: { title: 'Gym' }
};

function setView(name) {
  if (!VIEWS[name]) name = 'habits';
  document.getElementById('viewTitle').textContent = VIEWS[name].title;
  Object.keys(VIEWS).forEach(v => { document.getElementById('view-' + v).hidden = v !== name; });
  document.querySelectorAll('.tab').forEach(t => {
    if (t.dataset.view === name) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  // Untertitel und Eingabeleiste gehören nur zu den Habits
  subtitleEl.hidden = name !== 'habits';
  document.getElementById('gymSubtitle').hidden = name !== 'gym';
  currentView = name;
  if (name !== 'gym' && typeof gymState !== 'undefined') gymState.page = 'home';
  updateChrome();
  if (name === 'gym') renderGym();
  window.scrollTo(0, 0);
  try { localStorage.setItem(VIEW_KEY, name); } catch (e) { /* nicht kritisch */ }
}

document.querySelector('.tabbar').addEventListener('click', (e) => {
  const tab = e.target.closest('.tab');
  if (tab) setView(tab.dataset.view);
});

// ======================================================================
// 12a) Zurück-Geste des Handys
// ======================================================================
// Ohne Vorkehrung verlässt die Zurück-Geste sofort die App, weil die App technisch nur
// eine einzige Seite ist. Deshalb legen wir einen zusätzlichen "Puffer"-Eintrag in den
// Browserverlauf. Drückst du zurück, verbraucht das nur diesen Eintrag. Wir schließen dann
// die oberste Ebene (Fenster, Unterseite, Gym-Bereich, Statistik).
// Erst auf dem Hauptbildschirm der Habits ohne offene Ebene verlässt "Zurück" die App.

const openDialogs = [];
const nativeShowModal = HTMLDialogElement.prototype.showModal;
HTMLDialogElement.prototype.showModal = function () {
  nativeShowModal.call(this);
  openDialogs.push(this);
};
// Das "close"-Ereignis steigt nicht auf, daher capture (true). Es kommt auch bei Esc und Schaltflächen.
document.addEventListener('close', (e) => {
  const i = openDialogs.indexOf(e.target);
  if (i >= 0) openDialogs.splice(i, 1);
}, true);

// Wie viele Puffer-Einträge liegen aktuell über dem Start-Eintrag?
let depth = 0;
const MAX_DEPTH = 4;

// Browser überspringen Verlaufseinträge, die ohne Berührung entstanden sind. Deshalb legen wir
// die Puffer nur direkt bei einem Tipp an: bei jedem Tipp einer, bis es vier sind.
window.addEventListener('click', () => {
  if (depth >= MAX_DEPTH) return;
  try { history.pushState({ buffer: depth + 1 }, ''); depth++; } catch (e) { /* nicht kritisch */ }
}, true);

window.addEventListener('popstate', () => {
  if (depth === 0) return;
  depth--;
  // 1) offenes Fenster schließen (das zuletzt geöffnete zuerst)
  while (openDialogs.length && !openDialogs[openDialogs.length - 1].open) openDialogs.pop();
  if (openDialogs.length) {
    openDialogs.pop().close();
  }
  // 2) Unterseiten im Gym-Bereich
  else if (currentView === 'gym' && !active && gymState.page === 'exercise') {
    gymState.page = 'exercises'; renderGym(); window.scrollTo(0, 0);
  }
  else if (currentView === 'gym' && !active && gymState.page === 'exercises') {
    gymState.page = 'home'; renderGym(); window.scrollTo(0, 0);
  }
  // 3) vom Gym-Hauptbildschirm zu den Habits
  else if (currentView === 'gym') {
    setView('habits');
  }
  // 4) Statistik der Habits zurück zu "Heute"
  else if (currentView === 'habits' && habitsTab === 'stats') {
    setHabitsTab('today');
  }
  // 5) Habits-Hauptbildschirm: die App darf verlassen werden. Übrige Puffer überspringen.
  else {
    const n = depth + 1;
    depth = 0;
    history.go(-n);
  }
});

// ======================================================================
// 12b) Eingabefelder
// ======================================================================
// Manche Handys blenden über der Tastatur Symbole für Passwörter, Karten und Adressen ein.
// Diese Eigenschaften sagen dem Browser, dass hier nichts davon ausgefüllt werden soll.
// Der Beobachter wendet sie auch auf Felder an, die erst später eingeblendet werden.
function hardenInputs(root) {
  (root.matches && root.matches('input, textarea') ? [root] : []).concat(Array.from(root.querySelectorAll ? root.querySelectorAll('input, textarea') : []))
    .forEach(inp => {
      if (inp.type === 'file' || inp.type === 'checkbox' || inp.type === 'radio') return;
      inp.setAttribute('autocomplete', 'off');
      inp.setAttribute('autocorrect', 'off');
      inp.setAttribute('spellcheck', 'false');
      inp.setAttribute('data-lpignore', 'true');
      inp.setAttribute('data-1p-ignore', 'true');
      inp.setAttribute('data-bwignore', 'true');
      inp.setAttribute('data-form-type', 'other');
    });
}
hardenInputs(document.body);
new MutationObserver((list) => {
  list.forEach(m => m.addedNodes.forEach(n => { if (n.nodeType === 1) hardenInputs(n); }));
}).observe(document.body, { childList: true, subtree: true });
