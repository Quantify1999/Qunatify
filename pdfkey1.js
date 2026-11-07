// pdfkey1.js — image engine (pdfkey2.js se PEHLE load karna)
(function () {
const S = 4;                                   // render scale (px per pt)
const GAPW = 11;                               // word gap in output (px)
const PAD = 24;

function classify(d, W, x0, y0, x1, y1, erase) {
  const rw = x1 - x0, rh = y1 - y0, cls = new Uint8Array(rw * rh);
  for (let y = 0; y < rh; y++) {
    let i = ((y0 + y) * W + x0) * 4, o = y * rw;
    for (let x = 0; x < rw; x++, i += 4, o++) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (r * 299 + g * 587 + b * 114) / 1000;
      let c = 0;
      if (mx - mn > 130 && l < 215) c = 3;
      else if (l < 110) c = (g - r > 35) ? 2 : 1;
      else if (l < 226) c = 4;
      cls[o] = c;
    }
  }
  (erase || []).forEach(e => {
    const ax = Math.max(0, e.x0 - x0), bx = Math.min(rw, e.x1 - x0), ay = Math.max(0, e.y0 - y0), by = Math.min(rh, e.y1 - y0);
    for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) cls[y * rw + x] = 0;
  });
  return { rw, rh, cls, x0, y0 };
}

function dil(cls, rw, rh, mask, r) {
  const a = new Uint8Array(rw * rh), b = new Uint8Array(rw * rh);
  for (let i = 0; i < a.length; i++) a[i] = (mask >> cls[i]) & 1;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    let v = 0; const lo = Math.max(0, x - r), hi = Math.min(rw - 1, x + r);
    for (let k = lo; k <= hi; k++) if (a[y * rw + k]) { v = 1; break; }
    b[y * rw + x] = v;
  }
  const c = new Uint8Array(rw * rh);
  for (let y = 0; y < rh; y++) { const lo = Math.max(0, y - r), hi = Math.min(rh - 1, y + r);
    for (let x = 0; x < rw; x++) { let v = 0; for (let k = lo; k <= hi; k++) if (b[k * rw + x]) { v = 1; break; } c[y * rw + x] = v; } }
  return c;
}

// figure (table) = rows jinme lambi solid halki-grey line ho
function findFigure(d, W, blk, ya, yb) {
  const { rw, x0, y0 } = blk; let top = -1, bot = -1, xa = 1e9, xb = -1;
  for (let y = ya; y < yb; y++) {
    let run = 0, best = 0, bs = 0;
    for (let x = 0; x < rw; x++) {
      const i = ((y0 + y) * W + x0 + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
      const l = (r * 299 + g * 587 + b * 114) / 1000, sp = Math.max(r, g, b) - Math.min(r, g, b);
      if (l > 185 && l < 226 && sp < 45) { run++; if (run > best) { best = run; bs = x - run + 1; } } else run = 0;
    }
    if (best >= 32 * S) { if (top < 0) top = y; bot = y; xa = Math.min(xa, bs); xb = Math.max(xb, bs + best); }
  }
  return top < 0 ? null : { x0: Math.max(0, xa - 3), x1: Math.min(rw, xb + 3), y0: Math.max(0, top - 3), y1: Math.min(blk.rh, bot + 4) };
}

// language-wise kept pixels -> {rgba, ink, rw, rh}
function buildKeep(d, W, blk, lang, fig, masks) {
  const { rw, rh, cls, x0, y0 } = blk; const out = new Uint8ClampedArray(rw * rh * 4).fill(255), ink = new Uint8Array(rw * rh);
  const mine = lang === 'en' ? 1 : 2, other = lang === 'en' ? 2 : 1;
  const nearMine = lang === 'en' ? masks.E : masks.H, nearOther = lang === 'en' ? masks.H : masks.E;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const o = y * rw + x, c = cls[o]; let keep = false;
    if (c === mine || c === 3) keep = true;
    else if (c === 4) keep = masks.C[o] || (nearMine[o] && !nearOther[o]);
    if (!keep && c && fig && x >= fig.x0 && x < fig.x1 && y >= fig.y0 && y < fig.y1) keep = true;
    void other;
    if (keep) { const i = ((y0 + y) * W + x0 + x) * 4; out[o * 4] = d[i]; out[o * 4 + 1] = d[i + 1]; out[o * 4 + 2] = d[i + 2]; ink[o] = 1; }
  }
  return { rgba: out, ink, rw, rh };
}

function makeMasks(blk) {
  const { rw, rh, cls } = blk;
  return { E: dil(cls, rw, rh, 1 << 1, 2), H: dil(cls, rw, rh, 1 << 2, 2), C: dil(cls, rw, rh, 1 << 3, 2) };
}

// ---- lines / words ----
function rowBands(ink, rw, r, minGap) {
  const bs = []; let cur = null, blank = 0;
  for (let y = r.y0; y < r.y1; y++) {
    let has = false;
    for (let x = r.x0; x < r.x1; x++) if (ink[y * rw + x]) { has = true; break; }
    if (has) { if (!cur) { cur = { top: y, bot: y }; bs.push(cur); } else if (blank >= minGap) { cur = { top: y, bot: y }; bs.push(cur); } cur.bot = y; blank = 0; }
    else blank++;
  }
  return bs;
}
function lineInfo(ink, rw, r, b, gapMin) {
  const cols = new Uint16Array(r.x1 - r.x0), rows = new Uint16Array(b.bot - b.top + 1);
  for (let y = b.top; y <= b.bot; y++) for (let x = r.x0; x < r.x1; x++) if (ink[y * rw + x]) { cols[x - r.x0]++; rows[y - b.top]++; }
  const toks = []; let s = -1, blank = 0;
  for (let x = 0; x < cols.length; x++) {
    if (cols[x]) { if (s < 0) s = x; else if (blank >= gapMin) { toks.push({ x0: r.x0 + s, x1: r.x0 + lastX + 1 }); s = x; } var lastX = x; blank = 0; }
    else if (s >= 0) blank++;
  }
  if (s >= 0) toks.push({ x0: r.x0 + s, x1: r.x0 + lastX + 1 });
  let mx = 0; rows.forEach(v => { if (v > mx) mx = v; });
  let base = rows.length - 1; for (; base > 0; base--) if (rows[base] >= mx * 0.35) break;
  return { top: b.top, bot: b.bot, base: b.top + base, toks, right: toks.length ? toks[toks.length - 1].x1 : 0 };
}
function partLines(ink, rw, r, contX) {
  const gapMin = Math.round(1.9 * S);
  return rowBands(ink, rw, r, 4).map(b => { const L = lineInfo(ink, rw, r, b, gapMin); L.cont = L.right >= contX; return L; }).filter(L => L.toks.length);
}
function flow(lines, Wt) {
  const out = []; let cur = null;
  lines.forEach((ln, li) => {
    if (!cur || li === 0 || !lines[li - 1].cont) { cur = { w: 0, toks: [] }; out.push(cur); }
    ln.toks.forEach(t => {
      const tw = t.x1 - t.x0, sp = cur.toks.length ? GAPW : 0;
      if (cur.toks.length && cur.w + sp + tw > Wt) { cur = { w: 0, toks: [] }; out.push(cur); }
      const sp2 = cur.toks.length ? GAPW : 0;
      cur.toks.push({ x0: t.x0, x1: t.x1, top: ln.top, bot: ln.bot, base: ln.base, dx: cur.w + sp2 }); cur.w += sp2 + tw;
    });
  });
  return out;
}

// plan = [{kind:'lines', src, out:[flowLines]} | {kind:'fig', src, r}]
function compose(plan, Wt) {
  let width = Wt, h = PAD;
  const blocks = [];
  plan.forEach(p => {
    if (p.kind === 'fig') { width = Math.max(width, p.r.x1 - p.r.x0); blocks.push(p); h += p.r.y1 - p.r.y0 + 14; return; }
    p.out.forEach(L => {
      let asc = 0, desc = 0; L.toks.forEach(t => { asc = Math.max(asc, t.base - t.top); desc = Math.max(desc, t.bot - t.base); width = Math.max(width, L.w); });
      L.asc = asc; L.desc = desc; h += asc + desc + 1 + 10;
    });
    h += p.gapAfter == null ? 18 : p.gapAfter; blocks.push(p);
  });
  const W = Math.round(width + PAD * 2), H = Math.round(h + PAD);
  const out = new Uint8ClampedArray(W * H * 4).fill(255);
  const cp = (src, sx, sy, sw, sh, dx, dy) => {
    for (let y = 0; y < sh; y++) { const so = ((sy + y) * src.rw + sx) * 4, dO = ((dy + y) * W + dx) * 4;
      if (dy + y < 0 || dy + y >= H) continue;
      for (let x = 0; x < sw; x++) { const a = so + x * 4, b2 = dO + x * 4;
        if (dx + x < 0 || dx + x >= W) continue;
        if (src.ink[(sy + y) * src.rw + sx + x]) { out[b2] = src.rgba[a]; out[b2 + 1] = src.rgba[a + 1]; out[b2 + 2] = src.rgba[a + 2]; } } }
  };
  let y = PAD;
  blocks.forEach(p => {
    if (p.kind === 'fig') { const r = p.r; cp(p.src, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, PAD, y); y += r.y1 - r.y0 + 14; return; }
    p.out.forEach(L => {
      L.toks.forEach(t => cp(p.src, t.x0, t.top, t.x1 - t.x0, t.bot - t.top + 1, PAD + Math.round(t.dx), y + L.asc - (t.base - t.top)));
      y += L.asc + L.desc + 1 + 10;
    });
    y += p.gapAfter == null ? 18 : p.gapAfter;
  });
  return { rgba: out, w: W, h: H };
}

// ---- one question block -> {en, hi, flags} ----
function buildQuestion(d, W, rect, erase, Wt) {
  const flags = [];
  const blk = classify(d, W, rect.x0, rect.y0, rect.x1, rect.y1, erase);
  const { rw, rh, cls } = blk;
  const optLimit = Math.min(rw, 500 * S - rect.x0);
  // option labels = colored pixels
  const rowCol = new Uint8Array(rh);
  for (let y = 0; y < rh; y++) for (let x = 0; x < optLimit; x++) if (cls[y * rw + x] === 3) { rowCol[y] = 1; break; }
  const lb = []; let cur = null, blank = 0;
  for (let y = 16 * S; y < rh; y++) { if (rowCol[y]) { if (!cur || blank > 8) { cur = { top: y, bot: y }; lb.push(cur); } cur.bot = y; blank = 0; } else blank++; }
  const labels = [];
  lb.forEach((b, bi) => {
    let s = -1, last = -1, gap = 0;
    for (let x = 0; x <= optLimit; x++) {
      let has = false; if (x < optLimit) for (let y = b.top; y <= b.bot; y++) if (cls[y * rw + x] === 3) { has = true; break; }
      if (has) { if (s < 0) s = x; last = x; gap = 0; } else if (s >= 0) { gap++; if (gap > 20 || x === optLimit) { labels.push({ band: bi, x0: s, x1: last + 1, top: b.top, bot: b.bot }); s = -1; gap = 0; } }
    }
  });
  const masks = makeMasks(blk);
  const figProbe = { top: 0 };
  void figProbe;
  const stemEnd = labels.length ? Math.max(0, labels[0].top - 3 * S) : rh;
  const fig = findFigure(d, W, blk, 0, stemEnd);
  const keepEn = buildKeep(d, W, blk, 'en', fig, masks), keepHi = buildKeep(d, W, blk, 'hi', fig, masks);

  // option rects
  let opts = [];
  if (labels.length === 4) {
    opts = labels.map((L, i) => {
      const nextInRow = labels.find((M, j) => j > i && M.band === L.band);
      const nextBand = lb[L.band + 1];
      return { x0: Math.max(0, L.x0 - 6), x1: nextInRow ? nextInRow.x0 - 6 : optLimit, y0: Math.max(0, L.top - 3 * S), y1: nextBand ? nextBand.top - 3 * S : rh };
    });
  } else {
    flags.push('option labels ' + labels.length + ' mile (4 chahiye)');
    if (labels.length) opts = [{ x0: 0, x1: optLimit, y0: stemEnd, y1: rh }];
  }
  const contX = 540 * S - rect.x0;
  const stemRect = { x0: 0, x1: rw, y0: 0, y1: stemEnd };

  const build = (lang) => {
    const keep = lang === 'en' ? keepEn : keepHi, plan = [];
    const addLines = (src, r, gap) => { const ls = partLines(src.ink, rw, r, contX); if (ls.length) plan.push({ kind: 'lines', src, out: flow(ls, Wt), gapAfter: gap == null ? 18 : gap }); return ls.length; };
    let n = 0;
    if (fig) {
      n += addLines(keep, { x0: 0, x1: rw, y0: 0, y1: fig.y0 }, 10);
      plan.push({ kind: 'fig', src: keepEn, r: fig });
      n += addLines(keep, { x0: 0, x1: rw, y0: fig.y1, y1: stemEnd });
    } else n += addLines(keep, stemRect);
    opts.forEach(r => {
      let src = keep;
      if (lang === 'hi') { let h = 0; for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) if (cls[y * rw + x] === 2) h++; if (h < 8) src = keepEn; }
      addLines(src, r, 14);
    });
    return { plan, n };
  };
  const en = build('en'), hi = build('hi');
  let hindiInk = 0; for (let i = 0; i < cls.length; i++) if (cls[i] === 2) hindiInk++;
  const hasHi = hindiInk > 150;
  if (!en.n) flags.push('English text nahi mila');
  return { en: compose(en.plan, Wt), hi: hasHi ? compose(hi.plan, Wt) : null, flags };
}



window.PKCore = { S: S, buildQuestion: buildQuestion };
})();
