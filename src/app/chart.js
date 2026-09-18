/* ---------- chart ---------- */
function cssVar(n, fallback) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  return v || fallback;
}
function drawChart() {
  const cv = $('#chart'); if (!cv) return;
  const data = C.moneyCalc(S.money).last12; if (!data.length) return;
  const dpr = window.devicePixelRatio || 1, H = 210, padL = 44, padB = 26, padT = 10;
  const avail = (cv.parentElement && cv.parentElement.clientWidth) || 320;
  const W = Math.max(avail, padL + 6 + 46 * data.length);        // give every month room; the wrapper scrolls
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  cv.width = W * dpr; cv.height = H * dpr;
  const x = cv.getContext && cv.getContext('2d'); if (!x) return;
  x.scale(dpr, dpr);
  const ink = cssVar('--muted', '#667085'), line = cssVar('--line', '#E4E9F0');
  const c1 = cssVar('--brand', '#1F3A5F'), c2 = cssVar('--teal', '#2A9D8F');
  const max = Math.max(...data.map(d => C.num(d.earnings)), 1), gw = (W - padL - 6) / data.length;
  x.font = '10px ' + getComputedStyle(document.body).fontFamily; x.fillStyle = ink; x.strokeStyle = line;
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const v = max / steps * i, y = padT + (H - padT - padB) * (1 - v / max);
    x.beginPath(); x.moveTo(padL, y); x.lineTo(W, y); x.stroke();
    x.textAlign = 'right'; x.fillText('£' + Math.round(v / 1000) + 'k', padL - 6, y + 3);
  }
  data.forEach((d, i) => {
    const x0 = padL + i * gw + gw * 0.15, bw = gw * 0.32;
    const he = (H - padT - padB) * C.num(d.earnings) / max, hd = (H - padT - padB) * Math.max(C.num(d.disposable), 0) / max;
    x.fillStyle = c1; x.fillRect(x0, H - padB - he, bw, he);
    x.fillStyle = c2; x.fillRect(x0 + bw + 2, H - padB - hd, bw, hd);
    x.fillStyle = ink; x.textAlign = 'center'; x.fillText(C.fmtMs(d.month), x0 + bw, H - 8);
  });
}

