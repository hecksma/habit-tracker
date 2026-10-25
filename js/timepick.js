// Eigene Uhrzeit-Auswahl im 24-Stunden-Format (ohne AM/PM, unabhängig von den Handy-Einstellungen).
// Felder mit der Klasse "tp" öffnen sie. data-tp="time" liefert "HH:MM", data-tp="datetime" liefert "YYYY-MM-DDTHH:MM".
(function () {
  const dlg = document.getElementById('timePick');
  const hh = document.getElementById('tpH'), mm = document.getElementById('tpM');
  const svg = document.getElementById('tpDial');
  const dateRow = document.getElementById('tpDateRow'), dateLbl = document.getElementById('tpDateLbl');
  const NS = 'http://www.w3.org/2000/svg';
  let target = null, H = 0, M = 0, day = null, mode = 'h';

  const two = (n) => String(n).padStart(2, '0');
  const MONTHS = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
  function dateText(iso) {
    const d = new Date(iso + 'T12:00:00');
    return DAY_LABELS[(d.getDay() + 6) % 7] + ', ' + d.getDate() + '. ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }
  function shownText(el, v) {
    if (el.dataset.tp !== 'datetime') return v;
    return v && v.length >= 16 ? dateText(v.slice(0, 10)) + ', ' + v.slice(11, 16) : '';
  }

  const nativeSet = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  // Bei Datum+Zeit-Feldern bleibt .value der echte Wert, angezeigt wird ein lesbarer Text.
  function init(el) {
    if (el.dataset.tp !== 'datetime' || el._tp) return;
    el._tp = '';
    Object.defineProperty(el, 'value', {
      get() { return this._tp; },
      set(v) { this._tp = v || ''; nativeSet.call(this, shownText(this, this._tp)); }
    });
  }
  document.querySelectorAll('input.tp').forEach(init);

  function mk(tag, attrs, text) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function pos(r, a) { return [120 + r * Math.sin(a), 120 - r * Math.cos(a)]; }

  function drawDial() {
    svg.textContent = '';
    svg.appendChild(mk('circle', { cx: 120, cy: 120, r: 116, class: 'tp-face' }));
    let a, r;
    if (mode === 'h') { r = H >= 1 && H <= 12 ? 92 : 60; a = ((H % 12) / 12) * 2 * Math.PI; }
    else { r = 92; a = (M / 60) * 2 * Math.PI; }
    const [hx, hy] = pos(r, a);
    svg.appendChild(mk('line', { x1: 120, y1: 120, x2: hx, y2: hy, class: 'tp-hand' }));
    svg.appendChild(mk('circle', { cx: 120, cy: 120, r: 4, class: 'tp-hub' }));
    if (mode === 'h') {
      for (let i = 0; i < 24; i++) {
        const outer = i >= 1 && i <= 12;
        const ang = ((i % 12) / 12) * 2 * Math.PI;
        const [x, y] = pos(outer ? 92 : 60, ang);
        const sel = i === H;
        svg.appendChild(mk('circle', { cx: x, cy: y, r: 16, class: sel ? 'tp-sel' : 'tp-none' }));
        svg.appendChild(mk('text', { x, y: y + 5, class: 'tp-num' + (sel ? ' on' : '') + (outer ? '' : ' in') }, two(i)));
      }
    } else {
      for (let i = 0; i < 60; i += 5) {
        const [x, y] = pos(92, (i / 60) * 2 * Math.PI);
        const sel = i === M;
        svg.appendChild(mk('circle', { cx: x, cy: y, r: 16, class: sel ? 'tp-sel' : 'tp-none' }));
        svg.appendChild(mk('text', { x, y: y + 5, class: 'tp-num' + (sel ? ' on' : '') }, two(i)));
      }
      if (M % 5) { // genaue Minute zwischen den Zahlen
        const [x, y] = pos(92, (M / 60) * 2 * Math.PI);
        svg.appendChild(mk('circle', { cx: x, cy: y, r: 16, class: 'tp-sel' }));
        svg.appendChild(mk('text', { x, y: y + 5, class: 'tp-num on' }, two(M)));
      }
    }
  }
  function refresh() {
    hh.value = two(H); mm.value = two(M);
    hh.classList.toggle('on', mode === 'h'); mm.classList.toggle('on', mode === 'm');
    if (day) dateLbl.textContent = dateText(day);
    drawDial();
  }

  function fromPointer(e) {
    const r = svg.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * 240 - 120, y = (e.clientY - r.top) / r.height * 240 - 120;
    let ang = Math.atan2(x, -y); if (ang < 0) ang += 2 * Math.PI;
    if (mode === 'h') {
      let n = Math.round(ang / (2 * Math.PI) * 12) % 12;
      const outer = Math.hypot(x, y) > 76;
      H = outer ? (n === 0 ? 12 : n) : (n === 0 ? 0 : n + 12);
    } else {
      M = Math.round(ang / (2 * Math.PI) * 60) % 60;
    }
    refresh();
  }
  let dragging = false;
  svg.addEventListener('pointerdown', (e) => { dragging = true; svg.setPointerCapture(e.pointerId); fromPointer(e); e.preventDefault(); });
  svg.addEventListener('pointermove', (e) => { if (dragging) fromPointer(e); });
  const up = () => { if (!dragging) return; dragging = false; if (mode === 'h') { mode = 'm'; refresh(); } };
  svg.addEventListener('pointerup', up);
  svg.addEventListener('pointercancel', () => { dragging = false; });
  svg.style.touchAction = 'none';

  hh.addEventListener('focus', () => { mode = 'h'; hh.select(); refresh(); });
  mm.addEventListener('focus', () => { mode = 'm'; mm.select(); refresh(); });
  function typed(inp, max, isH) {
    inp.addEventListener('input', () => {
      const t = inp.value.replace(/\D/g, '').slice(0, 2); inp.value = t;
      if (t === '') return;
      let n = Math.min(max, Number(t));
      if (isH) { H = n; if (t.length === 2) { mode = 'm'; mm.focus(); } } else M = n;
      drawDial();
    });
    inp.addEventListener('blur', () => { inp.value = two(isH ? H : M); });
  }
  typed(hh, 23, true); typed(mm, 59, false);

  document.getElementById('tpPrev').addEventListener('click', () => shiftDay(-1));
  document.getElementById('tpNext').addEventListener('click', () => shiftDay(1));
  function shiftDay(n) { const d = new Date(day + 'T12:00:00'); d.setDate(d.getDate() + n); day = fmt(d); dateLbl.textContent = dateText(day); }

  document.getElementById('tpCancel').addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  document.getElementById('tpOk').addEventListener('click', () => {
    if (!target) return;
    if (document.activeElement === hh || document.activeElement === mm) document.activeElement.blur();
    const v = two(H) + ':' + two(M);
    target.value = target.dataset.tp === 'datetime' ? day + 'T' + v : v;
    target.dispatchEvent(new Event('input', { bubbles: true }));
    target.dispatchEvent(new Event('change', { bubbles: true }));
    dlg.close();
  });

  function open(el) {
    init(el);
    const v = el.value || '';
    const dt = el.dataset.tp === 'datetime';
    const t = dt ? v.slice(11, 16) : v.slice(0, 5);
    target = el;
    H = /^\d\d:\d\d$/.test(t) ? Number(t.slice(0, 2)) : 7;
    M = /^\d\d:\d\d$/.test(t) ? Number(t.slice(3, 5)) : 0;
    day = dt ? (v.slice(0, 10) || todayStr()) : null;
    dateRow.hidden = !dt;
    document.getElementById('tpTitle').textContent = el.dataset.title || (dt ? 'Datum und Uhrzeit' : 'Uhrzeit');
    mode = 'h';
    dlg.showModal();
    refresh();
    document.getElementById('tpTitle').focus({ preventScroll: true });
  }
  document.addEventListener('click', (e) => { const el = e.target.closest && e.target.closest('input.tp'); if (el) open(el); });
  document.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('input.tp')) { e.preventDefault(); open(e.target); } });
})();
