// pdfgen.js — KISI BHI PDF se questions: (1) Text-first (free, pdf.js)  (2) Gemini (free tier)  + review screen + multi-set split
// admin.html me admin.js ke BAAD lagao:  <script src="pdfgen.js?v=1"></script>   (purana pdfimport.js waise hi rahega)
// admin.js ke globals use hote hain: $, esc, sb, secs, allTests, loadTests
(function () {
  if (window.__pgen) return; window.__pgen = 1;
  const BUCKET = 'question-images', LET = ['A', 'B', 'C', 'D'];
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const PDFJS = (window.PDFIMPORT_CDN || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/');

  // ================= PURE HELPERS (testable) =================
  function linesFrom(items, W) {
    if (!items.length) return [];
    const mid = W / 2, cross = items.filter(i => i.x < mid - 2 && i.x + i.w > mid + 2).length;
    const left = items.filter(i => i.x + i.w / 2 < mid).length, right = items.length - left;
    const two = cross <= items.length * 0.03 && left > 15 && right > 15;
    const cols = two ? [items.filter(i => i.x + i.w / 2 < mid), items.filter(i => i.x + i.w / 2 >= mid)] : [items];
    const out = [];
    cols.forEach(col => {
      col.sort((a, b) => a.y - b.y || a.x - b.x);
      let line = [], ly = null;
      const flush = () => {
        if (!line.length) return;
        line.sort((a, b) => a.x - b.x);
        let s = '', px = null;
        line.forEach(it => { if (px !== null) s += (it.x - px > 1.2 ? ' ' : ''); s += it.s; px = it.x + it.w; });
        out.push(s.replace(/\s+/g, ' ').trim()); line = [];
      };
      col.forEach(it => { if (ly !== null && Math.abs(it.y - ly) > Math.max(3, it.h * 0.55)) flush(); line.push(it); ly = it.y; });
      flush();
    });
    return out;
  }
  function dropRepeated(pages) {                         // sirf har page ki pehli/aakhri 2 lines, jo bahut pages pe repeat hon (header/footer)
    const key = l => l.replace(/\d+/g, '#'), cnt = {}, edge = (p, i) => i < 2 || i >= p.length - 2;
    const skip = l => /^\s*(?:Q(?:uestion)?\.?\s*)?\d{1,3}\s*[\.\):\-]\s/i.test(l) || /^\(?[A-Da-d][\)\.]/.test(l);
    pages.forEach(p => new Set(p.filter((l, i) => edge(p, i) && !skip(l)).map(key)).forEach(k => cnt[k] = (cnt[k] || 0) + 1));
    const lim = Math.max(3, pages.length * 0.4);
    return pages.map(p => p.filter((l, i) => !(edge(p, i) && !skip(l) && l.length < 90 && cnt[key(l)] >= lim)));
  }
  function chainSplit(l, e) {                           // line me expected option (e) se shuru hoke (a)(b)(c)(d) chain todo
    const re = /(?:^|\s)\(?([a-dA-D])\)/g, ms = []; let m;
    while ((m = re.exec(l))) { const ws = /^\s/.test(m[0]) ? 1 : 0; ms.push({ s: m.index + ws, len: m[0].length - ws, k: m[1].toUpperCase().charCodeAt(0) - 65 }); }
    const i0 = ms.findIndex(x => x.k === e); if (i0 < 0) return null;
    const ch = [ms[i0]]; for (let j = i0 + 1; j < ms.length; j++) if (ms[j].k === ch[ch.length - 1].k + 1) ch.push(ms[j]);
    return { pre: l.slice(0, ch[0].s).trim(), parts: ch.map((x, i) => [x.k, l.slice(x.s + x.len, i + 1 < ch.length ? ch[i + 1].s : l.length).trim()]) };
  }
  const splitInline = l => { const r = chainSplit(l, 0); return r && !r.pre && r.parts.length > 1 ? r.parts : null; };
  const KH = /^\s*(answer\s*keys?|ans\.?\s*key|answer\s*sheet|answers?|key|उत्तर(?:\s*कुंजी)?|उत्तरमाला)(?=\s|[:\-–]|$)\s*[:\-–]?\s*(.*)$/i;
  const KPAIR = /\d{1,3}\s*[\.\-–:\)]*\s*\(?[A-Da-d]\)?(?![A-Za-z])/;
  const Q1 = /^\s*(?:Q(?:uestion)?\.?\s*)?(\d{1,3})\s*[\.\):\-]\s*(.*)$/i;
  const KPAIRG = /(\d{1,3})\s*[\.\-–:\)]*\s*\(?[A-Da-d]\)?(?![A-Za-z])/g;
  function isKeyish(l) {                                 // sirf answer-key jaisi line: "1. (b)", "1-b 2-c 3-d", "12 c"
    const ps = [...l.matchAll(KPAIRG)]; if (!ps.length || !/^\s*\d/.test(l)) return false;
    if (l.replace(KPAIRG, '').replace(/[\s,;|\-–.:()]/g, '').length > 3) return false;
    if (ps.length === 1) return true;
    const nums = ps.map(m => +m[1]); return nums.every((n, i) => i === 0 || n > nums[i - 1]);
  }
  function tailKey(lines) {                              // heading ke bina, PDF ke aakhir me sirf key-jaisi lines ka block
    let i = lines.length - 1, pairs = 0;
    for (; i >= 0; i--) {
      const l = lines[i].trim(); if (!l) continue;
      if (isKeyish(l)) pairs += (l.match(KPAIRG) || []).length; else break;
    }
    if (pairs < 10) return null;
    let start = i + 1; if (i >= 0 && KH.test(lines[i].trim()) && !(lines[i].match(KH)[2] || '').trim()) start = i;
    return start;
  }
  function parseMCQ(lines0) {
    const ts = tailKey(lines0), lines = ts == null ? lines0 : lines0.slice(0, ts), tailKeyLines = ts == null ? [] : lines0.slice(ts);
    const qs = [], keyLines = []; let cur = null, mode = 'q', last = -1, expect = 1, inKey = false;
    const filled = () => cur ? cur.opts.filter(Boolean).length : 0;
    const keyBlocks = []; let blk = null;                    // har key-section (A ki key, B ki key...) ka alag block
    const kpush = (...x) => { if (!blk) { blk = []; keyBlocks.push(blk); } blk.push(...x); keyLines.push(...x); };
    const start = (n, t) => { cur = { n, q: t || '', opts: [] }; qs.push(cur); mode = 'q'; last = -1; expect = n + 1; blk = null; };
    for (const raw of lines) {
      const l = raw.trim(); if (!l) continue;
      const kish = isKeyish(l);
      if (qs.length >= 3 && !inKey) {
        const h = l.match(KH);
        if (h) { const rest = (h[2] || '').trim(), pairs = KPAIR.test(rest); if (!rest || pairs || /^[\(\[]?\s*(set|test|shift|paper|part|section)\b/i.test(rest)) { inKey = true; if (pairs) kpush(rest); continue; } }
        else if (kish && filled() >= 2) inKey = true;
      }
      if (inKey) {
        if (kish) { kpush(l); continue; }
        const h2 = l.match(KH); if (h2) { const rest = (h2[2] || '').trim(); if (rest && KPAIR.test(rest)) kpush(rest); continue; }
        const mm = l.match(Q1);
        if (mm && !/^\d/.test(mm[2]) && mm[2].trim()) { inKey = false; start(+mm[1], mm[2]); continue; }   // key khatam, naya section/set shuru
        continue;                                          // key ke beech ki heading/page noise
      }
      const m = l.match(Q1);
      if (m && !/^\d/.test(m[2])) {
        const n = +m[1];
        if (n === expect || !qs.length || (n > expect && n <= expect + 3 && filled() >= 2) || (n === 1 && qs.length >= 5 && filled() >= 2)) { start(n, m[2]); continue; }
        if (n === 1 && qs.length < 5 && filled() < 2) { qs.pop(); start(1, m[2]); continue; }   // pehle wali "question" galat shuruaat thi
      }
      if (!cur) continue;
      const cs = chainSplit(l, mode === 'o' ? last + 1 : 0);
      if (cs) {
        if (cs.pre) { if (mode === 'q') cur.q += (cur.q ? ' ' : '') + cs.pre; else cur.opts[last] = ((cur.opts[last] || '') + ' ' + cs.pre).trim(); }
        cs.parts.forEach(([k, t]) => { cur.opts[k] = t; last = k; }); mode = 'o'; continue;
      }
      const om = l.match(/^\(?([A-Da-d])[\)\.]\s*(.*)$/);
      if (om) { const k = om[1].toUpperCase().charCodeAt(0) - 65; if (k === cur.opts.length || (mode === 'o' && k > last)) { cur.opts[k] = om[2]; last = k; mode = 'o'; continue; } }
      if (mode === 'q') cur.q += (cur.q ? ' ' : '') + l; else if (last >= 0) cur.opts[last] = ((cur.opts[last] || '') + ' ' + l).trim();
    }
    const tk = tailKeyLines.filter(x => !KH.test(x.trim()) || (x.match(KH)[2] || '').trim()); if (tk.length) { blk = null; kpush(...tk); }
    return { qs: qs.map(q => ({ n: q.n, q: q.q.trim(), opts: [0, 1, 2, 3].map(i => (q.opts[i] || '').trim()) })).filter(q => q.q && q.opts.filter(Boolean).length >= 2), keyLines, keyBlocks };
  }
  function parseKeySeq(text) {                           // answer key -> [ {n:'A'}, ... ] (restart pe naya set)
    const re = /(\d{1,3})\s*[\.\-–:\)]*\s*\(?([A-Da-d])\)?(?![A-Za-z])/g, maps = []; let x, m = null, lastN = 0;
    while ((x = re.exec(text))) {
      const n = +x[1];
      if (!m || (n <= lastN && Object.keys(m).length >= 5)) { m = {}; maps.push(m); }
      if (!(n in m)) m[n] = x[2].toUpperCase(); lastN = n;
    }
    return maps;
  }
  function keyMap(text) {                                // ek key-block -> {n:'A'} (number kisi bhi order me ho: columns bhi chalenge)
    const m = {}; parseKeySeq(text).forEach(mm => Object.keys(mm).forEach(k => { if (!(k in m)) m[k] = mm[k]; })); return m;
  }
  function markSets(qs) {                                // numbering restart -> naya set/test
    let s = 0, cnt = 0;
    qs.forEach((q, i) => {
      if (i > 0 && q.n != null && qs[i - 1].n != null && q.n <= qs[i - 1].n && cnt >= 5) { s++; cnt = 0; }
      q.set = s; cnt++;
    });
    return s + 1;
  }
  function loose(txt) {                                  // Gemini ka JSON (toota ho tab bhi)
    let t = String(txt || '').replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '').trim();
    const pick = j => Array.isArray(j) ? j : (j && Array.isArray(j.questions) ? j.questions : []);
    try { return pick(JSON.parse(t)); } catch (e) { }
    const s = t.indexOf('['); if (s < 0) throw new Error('JSON nahi mila');
    let body = t.slice(s);
    for (let i = 0; i < 8; i++) {
      const cut = body.lastIndexOf('},'); const end = body.lastIndexOf('}');
      body = (i === 0 ? body.slice(0, end + 1) : body.slice(0, cut + 1)) + ']';
      try { return pick(JSON.parse(body)); } catch (e) { body = body.slice(0, -1); if (cut < 0) break; }
    }
    throw new Error('JSON padh nahi paya');
  }
  function rankModels(names) {
    const bad = /(image|tts|audio|live|embed|robot|computer|imagen|veo|gemma|aqa|learnlm|native)/i;
    const sc = n => (/flash-lite/i.test(n) ? 0 : /flash/i.test(n) ? 1 : 2) + (/preview|exp|latest/i.test(n) ? 0.5 : 0);
    return names.filter(n => /gemini/i.test(n) && !bad.test(n)).sort((a, b) => sc(a) - sc(b) || b.localeCompare(a));
  }
  window.PGen = { keyMap, linesFrom, dropRepeated, splitInline, chainSplit, parseMCQ, parseKeySeq, markSets, loose, rankModels };
  if (typeof document === 'undefined' || !document.getElementById) return;

  // ================= PDF / GEMINI =================
  let _pdfjs = null;
  async function getPdfjs() { if (_pdfjs) return _pdfjs; _pdfjs = await import(PDFJS + 'pdf.min.mjs'); _pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs'; return _pdfjs; }
  const loadScript = src => new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('script load fail')); document.head.appendChild(s); });
  async function getPdfLib() { if (!window.PDFLib) await loadScript('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js'); return window.PDFLib; }
  const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); };
  const GEM = 'https://generativelanguage.googleapis.com/v1beta/';

  async function listModels(key) {
    const r = await fetch(GEM + 'models?pageSize=200&key=' + encodeURIComponent(key)), j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error((j.error && j.error.message) || ('HTTP ' + r.status));
    return rankModels((j.models || []).filter(m => (m.supportedGenerationMethods || []).includes('generateContent')).map(m => m.name.replace('models/', '')));
  }
  async function gem(key, model, parts, log) {
    for (let a = 0; a < 4; a++) {
      const r = await fetch(`${GEM}models/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json' } })
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return (((j.candidates || [])[0] || {}).content || { parts: [] }).parts.map(p => p.text || '').join('');
      const msg = (j.error && j.error.message) || ('HTTP ' + r.status);
      if (r.status === 429 && /per\s*day|PerDay/i.test(msg)) throw new Error('Aaj ki free limit khatam (daily). Kal try karo ya doosra model chuno.\n' + msg.slice(0, 160));
      if (r.status === 429 || r.status === 503) {
        const m = msg.match(/retry in ([\d.]+)s/i), w = Math.min(65, (m ? +m[1] : 25) + 2);
        log(`  limit/busy (${r.status}) — ${Math.round(w)} sec ruk raha hoon...`); await sleep(w * 1000); continue;
      }
      throw new Error(msg);
    }
    throw new Error('Limit lagi hai (429). Thodi der baad dobara try karo.');
  }
  const PROMPT = `You extract multiple-choice questions from the attached PDF pages. Return ONLY a JSON array, no commentary.
Each item: {"n": question number as printed (integer or null),
"q": question text in English (keep numbers; write math as plain text/unicode like x², 3/4, √),
"q_hi": the same question in Hindi if the PDF contains a Hindi version, else "",
"options": [4 option strings, English], "options_hi": [4 option strings in Hindi] or [],
"answer": "A"|"B"|"C"|"D"|null  (ONLY if the correct answer is printed in the PDF e.g. answer key / "Correct Ans" / marked option; NEVER guess),
"explanation": string or "",
"topic": short chapter name (e.g. "Percentage", "Algebra", "Reading Comprehension", "Synonyms"),
"has_diagram": true if the question needs a figure/table/graph/chart shown as an image (data interpretation, geometry figure, reasoning figure),
"diagram": null or {"page": page number inside THIS pdf (1-based), "box": [ymin,xmin,ymax,xmax] normalized 0-1000 around the WHOLE figure/table/chart including title and labels}}.
Rules: do not skip any question; keep the original order; keep Hindi exactly in Devanagari; map option labels (a)-(d) or 1-4 to A-D; for passage-based questions repeat the passage at the start of each question's q (and q_hi); ignore headers, footers and watermarks.`;
  const KEYPROMPT = `From these answer-key pages return ONLY a JSON array [{"n": question number (int), "answer": "A"|"B"|"C"|"D"}] for every question whose correct answer is printed (answer key table, "Correct Ans", 1-b style, or options 1-4 mapped to A-D). If the key restarts numbering for another set, keep the order of appearance.`;

  let CUR_DOC = null; const pageCache = new Map();
  async function pageCanvas(p) {
    if (pageCache.has(p)) return pageCache.get(p);
    const pg = await CUR_DOC.getPage(p), vp = pg.getViewport({ scale: 2.2 }), c = document.createElement('canvas');
    c.width = vp.width; c.height = vp.height;
    await pg.render({ canvasContext: c.getContext('2d'), viewport: vp, canvas: c }).promise;
    pageCache.set(p, c); return c;
  }
  async function crop(q, asBlob) {
    const c = await pageCanvas(q.diag.page), W = c.width, H = c.height, cl = v => Math.max(0, Math.min(1000, v));
    const [y0, x0, y1, x1] = q.diag.box, p = q.diag.pad;
    const sx = Math.round(cl(x0 - p) / 1000 * W), sy = Math.round(cl(y0 - p) / 1000 * H), ex = Math.round(cl(x1 + p) / 1000 * W), ey = Math.round(cl(y1 + p) / 1000 * H);
    const o = document.createElement('canvas'); o.width = Math.max(10, ex - sx); o.height = Math.max(10, ey - sy);
    o.getContext('2d').drawImage(c, sx, sy, o.width, o.height, 0, 0, o.width, o.height);
    return asBlob ? new Promise(r => o.toBlob(r, 'image/webp', 0.85)) : o.toDataURL('image/jpeg', 0.7);
  }

  async function runText(file, keyFile, log) {
    const lib = await getPdfjs(), doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise; CUR_DOC = doc;
    const pages = [];
    for (let p = 1; p <= doc.numPages; p++) {
      if (p % 10 === 0) log(`Text padh raha hoon: page ${p}/${doc.numPages}`);
      const pg = await doc.getPage(p), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
      pages.push(linesFrom(tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: vp.height - i.transform[5], w: i.width, h: Math.abs(i.transform[3]) })), vp.width));
      pg.cleanup();
    }
    const lines = dropRepeated(pages).flat(), all = lines.join('\n');
    const odd = (all.match(/[^\w\s\u0900-\u097F.,;:'"()\[\]{}%+\-*/=<>?!&@#$₹°²³√π∠×÷^_|\\~`]/g) || []).length / Math.max(1, all.length);
    const r = parseMCQ(lines); const blocks = r.keyBlocks.map(b => keyMap(b.join('\n'))); let maps = null;
    if (keyFile) {
      const kd = await lib.getDocument({ data: await keyFile.arrayBuffer() }).promise, kl = [];
      for (let p = 1; p <= kd.numPages; p++) { const pg = await kd.getPage(p), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent(); kl.push(linesFrom(tc.items.filter(i => i.str && i.str.trim()).map(i => ({ s: i.str, x: i.transform[4], y: vp.height - i.transform[5], w: i.width, h: Math.abs(i.transform[3]) })), vp.width).join(' ')); }
      maps = parseKeySeq(kl.join('\n'));
    }
    const out = r.qs.map(q => ({ n: q.n, q: q.q, qh: '', opts: q.opts, optsh: null, ans: -1, ex: '', topic: '', diag: null, inc: true }));
    const sets = markSets(out);
    if (!maps) { if (blocks.length === sets) maps = blocks; else { const mg = {}; blocks.forEach(b => Object.keys(b).forEach(k => { if (!(k in mg)) mg[k] = b[k]; })); maps = [mg]; } }
    out.forEach(q => { const m = maps.length >= sets ? maps[q.set] : maps[0]; if (m && m[q.n]) q.ans = m[q.n].charCodeAt(0) - 65; });
    const ents = maps.reduce((a, m) => a + Object.keys(m).length, 0), samp = r.keyLines.slice(0, 3).join(' / ').slice(0, 120);
    const info = `Key: ${r.keyLines.length} lines, ${ents} answers pehchane, ${maps.length} key-block, ${sets} set` + (samp ? `\n  key ki shuruaat: ${samp}` : `\n  ⚠ koi key line nahi mili. PDF ki aakhri lines: ${lines.slice(-6).join(' / ').slice(0, 220)}`);
    return { qs: out, info, warn: odd > 0.08 ? 'Text mein kharab/ajeeb akshar mile (PDF ka font). Is PDF ke liye Gemini mode try karo.' : '' };
  }
  async function runGemini(file, keyFile, o, log) {
    const lib = await getPdfjs(), buf = await file.arrayBuffer(); CUR_DOC = await lib.getDocument({ data: buf.slice(0) }).promise;
    const N = CUR_DOC.numPages; let PL = null, src = null;
    try { PL = await getPdfLib(); src = await PL.PDFDocument.load(buf, { ignoreEncryption: true }); } catch (e) { log('pdf-lib load nahi hua, poora PDF ek saath bhej raha hoon'); PL = null; }
    const chunkB64 = async (srcDoc, a, b) => { const d = await PL.PDFDocument.create(), idx = []; for (let i = a; i < b; i++) idx.push(i); (await d.copyPages(srcDoc, idx)).forEach(p => d.addPage(p)); return b64(await d.save()); };
    const step = PL ? o.chunk : N, out = [];
    for (let a = 0; a < N; a += step) {
      const b = Math.min(N, a + step); log(`Gemini: pages ${a + 1}-${b} / ${N}   (${out.length} questions mile)`);
      const data = PL ? await chunkB64(src, a, b) : b64(new Uint8Array(buf));
      let arr; try { arr = loose(await gem(o.key, o.model, [{ inline_data: { mime_type: 'application/pdf', data } }, { text: PROMPT }], log)); }
      catch (e) { if (/limit|quota|API key|429/i.test(e.message)) throw e; log('  ' + e.message + ' (ye hissa skip)'); continue; }
      arr.forEach(x => {
        const op = (x.options || []).map(s => String(s || '').trim()); if (!x.q || op.filter(Boolean).length < 2) return;
        const oph = (x.options_hi || []).map(s => String(s || '').trim());
        const q = { n: x.n == null ? null : +x.n, q: String(x.q).trim(), qh: String(x.q_hi || '').trim(), opts: [0, 1, 2, 3].map(i => op[i] || ''), optsh: oph.filter(Boolean).length ? [0, 1, 2, 3].map(i => oph[i] || '') : null,
          ans: x.answer && /^[A-D]$/i.test(x.answer) ? x.answer.toUpperCase().charCodeAt(0) - 65 : -1, ex: String(x.explanation || ''), topic: String(x.topic || ''), diag: null, inc: true };
        if (x.diagram && Array.isArray(x.diagram.box) && x.diagram.page) q.diag = { page: a + (+x.diagram.page), box: x.diagram.box.map(Number), pad: 15 };
        else if (x.has_diagram) q.diag = { page: a + 1, box: [0, 0, 1000, 1000], pad: 0, guess: true };
        out.push(q);
      });
      await sleep(o.gap);
    }
    const sets = markSets(out);
    if (out.some(q => q.ans < 0)) {                            // answer key: alag PDF, ya isi PDF ke aakhri pages
      let kDoc = null, kb = null, ka = 0, kn = 0;
      if (keyFile) { log('Answer key PDF padh raha hoon...'); kb = await keyFile.arrayBuffer(); if (PL) { kDoc = await PL.PDFDocument.load(kb, { ignoreEncryption: true }); kn = kDoc.getPageCount(); } }
      else if (PL && out.filter(q => q.ans < 0).length > out.length * 0.5) { log('Answer key isi PDF ke aakhri pages me dhundh raha hoon...'); kDoc = src; kn = N; ka = Math.max(0, N - Math.min(15, Math.max(3, Math.ceil(N * 0.25)))); }
      if (kDoc || kb) {
        const kmaps = []; let km = null, lastN = 0;
        const eat = arr => arr.forEach(x => { const n = +x.n; if (!km || (n <= lastN && Object.keys(km).length >= 5)) { km = {}; kmaps.push(km); } if (!(n in km) && /^[A-D]$/i.test(x.answer)) km[n] = String(x.answer).toUpperCase(); lastN = n; });
        const ask = async data => { try { eat(loose(await gem(o.key, o.model, [{ inline_data: { mime_type: 'application/pdf', data } }, { text: KEYPROMPT }], log))); } catch (e) { log('  key chunk: ' + e.message); } await sleep(o.gap); };
        if (kDoc) for (let a = ka; a < kn; a += 12) await ask(await chunkB64(kDoc, a, Math.min(kn, a + 12)));
        else await ask(b64(new Uint8Array(kb)));
        out.forEach(q => { if (q.ans >= 0) return; const m = kmaps.length >= sets ? kmaps[q.set] : kmaps[0]; if (m && m[q.n]) q.ans = m[q.n].charCodeAt(0) - 65; });
      }
    }
    return { qs: out, warn: '' };
  }

  // ================= UI =================
  let Q = [], SETS = 1;
  function build() {
    if ($('pg-box')) return;
    const anchor = document.querySelector('.box[data-tab="imp"]') || ($('t-add') && $('t-add').closest('.box')); if (!anchor) return;
    const box = document.createElement('div'); box.className = 'box'; box.id = 'pg-box'; box.dataset.tab = 'imp';
    box.innerHTML = `<h3>📄 Kisi bhi PDF se questions (Auto)</h3>
<p style="font-size:13px;color:var(--muted);margin:4px 0 8px">PDF daalo → <b>Padho</b> → review karke galtiyan theek karo → <b>Import</b>. Ek PDF me kai sets hon to har set ka alag test ban sakta hai.</p>
<div class="row"><label>Mode <select id="pg-mode"><option value="text">Text (free, bina key — English text-PDF)</option><option value="gem">Gemini (Hindi / scanned / diagram)</option></select></label></div>
<div id="pg-gbox" style="display:none">
<div class="row"><label>Gemini key <input type="password" id="pg-key" placeholder="AIza..." style="min-width:220px"></label><button class="btn-s ghost" id="pg-ksave" type="button">Save</button><button class="btn-s ghost" id="pg-mlist" type="button">Models laao</button></div>
<div class="row"><label>Model <select id="pg-model"></select></label><label>Pages/hissa <input type="number" id="pg-chunk" value="6" min="1" max="30" style="width:70px"></label><label>Gap (sec) <input type="number" id="pg-gap" value="4" min="0" max="30" style="width:70px"></label></div>
<p style="font-size:12px;color:var(--muted)">Key sirf is browser me save hoti hai. Flash-Lite jaisa model chuno (free limit zyada hoti hai).</p></div>
<div class="row"><label>PDF <input type="file" id="pg-pdf" accept="application/pdf"></label></div>
<div class="row"><label>Answer key PDF (optional) <input type="file" id="pg-keypdf" accept="application/pdf"></label></div>
<div class="row"><button class="btn-s" id="pg-go" type="button">Padho (Extract)</button></div>
<pre id="pg-log" style="white-space:pre-wrap;font-size:12px;margin-top:8px"></pre>
<div id="pg-imp" style="display:none">
<h4 style="margin:12px 0 6px">Import</h4>
<div class="row"><label>Test <select id="pg-test"></select></label><span style="font-size:12px;color:var(--muted)">ya naya:</span></div>
<div class="row"><input type="text" id="pg-title" placeholder="Naye test ka naam (kai sets ho to 'naam · Set 1, Set 2...')"><label>Section <select id="pg-sec"></select></label></div>
<div class="row"><label><input type="checkbox" id="pg-split" checked> Kai sets ho to alag-alag tests banao</label><label><input type="checkbox" id="pg-free"> Free</label><label><input type="checkbox" id="pg-pub"> Publish</label><label><input type="checkbox" id="pg-skip"> Bina answer wale chhod do</label></div>
<div class="row"><button class="btn-s" id="pg-import" type="button">Import karo</button><span id="pg-count"></span></div></div>
<div id="pg-rev"></div>`;
    anchor.insertAdjacentElement('afterend', box);
    const log = m => { $('pg-log').textContent = m; }, add = m => { $('pg-log').textContent += '\n' + m; };

    $('pg-key').value = localStorage.getItem('pg-key') || '';
    const setModels = (list, sel) => { $('pg-model').innerHTML = list.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join(''); if (sel && list.includes(sel)) $('pg-model').value = sel; };
    const savedModel = localStorage.getItem('pg-model'); if (savedModel) setModels([savedModel], savedModel);
    $('pg-mode').onchange = () => { $('pg-gbox').style.display = $('pg-mode').value === 'gem' ? '' : 'none'; };
    $('pg-ksave').onclick = () => { localStorage.setItem('pg-key', $('pg-key').value.trim()); alert('Key is browser me save ho gayi'); };
    $('pg-model').onchange = () => localStorage.setItem('pg-model', $('pg-model').value);
    $('pg-mlist').onclick = async () => {
      const k = $('pg-key').value.trim(); if (!k) return alert('Pehle Gemini key daalo');
      try { localStorage.setItem('pg-key', k); const l = await listModels(k); if (!l.length) return alert('Koi model nahi mila'); setModels(l, localStorage.getItem('pg-model')); localStorage.setItem('pg-model', $('pg-model').value); add('Models mil gaye: ' + l.slice(0, 6).join(', ')); }
      catch (e) { alert('Key/network dikkat: ' + e.message); }
    };
    setInterval(() => {                                   // admin.js ke tests/sections se dropdown sync
      if (typeof allTests === 'undefined' || typeof secs === 'undefined') return;
      const t = $('pg-test'), s = $('pg-sec'); if (!t || !s) return;
      const sig = allTests.map(x => x.id + x.title).join('|');
      if (t.dataset.sig !== sig) { const keep = t.value; t.dataset.sig = sig; t.innerHTML = '<option value="">— naya test banao —</option>' + allTests.map(x => `<option value="${x.id}">${esc(x.title)}</option>`).join(''); t.value = keep; }
      if (s.options.length !== secs.length + 1) { const keep = s.value; s.innerHTML = '<option value="">— Section —</option>' + secs.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join(''); s.value = keep; }
    }, 800);

    $('pg-go').onclick = async () => {
      const f = $('pg-pdf').files[0]; if (!f) return alert('PDF chuno');
      const kf = $('pg-keypdf').files[0] || null, mode = $('pg-mode').value;
      const o = { key: $('pg-key').value.trim(), model: $('pg-model').value, chunk: +$('pg-chunk').value || 6, gap: (+$('pg-gap').value || 0) * 1000 };
      if (mode === 'gem' && (!o.key || !o.model)) return alert('Gemini key daalo aur "Models laao" dabake model chuno');
      const btn = $('pg-go'); btn.disabled = true; pageCache.clear(); $('pg-imp').style.display = 'none'; $('pg-rev').innerHTML = '';
      try {
        log('Shuru...');
        const r = mode === 'text' ? await runText(f, kf, log) : await runGemini(f, kf, o, log);
        Q = r.qs; SETS = Q.length ? Math.max(...Q.map(q => q.set || 0)) + 1 : 0;
        if (r.info) add(r.info);
        if (r.warn) add('⚠ ' + r.warn);
        if (!Q.length) { add(mode === 'text' ? 'Koi question nahi mila. Ye PDF scanned/image wali ya alag layout ki lagti hai — Gemini mode try karo.' : 'Koi question nahi mila.'); return; }
        const noAns = Q.filter(q => q.ans < 0).length;
        add(`✅ ${Q.length} questions mile${SETS > 1 ? `, ${SETS} sets` : ''}. Bina answer: ${noAns}. Neeche review karo, phir Import.`);
        $('pg-imp').style.display = ''; renderReview();
      } catch (e) { add('❌ ' + (e.message || e)); } finally { btn.disabled = false; }
    };
    $('pg-import').onclick = doImport;

    // review events (delegation)
    const rev = $('pg-rev');
    rev.addEventListener('input', e => {
      const c = e.target.closest('.pgc'); if (!c) return; const q = Q[+c.dataset.i], f = e.target.dataset.f; if (!f) return;
      if (f === 'q') q.q = e.target.value; else if (f === 'qh') q.qh = e.target.value; else if (f === 'topic') q.topic = e.target.value; else if (f === 'ex') q.ex = e.target.value;
      else if (f[0] === 'o') q.opts[+f[1]] = e.target.value; else if (f[0] === 'h') { q.optsh = q.optsh || ['', '', '', '']; q.optsh[+f[1]] = e.target.value; }
    });
    rev.addEventListener('change', e => {
      const c = e.target.closest('.pgc'); if (!c) return; const q = Q[+c.dataset.i], f = e.target.dataset.f;
      if (f === 'ans') { q.ans = +e.target.value; c.classList.toggle('pg-bad', q.ans < 0); }
      if (f === 'inc') { q.inc = e.target.checked; c.style.opacity = q.inc ? 1 : 0.45; }
    });
    rev.addEventListener('click', async e => {
      const b = e.target.closest('[data-a]'); if (!b) return; const c = b.closest('.pgc'), q = Q[+c.dataset.i], a = b.dataset.a;
      if (a === 'del') { q.inc = false; c.querySelector('[data-f=inc]').checked = false; c.style.opacity = 0.45; return; }
      if (!q.diag) return;
      if (a === 'big') q.diag.pad = Math.min(300, q.diag.pad + 20); if (a === 'small') q.diag.pad = Math.max(-200, q.diag.pad - 20);
      if (a === 'full') { q.diag.box = [0, 0, 1000, 1000]; q.diag.pad = 0; }
      if (a === 'none') { q.diag = null; c.querySelector('.pg-dg').innerHTML = ''; return; }
      c.querySelector('.pg-dg img').src = await crop(q);
    });
  }

  async function renderReview() {
    $('pg-rev').innerHTML = Q.map((q, i) => {
      const setHdr = (i === 0 || q.set !== Q[i - 1].set) && SETS > 1 ? `<div style="margin:14px 0 6px;font-weight:700">📘 Set ${q.set + 1}</div>` : '';
      return setHdr + `<div class="pgc${q.ans < 0 ? ' pg-bad' : ''}" data-i="${i}" style="border:1px solid var(--line);border-radius:10px;padding:10px;margin:8px 0;${q.ans < 0 ? 'border-color:#dc2626;' : ''}">
<div class="row" style="margin:0 0 6px"><label><input type="checkbox" data-f="inc" checked> Q${q.n ?? i + 1}</label>
<label>Ans <select data-f="ans" style="width:70px"><option value="-1">—</option>${LET.map((l, k) => `<option value="${k}"${q.ans === k ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
<input type="text" data-f="topic" value="${esc(q.topic)}" placeholder="Topic" style="flex:1;min-width:110px"><button class="btn-s red" data-a="del" type="button">✕</button></div>
<textarea data-f="q" style="width:100%;min-height:64px">${esc(q.q).replace(/<br>/g, '\n')}</textarea>
<div class="g2">${[0, 1, 2, 3].map(k => `<input type="text" data-f="o${k}" value="${esc(q.opts[k])}" placeholder="${LET[k]}">`).join('')}</div>
<details style="margin-top:6px"><summary style="font-size:12px;color:var(--muted);cursor:pointer">Hindi / Explanation${q.qh || q.optsh || q.ex ? ' ✓' : ''}</summary>
<textarea data-f="qh" placeholder="Hindi question" style="width:100%;min-height:50px">${esc(q.qh).replace(/<br>/g, '\n')}</textarea>
<div class="g2">${[0, 1, 2, 3].map(k => `<input type="text" data-f="h${k}" value="${esc(q.optsh ? q.optsh[k] : '')}" placeholder="${LET[k]} (Hindi)">`).join('')}</div>
<textarea data-f="ex" placeholder="Explanation" style="width:100%;min-height:50px">${esc(q.ex).replace(/<br>/g, '\n')}</textarea></details>
<div class="pg-dg">${q.diag ? `<div style="margin-top:6px"><img alt="" style="max-width:100%;max-height:220px;border:1px solid var(--line);border-radius:8px;display:block"><div class="row" style="margin:4px 0 0"><button class="btn-s ghost" data-a="big" type="button">➕ Bada</button><button class="btn-s ghost" data-a="small" type="button">➖ Chhota</button><button class="btn-s ghost" data-a="full" type="button">Poora page</button><button class="btn-s red" data-a="none" type="button">Image hatao</button>${q.diag.guess ? '<span style="font-size:12px;color:#dc2626">⚠ jagah pakki nahi, check karo</span>' : ''}</div></div>` : ''}</div></div>`;
    }).join('');
    const imgs = [...document.querySelectorAll('#pg-rev .pgc')];
    for (const c of imgs) { const q = Q[+c.dataset.i]; if (q.diag) { const im = c.querySelector('.pg-dg img'); try { im.src = await crop(q); } catch (e) { } } }
  }

  async function doImport() {
    const inc = Q.filter(q => q.inc); if (!inc.length) return alert('Koi question select nahi');
    const miss = inc.filter(q => q.ans < 0);
    if (miss.length && !$('pg-skip').checked) return alert(`${miss.length} questions ka answer nahi hai (laal border wale). Answer chuno, ya "Bina answer wale chhod do" tick karo.`);
    const list = inc.filter(q => q.ans >= 0), sets = [...new Set(list.map(q => q.set || 0))].sort((a, b) => a - b);
    const split = $('pg-split').checked && sets.length > 1, existing = $('pg-test').value, title = $('pg-title').value.trim();
    if (!existing && !title) return alert('Test chuno ya naye test ka naam likho');
    if (split && existing) return alert('Kai sets alag tests me tabhi jaayenge jab "naya test" ho (naam likho, purana test mat chuno)');
    const btn = $('pg-import'); btn.disabled = true; const say = m => { $('pg-count').textContent = m; };
    try {
      const groups = split ? sets.map(s => ({ title: `${title} · Set ${s + 1}`, qs: list.filter(q => (q.set || 0) === s) })) : [{ title, qs: list }];
      let done = 0;
      for (const g of groups) {
        let test_id = existing, base = 0;
        if (!test_id) {
          const { data: t, error } = await sb.from('tests').insert({ title: g.title, section_id: $('pg-sec').value || null, duration_min: +$('t-dur').value || 60, pos_marks: +$('t-pos').value, neg_marks: Math.abs(+$('t-neg').value || 0), is_free: $('pg-free').checked, published: $('pg-pub').checked }).select('id').single();
          if (error) throw error; test_id = t.id;
        } else { const { count } = await sb.from('questions').select('*', { count: 'exact', head: true }).eq('test_id', test_id); base = count || 0; }
        const rows = [];
        for (let i = 0; i < g.qs.length; i++) {
          const q = g.qs[i]; say(`Test "${g.title}": ${i + 1}/${g.qs.length}...`); let image_url = null;
          if (q.diag) { const blob = await crop(q, true), path = `pdfgen/${Date.now()}-${done}-${i}.webp`; const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'image/webp', upsert: true, cacheControl: '31536000' }); if (error) throw error; image_url = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl; }
          rows.push({ test_id, position: base + i + 1, q_text: q.q, q_text_hi: q.qh || null, options: q.opts.map(x => x || '—'), options_hi: q.optsh && q.optsh.some(Boolean) ? q.optsh.map((x, k) => x || q.opts[k] || '—') : null,
            correct_option: q.ans, explanation: q.ex || null, has_diagram: !!q.diag, image_url, topic: q.topic || null });
        }
        for (let i = 0; i < rows.length; i += 100) { const { error } = await sb.from('questions').insert(rows.slice(i, i + 100)); if (error) throw error; }
        done += g.qs.length;
      }
      say(`✅ ${done} questions import ho gaye (${groups.length} test)`); Q = []; $('pg-rev').innerHTML = ''; if (typeof loadTests === 'function') loadTests();
    } catch (e) { say('❌ ' + (e.message || e)); } finally { btn.disabled = false; }
  }

  window.PGen.load = qs => { Q = qs; SETS = Q.length ? Math.max(...Q.map(q => q.set || 0)) + 1 : 0; $('pg-imp').style.display = ''; return renderReview(); };
  const go = () => { if ($('t-add')) build(); else setTimeout(go, 400); }; go();
})();
