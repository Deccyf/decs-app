/* ===== app: state, views, events ===== */
const SEED = (() => { try { return JSON.parse(document.getElementById('seed').textContent); } catch (e) { return { money: {}, pay: {} }; } })();
const KEY = SEED.storageKey || 'decs-stuff-v1';
const THEME_KEY = KEY + ':theme';
const PAY_ONLY = !!SEED.payOnly;
const SUN = SEED.sundayLabel || 'Sunday premium';
const clone = o => JSON.parse(JSON.stringify(o));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = s => document.querySelector(s);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
let S, storageOK = true, tab = 'home', theme = 'auto';
const ui = { payday: null, openYears: {}, showAllMonths: false, editBills: false, editDebts: false, editFixed: false,
  editJobs: false, editPots: false, moneyTab: 'now', showFlowOpts: false, flowPeriods: 4, set: 'Base Set', search: '', open: {} };

const TABS = [
  { k: 'home', l: 'Home', d: 'M3 10.6 12 3.4l9 7.2M5.6 9.4V20a1 1 0 0 0 1 1h10.8a1 1 0 0 0 1-1V9.4' },
  { k: 'pay', l: 'Pay', d: 'M3 8a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2M3 8v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-1M3 8h14M21 10v6h-3.5a3 3 0 0 1 0-6H21Z' },
  { k: 'money', l: 'Money', d: 'M3 20h18M7 20v-5.5M12 20V8M17 20v-9' },
  { k: 'lists', l: 'Lists', d: 'M10 6.5h10M10 12h10M10 17.5h10M3.5 6.3l1.2 1.2 2.3-2.4M3.5 11.8l1.2 1.2 2.3-2.4M3.5 17.3l1.2 1.2 2.3-2.4' },
  { k: 'games', l: 'Games', d: 'M7.5 12h3.2M9.1 10.4v3.2M15.4 11.3h.01M17.9 13.2h.01M8.6 6.2h6.8a5.4 5.4 0 0 1 5.3 6.4l-.8 4.1a2.9 2.9 0 0 1-5 1.5l-.9-1a2 2 0 0 0-1.5-.7h-1a2 2 0 0 0-1.5.7l-.9 1a2.9 2.9 0 0 1-5-1.5l-.8-4.1a5.4 5.4 0 0 1 5.3-6.4Z' }
];
const ICON = {
  auto: 'M12 3v18M12 3a9 9 0 0 1 0 18 9 9 0 0 1 0-18Z',
  light: 'M12 4.2V2.5M12 21.5v-1.7M19.8 12h1.7M2.5 12h1.7M17.5 6.5l1.2-1.2M5.3 18.7l1.2-1.2M17.5 17.5l1.2 1.2M5.3 5.3l1.2 1.2M12 7.6a4.4 4.4 0 1 1 0 8.8 4.4 4.4 0 0 1 0-8.8Z',
  dark: 'M20.5 14.3A8.6 8.6 0 0 1 9.7 3.5a8.6 8.6 0 1 0 10.8 10.8Z'
};
const svg = (d, w) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w || 1.8}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;

/* ---------- PIN lock ----------
   The data sits in localStorage, so a screen that merely hides the UI would be
   theatre — anything with devtools reads straight through it. The stored blob
   is encrypted instead: PBKDF2-SHA256 stretches the PIN into an AES-GCM key,
   and without the PIN there is nothing readable on the device.

   What this is for: someone picking up an unlocked phone. It is not proof
   against a determined attacker with the device and time — a short numeric PIN
   is only so many guesses, and PBKDF2 runs far faster on a GPU than a phone.
   Six digits is the floor for that reason. */
const CRYPTO_OK = !!(window.crypto && window.crypto.subtle);
const PBKDF2_ITERS = 310000;
let cryptoKey = null, cryptoSalt = null;

const b64 = buf => {                       // chunked: spreading a big array blows the stack
  const a = new Uint8Array(buf); let out = '';
  for (let i = 0; i < a.length; i += 0x8000) out += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
  return btoa(out);
};
const unb64 = str => Uint8Array.from(atob(str), c => c.charCodeAt(0));

async function deriveKey(pin, salt, iters) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iters || PBKDF2_ITERS, hash: 'SHA-256' },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function sealText(text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(text));
  return JSON.stringify({ decsEnc: 1, iters: PBKDF2_ITERS, salt: b64(cryptoSalt), iv: b64(iv), ct: b64(ct) });
}
async function openBlob(blob, pin) {
  const salt = unb64(blob.salt);
  const key = await deriveKey(pin, salt, blob.iters);
  // a wrong PIN fails the GCM tag check and throws, which is the whole point
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ct));
  return { text: new TextDecoder().decode(pt), key, salt };
}
function encBlob(raw) {
  if (!raw || raw[0] !== '{') return null;
  try { const o = JSON.parse(raw); return o && o.decsEnc && o.ct && o.iv && o.salt ? o : null; } catch (e) { return null; }
}
const pinIsSet = () => !!cryptoKey;

/* ---------- storage ---------- */
function probeStorage() { try { localStorage.setItem('__p', '1'); localStorage.removeItem('__p'); return true; } catch (e) { return false; } }
function load() {
  storageOK = probeStorage();
  if (storageOK) { try { const raw = localStorage.getItem(KEY); if (raw && !encBlob(raw)) { const o = JSON.parse(raw); if (o && o.pay && o.money) return o; } } catch (e) { } }
  return clone(SEED);
}
/* Encryption is async, so writes are queued rather than fired off in parallel —
   the snapshot is taken synchronously so they still land in the right order. */
let saveChain = Promise.resolve();
function save() {
  if (!storageOK) return saveChain;
  const snapshot = JSON.stringify(S);
  saveChain = saveChain.then(async () => {
    try { localStorage.setItem(KEY, cryptoKey ? await sealText(snapshot) : snapshot); }
    catch (e) { storageOK = false; toast('Could not save on this device'); }
  });
  return saveChain;
}

/* Fill in anything a backup is missing. A file from an older version — or a
   half-finished one — must never leave the app with a blank screen. */
function normalize() {
  if (!S || typeof S !== 'object') S = clone(SEED);
  const arr = (o, k) => { if (!Array.isArray(o[k])) o[k] = []; };
  const obj = (o, k) => { if (!o[k] || typeof o[k] !== 'object' || Array.isArray(o[k])) o[k] = {}; };
  ['house', 'classic', 'mega', 'psm', 'games'].forEach(k => arr(S, k));
  obj(S, 'money'); obj(S, 'pay');
  const m = S.money;
  ['bills', 'months', 'debts', 'pots'].forEach(k => arr(m, k));
  if (m.buffer === undefined) m.buffer = 0;
  if (m.overdraft === undefined) m.overdraft = 0;
  if (m.amex === undefined) m.amex = null;
  if (typeof m.amexBefore !== 'boolean') m.amexBefore = false;
  if (typeof m.netLongTerm !== 'boolean') m.netLongTerm = false;
  if (m.amexUndo === undefined) m.amexUndo = null;
  if (m.balance === undefined) m.balance = null;
  if (m.balanceOn === undefined) m.balanceOn = null;
  // a balance carried over from before this feature has no date — treat it as true today
  if (m.balance !== null && m.balance !== undefined && m.balance !== '' && !m.balanceOn) m.balanceOn = C.today();
  if (m.dueShift !== 'exact' && m.dueShift !== 'prev' && m.dueShift !== 'next') m.dueShift = 'next';
  if (typeof m.bankHols !== 'boolean') m.bankHols = true;
  m.bills.forEach(b => { if (!b.id) b.id = uid(); if (b.dueDay === undefined) b.dueDay = null; });
  m.debts.forEach(d => { if (!d.id) d.id = uid(); });
  m.pots.forEach(p => { if (!p.id) p.id = uid(); });
  m.months = m.months.filter(x => x && typeof x.month === 'string' && /^\d{4}-\d{2}$/.test(x.month));
  /* A restored backup can carry months out of order, or the same month twice.
     Unsorted rows make "latest month" and the chart wrong; duplicates double
     count in the yearly totals. Merge and sort so neither can happen. */
  const blank = v => v === null || v === undefined || v === '';
  const byMonth = new Map();
  m.months.forEach(x => {
    const prev = byMonth.get(x.month);
    if (!prev) { byMonth.set(x.month, x); return; }
    if (blank(prev.earnings) && !blank(x.earnings)) prev.earnings = x.earnings;
    if (blank(prev.saved) && !blank(x.saved)) prev.saved = x.saved;
  });
  m.months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  const P = S.pay;
  ['fixed', 'rises', 'taxYears'].forEach(k => arr(P, k));
  ['hours', 'hpaHistory', 'tax'].forEach(k => obj(P, k));
  if (!P.nextPayDay || !/^\d{4}-\d{2}-\d{2}$/.test(P.nextPayDay)) P.nextPayDay = (SEED.pay && SEED.pay.nextPayDay) || C.today();
  if (!C.num(P.weeksYear)) P.weeksYear = 52.1667;
  if (!C.num(P.hoursWeek)) P.hoursWeek = 35;
  if (P.periodEndDays === undefined || P.periodEndDays === null) P.periodEndDays = 6;
  if (!P.taxYears.length) {
    const t = P.tax || {}, seedTax = (SEED.pay && SEED.pay.tax) || {};
    P.taxYears = [{ from: t.taxYearStart || seedTax.taxYearStart || '2026-04-06',
      personalAllowance: P.personalAllowance ?? 12570,
      basicRate: t.basicRate ?? seedTax.basicRate, basicBand: t.basicBand ?? seedTax.basicBand,
      higherRate: t.higherRate ?? seedTax.higherRate, higherBand: t.higherBand ?? seedTax.higherBand,
      addRate: t.addRate ?? seedTax.addRate, niPT: t.niPT ?? seedTax.niPT, niUEL: t.niUEL ?? seedTax.niUEL,
      niMain: t.niMain ?? seedTax.niMain, niUpper: t.niUpper ?? seedTax.niUpper }];
  }
  P.taxYears.sort((a, b) => String(a.from).localeCompare(String(b.from)));
  if (Array.isArray(S.goals)) S.goals = S.goals.join('\n');
  if (typeof S.goals !== 'string') S.goals = '';
  ['house', 'games'].forEach(k => S[k].forEach(x => { if (!x.id) x.id = uid(); }));
  S.house.forEach(j => { if (!['To do', 'In progress', 'Done'].includes(j.status)) j.status = 'To do'; });
}
function setPath(o, p, v) {
  const ks = p.split('.'); const last = ks.pop();
  const t = ks.reduce((a, k) => (a && typeof a === 'object' ? (a[k] = a[k] || {}) : null), o);
  if (t) t[last] = v;
}
function commit() { save(); render(); }
let toastT; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2000); }

/* ---------- theme ---------- */
function applyTheme() {
  const root = document.documentElement;
  if (theme === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', theme);
  const btn = $('#themeBtn');
  if (btn) { btn.innerHTML = svg(ICON[theme], 1.9); btn.setAttribute('aria-label', `Theme: ${theme}. Tap to change`); btn.title = `Theme: ${theme}`; }
  requestAnimationFrame(() => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    const mt = $('#themeColor'); if (mt && bg) mt.setAttribute('content', bg);
  });
}
function cycleTheme() {
  theme = theme === 'auto' ? 'light' : theme === 'light' ? 'dark' : 'auto';
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { }
  applyTheme(); drawChart();
  toast(`Theme: ${theme}`);
}

/* ---------- dialogs (replaces prompt/confirm, which mobile browsers can block) ---------- */
let dlgQueue = Promise.resolve();
function dialog(opts) { return (dlgQueue = dlgQueue.then(() => showDialog(opts), () => showDialog(opts))); }
function showDialog({ title, body = '', ok = 'OK', cancel = 'Cancel', danger = false, input = null, inputType = 'text' }) {
  return new Promise(resolve => {
    const d = $('#dlg'), f = $('#dlgForm');
    f.innerHTML = `<h3>${esc(title)}</h3>${body ? `<p>${body}</p>` : ''}
      ${input !== null ? `<div class="field"><input type="${esc(inputType)}" id="dlgIn" value="${esc(input)}" autocomplete="off"${inputType === 'password' ? ' inputmode="numeric" class="pinin"' : ''}></div>` : ''}
      <div class="btnrow"><button class="btn ghost" value="cancel" type="submit">${esc(cancel)}</button>
      <button class="btn${danger ? ' danger' : ''}" value="ok" type="submit">${esc(ok)}</button></div>`;
    const done = () => {
      d.removeEventListener('close', done);
      const v = d.returnValue === 'ok';
      resolve(input !== null ? (v ? (f.dataset.val || '') : null) : v);
    };
    f.onsubmit = () => { const el = $('#dlgIn'); if (el) f.dataset.val = el.value.trim(); };
    d.addEventListener('close', done);
    d.returnValue = 'cancel';
    d.showModal();
    const el = $('#dlgIn'); if (el) { el.focus(); el.select(); }
  });
}
const confirmDlg = (title, body, ok = 'Remove') => dialog({ title, body, ok, danger: true });

/* Shows the lock screen and resolves once the PIN decrypts the blob. */
function unlockScreen(blob) {
  return new Promise(resolve => {
    const wrap = $('#lock'), form = $('#lockForm'), input = $('#pinIn'), err = $('#lockErr'), go = $('#lockGo');
    document.body.classList.add('locked');
    wrap.hidden = false;
    $('#lockTitle').textContent = document.title;
    let attempts = 0, busy = false;
    setTimeout(() => input.focus(), 50);
    form.onsubmit = async e => {
      e.preventDefault();
      if (busy) return;
      const pin = input.value;
      if (!pin) { input.focus(); return; }
      busy = true; go.disabled = true; err.textContent = ''; go.textContent = 'Unlocking…';
      try {
        const opened = await openBlob(blob, pin);
        const data = JSON.parse(opened.text);
        if (!data || !data.pay || !data.money) throw new Error('not the app\u2019s data');
        cryptoKey = opened.key; cryptoSalt = opened.salt;
        S = data;
        wrap.hidden = true; document.body.classList.remove('locked');
        form.onsubmit = null;
        resolve();
      } catch (e2) {
        attempts++;
        err.textContent = attempts > 2 ? `That PIN didn\u2019t work (${attempts} tries)` : 'That PIN didn\u2019t work';
        input.value = ''; input.focus();
        // slow repeated guesses down a little; PBKDF2 already makes each one cost
        await new Promise(r => setTimeout(r, Math.min(attempts * 400, 3000)));
      } finally { busy = false; go.disabled = false; go.textContent = 'Unlock'; }
    };
  });
}

/* ---------------- turning the PIN on, changing it, turning it off ---------------- */
async function askPin(title, body, ok) {
  const v = await dialog({ title, body, ok: ok || 'Continue', input: '', inputType: 'password' });
  return v === null ? null : String(v).trim();
}
async function setPin() {
  if (!CRYPTO_OK) { toast('This browser cannot encrypt'); return; }
  const ready = await dialog({
    title: 'Before you set a PIN',
    body: 'The data on this device gets encrypted with it. <b>If you forget the PIN it cannot be recovered</b> — not by us, not by anyone. Download a backup first and keep it somewhere safe.',
    ok: 'Download a backup', cancel: 'Cancel'
  });
  if (!ready) return;
  exportBackup();
  const one = await askPin('Choose a PIN', 'Six digits or more. Longer is harder to guess — a word or phrase works too.', 'Next');
  if (one === null) return;
  if (one.length < 6) { toast('Use at least 6 characters'); return; }
  const two = await askPin('Type it again', 'Just to be sure you have it right.', 'Turn on PIN lock');
  if (two === null) return;
  if (one !== two) { toast("Those didn't match — nothing changed"); return; }
  cryptoSalt = crypto.getRandomValues(new Uint8Array(16));
  cryptoKey = await deriveKey(one, cryptoSalt);
  await save();
  render();
  toast('PIN lock on');
}
async function changePin() {
  const one = await askPin('New PIN', 'Six digits or more.', 'Next');
  if (one === null) return;
  if (one.length < 6) { toast('Use at least 6 characters'); return; }
  const two = await askPin('Type it again', '', 'Change PIN');
  if (two === null) return;
  if (one !== two) { toast("Those didn't match — nothing changed"); return; }
  cryptoSalt = crypto.getRandomValues(new Uint8Array(16));
  cryptoKey = await deriveKey(one, cryptoSalt);
  await save();
  toast('PIN changed');
}
async function clearPin() {
  const yes = await dialog({ title: 'Turn off the PIN lock?',
    body: 'Your figures go back to being stored unencrypted on this device, readable by anyone who can unlock the phone.',
    ok: 'Turn it off', danger: true });
  if (!yes) return;
  cryptoKey = null; cryptoSalt = null;
  await save();
  render();
  toast('PIN lock off');
}

/* ---------- small html helpers ---------- */
const tile = (cls, cap, val, sub, sm) => `<div class="tile ${cls}"><div class="cap">${esc(cap)}</div><div><div class="val${sm ? ' sm' : ''}">${val}</div><div class="tsub">${sub || ''}</div></div></div>`;
const field = (label, inner) => `<div class="field"><label>${esc(label)}</label>${inner}</div>`;
const inp = (path, val, type = 'number', extra = '') => {
  const v = val === null || val === undefined ? '' : val;
  const attrs = type === 'number' ? 'type="number" inputmode="decimal" step="any"' : `type="${type}"`;
  return `<input ${attrs} data-set="${esc(path)}" value="${esc(v)}" ${extra}>`;
};
/* A figure that can legitimately be negative — an overdraft, a month you dipped
   into savings. inputmode="decimal" is deliberately left off: it means "fractional
   numeric", and phone keypads for it carry no minus key. The ± button covers any
   keyboard that still doesn't offer one. */
const signedInp = (path, val, extra = '') => {
  const neg = C.num(val) < 0, v = val === null || val === undefined ? '' : val;
  return `<div class="signed"><input type="number" step="any" data-set="${esc(path)}" value="${esc(v)}" ${extra}>
    <button type="button" class="sgn${neg ? ' on' : ''}" data-act="sign" aria-label="Make this ${neg ? 'positive' : 'negative'}">${neg ? '−' : '+'}</button></div>`;
};
const pctInp = (path, val) => `<input type="number" inputmode="decimal" step="any" data-set="${esc(path)}" data-kind="pct" value="${val == null ? '' : +(val * 100).toFixed(4)}">`;
const sel = (path, val, opts) => `<select data-set="${esc(path)}">${opts.map(o => `<option${o === val ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
const bar = (p, cls = '') => `<div class="bar ${cls}"><i style="width:${Math.max(0, Math.min(100, Math.round((p || 0) * 100)))}%"></i></div>`;
const detailsBlock = (key, title, inner) => `<details data-key="${key}"${ui.open[key] ? ' open' : ''}><summary>${esc(title)}</summary>${inner}</details>`;
const segment = (act, val, opts) => `<div class="seg" role="group">${opts.map(o =>
  `<button data-act="${act}" data-v="${esc(o.v)}" aria-pressed="${o.v === val}">${esc(o.l)}</button>`).join('')}</div>`;
const toggle = (path, on, label, note) => `<label class="switch"><span class="sl"><b>${esc(label)}</b>${note ? `<small>${esc(note)}</small>` : ''}</span>
  <input type="checkbox" data-set="${esc(path)}"${on ? ' checked' : ''}><span class="track"></span></label>`;
const flowOpt = () => ({ shift: S.money.dueShift, bankHols: !!S.money.bankHols });

