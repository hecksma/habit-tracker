// ======================================================================
// Schlaf: Daten (Speichern, Prüfen, Zusammenführen)
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================
//
// Eine Nacht: { id, bed: 'YYYY-MM-DDTHH:MM', wake: 'YYYY-MM-DDTHH:MM', rating: 1-5 oder null,
//               tags: ['Koffein', ...], sick: ['Husten', ...] (Krankheits-Symptome, nur wenn krank), how: 'plan' | 'ok' | 'edit' | 'manual' }
//   how sagt, woher die Aufstehzeit kommt: 'plan' = Weckzeit ohne Rückfrage übernommen,
//   'ok' = du hast die Weckzeit bestätigt, 'edit' = du hast eine andere Zeit angegeben,
//   'manual' = von Hand nachgetragen.
// Die laufende Nacht liegt separat: { bed: Zeitstempel, wake: Zeitstempel (geplant), time: 'HH:MM' }.
// Erst wenn du am Morgen antwortest, wird daraus ein Eintrag in der Liste.

const SLEEP_KEY = 'maximize-sleep';
const SLEEP_ACTIVE_KEY = 'maximize-sleep-active';
const DEFAULT_TAGS = ['Spätes Training', 'Koffein', 'Alkohol', 'Spät gegessen', 'Stress', 'Bildschirm im Bett'];
const DEFAULT_SICK = ['Schnupfen', 'Husten', 'Halsschmerzen', 'Fieber', 'Kopfschmerzen', 'Magen-Darm'];
const DT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

let sleep = { nights: [], draft: null, tags: DEFAULT_TAGS.slice(), sickTags: DEFAULT_SICK.slice(), goalMin: 480, wakeByWeekday: ['07:00', '07:00', '07:00', '07:00', '07:00', '07:00', '07:00'] };
let sleepActive = null;
// Was gerade angezeigt wird (nur im Speicher der Seite)
const sleepState = { page: 'main', tab: 'night', calMonth: null, calSel: null, openId: null, shown: 14, draftWake: null, askEdit: false, newTagFor: null, newTagKind: 'tag', sickOpen: null, draftOpen: false, asked: false };

// Datum und Uhrzeit als Text ("2026-10-25T23:10") und zurück. Immer in deiner Ortszeit.
function parseDT(s) { return new Date(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10), +s.slice(11, 13), +s.slice(14, 16)); }
function fmtDT(d) { return fmt(d) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function nightMinutes(n) { return Math.round((parseDT(n.wake) - parseDT(n.bed)) / 60000); }

function cleanTag(t) { return typeof t === 'string' ? t.trim().replace(/\s+/g, ' ').slice(0, 24) : ''; }

function sanitizeSleep(raw) {
  const out = { nights: [], draft: null, tags: [], sickTags: [], goalMin: 480, wakeByWeekday: ['07:00', '07:00', '07:00', '07:00', '07:00', '07:00', '07:00'] };
  const src = (raw && typeof raw === 'object') ? raw : null;
  if (!src) { out.tags = DEFAULT_TAGS.slice(); out.sickTags = DEFAULT_SICK.slice(); return out; }
  const seen = new Set();
  (Array.isArray(src.tags) ? src.tags : DEFAULT_TAGS).forEach(t => {
    const c = cleanTag(t);
    if (c && !seen.has(c.toLowerCase()) && out.tags.length < 60) { seen.add(c.toLowerCase()); out.tags.push(c); }
  });
  const seenSick = new Set();
  (Array.isArray(src.sickTags) ? src.sickTags : DEFAULT_SICK).forEach(t => {
    const c = cleanTag(t);
    if (c && !seenSick.has(c.toLowerCase()) && out.sickTags.length < 40) { seenSick.add(c.toLowerCase()); out.sickTags.push(c); }
  });
  if (Number.isFinite(src.goalMin) && src.goalMin >= 240 && src.goalMin <= 720) out.goalMin = Math.round(src.goalMin / 15) * 15;
  if (Array.isArray(src.wakeByWeekday)) {
    for (let i = 0; i < 7; i++) if (typeof src.wakeByWeekday[i] === 'string' && TIME_RE.test(src.wakeByWeekday[i])) out.wakeByWeekday[i] = src.wakeByWeekday[i];
  }
  // Notizen für die kommende Nacht (schon vor dem Schlafen angehakt)
  if (src.draft && typeof src.draft === 'object') {
    const clean = (arr) => { const r = []; (Array.isArray(arr) ? arr : []).slice(0, 12).forEach(t => { const c = cleanTag(t); if (c && !r.includes(c)) r.push(c); }); return r; };
    const dt = clean(src.draft.tags), ds = clean(src.draft.sick);
    if (dt.length || ds.length) out.draft = { at: Number.isFinite(src.draft.at) ? src.draft.at : Date.now(), tags: dt, sick: ds };
  }
  const ids = new Set();
  (Array.isArray(src.nights) ? src.nights : []).slice(0, 20000).forEach(n => {
    if (!n || typeof n.id !== 'string' || !ID_RE.test(n.id) || ids.has(n.id)) return;
    if (typeof n.bed !== 'string' || typeof n.wake !== 'string' || !DT_RE.test(n.bed) || !DT_RE.test(n.wake)) return;
    const mins = Math.round((parseDT(n.wake) - parseDT(n.bed)) / 60000);
    if (!(mins >= 20 && mins <= 1440)) return;
    ids.add(n.id);
    const tags = [];
    (Array.isArray(n.tags) ? n.tags : []).slice(0, 12).forEach(t => { const c = cleanTag(t); if (c && !tags.includes(c)) tags.push(c); });
    tags.forEach(t => { if (!out.tags.some(x => x.toLowerCase() === t.toLowerCase())) out.tags.push(t); });
    const sick = [];
    (Array.isArray(n.sick) ? n.sick : []).slice(0, 12).forEach(t => { const c = cleanTag(t); if (c && !sick.includes(c)) sick.push(c); });
    sick.forEach(t => { if (!out.sickTags.some(x => x.toLowerCase() === t.toLowerCase())) out.sickTags.push(t); });
    out.nights.push({
      id: n.id, bed: n.bed, wake: n.wake,
      rating: (Number.isInteger(n.rating) && n.rating >= 1 && n.rating <= 5) ? n.rating : null,
      tags, sick, how: ['plan', 'ok', 'edit', 'manual'].includes(n.how) ? n.how : 'manual'
    });
  });
  out.nights.sort((a, b) => (a.bed < b.bed ? -1 : a.bed > b.bed ? 1 : 0));
  return out;
}

function sanitizeSleepActive(a) {
  if (!a || typeof a !== 'object') return null;
  const bed = numOrNull(a.bed, 0, 4e12), wake = numOrNull(a.wake, 0, 4e12);
  if (bed === null || wake === null || wake <= bed || wake - bed > 48 * 3600e3) return null;
  const d = new Date(wake);
  const time = (typeof a.time === 'string' && TIME_RE.test(a.time)) ? a.time : pad(d.getHours()) + ':' + pad(d.getMinutes());
  return { bed, wake, time };
}

function loadSleep() {
  const raw = readJson(SLEEP_KEY);
  sleep = sanitizeSleep(raw);
  if (raw && typeof raw === 'object' && Array.isArray(raw.nights) && raw.nights.length !== sleep.nights.length) quarantine(SLEEP_KEY);
}
function saveSleep() {
  try { localStorage.setItem(SLEEP_KEY, JSON.stringify(sleep)); return true; } catch (e) { return false; }
}
function loadSleepActive() { sleepActive = sanitizeSleepActive(readJson(SLEEP_ACTIVE_KEY)); }
function saveSleepActive() {
  try {
    if (sleepActive) localStorage.setItem(SLEEP_ACTIVE_KEY, JSON.stringify(sleepActive));
    else localStorage.removeItem(SLEEP_ACTIVE_KEY);
  } catch (e) { /* nicht kritisch */ }
}

// Wiederherstellen aus einer Sicherung: nichts überschreiben. Nächte mit gleicher ID oder gleicher
// Einschlafzeit gelten als vorhanden. Neue Notiz-Schlagworte kommen dazu.
function mergeSleep(incoming) {
  const have = new Set(sleep.nights.map(n => n.id)), beds = new Set(sleep.nights.map(n => n.bed));
  let added = 0;
  incoming.nights.forEach(n => {
    if (have.has(n.id) || beds.has(n.bed)) return;
    sleep.nights.push(n); have.add(n.id); beds.add(n.bed); added++;
  });
  (incoming.sickTags || []).forEach(t => { if (!sleep.sickTags.some(x => x.toLowerCase() === t.toLowerCase()) && sleep.sickTags.length < 40) sleep.sickTags.push(t); });
  incoming.tags.forEach(t => { if (!sleep.tags.some(x => x.toLowerCase() === t.toLowerCase()) && sleep.tags.length < 60) sleep.tags.push(t); });
  sleep.nights.sort((a, b) => (a.bed < b.bed ? -1 : a.bed > b.bed ? 1 : 0));
  return added;
}
