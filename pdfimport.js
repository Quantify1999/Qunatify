// pdfimport.js — SSC response-sheet PDF (English + Hindi) -> auto tests
// admin.html me admin.js ke BAAD ye script add karo:  <script src="pdfimport.js"></script>
// Ye admin.js ke globals use karta hai: $, esc, sb, secs, allTests, loadTests
(function () {
  const SCALE = 2.2;                       // render quality (2.2 = saaf aur halka)
  const G = 76;                            // left gutter jisme (A)(B)(C)(D) likhte hain
  const BUCKET = 'question-images';
  const LET = ['A', 'B', 'C', 'D'];
  const CDN = (window.PDFIMPORT_CDN || 'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.2.108/build/');
  let pdfjs = null;

  async function getPdfjs() {
    if (pdfjs) return pdfjs;
    pdfjs = await import(CDN + 'pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = CDN + 'pdf.worker.min.mjs';
    return pdfjs;
  }

  // ---------------- page analysis ----------------
  const isDark = (d, i) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 < 100;

  function findCol(d, W, H, a, b) {
    let best = -1, bc = 0;
    for (let x = a; x < b; x++) {
      let c = 0;
      for (let y = 0; y < H; y += 2) if (isDark(d, (y * W + x) * 4)) c++;
      if (c > bc) { bc = c; best = x; }
    }
    return { x: best, c: bc };
  }

  const isLine = (d, i) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 < 175;   // patli lines halki aati hain

  function findRows(d, W, H, xd, xr) {
    const x0 = xd + 8, x1 = xr - 8, need = (x1 - x0) * 0.85;
    const lines = [];
    for (let y = 0; y < H; y++) {
      let c = 0;
      for (let x = x0; x < x1; x += 1) if (isLine(d, (y * W + x) * 4)) c++;
      if (c >= need) {
        const L = lines[lines.length - 1];
        if (L && y - L.bot <= 1) L.bot = y; else lines.push({ top: y, bot: y });
      }
    }
    const rows = [];
    for (let i = 0; i + 1 < lines.length; i++) {
      const top = lines[i].bot + 1, bot = lines[i + 1].top - 1;
      if (bot - top < 18) continue;          // do boxes ke beech ka patla gap (legit rows 25px+ hoti hain)
      rows.push({ top, bot });
    }
    return rows;
  }

  function isGreen(d, W, top, bot, xa, xb) {
    let g = 0, t = 0;
    for (let y = top; y <= bot; y += 2) for (let x = xa; x < xb; x += 2) {
      const i = (y * W + x) * 4; t++;
      if (d[i] < 70 && d[i + 1] > 90 && d[i + 1] < 175 && d[i + 2] < 70) g++;
    }
    return t > 0 && g / t > 0.25;
  }

  // ---------------- header text ----------------
  function readHeader(text) {
    const date = (text.match(/Test Date\s*:?\s*(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/) || [])[1] || '';
    const shift = (text.match(/Test Time and Shift\s*:?\s*([0-9:]+\s*[AP]M\s*\(\s*Shift-?\s*\d+\s*\))/i) || [])[1] || '';
    const exam = (text.match(/(Combined [A-Za-z ]+Examination,?\s*\d{4})/) || [])[1] || '';
    return { date: date.trim(), shift: shift.replace(/\s+/g, ' ').trim(), exam: exam.trim() };
  }
  function examShort(e) {
    if (/Combined Graduate Level/i.test(e)) return 'SSC CGL ' + ((e.match(/\d{4}/) || [''])[0]);
    return e.replace(/Examination/i, '').trim() || 'SSC';
  }

  // ---------------- compose one question image ----------------
  async function finalize(q) {
    const rows = q.rows; q.flags = [];
    if (rows.length < 5) q.flags.push('rows kam (' + rows.length + ')');
    const nOpt = Math.min(4, Math.max(0, rows.length - 1));
    const stem = rows.slice(0, rows.length - nOpt), opts = rows.slice(rows.length - nOpt);
    const greens = opts.map((r, i) => r.green ? i : -1).filter(i => i >= 0);
    q.correct = greens.length === 1 ? greens[0] : -1;
    if (greens.length !== 1) q.flags.push('answer (green) ' + greens.length + ' mile');
    const gap = 8, w = Math.max(...rows.map(r => r.cv.width)) + G;
    const h = rows.reduce((s, r) => s + r.cv.height, 0) + gap * rows.length;
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
    const c = cv.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, w, h);
    let y = 0;
    const put = (r, label) => {
      c.drawImage(r.cv, G, y);
      if (label) { c.fillStyle = '#111'; c.font = '700 34px Arial, sans-serif'; c.textBaseline = 'top'; c.fillText('(' + label + ')', 6, y + 4); }
      y += r.cv.height;
      c.fillStyle = '#d5d9e0'; c.fillRect(0, y + 3, w, 1); y += gap;
    };
    stem.forEach(r => put(r, null));
    opts.forEach((r, i) => put(r, LET[i]));
    q.blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.86));
    q.w = w; q.h = h; delete q.rows;
  }

  // ---------------- parse one PDF ----------------
  async function parsePdf(file, lang, log) {
    const lib = await getPdfjs();
    const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
    const sheets = []; let sheet = null, part = null, cur = null;
    const finish = async () => { if (cur) { await finalize(cur); part.qs[cur.n] = cur; cur = null; } };

    for (let p = 1; p <= doc.numPages; p++) {
      log && log(`${lang}: page ${p}/${doc.numPages}`);
      const page = await doc.getPage(p);
      const vp = page.getViewport({ scale: SCALE });
      const W = Math.round(vp.width), H = Math.round(vp.height);
      const tc = await page.getTextContent();
      const items = tc.items.filter(i => i.str && i.str.trim()).map(i => {
        const pt = vp.convertToViewportPoint(i.transform[4], i.transform[5]);
        return { s: i.str.trim(), x: pt[0], y: pt[1], w: i.width * SCALE, h: Math.abs(i.transform[3]) * SCALE };
      });
      const text = items.map(i => i.s).join(' ');

      if (/Test Date/.test(text)) {
        await finish();
        const hd = readHeader(text);
        sheet = { ...hd, parts: {} }; sheets.push(sheet); part = null;
      }
      if (!sheet) continue;

      // events: part headings + Q.No labels
      const ev = [];
      items.forEach((it, k) => {
        let m = it.s.match(/^PART-([A-Z])\s*(?:\(([^)]*)\))?/);
        if (m) { ev.push({ t: 'p', y: it.y, L: m[1], title: (m[2] || (items[k + 1] && /^\(/.test(items[k + 1].s) ? items[k + 1].s.replace(/[()]/g, '') : '')).trim() }); return; }
        m = it.s.match(/^Q\.No:?\s*(\d+)?$/);
        if (m) {
          const n = m[1] ? +m[1] : (items[k + 1] && /^\d+$/.test(items[k + 1].s) ? +items[k + 1].s : 0);
          if (n) ev.push({ t: 'q', y: it.y, n });
        }
      });
      ev.sort((a, b) => a.y - b.y);

      const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d', { willReadFrequently: true });
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
      await page.render({ canvasContext: ctx, canvas: cv, viewport: vp }).promise;
      const d = ctx.getImageData(0, 0, W, H).data;

      const xdC = findCol(d, W, H, Math.round(W * 0.07), Math.round(W * 0.15));
      const xd = xdC.c > 80 ? xdC.x : Math.round(W * 0.11);
      const xrC = findCol(d, W, H, Math.round(W * 0.94), Math.round(W * 0.995));
      const xr = (xrC.c > 80 ? xrC.x : Math.round(W * 0.973)) - 5;
      const rows = findRows(d, W, H, xd, xr);
      const foot = items.filter(i => /JOIN GOAL CHASERS/i.test(i.s));
      let ei = 0;

      for (const r of rows) {
        let started = false;
        while (ei < ev.length && ev[ei].y <= r.bot) {
          const e = ev[ei++];
          if (e.t === 'p') {
            await finish();
            part = sheet.parts[e.L] = sheet.parts[e.L] || { L: e.L, title: e.title, qs: {} };
          } else {
            await finish();
            if (!part) part = sheet.parts.X = sheet.parts.X || { L: 'X', title: '', qs: {} };
            cur = { n: e.n, rows: [] }; started = true;
          }
        }
        if (!cur) continue;
        const x0 = xd + 4, cw = xr - x0, ch = r.bot - r.top + 1;
        const rc = document.createElement('canvas'); rc.width = cw; rc.height = ch;
        const rctx = rc.getContext('2d');
        rctx.drawImage(cv, x0, r.top, cw, ch, 0, 0, cw, ch);
        rctx.fillStyle = '#fff';
        foot.forEach(f => {      // page footer text jo row ke upar aa gaya ho use saaf karo
          const fy = f.y - f.h - 4 - r.top;
          if (fy + f.h + 12 > 0 && fy < ch) rctx.fillRect(f.x - 6 - x0, fy, f.w + 12, f.h + 12);
        });
        cur.rows.push({ cv: rc, green: isGreen(d, W, r.top, r.bot, Math.round(W * 0.02), xd - 6) });
        void started;
      }
    }
    await finish();
    return sheets;
  }

  // ---------------- sheets -> tests (en + hi merge) ----------------
  function flatten(sheets, lang) {
    const out = {};
    sheets.forEach(s => Object.values(s.parts).forEach(pt => {
      const key = [s.date, s.shift, pt.L].join('|');
      if (out[key]) { out[key].dupes++; return; }          // same shift ki dusri candidate sheet
      out[key] = { key, lang, exam: s.exam, date: s.date, shift: s.shift, L: pt.L, title: pt.title, qs: pt.qs, dupes: 0 };
    }));
    return out;
  }
  function mergeTests(en, hi) {
    const keys = Array.from(new Set([...Object.keys(en || {}), ...Object.keys(hi || {})]));
    return keys.map(k => {
      const e = en && en[k], h = hi && hi[k], base = e || h;
      const nums = Array.from(new Set([...Object.keys(e ? e.qs : {}), ...Object.keys(h ? h.qs : {})].map(Number))).sort((a, b) => a - b);
      const qs = nums.map(n => {
        const qe = e && e.qs[n], qh = h && h.qs[n], flags = [];
        if (qe) qe.flags.forEach(f => flags.push('EN ' + f));
        if (qh) qh.flags.forEach(f => flags.push('HI ' + f));
        if (e && !qe) flags.push('EN me ye question nahi mila');
        if (h && !qh) flags.push('HI me ye question nahi mila');
        let correct = qe && qe.correct >= 0 ? qe.correct : (qh ? qh.correct : -1);
        let mismatch = false;
        if (qe && qh && qe.correct >= 0 && qh.correct >= 0 && qe.correct !== qh.correct) { mismatch = true; flags.push('EN/HI answer alag'); }
        return { n, en: qe, hi: qh, correct, flags, mismatch };
      });
      const title = [examShort(base.exam), base.date, base.shift.replace(/^.*\((Shift-?\s*\d+)\)$/i, '$1'), base.title || ('Part ' + base.L)].filter(Boolean).join(' · ');
      return { key: k, title, qs, hasEn: !!e, hasHi: !!h, dupes: (e ? e.dupes : 0) + (h ? h.dupes : 0) };
    }).sort((a, b) => a.key.localeCompare(b.key));
  }

  // ---------------- upload ----------------
  async function putImg(path, blob) {
    const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }
  async function hasHiCol() {
    const { error } = await sb.from('questions').select('image_url_hi').limit(1);
    return !error;
  }

  async function saveTest(t, opt, log) {
    const { data: test, error } = await sb.from('tests').insert({
      title: t.title, section_id: opt.section, duration_min: opt.dur, pos_marks: opt.pos, neg_marks: opt.neg, is_free: false, published: opt.pub
    }).select('id').single();
    if (error) throw error;
    const base = `pdf/${test.id}`;
    const payload = [];
    const first = t.qs[0] ? t.qs[0].n : 1;
    for (let i = 0; i < t.qs.length; i += 4) {                    // 4-4 images parallel upload
      await Promise.all(t.qs.slice(i, i + 4).map(async q => {
        log(`${t.title}: image ${q.n}`);
        if (q.en) q.urlEn = await putImg(`${base}/${q.n}-en-${Date.now()}.jpg`, q.en.blob);
        if (q.hi && (opt.hiCol || !q.en)) q.urlHi = await putImg(`${base}/${q.n}-hi-${Date.now()}.jpg`, q.hi.blob);
      }));
    }
    t.qs.forEach(q => {
      const row = {
        test_id: test.id, position: q.n - first + 1,
        q_text: 'Q.' + q.n, q_text_hi: t.hasHi ? 'प्रश्न ' + q.n : null,
        options: LET.slice(), options_hi: null,
        correct_option: q.correct >= 0 ? q.correct : 0,
        has_diagram: true, image_url: q.urlEn || q.urlHi || null,
        explanation: null, explanation_hi: null, explanation_image_url: null, topic: null, difficulty: null
      };
      if (opt.hiCol && q.urlHi) row.image_url_hi = q.urlHi;
      payload.push(row);
    });
    for (let i = 0; i < payload.length; i += 100) {
      const { error: e2 } = await sb.from('questions').insert(payload.slice(i, i + 100));
      if (e2) throw e2;
    }
    return test.id;
  }

  // ---------------- UI ----------------
  function build() {
    const anchor = $('t-add') && $('t-add').closest('.box');
    if (!anchor) return;
    const box = document.createElement('div'); box.className = 'box'; box.id = 'pi-box';
    box.innerHTML = `<h3>PDF se auto tests (English + Hindi)</h3>
<p style="font-size:13px;color:var(--muted);margin:4px 0 8px">Section chuno, PDF daalo, bas. Har sheet (date + shift + part) ka alag test banega. Time / Sahi / Galat upar "Naya test banao" wale boxes se aayega.</p>
<div class="row"><label>Section <select id="pi-sec"></select></label></div>
<div class="row"><label>English PDF <input type="file" id="pi-en" accept="application/pdf"></label></div>
<div class="row"><label>Hindi PDF <input type="file" id="pi-hi" accept="application/pdf"></label></div>
<div class="row"><label><input type="checkbox" id="pi-pub"> Seedha publish karo</label><button class="btn-s" id="pi-go">Tests banao</button></div>
<pre id="pi-log" style="white-space:pre-wrap;font-size:12px;margin-top:8px"></pre>`;
    anchor.insertAdjacentElement('afterend', box);
    const log = m => { $('pi-log').textContent = m; };
    const addLog = m => { $('pi-log').textContent += '\n' + m; };

    setInterval(() => {                    // admin.js ke secs se dropdown sync
      const s = $('pi-sec'); if (!s || typeof secs === 'undefined') return;
      if (s.options.length !== secs.length + 1) {
        const keep = s.value;
        s.innerHTML = '<option value="">— Section chuno —</option>' + secs.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
        s.value = keep;
      }
    }, 800);

    $('pi-go').onclick = async () => {
      const section = $('pi-sec').value, fe = $('pi-en').files[0], fh = $('pi-hi').files[0];
      if (!section) return alert('Pehle section chuno');
      if (!fe && !fh) return alert('Kam se kam ek PDF chuno (English ya Hindi)');
      const opt = { section, dur: +$('t-dur').value || 60, pos: +$('t-pos').value, neg: Math.abs(+$('t-neg').value || 0), pub: $('pi-pub').checked };
      const btn = $('pi-go'); btn.disabled = true;
      try {
        log('Shuru...');
        const en = fe ? flatten(await parsePdf(fe, 'EN', log), 'en') : null;
        const hi = fh ? flatten(await parsePdf(fh, 'HI', log), 'hi') : null;
        const tests = mergeTests(en, hi).filter(t => t.qs.length);
        if (!tests.length) { log('Koi test nahi mila. PDF SSC response sheet jaisi honi chahiye.'); return; }

        const exist = new Set((allTests || []).map(t => t.title));
        const todo = tests.filter(t => !exist.has(t.title)), skip = tests.filter(t => exist.has(t.title));
        const summary = tests.map(t => {
          const bad = t.qs.filter(q => q.flags.length).length, mis = t.qs.filter(q => q.mismatch).length;
          return `• ${t.title} — ${t.qs.length} Qs [${t.hasEn ? 'EN' : ''}${t.hasEn && t.hasHi ? '+' : ''}${t.hasHi ? 'HI' : ''}]` +
            (exist.has(t.title) ? ' (pehle se hai, skip)' : '') + (bad ? ` ⚠ ${bad} check` : '') + (mis ? ` (EN/HI answer alag: ${mis})` : '') + (t.dupes ? ` (${t.dupes} duplicate sheet ignore)` : '');
        }).join('\n');
        log(summary);
        if (!todo.length) return addLog('\nSab tests pehle se bane hain.');
        if (!confirm(`${todo.length} naye test banenge:\n\n${summary}\n\nSahi hai?`)) return addLog('\nCancel.');

        opt.hiCol = hi ? await hasHiCol() : false;
        if (hi && !opt.hiCol) addLog('\n⚠ questions table me image_url_hi column nahi hai, Hindi images abhi save nahi hongi. SQL: alter table questions add column image_url_hi text;');
        let done = 0;
        for (const t of todo) {
          try { await saveTest(t, opt, m => { $('pi-log').textContent = summary + '\n\n' + m; }); done++; }
          catch (e) { addLog('\n❌ ' + t.title + ': ' + (e.message || e)); }
        }
        addLog(`\n✅ ${done}/${todo.length} tests ban gaye. ⚠ wale questions Questions edit se check kar lena.`);
        loadTests();
      } catch (e) { log('Error: ' + (e.message || e)); }
      finally { btn.disabled = false; }
    };
  }

  window.PdfImport = { parsePdf, flatten, mergeTests };
  if (typeof document !== 'undefined' && document.getElementById('t-add')) build();
  else addEventListener('DOMContentLoaded', () => document.getElementById('t-add') && build());
})();

/* ===== Answer-key PDF importer (pdfkey v3) ===== */
function pkBanner(t,ok){try{var d=document.createElement('div');d.textContent=t;d.style.cssText='position:fixed;top:0;left:0;right:0;z-index:99999;padding:8px;font:14px sans-serif;text-align:center;color:#fff;background:'+(ok?'#16a34a':'#dc2626');(document.body||document.documentElement).appendChild(d);setTimeout(function(){d.remove()},6000);}catch(e){}}
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
    for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) { const o = y * rw + x; if (!e.col || cls[o] === 3 || cls[o] === 4) cls[o] = 0; }
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
function buildKeep(d, W, blk, lang, fig, masks, dropCol) {
  const { rw, rh, cls, x0, y0 } = blk; const out = new Uint8ClampedArray(rw * rh * 4).fill(255), ink = new Uint8Array(rw * rh);
  const mine = lang === 'en' ? 1 : 2, other = lang === 'en' ? 2 : 1;
  const nearMine = lang === 'en' ? masks.E : masks.H, nearOther = lang === 'en' ? masks.H : masks.E;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const o = y * rw + x, c = cls[o]; let keep = false;
    if (c === mine || (c === 3 && !dropCol)) keep = true;
    else if (c === 4) keep = (!dropCol && masks.C[o]) || (nearMine[o] && !nearOther[o]);
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
function compose(plan, Wt, fit) {
  const P = fit ? 8 : PAD;
  let width = fit ? 0 : Wt, h = P;
  const blocks = [];
  plan.forEach(p => {
    if (p.kind === 'fig') { width = Math.max(width, p.r.x1 - p.r.x0); blocks.push(p); h += p.r.y1 - p.r.y0 + 14; return; }
    p.out.forEach(L => {
      let asc = 0, desc = 0; L.toks.forEach(t => { asc = Math.max(asc, t.base - t.top); desc = Math.max(desc, t.bot - t.base); });
      width = Math.max(width, L.w);
      L.asc = asc; L.desc = desc; h += asc + desc + 1 + 10;
    });
    h += p.gapAfter == null ? 18 : p.gapAfter; blocks.push(p);
  });
  const W = Math.round(width + P * 2), H = Math.round(h + P);
  const out = new Uint8ClampedArray(W * H * 4).fill(255);
  const cp = (src, sx, sy, sw, sh, dx, dy) => {
    for (let y = 0; y < sh; y++) { const so = ((sy + y) * src.rw + sx) * 4, dO = ((dy + y) * W + dx) * 4;
      if (dy + y < 0 || dy + y >= H) continue;
      for (let x = 0; x < sw; x++) { const a = so + x * 4, b2 = dO + x * 4;
        if (dx + x < 0 || dx + x >= W) continue;
        if (src.ink[(sy + y) * src.rw + sx + x]) { out[b2] = src.rgba[a]; out[b2 + 1] = src.rgba[a + 1]; out[b2 + 2] = src.rgba[a + 2]; } } }
  };
  let y = P;
  blocks.forEach(p => {
    if (p.kind === 'fig') { const r = p.r; cp(p.src, r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0, P, y); y += r.y1 - r.y0 + 14; return; }
    p.out.forEach(L => {
      L.toks.forEach(t => cp(p.src, t.x0, t.top, t.x1 - t.x0, t.bot - t.top + 1, P + Math.round(t.dx), y + L.asc - (t.base - t.top)));
      y += L.asc + L.desc + 1 + 10;
    });
    y += p.gapAfter == null ? 18 : p.gapAfter;
  });
  return { rgba: out, w: W, h: H };
}

// ---- one question block -> {en:{stem,opts[4],full}, hi:{..}|null, flags} ----
function buildQuestion(d, W, rect, erase, Wt) {
  const flags = [];
  const blk = classify(d, W, rect.x0, rect.y0, rect.x1, rect.y1, erase);
  const { rw, rh, cls } = blk;
  const optLimit = Math.min(rw, 500 * S - rect.x0);
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
  const full = labels.length !== 4;
  if (full) flags.push('option labels ' + labels.length + ' mile (4 chahiye) - poora question ek image me');
  const masks = makeMasks(blk);
  const stemEnd = full ? rh : Math.max(0, labels[0].top - 3 * S);
  const fig = findFigure(d, W, blk, 0, stemEnd);
  const keepEn = buildKeep(d, W, blk, 'en', fig, masks, false), keepHi = buildKeep(d, W, blk, 'hi', fig, masks, false);
  const keepEnO = buildKeep(d, W, blk, 'en', null, masks, true), keepHiO = buildKeep(d, W, blk, 'hi', null, masks, true);
  let opts = [];
  if (!full) opts = labels.map((L, i) => {
    const nextInRow = labels.find((M, j) => j > i && M.band === L.band);
    const nextBand = lb[L.band + 1];
    return { x0: Math.max(0, L.x0 - 6), x1: nextInRow ? nextInRow.x0 - 6 : optLimit, y0: Math.max(0, L.top - 3 * S), y1: nextBand ? nextBand.top - 3 * S : rh };
  });
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
    const optPlans = opts.map(r => {
      let src = lang === 'en' ? keepEnO : keepHiO;
      if (lang === 'hi') { let h = 0; for (let y = r.y0; y < r.y1; y++) for (let x = r.x0; x < r.x1; x++) if (cls[y * rw + x] === 2) h++; if (h < 8) src = keepEnO; }
      const ls = partLines(src.ink, rw, r, contX);
      return ls.length ? [{ kind: 'lines', src, out: flow(ls, Wt), gapAfter: 0 }] : null;
    });
    return { plan, optPlans, n };
  };
  const en = build('en'), hi = build('hi');
  let hindiInk = 0; for (let i = 0; i < cls.length; i++) if (cls[i] === 2) hindiInk++;
  const hasHi = hindiInk > 150;
  if (!en.n) flags.push('English text nahi mila');
  const mk = b => ({ stem: compose(b.plan, Wt, false), opts: b.optPlans.map(p => p ? compose(p, Wt, true) : null), full });
  return { en: mk(en), hi: hasHi ? mk(hi) : null, flags };
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
  const SECRE = /(Reasoning|Awareness|Quantitative|English Comprehension|General Intelligence)/i;
  const clean = t => String(t).replace(/[\u0000-\u001f\ufffd]/g, '').trim();
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
  const toBlob = (o) => !o ? Promise.resolve(null) : new Promise(res => {
    const cv = document.createElement('canvas'); cv.width = o.w; cv.height = o.h;
    cv.getContext('2d').putImageData(new ImageData(o.rgba, o.w, o.h), 0, 0);
    cv.toBlob(b => { cv.width = 0; res(b); }, 'image/webp', 0.82);
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
        if (it.x > 100 * S && /^Q\s*\d+\s*\S{0,2}\s*\d*$/.test(it.s)) {
          const name = items.filter(o => o !== it && Math.abs(o.y - it.y) < 5 * S && o.x < it.x).sort(byXY).map(o => o.s).join(' ').trim();
          if (name && name.length < 60 && SECRE.test(name) && !/[\u0900-\u097F]/.test(name)) secs.push({ y: it.y, top: Math.round(it.top - 8 * S), name });
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
        const erase = [{ col: true, x0: 14 * S, x1: Math.round(pl.it.x + pl.it.w + 14 * S), y0: Math.round(pl.it.top - 5 * S), y1: Math.round(pl.it.y + 5 * S) }];
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
        const pack = async (g) => g ? { full: g.full, stem: await toBlob(g.stem), opts: await Promise.all(g.opts.map(toBlob)) } : null;
        qs[pl.n] = { n: pl.n, sec: curSec, correct, en: await pack(r.en), hi: await pack(r.hi), flags };
      }
      cv.width = 0; page.cleanup();
    }
    const arr = Object.values(qs).sort((a, b) => a.n - b.n);
    arr.missing = []; if (arr.length) for (let i = 1; i <= arr[arr.length - 1].n; i++) if (!qs[i]) arr.missing.push(i);
    return arr;
  }

  // ---- upload + tests ----
  const errTxt = e => { try { return (e && (e.message || e.error_description)) ? e.message + (e.statusCode ? ' [' + e.statusCode + ']' : '') : JSON.stringify(e); } catch (x) { return String(e); } };
  async function putImg(path, blob) {
    let last;
    for (let a = 0; a < 4; a++) {
      try {
        const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp', upsert: true, cacheControl: '31536000' });
        if (!error) return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        last = error;
      } catch (e) { last = e; }
      await new Promise(r => setTimeout(r, 800 * (a + 1)));
    }
    throw new Error('upload fail (' + path + '): ' + errTxt(last));
  }
  const OL = ['a', 'b', 'c', 'd'];
  async function uploadQs(qs, base, log) {
    const tasks = [];
    qs.forEach(q => {
      [['en', q.en], ['hi', q.hi]].forEach(([lg, g]) => {
        if (!g) return;
        const f = g.full ? 'f' : 's';
        tasks.push({ q, key: lg === 'en' ? 'urlEn' : 'urlHi', path: `${base}/${q.n}${f}-${lg}.webp`, blob: g.stem });
        g.opts.forEach((o, i) => { if (o) tasks.push({ q, key: null, path: `${base}/${q.n}${OL[i]}-${lg}.webp`, blob: o }); });
      });
    });
    let done = 0;
    const worker = async () => {
      while (tasks.length) {
        const t = tasks.shift();
        const url = await putImg(t.path, t.blob);
        if (t.key) t.q[t.key] = url;
        done++; if (done % 10 === 0) log(`images upload: ${done} hue`);
      }
    };
    await Promise.all([1, 2, 3, 4, 5, 6].map(worker));
  }
  async function insertTest(title, section, list, opt) {
    const body = { title: clean(title), section_id: section, duration_min: opt.dur, pos_marks: opt.pos, neg_marks: opt.neg, is_free: false, published: opt.pub };
    if (opt.cfg) body.sec_cfg = opt.cfg;
    let r = await sb.from('tests').insert(body).select('id').single();
    if (r.error && opt.cfg && /sec_cfg/.test(r.error.message || '')) {
      throw new Error('tests table me sec_cfg column nahi hai. Supabase SQL me chalao: alter table tests add column if not exists sec_cfg jsonb;');
    }
    if (r.error) throw r.error;
    const test = r.data;
    const rows = list.map((q, i) => ({
      test_id: test.id, position: i + 1, q_text: 'Q.' + (i + 1), q_text_hi: q.urlHi ? 'प्रश्न ' + (i + 1) : null,
      options: LET.slice(), options_hi: q.urlHi ? LET.slice() : null, correct_option: q.correct >= 0 ? q.correct : 0,
      has_diagram: true, image_url: q.urlEn || null,
      explanation: null, explanation_hi: null, explanation_image_url: null, topic: null, difficulty: null
    }));
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
    box.innerHTML = `<h3>Answer-key PDF se tests (English + Hindi, bade font)</h3>
<p style="font-size:13px;color:var(--muted);margin:4px 0 8px">Bilingual answer-key PDF daalo (jisme "Correct Ans" likha ho). Pehle "PDF scan karo", phir shift chuno. Sahi/Galat marks upar "Naya test banao" wale boxes se aate hain.</p>
<div class="row"><label>PDF <input type="file" id="pk-file" accept="application/pdf"></label><button class="btn-s" id="pk-scan">1) PDF scan karo</button></div>
<pre id="pk-list" style="white-space:pre-wrap;font-size:12px;margin:6px 0"></pre>
<div class="row"><label>Shift numbers (jaise 1-3,5) <input id="pk-range" placeholder="1"></label><label>Exam naam <input id="pk-exam" value="SSC CGL Tier-1 2026"></label></div>
<div class="row"><label>Full test (100 Qs) kis section me <select id="pk-full"></select></label><label>Time (min) <input id="pk-dfull" type="number" value="60" style="width:70px"></label></div>
<div class="row"><label><input type="checkbox" id="pk-lock" checked> Full test me har section ka alag time (lock)</label><label>Minutes (section-wise) <input id="pk-mins" value="15,15,15,15" style="width:120px"></label></div>
<div class="row"><label>Section-wise tests kis section me <select id="pk-sec"></select></label><label>Time har section test (min) <input id="pk-dsec" type="number" value="15" style="width:70px"></label></div>
<div class="row"><label>Image width (chhota = bada font) <input id="pk-w" type="number" value="900" style="width:80px"></label><label><input type="checkbox" id="pk-pub"> Seedha publish karo</label><button class="btn-s" id="pk-go">2) Tests banao</button></div>
<pre id="pk-log" style="white-space:pre-wrap;font-size:12px;margin-top:8px"></pre>`;
    anchor.insertAdjacentElement('afterend', box);
    const log = m => { $('pk-log').textContent = m; }, addLog = m => { $('pk-log').textContent += '\n' + m; };
    let scanned = null;

    setInterval(() => {
      if (typeof secs === 'undefined') return;
      ['pk-full', 'pk-sec'].forEach(id => {
        const s = $(id); if (!s) return;
        if (s.options.length !== secs.length + 1) {
          const keep = s.value;
          s.innerHTML = '<option value="">— nahi banana —</option>' + secs.map(x => `<option value="${x.id}">${esc(x.name)}</option>`).join('');
          s.value = keep;
        }
      });
    }, 800);

    $('pk-scan').onclick = async () => {
      const f = $('pk-file').files[0]; if (!f) return alert('Pehle PDF chuno');
      const btn = $('pk-scan'); btn.disabled = true;
      try {
        log('Scan shuru...');
        scanned = await scanPdf(f, log);
        const L = scanned.shifts;
        if (!L.length) { $('pk-list').textContent = ''; return log('Koi shift nahi mila (PDF me "Correct Ans" + "30 Sep 2026 Shift 2" jaisa header chahiye).'); }
        $('pk-list').textContent = L.map((s, i) => `${i + 1}. ${s.date} · Shift ${s.shift} (pages ${s.pages[0]}–${s.pages[s.pages.length - 1]})`).join('\n');
        if (!$('pk-range').value) $('pk-range').value = '1';
        log(`${L.length} shifts mile. Ab shift numbers likho aur "Tests banao" dabao.`);
      } catch (e) { log('Error: ' + (e.message || e)); } finally { btn.disabled = false; }
    };

    $('pk-go').onclick = async () => {
      if (!scanned) return alert('Pehle "PDF scan karo" dabao');
      const full = $('pk-full').value, secSel = $('pk-sec').value;
      if (!full && !secSel) return alert('Kam se kam ek chuno: Full test ya Section-wise ka section');
      const pick = parseRange($('pk-range').value, scanned.shifts.length);
      if (!pick.length) return alert('Shift numbers sahi likho (jaise 1-3,5)');
      const Wt = Math.max(600, Math.min(2200, +$('pk-w').value || 900));
      const exam = $('pk-exam').value.trim() || 'SSC CGL';
      const base = { pos: +$('t-pos').value, neg: Math.abs(+$('t-neg').value || 0), pub: $('pk-pub').checked };
      if (!confirm(`${pick.length} shift(s): ${pick.join(', ')}\n${full ? '• Full test banega\n' : ''}${secSel ? '• Section-wise tests banenge\n' : ''}\nSahi hai?`)) return;
      const btn = $('pk-go'); btn.disabled = true;
      try {
                const exist = new Set((allTests || []).map(t => t.title));
        let made = 0, report = '';
        for (const no of pick) {
          const sh = scanned.shifts[no - 1], head = `${exam} · ${sh.date} · Shift ${sh.shift}`;
          const want = [];
          if (full) want.push({ title: head, section: full, dur: +$('pk-dfull').value || 60, kind: 'full' });
          // sections order = PDF order
          const qs = await processShift(scanned.doc, sh, Wt, m => { $('pk-log').textContent = report + `[${head}] ` + m; });
          const order = []; qs.forEach(q => { if (q.sec && !order.includes(q.sec)) order.push(q.sec); });
          if (secSel) order.forEach(sn => want.push({ title: `${head} · ${secShort(sn)}`, section: secSel, dur: +$('pk-dsec').value || 15, kind: 'sec', sec: sn }));
          const todo = want.filter(w => !exist.has(w.title));
          const bad = qs.filter(q => q.flags.length);
          report += `\n${head}: ${qs.length} questions` + (qs.missing && qs.missing.length ? ` ⚠ MISSING Q: ${qs.missing.join(',')}` : '') + (bad.length ? ` (⚠ ${bad.length} check: ` + bad.slice(0, 8).map(q => 'Q' + q.n + ' ' + q.flags[0]).join('; ') + ')' : '');
          if (!todo.length) { report += ' — sab tests pehle se hain'; continue; }
          try { await uploadQs(qs, `pk2/${Date.now()}-${no}`, m => { $('pk-log').textContent = report + `\n[${head}] ` + m; }); }
          catch (e) { report += `\n  ❌ ${head}: ${errTxt(e)}`; log(report); continue; }
          for (const w of todo) {
            const list = w.kind === 'full' ? qs : qs.filter(q => q.sec === w.sec);
            let cfg = null, dur = w.dur;
            if (w.kind === 'full' && $('pk-lock').checked && order.length > 1) {
              const mins = $('pk-mins').value.split(',').map(x => +x.trim()).filter(x => x > 0);
              cfg = order.map((sn, i) => ({ name: secShort(sn), mins: mins[i] || mins[mins.length - 1] || 15, n: qs.filter(q => q.sec === sn).length }));
              dur = cfg.reduce((a, c) => a + c.mins, 0);
            }
            try { await insertTest(w.title, w.section, list, { ...base, dur, cfg }); made++; report += `\n  ✅ ${w.title} (${list.length} Qs)`; }
            catch (e) { report += `\n  ❌ ${w.title}: ${errTxt(e)}`; }
          }
          log(report);
        }
        log(report + `\n\n${made} tests ban gaye. ⚠ wale questions Questions edit se check kar lena.`);
        loadTests();
      } catch (e) { addLog('Error: ' + errTxt(e)); }
      finally { btn.disabled = false; }
    };
  }

  window.PdfKey = { scanPdf, processShift };
  const go = () => { if (document.getElementById('t-add')) { build(); pkBanner(document.getElementById('pk-box') ? 'Answer-key PDF importer ready ✓ (v3)' : 'pdfkey: box nahi bana', !!document.getElementById('pk-box')); } };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', go); else go();

})();
