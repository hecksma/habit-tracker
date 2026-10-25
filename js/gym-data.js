// ======================================================================
// Gym: Datenmodell, Speicher, CSV-Import
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================

// ======================================================================
// 9) Gym: Daten, Speicher und Import
// ======================================================================
//
// So sind die Gym-Daten aufgebaut (wie drei verknüpfte Tabellen):
//   exercises: Übungen,  { id, name, rest, group }                rest = Standard-Pause in Sekunden, group = Muskelgruppe
//   routines:  Routinen, { id, name, items: [{ exerciseId, sets }] }
//   workouts:  Trainings, { id, date, name, routineId, durationSec,
//                           entries: [{ exerciseId, sets: [{ kg, reps, sec, dist }] }] }
// Trainings verweisen mit der exerciseId auf eine Übung. Benennst du eine Übung um,
// ändert sich der Name deshalb automatisch in der ganzen Historie. Gewichte sind immer kg.
// Alles liegt unter einem eigenen Schlüssel im Browser-Speicher, getrennt von den Habits.

const GYM_KEY = 'maximize-gym';
let gym = { exercises: [], routines: [], workouts: [] };
const gymState = { shown: 20, page: 'home', exId: null, exFilter: '', exGroup: '', exShown: 10 };

// Muskelgruppen: Jede Übung hat genau eine (oder keine). Cardio gilt hier auch als Gruppe.
const MUSCLE_GROUPS = ['Brust', 'Rücken', 'Schultern', 'Bizeps', 'Trizeps', 'Arme', 'Quadrizeps', 'Beinbeuger', 'Beine', 'Bauch', 'Cardio'];

// Zuordnung bekannter Übungsnamen (klein geschrieben) zu ihrer Gruppe.
// Sie wird beim CSV-Import und einmalig für bereits vorhandene Übungen benutzt.
const GROUP_BY_NAME = {
  "bench press (barbell)": "Brust",
  "bench press (dumbbell)": "Brust",
  "bench press iso": "Brust",
  "cable crossover": "Brust",
  "chest dip": "Brust",
  "chest fly": "Brust",
  "chest press (machine)": "Brust",
  "horizontal chest fly": "Brust",
  "incline bench press (dumbbell)": "Brust",
  "incline bench press (smith machine)": "Brust",
  "incline chest press (machine)": "Brust",
  "iso-lateral chest press (machine)": "Brust",
  "back extension": "Rücken",
  "cable pullover": "Rücken",
  "deadlift (barbell)": "Rücken",
  "iso-lateral row (machine)": "Rücken",
  "iso-lateral row (cable)": "Rücken",
  "lat pulldown (cable)": "Rücken",
  "lat pulldown (single arm)": "Rücken",
  "lat pulldown close grip": "Rücken",
  "pull up (assisted)": "Rücken",
  "pull up (band)": "Rücken",
  "seated row (cable)": "Rücken",
  "seated row wide grip iso": "Rücken",
  "seated wide-grip row (cable)": "Rücken",
  "seated wide-grip row machine": "Rücken",
  "seated wide grip row high plate loaded": "Rücken",
  "seated wide grip row machine high": "Rücken",
  "t bar row": "Rücken",
  "face pull (cable)": "Schultern",
  "lateral raise (cable)": "Schultern",
  "lateral raise (dumbbell)": "Schultern",
  "lateral raise (machine)": "Schultern",
  "overhead press (dumbbell)": "Schultern",
  "overhead press (smith machine)": "Schultern",
  "reverse fly (cable)": "Schultern",
  "reverse fly (dumbbell)": "Schultern",
  "reverse fly (machine)": "Schultern",
  "seated overhead press (dumbbell)": "Schultern",
  "seated overhead press (machine)": "Schultern",
  "shoulder press (machine)": "Schultern",
  "shoulder press (plate loaded)": "Schultern",
  "y raises": "Schultern",
  "bicep curl (barbell)": "Bizeps",
  "bicep curl (cable)": "Bizeps",
  "bicep curl (dumbbell)": "Bizeps",
  "concentration curl (dumbbell)": "Bizeps",
  "hammer curl (cable)": "Bizeps",
  "hammer curl (dumbbell)": "Bizeps",
  "incline curl (dumbbell)": "Bizeps",
  "preacher curl (barbell)": "Bizeps",
  "preacher curl (dumbbell)": "Bizeps",
  "preacher curl (machine)": "Bizeps",
  "preacher curl (machine) single": "Bizeps",
  "iso triceps pushdown cable": "Trizeps",
  "skullcrusher (barbell)": "Trizeps",
  "tricep overhead extension": "Trizeps",
  "triceps dip": "Trizeps",
  "triceps dip machine": "Trizeps",
  "triceps extension (cable)": "Trizeps",
  "triceps extension (dumbbell)": "Trizeps",
  "triceps pushdown (cable - straight bar)": "Trizeps",
  "reverse curl (barbell)": "Arme",
  "hack squat": "Quadrizeps",
  "leg extension (machine)": "Quadrizeps",
  "leg extension single": "Quadrizeps",
  "leg press": "Quadrizeps",
  "pendulum squat": "Quadrizeps",
  "squat (smith machine)": "Quadrizeps",
  "kneeling leg curl": "Beinbeuger",
  "romanian deadlift (barbell)": "Beinbeuger",
  "seated leg curl (machine)": "Beinbeuger",
  "hip abductor (machine)": "Beine",
  "hip adductor (machine)": "Beine",
  "hip thrust (barbell)": "Beine",
  "ab workout": "Bauch",
  "crunch": "Bauch",
  "crunch (machine)": "Bauch",
  "crunch (stability ball)": "Bauch",
  "decline crunch": "Bauch",
  "flat knee raise": "Bauch",
  "cycling (indoor)": "Cardio",
};
const groupOf = (name) => GROUP_BY_NAME[String(name).trim().toLowerCase()] || null;

const ID_RE = /^[a-z0-9]{1,40}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function numOrNull(v, min, max) {
  return (typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max) ? v : null;
}

// Alles, was von außen kommt (Sicherungsdatei, Speicher, CSV-Import), läuft hier durch.
// Es wird geprüft und bereinigt: falsche Typen, unmögliche Zahlen und Verweise ins Leere fliegen raus.
function sanitizeGym(g) {
  const out = { exercises: [], routines: [], workouts: [] };
  if (!g || typeof g !== 'object') return out;
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

  const exIds = new Set();
  (Array.isArray(g.exercises) ? g.exercises : []).slice(0, 2000).forEach(e => {
    if (!e || typeof e.id !== 'string' || !ID_RE.test(e.id) || exIds.has(e.id)) return;
    const name = str(e.name, 60);
    if (!name) return;
    exIds.add(e.id);
    const rest = numOrNull(e.rest, 10, 900);
    out.exercises.push({ id: e.id, name, rest: rest === null ? null : Math.round(rest), group: MUSCLE_GROUPS.includes(e.group) ? e.group : null });
  });

  const rIds = new Set();
  (Array.isArray(g.routines) ? g.routines : []).slice(0, 200).forEach(r => {
    if (!r || typeof r.id !== 'string' || !ID_RE.test(r.id) || rIds.has(r.id)) return;
    const name = str(r.name, 40);
    if (!name) return;
    const items = (Array.isArray(r.items) ? r.items : []).slice(0, 60)
      .filter(it => it && exIds.has(it.exerciseId))
      .map(it => ({ exerciseId: it.exerciseId, sets: Math.round(numOrNull(it.sets, 1, 20) || 3) }));
    rIds.add(r.id);
    out.routines.push({ id: r.id, name, items });
  });

  const wIds = new Set();
  (Array.isArray(g.workouts) ? g.workouts : []).slice(0, 20000).forEach(w => {
    if (!w || typeof w.id !== 'string' || !ID_RE.test(w.id) || wIds.has(w.id)) return;
    if (typeof w.date !== 'string' || !DATE_RE.test(w.date)) return;
    const entries = [];
    (Array.isArray(w.entries) ? w.entries : []).slice(0, 60).forEach(en => {
      if (!en || !exIds.has(en.exerciseId)) return;
      const sets = (Array.isArray(en.sets) ? en.sets : []).slice(0, 60).map(st => ({
        kg: numOrNull(st && st.kg, 0, 1000),
        reps: numOrNull(st && st.reps, 0, 1000),
        sec: numOrNull(st && st.sec, 0, 86400),
        dist: numOrNull(st && st.dist, 0, 1000000)
      })).filter(st => st.kg !== null || st.reps !== null || st.sec !== null || st.dist !== null);
      if (sets.length) entries.push({ exerciseId: en.exerciseId, sets });
    });
    if (!entries.length) return;
    wIds.add(w.id);
    const dur = numOrNull(w.durationSec, 0, 86400);
    out.workouts.push({
      id: w.id, date: w.date, name: str(w.name, 60) || 'Training',
      routineId: (typeof w.routineId === 'string' && ID_RE.test(w.routineId)) ? w.routineId : null,
      durationSec: dur === null ? null : Math.round(dur), entries
    });
  });
  return out;
}

// Führt neue Gym-Daten mit den vorhandenen zusammen. Es wird nichts überschrieben:
// Was es (per ID) schon gibt, bleibt unverändert. Nur eine fehlende Standard-Pause oder Muskelgruppe wird ergänzt.
function mergeGym(incoming) {
  const res = { exercises: 0, routines: 0, workouts: 0, skipped: 0 };
  const exById = new Map(gym.exercises.map(e => [e.id, e]));
  incoming.exercises.forEach(e => {
    const ex = exById.get(e.id);
    if (ex) {
      if (ex.rest === null && e.rest !== null) ex.rest = e.rest;
      if (!ex.group && e.group) ex.group = e.group;
    }
    else { gym.exercises.push(e); exById.set(e.id, e); res.exercises++; }
  });
  const rIds = new Set(gym.routines.map(r => r.id));
  incoming.routines.forEach(r => { if (!rIds.has(r.id)) { gym.routines.push(r); rIds.add(r.id); res.routines++; } });
  const wIds = new Set(gym.workouts.map(w => w.id));
  incoming.workouts.forEach(w => {
    if (wIds.has(w.id)) { res.skipped++; return; }
    gym.workouts.push(w); wIds.add(w.id); res.workouts++;
  });
  gym.workouts.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return res;
}

function loadGym() {
  const raw = readJson(GYM_KEY);
  gym = sanitizeGym(raw);
  // Hat die Prüfung Einträge aussortiert, heben wir die Originaldaten auf, bevor sie überschrieben werden
  if (raw && typeof raw === 'object' && ['exercises', 'routines', 'workouts'].some(k => Array.isArray(raw[k]) && raw[k].length !== gym[k].length)) {
    quarantine(GYM_KEY);
  }
}

function saveGym() {
  try { localStorage.setItem(GYM_KEY, JSON.stringify(gym)); return true; }
  catch (e) { return false; }
}

// Eine feste Zeichenfolge aus einem Text machen (Hash). So bekommt dieselbe Übung bei jedem
// Import dieselbe ID, und ein zweiter Import erzeugt keine Dubletten.
function hashStr(str) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

// Liest CSV-Text in eine Tabelle. Trennzeichen ist hier ";", Felder stehen in "...".
// Ein "" innerhalb eines Feldes bedeutet ein einzelnes Anführungszeichen.
function parseCsv(text, delim) {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false; }
      else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// Routinen, die beim CSV-Import angelegt werden: Name in der Datei (klein) -> Name bei uns.
// Alle anderen Trainings landen nur im Verlauf.
const CSV_ROUTINES = { 'ub 1': 'Upper Body', 'leg day': 'Lower Body' };

function buildFromCsv(text) {
  const table = parseCsv(text.replace(/^\uFEFF/, ''), ';');
  if (table.length < 2) throw new Error('leer');
  const head = table[0].map(h => h.trim());
  const col = n => head.indexOf(n);
  const C = { no: col('Workout #'), date: col('Date'), wname: col('Workout Name'), dur: col('Duration (sec)'),
    ex: col('Exercise Name'), set: col('Set Order'), kg: col('Weight (kg)'), reps: col('Reps'),
    dist: col('Distance (meters)'), sec: col('Seconds') };
  if ([C.no, C.date, C.wname, C.ex, C.set, C.kg, C.reps].some(i => i < 0)) throw new Error('spalten');

  const exByName = new Map();   // Name (klein) -> Übung
  const restLatest = new Map(); // Übungs-ID -> { date, rest }
  const workouts = [];
  const byNo = new Map();
  const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

  const exFor = (rawName) => {
    const name = rawName.trim();
    const key = name.toLowerCase();
    if (!exByName.has(key)) exByName.set(key, { id: 'e' + hashStr(key), name, rest: null, group: groupOf(name) });
    return exByName.get(key);
  };

  for (let i = 1; i < table.length; i++) {
    const r = table[i];
    const no = (r[C.no] || '').trim();
    if (!no || !(r[C.ex] || '').trim()) continue;
    const date = (r[C.date] || '').trim().replace(' ', 'T').slice(0, 16);
    let w = byNo.get(no);
    if (!w) {
      w = { id: 'wstrong' + no.replace(/[^a-z0-9]/gi, ''), date, name: (r[C.wname] || '').trim(),
        routineId: null, durationSec: num(r[C.dur]), entries: [], _byEx: new Map() };
      byNo.set(no, w); workouts.push(w);
    }
    const ex = exFor(r[C.ex]);
    const setOrder = (r[C.set] || '').trim();
    if (setOrder === 'Rest Timer') {
      const rest = num(r[C.sec]);
      if (rest !== null && rest >= 10) {
        const cur = restLatest.get(ex.id);
        if (!cur || date >= cur.date) restLatest.set(ex.id, { date, rest: Math.round(rest) });
      }
      continue;
    }
    let entry = w._byEx.get(ex.id);
    if (!entry) { entry = { exerciseId: ex.id, sets: [] }; w._byEx.set(ex.id, entry); w.entries.push(entry); }
    entry.sets.push({ kg: num(r[C.kg]), reps: num(r[C.reps]), sec: C.sec >= 0 ? num(r[C.sec]) : null, dist: C.dist >= 0 ? num(r[C.dist]) : null });
  }

  const exercises = Array.from(exByName.values());
  exercises.forEach(e => { const r = restLatest.get(e.id); if (r) e.rest = r.rest; });

  // Routinen aus dem jeweils letzten Training mit diesem Namen
  const routines = [];
  Object.keys(CSV_ROUTINES).forEach(key => {
    const matching = workouts.filter(w => w.name.toLowerCase() === key).sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!matching.length) return;
    const name = CSV_ROUTINES[key];
    const id = 'r' + hashStr(name.toLowerCase());
    routines.push({ id, name, items: matching[0].entries.map(en => ({ exerciseId: en.exerciseId, sets: en.sets.length })) });
    matching.forEach(w => { w.routineId = id; w.name = name; });
  });

  workouts.forEach(w => { delete w._byEx; });
  return sanitizeGym({ exercises, routines, workouts });
}

async function importCsv(file) {
  const status = document.getElementById('csvStatus');
  const say = (t, err) => { status.textContent = t; status.className = 'status' + (err ? ' error' : ''); };
  if (file.size > 15 * 1024 * 1024) { say('Die Datei ist zu groß für den Import.', true); return; }
  try {
    const clean = buildFromCsv(await file.text());
    if (clean.workouts.length === 0) throw new Error('keine Trainings');
    const before = JSON.stringify(gym);
    const res = mergeGym(clean);
    if (!saveGym()) {
      gym = JSON.parse(before);
      say('Der Speicher ist voll. Importiert wurde nichts.', true);
      return;
    }
    renderGym();
    say('Importiert: ' + res.workouts + ' Trainings, ' + res.exercises + ' Übungen, ' + res.routines + ' Routinen'
      + (res.skipped ? ' (' + res.skipped + ' Trainings schon vorhanden)' : '') + '.', false);
  } catch (e) {
    say('Diese Datei konnte nicht gelesen werden. Erwartet wird eine CSV mit Trainingsdaten.', true);
  }
}

document.getElementById('csvBtn').addEventListener('click', () => document.getElementById('csvFile').click());
document.getElementById('csvFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) importCsv(file);
  e.target.value = '';
});
