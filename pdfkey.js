// pdfkey.js — bilingual answer-key PDF (English+Hindi, "Correct Ans: B") -> full test + section-wise tests
// admin.html me admin.js ke BAAD:  <script src="pdfkey.js"></script>   (purana pdfimport.js alag chalta rahega)
// Globals jo admin.js se aate hain: $, esc, sb, secs, allTests, loadTests
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



  // ================= browser part =================
  const BUCKET = 'question-images', LET = ['A', 'B', 'C', 'D'];
  const CDN = (window.PDFIMPORT_CDN || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/');
  let pdfjs = null;
  async function getPdfjs() {
    if (pdfjs) return pdfjs;
    pdfjs = await import(CDN + 'pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = CDN + 'pdf.worker.min.mjs';
    return pdfjs;
  }
  async function pageItems(page, vp) {
    const tc = await page.getTextContent();
    return tc.items.filter(i => i.str && i.str.trim()).map(i => {
      const pt = vp.convertToViewportPoint(i.transform[4], i.transform[5]), h = Math.abs(i.transform[3]) * S;
      return { s: i.str.trim(), x: pt[0], y: pt[1], top: pt[1] - h, h, w: i.width * S };
    });
  }
  const byXY = (a, b) => a.y - b.y || a.x - b.x;
  function headerOf(items) {
    const t = items.filter(i => i.y < 75 * S).sort(byXY).map(i => i.s).join(' ');
    const m = t.match(/(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\D{0,8}Shift\s*(\d+)/);
    return m ? { date: m[1].replace(/\s+/g, ' '), shift: +m[2] } : null;
  }
  const secShort = n => /reason/i.test(n) ? 'Reasoning' : /awareness/i.test(n) ? 'General Awareness' : /quant/i.test(n) ? 'Quant' : /english/i.test(n) ? 'English' : (n || 'Section');

  // ---- phase 1: shifts ki list (sirf text, fast) ----
  async function scanPdf(file, log) {
    const lib = await getPdfjs();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const shifts = []; let cur = null;
    for (let p = 1; p <= doc.numPages; p++) {
      if (p % 25 === 0) log(`Scan: page ${p}/${doc.numPages}`);
      const page = await doc.getPage(p);
      const items = await pageItems(page, page.getViewport({ scale: S }));
      page.cleanup();
      if (!/Correct\s*Ans/.test(items.map(i => i.s).join(' '))) continue;
      const h = headerOf(items);
      if (h) { cur = { date: h.date, shift: h.shift, pages: [p] }; shifts.push(cur); } else if (cur) cur.pages.push(p);
    }
    return { doc, shifts };
  }

  // ---- phase 2: ek shift ke saare questions ----
  const toBlob = (o) => new Promise(res => {
    const cv = document.createElement('canvas'); cv.width = o.w; cv.height = o.h;
    cv.getContext('2d').putImageData(new ImageData(o.rgba, o.w, o.h), 0, 0);
    cv.toBlob(b => { cv.width = 0; res(b); }, 'image/jpeg', 0.92);
  });

  async function processShift(doc, shift, Wt, log) {
    const qs = {}; let curSec = '';
    for (const p of shift.pages) {
      log(`Page ${p}...`);
      const page = await doc.getPage(p), vp = page.getViewport({ scale: S });
      const W = Math.round(vp.width), H = Math.round(vp.height);
      const items = await pageItems(page, vp);
      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      await page.render({ canvasContext: ctx, canvas: cv, viewport: vp }).promise;
      const d = ctx.getImageData(0, 0, W, H).data;

      // question pills (number + rang ka pill)
      const pills = [];
      items.forEach(it => {
        if (!/^\d{1,3}\.?$/.test(it.s) || it.x < 15 * S || it.x > 34 * S) return;
        const ax = Math.round(it.x - 4 * S), bx = Math.round(it.x + it.w + 4 * S), ay = Math.round(it.top - 2 * S), by = Math.round(it.y + 2 * S);
        let c = 0, t = 0;
        for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) {
          const i = (y * W + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2]; t++;
          if (Math.max(r, g, b) - Math.min(r, g, b) > 130) c++;
        }
        if (t && c / t > 0.3) pills.push({ n: +it.s.replace('.', ''), it, top: Math.max(0, Math.round(it.top - 6 * S)) });
      });
      pills.sort((a, b) => a.it.y - b.it.y);
      // section lines  ("General Awareness   Q 26-50")
      const secs = [];
      items.forEach(it => {
        if (it.x > 100 * S && (/^Q\s*\d/.test(it.s) || it.s === 'Q')) {
          const name = items.filter(o => o !== it && Math.abs(o.y - it.y) < 5 * S && o.x < it.x).sort(byXY).map(o => o.s).join(' ').trim();
          if (name) secs.push({ y: it.y, top: Math.round(it.top - 8 * S), name });
        }
      });
      secs.sort((a, b) => a.y - b.y);
      const foot = items.filter(i => /Join on Telegram/.test(i.s)).map(i => i.top);
      const limit = Math.min(Math.round((foot.length ? Math.min(...foot) : 830 * S) - 6 * S), 806 * S);

      for (let i = 0; i < pills.length; i++) {
        const pl = pills[i];
        let end = i + 1 < pills.length ? pills[i + 1].top : limit;
        secs.forEach(s => { if (s.y > pl.it.y && s.top < end) end = s.top - 2 * S; });
        end = Math.min(end, limit);
        const sec = (secs.filter(s => s.y < pl.it.y).pop() || {}).name;
        if (sec) curSec = sec;
        if (qs[pl.n] || end - pl.top < 20 * S) continue;
        const flags = [];
        const rect = { x0: 14 * S, x1: Math.min(W, 578 * S), y0: pl.top, y1: Math.round(end) };
        const erase = [{ x0: 14 * S, x1: Math.round(pl.it.x + pl.it.w + 9 * S), y0: Math.round(pl.it.top - 5 * S), y1: Math.round(pl.it.y + 5 * S) }];
        // correct answer text + uska pill
        let correct = -1;
        const ci = items.find(o => /Correct/.test(o.s) && o.y > pl.top && o.y < end);
        if (ci) {
          erase.push({ x0: Math.round(ci.x - 16 * S), x1: W, y0: Math.round(ci.top - 8 * S), y1: Math.round(ci.y + 8 * S) });
          const t = items.filter(o => Math.abs(o.y - ci.y) < 4 * S && o.x >= ci.x - 2).sort((a, b) => a.x - b.x).map(o => o.s).join(' ');
          const m = t.match(/Correct\s*Ans\s*:?\s*([A-D])/i); if (m) correct = m[1].toUpperCase().charCodeAt(0) - 65;
        }
        if (correct < 0) flags.push('sahi answer nahi mila');
        let r;
        try { r = buildQuestion(d, W, rect, erase, Wt); } catch (e) { flags.push('image error: ' + (e.message || e)); r = null; }
        if (!r) { qs[pl.n] = { n: pl.n, sec: curSec, correct, en: null, hi: null, flags }; continue; }
        r.flags.forEach(f => flags.push(f));
        qs[pl.n] = { n: pl.n, sec: curSec, correct, en: await toBlob(r.en), hi: r.hi ? await toBlob(r.hi) : null, flags };
      }
      cv.width = 0; page.cleanup();
    }
    return Object.values(qs).sort((a, b) => a.n - b.n);
  }

  // ---- upload + tests ----
  async function putImg(path, blob) {
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  async function hasHiCol() { const { error } = await sb.from('questions').select('image_url_hi').limit(1); return !error; }

  async function uploadQs(qs, base, log) {
    const todo = qs.filter(q => q.en);
    for (let i = 0; i < todo.length; i += 4) {
      await Promise.all(todo.slice(i, i + 4).map(async q => {
        log(`image ${q.n}/${todo.length ? todo[todo.length - 1].n : ''}`);
        q.urlEn = await putImg(`${base}/${q.n}-en.jpg`, q.en);
        if (q.hi) q.urlHi = await putImg(`${base}/${q.n}-hi.jpg`, q.hi);
      }));
    }
  }
  async function insertTest(title, section, list, opt) {
    const hasHi = list.some(q => q.urlHi);
    const { data: test, error } = await sb.from('tests').insert({
      title, section_id: section, duration_min: opt.dur, pos_marks: opt.pos, neg_marks: opt.neg, is_free: false, published: opt.pub
    }).select('id').single();
    if (error) throw error;
    const rows = list.map((q, i) => {
      const row = {
        test_id: test.id, position: i + 1, q_text: 'Q.' + (i + 1), q_text_hi: hasHi ? 'प्रश्न ' + (i + 1) : null,
        options: LET.slice(), options_hi: null, correct_option: q.correct >= 0 ? q.correct : 0,
        has_diagram: true, image_url: q.urlEn || null,
        explanation: null, explanation_hi: null, explanation_image_url: null, topic: null, difficulty: null
      };
      if (opt.hiCol) row.image_url_hi = q.urlHi || q.urlEn || null;   // Hindi nahi hai to English hi dikhegi
      return row;
    });
    for (let i = 0; i < rows.length; i += 100) {
      const { error: e2 } = await sb.from('questions').insert(rows.slice(i, i + 100));
      if (e2) throw e2;
    }
  }

  function parseRange(str, max) {
    const set = new Set();
    String(str).split(',').forEach(part => {
      const m = part.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/); if (!m) return;
      const a = +m[1], b = m[2] ? +m[2] : a;
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= max) set.add(i);
    });
    return Array.from(set).sort((a, b) => a - b);
  }

  // ---------------- UI ----------------
  function build() {
    const anchor = $('t-add') && $('t-add').closest('.box');
    if (!anchor) return;
    const box = document.createElement('div'); box.className = 'box'; box.id = 'pk-box';
    box.innerHTML = `<h3>Answer-key PDF se tests (English + Hindi, bade font)<
