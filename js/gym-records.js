// ======================================================================
// Gym: Rekorde (PRs)
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================
//
// Ein Satz ist ein Rekord, wenn er bei dieser Übung
//   - mehr Gewicht zeigt als jeder Satz zuvor ("Gewicht"), oder
//   - ein höheres geschätztes Maximalgewicht für eine Wiederholung ("1RM") ergibt.
// Es gibt zwei Stufen:
//   'all' = Gesamt-Rekord: schlägt alles, was du je gemacht hast.
//   'cur' = Aktueller Rekord: schlägt alles aus den letzten 6 Monaten (Gesamt-Rekorde zählen auch).
// Rekorde gibt es erst, wenn es etwas zum Schlagen gibt: Der allererste Satz einer Übung ist keiner.
// Nach einer langen Pause (kein Satz in den letzten 6 Monaten) gibt es keinen "aktuellen" Rekord,
// bis wieder ein Vergleichswert da ist.

const PR_WINDOW_DAYS = 183; // ungefähr 6 Monate

// Geschätztes Maximalgewicht für eine Wiederholung (Epley-Formel). Nur bis 12 Wiederholungen
// aussagekräftig, darüber gibt es keine Schätzung.
function estimate1RM(kg, reps) {
  if (!(kg > 0) || !(reps >= 1)) return null;
  if (reps === 1) return kg;
  if (reps > 12) return null;
  return kg * (1 + reps / 30);
}

// Ein Satz als Zahlen, oder null, wenn er für Rekorde nicht taugt (ohne Wiederholungen).
// Ohne Gewicht (Körpergewicht) zählt das Gewicht als 0, bei Geräten mit Unterstützung ist es negativ.
function scoreSet(st) {
  if (!st || !(st.reps >= 1)) return null;
  const kg = Number.isFinite(st.kg) ? st.kg : 0;
  return { kg, reps: st.reps, rm: estimate1RM(kg, st.reps) };
}

// Womit wird ein Satz verglichen? list = bisherige Sätze [{date, kg, reps, rm}].
// Mit Gewicht: höheres Gewicht ("kg") oder höheres geschätztes 1RM ("1rm").
// Ohne Gewicht oder mit Unterstützung (Gewicht 0 oder negativ): mehr Wiederholungen bei gleichem oder
// weniger Hilfsgewicht ("reps"), oder weniger Hilfe als je zuvor ("kg").
function beatKinds(list, s) {
  const kinds = [];
  if (s.kg > 0) {
    let maxKg = 0, maxRm = 0;
    list.forEach(x => { if (x.kg > maxKg) maxKg = x.kg; if (x.rm !== null && x.rm > maxRm) maxRm = x.rm; });
    if (s.kg > maxKg) kinds.push('kg');
    if (s.rm !== null && s.rm > maxRm + 0.05) kinds.push('1rm');
  } else {
    const same = list.filter(x => x.kg >= s.kg);
    if (!same.length) kinds.push('kg');
    else if (s.reps > Math.max.apply(null, same.map(x => x.reps))) kinds.push('reps');
  }
  return kinds;
}

// Vergleicht einen Satz mit bisherigen Sätzen (h = [{date, kg, reps, rm}]).
// Ergebnis: null oder { level: 'all' | 'cur', kinds: ['kg', '1rm', 'reps'] }
function judgeSet(h, s, cutoff) {
  if (!h.length) return null;
  const all = beatKinds(h, s);
  if (all.length) return { level: 'all', kinds: all };
  const win = h.filter(x => x.date >= cutoff);
  if (!win.length) return null;
  const cur = beatKinds(win, s);
  return cur.length ? { level: 'cur', kinds: cur } : null;
}

const prCutoff = (dateStr) => fmt(addDays(parseDate(dateStr.slice(0, 10)), -PR_WINDOW_DAYS));

// Alle Sätze einer Übung aus dem gespeicherten Verlauf (für den Vergleich im laufenden Training)
function exHistory(exId) {
  const out = [];
  gym.workouts.forEach(w => w.entries.forEach(en => {
    if (en.exerciseId !== exId) return;
    en.sets.forEach(st => { const s = scoreSet(st); if (s) out.push({ date: w.date.slice(0, 10), kg: s.kg, reps: s.reps, rm: s.rm }); });
  }));
  return out;
}

// Prüft einen Satz im laufenden Training. earlier = Sätze (kg/reps als Zahlen) davor in derselben Übung.
function liveRecord(exId, kg, reps, earlier) {
  const s = scoreSet({ kg, reps });
  if (!s) return null;
  const today = todayStr();
  const h = exHistory(exId);
  (earlier || []).forEach(e => { const x = scoreSet(e); if (x) h.push({ date: today, kg: x.kg, reps: x.reps, rm: x.rm }); });
  return judgeSet(h, s, prCutoff(today));
}

// Rekorde des ganzen Verlaufs. Ergebnis:
//   list: [{ wid, date, exId, ei, si, kg, reps, rm, level, kinds }] (älteste zuerst)
//   map:  Schlüssel "wid|ei|si" -> Eintrag der Liste
let prCache = { key: '', data: null };
function getPRs() {
  const n = gym.workouts.length, last = n ? gym.workouts[n - 1].id : '';
  const key = n + '|' + last;
  if (prCache.key === key && prCache.data) return prCache.data;
  const ws = gym.workouts.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const hist = {}, list = [], map = new Map();
  ws.forEach(w => {
    const date = w.date.slice(0, 10), cutoff = prCutoff(date);
    w.entries.forEach((en, ei) => {
      const h = hist[en.exerciseId] = hist[en.exerciseId] || [];
      en.sets.forEach((st, si) => {
        const s = scoreSet(st);
        if (!s) return;
        const r = judgeSet(h, s, cutoff);
        if (r) {
          const rec = { wid: w.id, date: w.date, exId: en.exerciseId, ei, si, kg: s.kg, reps: s.reps, rm: s.rm, level: r.level, kinds: r.kinds };
          list.push(rec); map.set(w.id + '|' + ei + '|' + si, rec);
        }
        h.push({ date, kg: s.kg, reps: s.reps, rm: s.rm });
      });
    });
  });
  prCache = { key, data: { list, map } };
  return prCache.data;
}

// Ein Satz als Text: "82,5 kg × 8", "12 Wdh." (ohne Gewicht), "-12 kg × 10" (mit Unterstützung)
function setLabel(kg, reps) {
  return kg ? numText(kg) + ' kg × ' + reps : reps + ' Wdh.';
}

// Was wurde geschlagen? Beides gleichzeitig ist möglich.
function kindsLabel(kinds) {
  const has = k => kinds.includes(k);
  if (has('kg') && has('1rm')) return 'Gewicht & 1RM';
  if (has('kg')) return 'Gewicht';
  if (has('1rm')) return '1RM';
  return 'Wiederholungen';
}

// Texte für Meldungen
function recordText(name, kg, reps, kinds, level) {
  const rm = estimate1RM(kg, reps);
  return {
    title: level === 'all' ? 'Neuer Gesamt-Rekord' : 'Neuer aktueller Rekord',
    body: name + ': ' + setLabel(kg, reps),
    sub: kindsLabel(kinds) + (kinds.includes('1rm') && rm ? ' · geschätztes 1RM ' + nf.format(Math.round(rm * 10) / 10) + ' kg' : '')
  };
}

// Kleiner Pokal. Die Farbe kommt aus dem Text (currentColor): Gold für Gesamt, Blau für aktuell.
function trophy(size) {
  const n = size || 16;
  return '<svg class="trophy" width="' + n + '" height="' + n + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">'
    + '<path d="M7 3h10v5a5 5 0 0 1-10 0z"/><path d="M7 5H3.5v1.5A3.5 3.5 0 0 0 7 10V8.4A1.8 1.8 0 0 1 5.3 6.6V6.5H7zM17 5h3.5v1.5A3.5 3.5 0 0 1 17 10V8.4a1.8 1.8 0 0 0 1.7-1.8V6.5H17z"/>'
    + '<path d="M11 13h2v3h-2z"/><path d="M8 19a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H8z"/></svg>';
}

// Kleine Einblendung oben (z. B. bei einem Rekord)
let toastTimer = null;
function showToast(html, ms) {
  const t = document.getElementById('toast');
  t.innerHTML = html;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms || 4000);
}
document.getElementById('toast').addEventListener('click', () => { document.getElementById('toast').hidden = true; });
