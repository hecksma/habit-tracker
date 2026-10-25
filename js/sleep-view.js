// ======================================================================
// Schlaf: Anzeige und Bedienung
// Teil von Maximize. Die Skripte laufen in der Reihenfolge, wie sie in index.html stehen
// und teilen sich dieselben Funktionen und Variablen.
// ======================================================================

const sleepEl = document.getElementById('sleepContent');

// ---- Hilfen ----

const fmtDur = (min) => {
  const h = Math.floor(min / 60), m = Math.round(min % 60);
  return h + ' h' + (m ? ' ' + pad(m) + ' min' : '');
};
const clockText = (d) => pad(d.getHours()) + ':' + pad(d.getMinutes());
const dayShort = (dateStr) => parseDate(dateStr.slice(0, 10)).toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
const dayLong = (dateStr) => parseDate(dateStr.slice(0, 10)).toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
// Minuten seit Mittag des Vortags: so liegen 23:00 und 00:30 nebeneinander statt weit auseinander
const nightMin = (d) => (d.getHours() * 60 + d.getMinutes() - 720 + 1440) % 1440;
const fromNightMin = (v) => { const t = (Math.round(v) + 720) % 1440; return pad(Math.floor(t / 60)) + ':' + pad(t % 60); };
const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const sd = (arr) => { const m = avg(arr); return Math.sqrt(avg(arr.map(x => (x - m) * (x - m)))); };

// Die nächste Weckzeit (Uhrzeit "HH:MM") nach dem Zeitpunkt from
function nextWake(timeStr, from) {
  const d = new Date(from);
  d.setHours(+timeStr.slice(0, 2), +timeStr.slice(3, 5), 0, 0);
  if (d.getTime() <= from + 60000) d.setDate(d.getDate() + 1);
  return d;
}

// Vorschlag für die Weckzeit: die zuletzt genutzte Zeit für den Wochentag, an dem du aufwachst
function defaultWakeTime() {
  const now = Date.now();
  const wd = weekdayIdx(nextWake(sleep.wakeByWeekday[weekdayIdx(new Date(now))] || '07:00', now));
  return sleep.wakeByWeekday[wd] || '07:00';
}

// Link, der die Wecker-App von Android öffnet (nur ein Versuch: ob Chrome das erlaubt, hängt vom Handy ab)
function alarmLink(timeStr, show) {
  const fb = 'S.browser_fallback_url=' + encodeURIComponent(location.href.split('#')[0]);
  if (show) return 'intent:#Intent;action=android.intent.action.SHOW_ALARMS;' + fb + ';end';
  return 'intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=' + (+timeStr.slice(0, 2))
    + ';i.android.intent.extra.alarm.MINUTES=' + (+timeStr.slice(3, 5)) + ';S.android.intent.extra.alarm.MESSAGE=Maximize;B.android.intent.extra.alarm.SKIP_UI=false;' + fb + ';end';
}

// ---- Speichern einer Nacht ----

function finishNight(wakeMs, how) {
  if (!sleepActive) return null;
  const n = {
    id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    bed: fmtDT(new Date(sleepActive.bed)), wake: fmtDT(new Date(wakeMs)), rating: null, tags: [], how
  };
  const clean = sanitizeSleep({ nights: [n], tags: sleep.tags });
  if (!clean.nights.length) return null;
  const before = JSON.stringify(sleep);
  sleep.nights.push(clean.nights[0]);
  sleep.nights.sort((a, b) => (a.bed < b.bed ? -1 : a.bed > b.bed ? 1 : 0));
  if (!saveSleep()) { sleep = JSON.parse(before); return null; }
  sleepActive = null; saveSleepActive();
  sleepState.askEdit = false; sleepState.asked = false;
  return clean.nights[0];
}

// ---- Editor einer Nacht (Gefühl, Notizen, Zeiten) ----

function nightEditorHtml(n) {
  const nid = escapeHtml(n.id);
  const chips = sleep.tags.map((t, i) => '<button type="button" class="chip" data-act="s-tag" data-id="' + nid + '" data-ti="' + i + '" aria-pressed="' + n.tags.includes(t) + '">' + escapeHtml(t) + '</button>').join('');
  return '<div class="night-ed">'
    + '<div class="ne-label">Wie fühlst du dich? <span>1 = müde, 5 = fit</span></div>'
    + '<div class="chips wrap">' + [1, 2, 3, 4, 5].map(v => '<button type="button" class="chip" data-act="s-rate" data-id="' + nid + '" data-v="' + v + '" aria-pressed="' + (n.rating === v) + '">' + v + '</button>').join('') + '</div>'
    + '<div class="ne-label">Notizen zur Nacht <span>optional</span></div>'
    + '<div class="chips wrap">' + chips + '<button type="button" class="chip add" data-act="s-newtag" data-id="' + nid + '">+ Neu</button></div>'
    + (sleepState.newTagFor === n.id ? '<div class="newtag-row"><input type="text" class="text-input" id="newTagInput" maxlength="24" placeholder="z. B. Sport, Reise …" aria-label="Neue Notiz" /><button type="button" class="btn primary" data-act="s-addtag" data-id="' + nid + '">Hinzufügen</button></div>' : '')
    + '<div class="tool-row" style="margin-top:12px;"><button type="button" class="tool-btn" data-act="s-times" data-id="' + nid + '">Zeiten ändern</button></div>'
    + '</div>';
}

function nightItemHtml(n) {
  const mins = nightMinutes(n), goalOk = mins >= sleep.goalMin;
  const bits = [clockText(parseDT(n.bed)) + ' – ' + clockText(parseDT(n.wake))];
  if (n.rating) bits.push('Gefühl ' + n.rating + '/5');
  if (n.tags.length) bits.push(n.tags.join(', '));
  return '<details class="stat-habit" data-nid="' + escapeHtml(n.id) + '"' + (sleepState.openId === n.id ? ' open' : '') + '>'
    + '<summary><span class="log-summary-text"><span class="log-title">' + dayShort(n.wake) + ' · ' + fmtDur(mins) + '</span>'
    + '<span class="log-sub">' + escapeHtml(bits.join(' · ')) + '</span></span><span class="chevron" aria-hidden="true"></span></summary>'
    + '<div class="sh-body">' + nightEditorHtml(n) + '</div></details>';
}

// ---- Startseite ----

function renderSleep() {
  updateSleepNav();
  if (sleepState.tab === 'stats') { renderSleepStats(); return; }
  const sub = document.getElementById('sleepSubtitle');
  let html = '';
  const now = Date.now();
  const last = sleep.nights[sleep.nights.length - 1];
  if (sleepActive && now >= sleepActive.wake) {
    sub.textContent = 'Guten Morgen';
    html += wakeCardHtml();
  } else if (sleepActive) {
    sub.textContent = 'Gute Nacht';
    html += sleepingHtml();
  } else {
    sub.textContent = last ? 'Letzte Nacht: ' + fmtDur(nightMinutes(last)) : 'Noch keine Nächte.';
    html += goodNightHtml();
  }
  if (last && !(sleepActive && now >= sleepActive.wake) && parseDT(last.wake) > now - 36 * 3600e3) {
    html += '<div class="stats-title">Letzte Nacht</div><div class="night-card"><div class="night-card-head"><span class="log-title">' + dayShort(last.wake) + ' · ' + fmtDur(nightMinutes(last)) + '</span>'
      + '<span class="log-sub">' + clockText(parseDT(last.bed)) + ' – ' + clockText(parseDT(last.wake)) + '</span></div>' + nightEditorHtml(last) + '</div>';
  }
  const rest = sleep.nights.slice().reverse().filter(n => !(last && n.id === last.id && parseDT(last.wake) > now - 36 * 3600e3));
  html += '<div class="stats-title">Nächte</div>';
  html += rest.slice(0, sleepState.shown).map(nightItemHtml).join('') || '<p class="hint">Hier erscheinen deine Nächte.</p>';
  if (rest.length > sleepState.shown) html += '<div class="more-row"><button type="button" class="tool-btn" data-act="s-more">Mehr anzeigen (' + (rest.length - sleepState.shown) + ' weitere)</button></div>';
  html += '<div class="more-row"><button type="button" class="tool-btn" data-act="s-add">+ Nacht nachtragen</button></div>';
  sleepEl.innerHTML = html;
}

function planLineText(timeStr) {
  const w = nextWake(timeStr, Date.now());
  const mins = Math.round((w.getTime() - Date.now()) / 60000);
  return dayLong(fmt(w)) + ' · bis dahin ' + fmtDur(mins);
}

function goodNightHtml() {
  const time = sleepState.draftWake || defaultWakeTime();
  const base = Date.now() + 15 * 60000; // etwa 15 Minuten zum Einschlafen
  const chips = [4, 5, 6].map(c => {
    const t = new Date(Math.ceil((base + c * 90 * 60000) / 300000) * 300000);
    return '<button type="button" class="chip" data-act="s-cycle" data-time="' + clockText(t) + '">' + clockText(t) + ' <small>' + c + ' Zyklen</small></button>';
  }).join('');
  return '<div class="stats-title" style="margin-top:20px;">Gute Nacht</div>'
    + '<div class="night-card"><label class="ne-label" for="sleepWake">Wecken um</label>'
    + '<input type="text" readonly id="sleepWake" class="time-input tp" data-tp="time" data-title="Wecken um" value="' + time + '" aria-label="Weckzeit" />'
    + '<p class="hint" id="sleepPlan" style="margin:8px 0 12px;">' + planLineText(time) + '</p>'
    + '<div class="ne-label">Vorschlag nach Schlafzyklen <span>etwa 90 Minuten pro Zyklus</span></div>'
    + '<div class="chips wrap">' + chips + '</div>'
    + '<div class="start-row" style="margin-top:16px;"><button type="button" class="btn primary" data-act="s-start">Gute Nacht</button></div></div>';
}

function sleepingHtml() {
  const a = sleepActive;
  return '<div class="stats-title" style="margin-top:20px;">Gute Nacht</div>'
    + '<div class="night-card sleeping"><div class="big-time" id="sleepBig">' + a.time + '</div>'
    + '<p class="hint" id="sleepLeft" style="margin:0 0 12px;">' + sleepLeftText() + '</p>'
    + '<label class="ne-label" for="sleepWake2">Weckzeit ändern</label>'
    + '<input type="text" readonly id="sleepWake2" class="time-input tp" data-tp="time" data-title="Wecken um" value="' + a.time + '" aria-label="Weckzeit" />'
    + '<div class="ne-label" style="margin-top:16px;">Wecker in der Uhr-App <span>Versuch: ob dein Handy das zulässt, zeigt sich</span></div>'
    + '<div class="tool-row"><a class="tool-btn" href="' + escapeHtml(alarmLink(a.time, false)) + '">Wecker stellen (Test)</a>'
    + '<a class="tool-btn" href="' + escapeHtml(alarmLink(a.time, true)) + '">Wecker-Liste öffnen</a></div>'
    + '<div class="end-row"><button type="button" class="btn danger" data-act="s-cancel">Abbrechen</button><span class="spacer"></span>'
    + '<button type="button" class="btn" data-act="s-up">Jetzt aufgestanden</button></div></div>';
}
function sleepLeftText() {
  const a = sleepActive, now = Date.now();
  return 'Eingeschlafen um ' + clockText(new Date(a.bed)) + ' · noch ' + fmtDur(Math.max(0, Math.round((a.wake - now) / 60000))) + ' bis zum Wecken';
}

function wakeCardHtml() {
  const a = sleepActive;
  const edit = sleepState.askEdit;
  return '<div class="stats-title" style="margin-top:20px;">Guten Morgen</div>'
    + '<div class="night-card"><p style="margin:0 0 12px;font-size:16px;">Warst du um <b>' + a.time + ' Uhr</b> wach?</p>'
    + (edit ? '<label class="ne-label" for="wakeTimeInline">Wann bist du aufgewacht?</label><input type="text" readonly id="wakeTimeInline" class="time-input tp" data-tp="time" data-title="Aufgewacht um" value="' + a.time + '" aria-label="Aufwachzeit" /><p class="status error" id="wakeMsgInline" role="alert"></p>'
        + '<div class="end-row"><button type="button" class="btn" data-act="s-wake-back">Zurück</button><span class="spacer"></span><button type="button" class="btn primary" data-act="s-wake-save">Speichern</button></div>'
      : '<div class="end-row" style="margin-top:6px;"><button type="button" class="btn" data-act="s-wake-no">Nein, andere Zeit</button><span class="spacer"></span><button type="button" class="btn primary" data-act="s-wake-yes">Ja</button></div>')
    + '</div>';
}

function updateSleepNav() {
  const tabs = document.getElementById('sleepTabs');
  tabs.querySelectorAll('button').forEach(t => t.setAttribute('aria-pressed', String(t.dataset.stab === sleepState.tab)));
}

// ---- Fragen am Morgen (Fenster) ----

const wakeSheet = document.getElementById('wakeSheet');

function maybeAskWake() {
  if (!sleepActive || Date.now() < sleepActive.wake || sleepState.asked || wakeSheet.open) return;
  if (document.querySelector('dialog[open]')) return;
  sleepState.asked = true;
  sleepState.askEdit = false;
  document.getElementById('wakeText').innerHTML = 'Warst du um <b>' + sleepActive.time + ' Uhr</b> wach?';
  document.getElementById('wakeEdit').hidden = true;
  document.getElementById('wakeNo').hidden = false;
  document.getElementById('wakeYes').textContent = 'Ja';
  document.getElementById('wakeTime').value = sleepActive.time;
  document.getElementById('wakeMsg').textContent = '';
  wakeSheet.showModal();
  document.getElementById('wakeTitle').focus({ preventScroll: true });
}

// Speichert mit der angegebenen Aufstehzeit (null = Weckzeit). Gibt Fehlertext zurück oder ''.
function saveWake(timeStr) {
  const a = sleepActive;
  if (!a) return '';
  let wakeMs = a.wake, how = 'ok';
  if (timeStr && timeStr !== a.time) {
    if (!TIME_RE.test(timeStr)) return 'Bitte gib eine Uhrzeit an.';
    const d = new Date(a.wake);
    d.setHours(+timeStr.slice(0, 2), +timeStr.slice(3, 5), 0, 0);
    wakeMs = d.getTime(); how = 'edit';
    if (wakeMs - a.bed < 20 * 60000) return 'Die Aufwachzeit muss nach dem Einschlafen liegen.';
  }
  const n = finishNight(wakeMs, how);
  if (!n) return 'Das Speichern hat nicht geklappt (Speicher voll?).';
  sleepState.openId = null;
  showToast('<b>Nacht gespeichert</b><br />' + fmtDur(nightMinutes(n)) + ' Schlaf (' + clockText(parseDT(n.bed)) + ' – ' + clockText(parseDT(n.wake)) + ')<br /><span class="toast-sub">Gefühl und Notizen kannst du unter „Schlaf“ ergänzen.</span>', 5000);
  renderSleep();
  return '';
}

document.getElementById('wakeYes').addEventListener('click', () => {
  const editing = !document.getElementById('wakeEdit').hidden;
  const msg = saveWake(editing ? document.getElementById('wakeTime').value : null);
  if (msg) document.getElementById('wakeMsg').textContent = msg; else wakeSheet.close();
});
document.getElementById('wakeNo').addEventListener('click', () => {
  document.getElementById('wakeEdit').hidden = false;
  document.getElementById('wakeNo').hidden = true;
  document.getElementById('wakeYes').textContent = 'Speichern';
});
wakeSheet.addEventListener('click', (e) => { if (e.target === wakeSheet) wakeSheet.close(); });

// ---- Bedienung auf der Seite ----

sleepEl.addEventListener('click', (e) => {
  const b = e.target.closest('[data-act]');
  if (!b) return;
  const act = b.dataset.act;
  const night = b.dataset.id ? sleep.nights.find(n => n.id === b.dataset.id) : null;
  if (act === 's-cycle') {
    const inp = document.getElementById('sleepWake');
    inp.value = b.dataset.time; sleepState.draftWake = b.dataset.time;
    document.getElementById('sleepPlan').textContent = planLineText(b.dataset.time);
  }
  else if (act === 's-start') {
    const time = (document.getElementById('sleepWake').value || '').slice(0, 5);
    if (!TIME_RE.test(time)) return;
    const now = Date.now(), wake = nextWake(time, now);
    sleepActive = { bed: now, wake: wake.getTime(), time };
    sleep.wakeByWeekday[weekdayIdx(wake)] = time;
    saveSleep(); saveSleepActive();
    sleepState.draftWake = null; sleepState.asked = false; sleepState.askEdit = false;
    renderSleep(); window.scrollTo(0, 0);
  }
  else if (act === 's-cancel') { if (twoStep(b, 'Wirklich abbrechen?')) { sleepActive = null; saveSleepActive(); renderSleep(); } }
  else if (act === 's-up') { const n = finishNight(Date.now(), 'edit'); if (n) { showToast('<b>Nacht gespeichert</b><br />' + fmtDur(nightMinutes(n)) + ' Schlaf', 4000); renderSleep(); } }
  else if (act === 's-wake-yes') saveWake(null);
  else if (act === 's-wake-no') { sleepState.askEdit = true; renderSleep(); }
  else if (act === 's-wake-back') { sleepState.askEdit = false; renderSleep(); }
  else if (act === 's-wake-save') { const m = saveWake(document.getElementById('wakeTimeInline').value); if (m) document.getElementById('wakeMsgInline').textContent = m; }
  else if (act === 's-rate' && night) { const v = Number(b.dataset.v); night.rating = night.rating === v ? null : v; saveSleep(); renderSleep(); }
  else if (act === 's-tag' && night) {
    const t = sleep.tags[Number(b.dataset.ti)];
    if (t) { night.tags = night.tags.includes(t) ? night.tags.filter(x => x !== t) : night.tags.concat(t); saveSleep(); renderSleep(); }
  }
  else if (act === 's-newtag') { sleepState.newTagFor = sleepState.newTagFor === b.dataset.id ? null : b.dataset.id; renderSleep(); const i = document.getElementById('newTagInput'); if (i) i.focus(); }
  else if (act === 's-addtag' && night) addTag(night);
  else if (act === 's-times' && night) openNightSheet(night.id);
  else if (act === 's-add') openNightSheet(null);
  else if (act === 's-more') { sleepState.shown += 14; renderSleep(); }
  else if (act === 's-month') shiftSleepMonth(Number(b.dataset.dir));
  else if (act === 's-day') { sleepState.calSel = sleepState.calSel === b.dataset.date ? null : b.dataset.date; renderSleep(); }
});

function addTag(night) {
  const input = document.getElementById('newTagInput');
  const t = cleanTag(input ? input.value : '');
  if (!t) return;
  let existing = sleep.tags.find(x => x.toLowerCase() === t.toLowerCase());
  if (!existing) { sleep.tags.push(t); existing = t; }
  if (!night.tags.includes(existing)) night.tags.push(existing);
  sleepState.newTagFor = null;
  saveSleep(); renderSleep();
}

sleepEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.id === 'newTagInput') {
    e.preventDefault();
    const night = sleep.nights.find(n => n.id === sleepState.newTagFor);
    if (night) addTag(night);
  }
});

// Zeitfelder: Änderungen sofort übernehmen
sleepEl.addEventListener('input', (e) => {
  if (e.target.id === 'sleepWake' && TIME_RE.test(e.target.value)) {
    sleepState.draftWake = e.target.value;
    document.getElementById('sleepPlan').textContent = planLineText(e.target.value);
  }
});
sleepEl.addEventListener('change', (e) => {
  if (e.target.id === 'sleepWake2' && sleepActive && TIME_RE.test(e.target.value)) {
    const wake = nextWake(e.target.value, sleepActive.bed);
    // Die Weckzeit liegt immer nach dem Einschlafen, aber nicht vor jetzt
    const w = wake.getTime() > Date.now() ? wake : nextWake(e.target.value, Date.now());
    sleepActive.wake = w.getTime(); sleepActive.time = e.target.value;
    saveSleepActive();
    document.getElementById('sleepBig').textContent = sleepActive.time;
    document.getElementById('sleepLeft').textContent = sleepLeftText();
  }
});
// Welche Nacht aufgeklappt ist, merken wir uns für das nächste Neuzeichnen
sleepEl.addEventListener('toggle', (e) => {
  const d = e.target;
  if (d.matches && d.matches('details[data-nid]')) {
    if (d.open) sleepState.openId = d.dataset.nid;
    else if (sleepState.openId === d.dataset.nid) sleepState.openId = null;
  }
}, true);

document.getElementById('sleepTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-stab]');
  if (!b) return;
  sleepState.tab = b.dataset.stab === 'stats' ? 'stats' : 'night';
  renderSleep(); window.scrollTo(0, 0);
});

// ---- Nacht nachtragen / Zeiten ändern ----

const nightSheet = document.getElementById('nightSheet');
let nightCtx = null;

function openNightSheet(id) {
  const n = id ? sleep.nights.find(x => x.id === id) : null;
  nightCtx = { id: n ? n.id : null };
  const y = addDays(new Date(), -1);
  document.getElementById('nightTitle').textContent = n ? 'Zeiten ändern' : 'Nacht nachtragen';
  document.getElementById('nightBed').value = n ? n.bed : fmt(y) + 'T23:00';
  document.getElementById('nightWake').value = n ? n.wake : todayStr() + 'T07:00';
  document.getElementById('nightMsg').textContent = '';
  const del = document.getElementById('nightDelete');
  disarm(del); del.hidden = !n;
  nightSheet.showModal();
  document.getElementById('nightTitle').focus({ preventScroll: true });
}

document.getElementById('nightCancel').addEventListener('click', () => nightSheet.close());
nightSheet.addEventListener('click', (e) => { if (e.target === nightSheet) nightSheet.close(); });
document.getElementById('nightDelete').addEventListener('click', (e) => {
  if (!twoStep(e.currentTarget, 'Wirklich löschen?')) return;
  const before = JSON.stringify(sleep);
  sleep.nights = sleep.nights.filter(n => n.id !== nightCtx.id);
  if (!saveSleep()) { sleep = JSON.parse(before); return; }
  nightSheet.close(); renderSleep();
});
document.getElementById('nightForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const bed = document.getElementById('nightBed').value, wake = document.getElementById('nightWake').value, msg = document.getElementById('nightMsg');
  if (!DT_RE.test(bed) || !DT_RE.test(wake)) { msg.textContent = 'Bitte gib beide Zeiten an.'; return; }
  const mins = Math.round((parseDT(wake) - parseDT(bed)) / 60000);
  if (mins < 20 || mins > 1440) { msg.textContent = 'Die Aufwachzeit muss nach dem Einschlafen liegen (höchstens 24 Stunden).'; return; }
  if (sleep.nights.some(n => n.id !== nightCtx.id && n.bed === bed)) { msg.textContent = 'Für diese Einschlafzeit gibt es schon eine Nacht.'; return; }
  const before = JSON.stringify(sleep);
  if (nightCtx.id) { const n = sleep.nights.find(x => x.id === nightCtx.id); n.bed = bed; n.wake = wake; if (n.how === 'plan' || n.how === 'ok') n.how = 'edit'; }
  else sleep.nights.push({ id: 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), bed, wake, rating: null, tags: [], how: 'manual' });
  sleep.nights.sort((a, b) => (a.bed < b.bed ? -1 : a.bed > b.bed ? 1 : 0));
  if (!saveSleep()) { sleep = JSON.parse(before); msg.textContent = 'Der Speicher ist voll.'; return; }
  nightSheet.close(); renderSleep();
});

// ---- Einstellungen: Schlafziel und Notizen ----

function renderSleepSettings() {
  document.getElementById('sleepGoalValue').textContent = fmtDur(sleep.goalMin);
  document.getElementById('tagList').innerHTML = sleep.tags.map((t, i) =>
    '<span class="tag-pill">' + escapeHtml(t) + '<button type="button" data-ti="' + i + '" aria-label="' + escapeHtml(t) + ' entfernen">✕</button></span>').join('') || '<p class="setting-desc">Keine Notizen.</p>';
}
document.getElementById('sleepGoalMinus').addEventListener('click', () => { sleep.goalMin = Math.max(240, sleep.goalMin - 15); saveSleep(); renderSleepSettings(); });
document.getElementById('sleepGoalPlus').addEventListener('click', () => { sleep.goalMin = Math.min(720, sleep.goalMin + 15); saveSleep(); renderSleepSettings(); });
document.getElementById('tagList').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-ti]');
  if (!b) return;
  sleep.tags.splice(Number(b.dataset.ti), 1); // bereits gespeicherte Nächte behalten ihre Notizen
  saveSleep(); renderSleepSettings();
});

// ---- Takt: Anzeige auffrischen, Weckzeit erkennen ----

function sleepTick() {
  if (!sleepActive) return;
  if (Date.now() >= sleepActive.wake) {
    if (!sleepState.asked) maybeAskWake();
    if (currentView === 'sleep' && sleepState.tab === 'night' && !wakeSheet.open && !sleepEl.querySelector('#wakeTimeInline')) renderSleep();
  } else {
    const el = document.getElementById('sleepLeft');
    if (el && currentView === 'sleep') el.textContent = sleepLeftText();
  }
}
setInterval(sleepTick, 20000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { sleepState.asked = false; maybeAskWake(); if (currentView === 'sleep') renderSleep(); } });

// ======================================================================
// Schlaf: Statistik
// ======================================================================

// Die Nacht gehört zum Tag, an dem du aufgewacht bist
const nightDay = (n) => n.wake.slice(0, 10);
// Der Abend, an dem die Nacht begann (Einschlafen nach Mitternacht zählt zum Vortag)
function eveningOf(n) {
  const d = parseDT(n.bed);
  return fmt(d.getHours() < 12 ? addDays(d, -1) : d);
}

function shiftSleepMonth(dir) {
  const cur = todayStr().slice(0, 7);
  const [y, m] = (sleepState.calMonth || cur).split('-').map(Number);
  const d = new Date(y, m - 1 + dir, 1, 12);
  sleepState.calMonth = d.getFullYear() + '-' + pad(d.getMonth() + 1);
  sleepState.calSel = null;
  renderSleep();
}

function sleepCalendarHtml(byDay, today) {
  const cur = today.slice(0, 7);
  const firstKey = Object.keys(byDay).sort()[0];
  const firstMonth = firstKey ? firstKey.slice(0, 7) : cur;
  let ym = sleepState.calMonth || cur;
  if (ym > cur) ym = cur;
  if (ym < firstMonth) ym = firstMonth;
  sleepState.calMonth = ym;
  const [y, m] = ym.split('-').map(Number);
  const monthStart = new Date(y, m - 1, 1, 12), daysInMonth = new Date(y, m, 0).getDate();
  const label = monthStart.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
  let cells = DAY_LABELS.map(l => '<span class="cal-wd">' + l + '</span>').join('');
  for (let i = 0; i < weekdayIdx(monthStart); i++) cells += '<span></span>';
  let count = 0;
  for (let n = 1; n <= daysInMonth; n++) {
    const key = fmt(new Date(y, m - 1, n, 12)), list = byDay[key];
    const cls = ['cal-day'];
    if (list) { count++; cls.push(Math.max.apply(null, list.map(nightMinutes)) >= sleep.goalMin ? 'trained' : 'partial'); }
    if (key === today) cls.push('today');
    if (key === sleepState.calSel) cls.push('sel');
    cells += '<button type="button" class="' + cls.join(' ') + '" data-act="s-day" data-date="' + key + '" aria-label="' + n + '. ' + label + (list ? ': ' + fmtDur(nightMinutes(list[0])) : ': keine Nacht') + '"' + (key > today ? ' disabled' : '') + '>' + n + '</button>';
  }
  let html = '<div class="cal-head">'
    + '<button type="button" class="cal-nav" data-act="s-month" data-dir="-1" aria-label="Vorheriger Monat"' + (ym <= firstMonth ? ' disabled' : '') + '>‹</button>'
    + '<span>' + label + ' · ' + count + (count === 1 ? ' Nacht' : ' Nächte') + '</span>'
    + '<button type="button" class="cal-nav" data-act="s-month" data-dir="1" aria-label="Nächster Monat"' + (ym >= cur ? ' disabled' : '') + '>›</button>'
    + '</div><div class="cal">' + cells + '</div>'
    + '<p class="stats-note" style="margin:8px 2px 0;"><span class="leg leg-ok"></span> Ziel erreicht <span class="leg leg-part"></span> darunter</p>';
  if (sleepState.calSel) {
    const list = byDay[sleepState.calSel] || [];
    html += '<div class="day-list">' + (list.length ? list.map(nightItemHtml).join('') : '<p class="hint">Am ' + longDate(sleepState.calSel) + ' gibt es keine Nacht.</p>') + '</div>';
  }
  return html;
}

// Balken: Schlafdauer der letzten 14 Nächte, mit Linie für das Ziel
function sleepBarsHtml(nights) {
  const max = Math.max(sleep.goalMin * 1.25, ...nights.map(nightMinutes));
  const goalPct = Math.round(100 * sleep.goalMin / max);
  return '<div class="chart sleep-chart" role="img" aria-label="Schlafdauer pro Nacht" style="--goal:' + goalPct + '%">' + nights.map(n => {
    const mins = nightMinutes(n), pct = Math.max(Math.round(100 * mins / max), 3);
    const tip = dayShort(n.wake) + ': ' + fmtDur(mins) + ' (' + clockText(parseDT(n.bed)) + ' – ' + clockText(parseDT(n.wake)) + ')';
    return '<div class="bar-col" data-tip="' + escapeHtml(tip) + '" tabindex="0" role="button" aria-label="' + escapeHtml(tip) + '">'
      + '<span class="bar-val">' + (Math.round(mins / 6) / 10).toString().replace('.', ',') + '</span>'
      + '<span class="bar-track"><span class="bar' + (mins >= sleep.goalMin ? '' : ' under') + '" style="height:' + pct + '%"></span></span>'
      + '<span class="bar-label">' + parseDT(n.wake).getDate() + '.</span></div>';
  }).join('') + '</div>';
}

// Linien: Einschlaf- und Aufstehzeit der letzten Nächte (zeigt die Regelmäßigkeit)
function rhythmSvg(nights) {
  const W = 320, H = 150, L = 38, R = 10, T = 12, B = 22, n = nights.length;
  const beds = nights.map(x => nightMin(parseDT(x.bed))), wakes = nights.map(x => nightMin(parseDT(x.wake)));
  const all = beds.concat(wakes);
  let lo = Math.floor((Math.min.apply(null, all) - 20) / 60) * 60, hi = Math.ceil((Math.max.apply(null, all) + 20) / 60) * 60;
  if (hi - lo < 120) hi = lo + 120;
  const x = i => n === 1 ? (L + W - R) / 2 : L + i * (W - L - R) / (n - 1);
  const y = v => T + (v - lo) * (H - T - B) / (hi - lo);
  const step = (hi - lo) > 480 ? 180 : 120;
  let grid = '';
  for (let v = lo; v <= hi; v += step) grid += '<line x1="' + L + '" y1="' + y(v).toFixed(1) + '" x2="' + (W - R) + '" y2="' + y(v).toFixed(1) + '" stroke="var(--border)"/><text x="0" y="' + (y(v) + 3.5).toFixed(1) + '" fill="var(--ink-dim)" font-size="10">' + fromNightMin(v) + '</text>';
  const line = (vals, color) => '<polyline points="' + vals.map((v, i) => x(i).toFixed(1) + ',' + y(v).toFixed(1)).join(' ') + '" fill="none" stroke="' + color + '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'
    + vals.map((v, i) => '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3" fill="' + color + '" data-tip="' + escapeHtml(dayShort(nights[i].wake) + ' · ' + (color === 'var(--sage)' ? 'Einschlafen ' : 'Aufstehen ') + fromNightMin(v)) + '"/>').join('');
  const every = n <= 7 ? 1 : n <= 12 ? 2 : 3;
  const labels = nights.map((nt, i) => ((n - 1 - i) % every === 0) ? '<text x="' + x(i).toFixed(1) + '" y="' + (H - 6) + '" fill="var(--ink-dim)" font-size="9.5" text-anchor="middle">' + parseDT(nt.wake).getDate() + '.</text>' : '').join('');
  return '<svg class="chart-svg" viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Einschlaf- und Aufstehzeiten. Antippen zeigt Werte.">' + grid + labels + line(beds, 'var(--sage)') + line(wakes, 'var(--amber)') + '</svg>'
    + '<p class="stats-note" style="margin:4px 2px 0;"><span class="leg" style="background:var(--sage)"></span> Einschlafen <span class="leg" style="background:var(--amber)"></span> Aufstehen</p>';
}

function renderSleepStats() {
  const sub = document.getElementById('sleepSubtitle');
  const nights = sleep.nights;
  if (!nights.length) {
    sub.textContent = 'Noch keine Nächte.';
    sleepEl.innerHTML = '<div class="empty-state"><div class="big">Noch keine Statistik</div>Sobald du eine Nacht gespeichert hast, siehst du hier Dauer, Rhythmus und Auffälligkeiten.</div>';
    return;
  }
  sub.textContent = nights.length + (nights.length === 1 ? ' Nacht' : ' Nächte') + ' erfasst';
  const today = todayStr();
  const byDay = {};
  nights.forEach(n => { (byDay[nightDay(n)] = byDay[nightDay(n)] || []).push(n); });
  const last7 = nights.slice(-7), last14 = nights.slice(-14);
  const cutoff30 = fmt(addDays(parseDate(today), -29));
  const last30 = nights.filter(n => nightDay(n) >= cutoff30);
  const avgDur = (list) => list.length ? Math.round(avg(list.map(nightMinutes))) : null;
  const debt = last7.reduce((a, n) => a + Math.max(0, sleep.goalMin - nightMinutes(n)), 0);
  const bedAvg = fromNightMin(avg(last14.map(n => nightMin(parseDT(n.bed)))));
  const wakeAvg = fromNightMin(avg(last14.map(n => nightMin(parseDT(n.wake)))));
  const card = (v, l, s) => '<div class="stat-card"><div class="stat-value">' + v + '</div><div class="stat-label">' + l + '</div>' + (s ? '<div class="stat-sub">' + s + '</div>' : '') + '</div>';

  let html = '<div class="stats-title" style="margin-top:20px;">Kalender</div>' + sleepCalendarHtml(byDay, today)
    + '<div class="stats-title">Zahlen</div><div class="stat-grid">'
    + card(avgDur(last7) ? fmtDur(avgDur(last7)) : '–', 'Ø Schlaf, 7 Nächte', 'Ziel ' + fmtDur(sleep.goalMin))
    + card(avgDur(last30) ? fmtDur(avgDur(last30)) : '–', 'Ø Schlaf, 30 Tage', last30.length + ' Nächte')
    + card(bedAvg, 'Ø Einschlafen', 'letzte ' + last14.length + ' Nächte')
    + card(wakeAvg, 'Ø Aufstehen', 'letzte ' + last14.length + ' Nächte')
    + card(debt ? fmtDur(debt) : '0 h', 'Schlafschuld, 7 Nächte', 'Summe unter dem Ziel')
    + card(last30.length ? Math.round(100 * last30.filter(n => nightMinutes(n) >= sleep.goalMin).length / last30.length) + ' %' : '–', 'Ziel erreicht', 'letzte 30 Tage')
    + '</div>'
    + '<div class="stats-title">Schlafdauer</div><p class="stats-note" style="margin:-6px 2px 8px;">Letzte ' + Math.min(14, nights.length) + ' Nächte. Die Linie ist dein Ziel.</p>' + sleepBarsHtml(last14);

  // Regelmäßigkeit
  if (last14.length >= 3) {
    const sdBed = Math.round(sd(last14.map(n => nightMin(parseDT(n.bed))))), sdWake = Math.round(sd(last14.map(n => nightMin(parseDT(n.wake)))));
    const verdict = (m) => m <= 30 ? 'sehr regelmäßig' : m <= 60 ? 'ziemlich regelmäßig' : m <= 90 ? 'schwankend' : 'unregelmäßig';
    html += '<div class="stats-title">Regelmäßigkeit</div><div class="stat-grid">'
      + card('± ' + sdBed + ' min', 'Einschlafzeit', verdict(sdBed))
      + card('± ' + sdWake + ' min', 'Aufstehzeit', verdict(sdWake)) + '</div>'
      + '<div style="margin-top:10px;">' + rhythmSvg(last14) + '</div>';
  }

  // Notizen: Wie wirken sie auf die Dauer?
  const tagRows = sleep.tags.map(t => {
    const w = nights.filter(n => n.tags.includes(t)), wo = nights.filter(n => !n.tags.includes(t));
    if (w.length < 3 || wo.length < 3) return null;
    return { t, n: w.length, a: avg(w.map(nightMinutes)), b: avg(wo.map(nightMinutes)) };
  }).filter(Boolean).sort((p, q) => Math.abs(q.a - q.b) - Math.abs(p.a - p.b));
  const tagUsed = sleep.tags.filter(t => nights.some(n => n.tags.includes(t))).length;
  html += '<div class="stats-title">Notizen und Schlaf</div>';
  if (tagRows.length) {
    html += '<p class="stats-note" style="margin:-6px 2px 8px;">Ø Schlafdauer in Nächten mit der Notiz, verglichen mit Nächten ohne.</p><div class="pr-list">'
      + tagRows.map(r => {
        const diff = Math.round(r.a - r.b);
        return '<div class="pr-row"><span class="pr-name">' + escapeHtml(r.t) + '<span class="pr-kind">' + r.n + ' Nächte</span></span><span class="pr-val">' + fmtDur(Math.round(r.a)) + '</span>'
          + '<span class="pr-date" style="color:' + (diff < -10 ? 'var(--danger)' : diff > 10 ? 'var(--amber)' : 'var(--ink-dim)') + '">' + (diff > 0 ? '+' : diff < 0 ? '−' : '') + Math.abs(diff) + ' min</span></div>';
      }).join('') + '</div>';
  } else {
    html += '<p class="hint">' + (tagUsed ? 'Sobald eine Notiz in mindestens 3 Nächten (und 3 ohne sie) vorkommt, siehst du hier den Vergleich.' : 'Hake bei einer Nacht Notizen wie „Koffein“ an. Nach ein paar Nächten siehst du hier, was sich auf deinen Schlaf auswirkt.') + '</p>';
  }

  // Verbindung zum Gym
  html += gymLinkHtml(nights);
  sleepEl.innerHTML = html;
}

// Schlaf nach Trainingstagen (Gym) und Training nach kurzen Nächten
function gymLinkHtml(nights) {
  if (!gym.workouts.length) return '';
  const byDate = {};
  gym.workouts.forEach(w => { const d = w.date.slice(0, 10), h = +w.date.slice(11, 13); (byDate[d] = byDate[d] || []).push(h); });
  const groups = { late: [], early: [], none: [] };
  nights.forEach(n => {
    const hrs = byDate[eveningOf(n)];
    if (!hrs) groups.none.push(n); else if (Math.max.apply(null, hrs) >= 18) groups.late.push(n); else groups.early.push(n);
  });
  const rows = [['Nach Training ab 18 Uhr', groups.late], ['Nach Training früher am Tag', groups.early], ['Ohne Training an dem Tag', groups.none]].filter(r => r[1].length >= 2);
  if (rows.length < 2) return '';
  const rate = (list) => { const r = list.filter(n => n.rating); return r.length >= 2 ? ' · Gefühl Ø ' + nf.format(Math.round(avg(r.map(n => n.rating)) * 10) / 10) : ''; };
  return '<div class="stats-title">Schlaf und Gym</div><p class="stats-note" style="margin:-6px 2px 8px;">So schläfst du in der Nacht nach dem jeweiligen Tag.</p><div class="pr-list">'
    + rows.map(([label, list]) => '<div class="pr-row"><span class="pr-name">' + label + '<span class="pr-kind">' + list.length + ' Nächte' + rate(list) + '</span></span><span class="pr-val">' + fmtDur(Math.round(avg(list.map(nightMinutes)))) + '</span><span class="pr-date"></span></div>').join('') + '</div>';
}
