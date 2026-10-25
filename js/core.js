// ======================================================================
// Grundlagen: Version, Speicher-Hilfen, Datumshilfen
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================

// ======================================================================
// 1) Grundlagen: Speicher und Datumshilfen
// ======================================================================

// Unter diesem Namen liegen deine Daten im Browser-Speicher (localStorage)
const STORAGE_KEY = 'maximize-habits';
// Versionsnummer der App. Sie erscheint unten in den Einstellungen, damit du siehst,
// ob ein Update angekommen ist. Bei jeder Veröffentlichung hier und in sw.js erhöhen.
const APP_VERSION = '1.3.0';
// Aufbau der gespeicherten Daten. Ändert sich der Aufbau einmal, erhöhst du diese Zahl
// und schreibst in migrate() (siehe main.js), wie alte Daten umgewandelt werden.
const SCHEMA_VERSION = 3;
const SCHEMA_KEY = 'maximize-schema';
// Alter Speicherort aus der Zeit, als die App noch anders hieß.
// Wir lesen ihn weiter, damit bestehende Daten nicht verloren gehen.
const LEGACY_STORAGE_KEY = 'wegmarken-habits';

const DAY_LABELS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So']; // Index 0 = Montag
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

let habits = [];
let loaded = false;
let habitsTab = 'today';   // 'today' oder 'stats'
let currentView = 'habits'; // Bereich der unteren Leiste

const contentEl = document.getElementById('content');
const subtitleEl = document.getElementById('subtitle');
const addForm = document.getElementById('addForm');
const habitInput = document.getElementById('habitInput');

// Datumsangaben speichern wir als Text im Format "2026-10-24" (Jahr-Monat-Tag).
// Das lässt sich alphabetisch vergleichen: "2026-10-24" < "2026-10-25".
function pad(n) { return String(n).padStart(2, '0'); }
function fmt(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
// Mittag statt Mitternacht, damit Zeitumstellungen kein Datum verschieben
function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
function addDays(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
function todayStr() { return fmt(new Date()); }
// JavaScript zählt Sonntag = 0. Wir wollen Montag = 0, deshalb die Umrechnung.
function weekdayIdx(d) { return (d.getDay() + 6) % 7; }
function weekStart(d) { return addDays(d, -weekdayIdx(d)); }

// Zeigt das heutige Datum oben an, z. B. "Samstag, 24. Oktober".
function showTodayLabel() {
  const text = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
  document.getElementById('todayLabel').textContent = text;
}

// Liest gespeicherte Daten (JSON). Ist der Inhalt beschädigt, wird er nicht stillschweigend
// überschrieben: Eine Kopie wird unter einem anderen Namen aufgehoben (siehe quarantine).
function readJson(key) {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch (e) { return null; }
  if (raw === null) return null;
  try { return JSON.parse(raw); }
  catch (e) { quarantine(key); return null; }
}

// Hebt den aktuellen Inhalt eines Schlüssels als Kopie auf, bevor er überschrieben wird.
// Es bleiben nur die drei neuesten Kopien erhalten.
function quarantine(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return;
    localStorage.setItem('maximize-defekt-' + Date.now() + '-' + key, raw);
    const old = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf('maximize-defekt-') === 0) old.push(k);
    }
    old.sort().slice(0, Math.max(0, old.length - 3)).forEach(k => localStorage.removeItem(k));
  } catch (e) { /* nicht kritisch */ }
}

// Macht Text für HTML unschädlich. Wichtig sind auch die Anführungszeichen:
// Namen landen teils in Attributen (z. B. aria-label="..."), und ein Namensbestandteil
// mit " könnte sonst aus dem Attribut ausbrechen.
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ======================================================================
// Kleine Infoblase für Diagramme: Antippen eines Balkens oder Punkts zeigt den genauen Wert
// ======================================================================

const tipEl = document.createElement('div');
tipEl.className = 'tip';
tipEl.hidden = true;
tipEl.setAttribute('role', 'status');
document.body.appendChild(tipEl);
let tipTimer = null;
let tipMark = null; // das Element, das gerade hervorgehoben ist

// Zeigt den Text über dem Punkt (x, y) in Bildschirm-Koordinaten, ohne den Rand zu überschreiten
function showTip(text, x, y) {
  tipEl.textContent = text;
  tipEl.hidden = false;
  const w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  tipEl.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + 'px';
  tipEl.style.top = Math.max(8, y - h - 10) + 'px';
  clearTimeout(tipTimer);
  tipTimer = setTimeout(hideTip, 4000);
}

function hideTip() {
  tipEl.hidden = true;
  clearTimeout(tipTimer);
  if (tipMark) { tipMark.classList.remove('sel'); tipMark = null; }
  document.querySelectorAll('.chart-svg circle.sel').forEach(c => c.classList.remove('sel'));
}

// Balken (HTML-Diagramme mit data-tip): antippen zeigt den Wert, erneutes Antippen blendet aus
document.addEventListener('click', (e) => {
  if (e.target.closest('.chart-svg')) return; // die Liniendiagramme regeln das selbst
  const bar = e.target.closest('.bar-col[data-tip]');
  if (!bar) { hideTip(); return; }
  const same = tipMark === bar && !tipEl.hidden;
  hideTip();
  if (same) return;
  bar.classList.add('sel');
  tipMark = bar;
  const r = bar.getBoundingClientRect();
  showTip(bar.dataset.tip, r.left + r.width / 2, r.top);
});
document.addEventListener('keydown', (e) => {
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.bar-col[data-tip]')) { e.preventDefault(); e.target.click(); }
});
window.addEventListener('scroll', hideTip, { passive: true });

// ======================================================================
// Zwei-Schritt-Bestätigung für Löschen, Verwerfen und Entfernen
// ======================================================================
// Überall in der App gleich: Der erste Tipp färbt den Knopf rot und ändert den Text
// (z. B. "Wirklich löschen?"). Erst der zweite Tipp führt die Aktion aus.
// Nach 4 Sekunden ohne zweiten Tipp springt der Knopf zurück.
function twoStep(btn, confirmLabel) {
  if (btn.dataset.armed === '1') { disarm(btn); return true; }
  btn.dataset.armed = '1';
  btn.dataset.label = btn.textContent;
  btn.textContent = confirmLabel;
  btn.classList.add('confirm');
  btn._armTimer = setTimeout(() => disarm(btn), 4000);
  return false;
}

function disarm(btn) {
  if (btn.dataset.armed !== '1') return;
  clearTimeout(btn._armTimer);
  btn.dataset.armed = '';
  btn.textContent = btn.dataset.label;
  btn.classList.remove('confirm');
}

// Tippst du irgendwo anders hin, während ein Knopf auf "Wirklich ...?" steht, springt er zurück.
document.addEventListener('click', (e) => {
  document.querySelectorAll('[data-armed="1"]').forEach(b => { if (!b.contains(e.target)) disarm(b); });
}, true);
