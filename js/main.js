// ======================================================================
// Start der App
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================

// ======================================================================
// 13) Start
// ======================================================================

// Alte Daten bei Bedarf auf den aktuellen Aufbau bringen (siehe SCHEMA_VERSION in core.js).
// Neue Umwandlung: Zahl in SCHEMA_VERSION erhöhen und hier einen Block "if (v < N) { ... }" ergänzen.
function migrate() {
  let v = 0;
  try { v = Number(localStorage.getItem(SCHEMA_KEY)) || 0; } catch (e) { return; }
  // v < 1: Ausgangsaufbau, nichts umzuwandeln
  if (v < 3) {
    // Version 3: Gruppe "Cardio" ergänzt. Übungen ohne Gruppe bekommen sie, wenn ihr Name bekannt ist.
    const g3 = readJson(GYM_KEY);
    if (g3 && Array.isArray(g3.exercises)) {
      g3.exercises.forEach(e => { if (e && typeof e.name === 'string' && !e.group) e.group = groupOf(e.name); });
      try { localStorage.setItem(GYM_KEY, JSON.stringify(g3)); } catch (e) { return; }
    }
  }
  if (v < 2) {
    // Version 2: Übungen bekommen eine Muskelgruppe. Bekannte Namen werden zugeordnet, der Rest bleibt leer.
    const g = readJson(GYM_KEY);
    if (g && Array.isArray(g.exercises)) {
      g.exercises.forEach(e => { if (e && typeof e.name === 'string' && !('group' in e)) e.group = groupOf(e.name); });
      try { localStorage.setItem(GYM_KEY, JSON.stringify(g)); } catch (e) { return; }
    }
  }
  if (v !== SCHEMA_VERSION) {
    try { localStorage.setItem(SCHEMA_KEY, String(SCHEMA_VERSION)); } catch (e) { /* nicht kritisch */ }
  }
}

migrate();
document.getElementById('appVersion').textContent = 'Maximize ' + APP_VERSION;
showTodayLabel();
loadSettings();
loadGym();
loadSleep();
loadSleepActive();
loadPlanner();
loadActive();
if (active) gymState.page = 'workout'; // läuft ein Training, geht es nach dem Öffnen dort weiter
loadHabits();
// Bittet den Browser, die Daten nicht von selbst zu löschen, wenn der Speicher knapp wird
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
let savedView = 'habits';
try { savedView = localStorage.getItem(VIEW_KEY) || 'habits'; } catch (e) { /* Standard */ }
setView(savedView);
maybeAskWake(); // Morgens: hat die Weckzeit gestimmt?

// Wenn du die App über Nacht offen lässt und morgens zurückkehrst, soll sie den neuen Tag zeigen.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { showTodayLabel(); render(); }
});

// Ist die App in zwei Fenstern offen (z. B. installiert und im Browser), würde sonst das Fenster
// mit dem älteren Stand die Daten des anderen überschreiben. Deshalb laden wir bei Änderungen neu.
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY) loadHabits();
  else if (e.key === GYM_KEY) { loadGym(); renderGym(); }
  else if (e.key === ACTIVE_KEY) { loadActive(); renderGym(); }
  else if (e.key === SLEEP_KEY || e.key === SLEEP_ACTIVE_KEY) { loadSleep(); loadSleepActive(); if (currentView === 'sleep') renderSleep(); }
  else if (e.key === PLANNER_KEY) { loadPlanner(); if (currentView === 'planner') renderPlanner(); }
  else if (e.key === SETTINGS_KEY) { loadSettings(); render(); }
});

// Meldet den Service Worker (sw.js) beim Browser an, damit die App offline starten kann.
// Das geht nur über https (oder localhost), nicht beim Öffnen der Datei per Doppelklick,
// deshalb die Prüfung davor.
//
// Updates: Der Service Worker holt eine neue Version im Hintergrund. Sobald er übernommen hat,
// zeigen wir oben "Neue Version verfügbar". Ein Tipp lädt die App neu. Das passiert nie von selbst,
// damit dich ein Update nicht mitten im Training stört.
let swReg = null;
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) document.getElementById('updateBar').hidden = false;
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => { swReg = reg; }).catch(() => {});
  });
  // Kommst du in die App zurück, nachsehen, ob es etwas Neues gibt
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && swReg) swReg.update().catch(() => {});
  });
}
document.getElementById('updateNow').addEventListener('click', () => location.reload());

// Einstellungen: von Hand nach einem Update suchen
document.getElementById('checkUpdate').addEventListener('click', async () => {
  const info = document.getElementById('updateInfo');
  info.textContent = 'Suche …';
  try {
    if (!swReg) swReg = await navigator.serviceWorker.getRegistration();
    if (swReg) await swReg.update();
    await new Promise(r => setTimeout(r, 2500)); // dem Service Worker Zeit zum Übernehmen geben
    if (!document.getElementById('updateBar').hidden) { info.textContent = 'Neue Version gefunden.'; location.reload(); }
    else info.textContent = 'Du hast die neueste Version (' + APP_VERSION + ').';
  } catch (e) {
    info.textContent = 'Keine Verbindung. Versuche es später noch einmal.';
  }
});
