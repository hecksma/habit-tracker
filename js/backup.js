// ======================================================================
// Datensicherung (Export und Import)
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================

// ======================================================================
// 11) Datensicherung
// ======================================================================

function setStatus(text, isError) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.className = 'status' + (isError ? ' error' : '');
}

// Export: Die Liste wird als Text (JSON) in eine Datei geschrieben und
// über einen unsichtbaren Download-Link an den Browser übergeben.
function exportData() {
  const payload = {
    app: 'maximize',
    version: 2,
    exportedAt: new Date().toISOString(),
    habits: habits,
    gym: gym,
    sleep: sleep
  };
  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'maximize-sicherung-' + todayStr() + '.json';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  settings.lastBackup = todayStr();
  saveSettings();
  updateBackupInfo();
  setStatus('Sicherung gespeichert (' + habits.length + ' Gewohnheiten, ' + gym.workouts.length + ' Trainings, ' + sleep.nights.length + ' Nächte).', false);
}

// Prüft, ob ein Eintrag aus einer Datei (oder dem Speicher) wie eine echte Gewohnheit aussieht.
// Dateien kommen von außen, deshalb vertrauen wir ihnen nicht blind:
// Die ID landet später im HTML und darf nur Buchstaben und Ziffern enthalten.
function isValidHabit(h) {
  return h
    && typeof h.id === 'string' && /^[a-z0-9]{1,40}$/i.test(h.id)
    && typeof h.name === 'string' && h.name.trim().length > 0 && h.name.length <= 40
    && Array.isArray(h.completions)
    && h.completions.every(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d));
}

// Übernimmt Art, Mengenziel und Tagesmengen aus einer Sicherung und prüft sie dabei
function cleanHabitExtras(src) {
  const out = { kind: kindOf(src) };
  if (out.kind === 'amount') {
    const a = getAmount(src);
    out.amount = { target: a.target, step: a.step, unit: a.unit };
    out.amounts = {};
    const m = src.amounts && typeof src.amounts === 'object' ? src.amounts : {};
    Object.keys(m).forEach(d => { if (/^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(m[d]) && m[d] > 0 && m[d] < 1e7) out.amounts[d] = m[d]; });
  }
  if (out.kind === 'avoid') {
    out.slips = Array.from(new Set((Array.isArray(src.slips) ? src.slips : []).filter(d => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d)))).sort();
  }
  return out;
}

// Import: Die Daten aus der Datei werden mit den vorhandenen ZUSAMMENGEFÜHRT.
// Nichts wird überschrieben oder gelöscht: neue Gewohnheiten kommen dazu,
// bei gleicher ID werden die erledigten Tage vereint (der Plan bleibt, wie er hier ist).
async function importData(file) {
  if (file.size > 30 * 1024 * 1024) { setStatus('Die Datei ist zu groß für eine Sicherung von Maximize.', true); return; }
  try {
    const data = JSON.parse(await file.text());
    // 'wegmarken' akzeptieren wir weiter, damit ältere Sicherungen noch lesbar sind
    if (!data || !['maximize', 'wegmarken'].includes(data.app) || (!Array.isArray(data.habits) && !data.gym && !data.sleep)) {
      throw new Error('format');
    }
    const incomingHabits = Array.isArray(data.habits) ? data.habits : [];
    const valid = incomingHabits.filter(isValidHabit);
    let added = 0;
    valid.forEach(incoming => {
      const existing = habits.find(h => h.id === incoming.id);
      if (existing) {
        existing.completions = Array.from(new Set([...(existing.completions || []), ...incoming.completions]));
        if (kindOf(existing) === 'avoid' && kindOf(incoming) === 'avoid') {
          existing.slips = Array.from(new Set([...(existing.slips || []), ...cleanHabitExtras(incoming).slips])).sort();
        }
        if (kindOf(existing) === 'amount' && kindOf(incoming) === 'amount') {
          const extra = cleanHabitExtras(incoming).amounts;
          existing.amounts = existing.amounts || {};
          Object.keys(extra).forEach(d => { if (!(d in existing.amounts)) existing.amounts[d] = extra[d]; });
          Object.keys(existing.amounts).forEach(d => syncAmountDay(existing, d));
        }
      } else {
        habits.push({
          id: incoming.id,
          name: incoming.name.trim(),
          createdAt: typeof incoming.createdAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(incoming.createdAt) ? incoming.createdAt : todayStr(),
          schedule: getSchedule(incoming),
          completions: Array.from(new Set(incoming.completions)),
          ...cleanHabitExtras(incoming)
        });
        added++;
      }
    });
    render();
    saveHabits();
    const skipped = incomingHabits.length - valid.length;
    let gymText = '';
    if (data.gym) {
      const before = JSON.stringify(gym);
      const res = mergeGym(sanitizeGym(data.gym));
      if (saveGym()) {
        gymText = ' Gym: ' + res.workouts + ' Trainings und ' + res.exercises + ' Übungen neu.';
        renderGym();
      } else {
        gym = JSON.parse(before);
        gymText = ' Gym-Daten konnten nicht gespeichert werden (Speicher voll).';
      }
    }
    let sleepText = '';
    if (data.sleep) {
      const before = JSON.stringify(sleep);
      const added = mergeSleep(sanitizeSleep(data.sleep));
      if (saveSleep()) { sleepText = ' Schlaf: ' + added + ' Nächte neu.'; renderSleep(); }
      else { sleep = JSON.parse(before); sleepText = ' Schlafdaten konnten nicht gespeichert werden (Speicher voll).'; }
    }
    setStatus('Wiederhergestellt: ' + added + ' Habits neu, ' + (valid.length - added) + ' zusammengeführt'
      + (skipped ? ', ' + skipped + ' übersprungen' : '') + '.' + gymText + sleepText, false);
  } catch (e) {
    setStatus('Diese Datei ist keine gültige Sicherung von Maximize.', true);
  }
}

document.getElementById('exportBtn').addEventListener('click', exportData);
document.getElementById('importBtn').addEventListener('click', () => document.getElementById('importFile').click());
document.getElementById('importFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (file) importData(file);
  e.target.value = ''; // damit dieselbe Datei später erneut gewählt werden kann
});
