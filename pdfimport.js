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
