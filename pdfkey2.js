// pdfkey2.js — admin UI (pdfkey1.js ke BAAD, admin.js ke BAAD load karna)
// Globals jo admin.js se aate hain: $, esc, sb, secs, allTests, loadTests
(function () {
if (!window.PKCore) { console.error('pdfkey1.js pehle load karo'); return; }
const S = PKCore.S, buildQuestion = PKCore.buildQuestion;
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
    box.innerHTML = `<h3>Answer-key PDF se tests (English + Hindi, bade font)</h3>
<p style="font-size:13px;color:var(--muted);margin:4px 0 8px">Bilingual answer-key PDF daalo (jisme "Correct Ans" likha ho). Pehle "PDF scan karo", phir shift chuno. Sahi/Galat marks upar "Naya test banao" wale boxes se aate hain.</p>
<div class="row"><label>PDF <input type="file" id="pk-file" accept="application/pdf"></label><button class="btn-s" id="pk-scan">1) PDF scan karo</button></div>
<pre id="pk-list" style="white-space:pre-wrap;font-size:12px;margin:6px 0"></pre>
<div class="row"><label>Shift numbers (jaise 1-3,5) <input id="pk-range" placeholder="1"></label><label>Exam naam <input id="pk-exam" value="SSC CGL Tier-1 2026"></label></div>
<div class="row"><label>Full test (100 Qs) kis section me <select id="pk-full"></select></label><label>Time (min) <input id="pk-dfull" type="number" value="60" style="width:70px"></label></div>
<div class="row"><label>Section-wise tests kis section me <select id="pk-sec"></select></label><label>Time har section test (min) <input id="pk-dsec" type="number" value="15" style="width:70px"></label></div>
<div class="row"><label>Image width (chhota = bada font) <input id="pk-w" type="number" value="1100" style="width:80px"></label><label><input type="checkbox" id="pk-pub"> Seedha publish karo</label><button class="btn-s" id="pk-go">2) Tests banao</button></div>
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
      const Wt = Math.max(600, Math.min(2200, +$('pk-w').value || 1100));
      const exam = $('pk-exam').value.trim() || 'SSC CGL';
      const base = { pos: +$('t-pos').value, neg: Math.abs(+$('t-neg').value || 0), pub: $('pk-pub').checked };
      if (!confirm(`${pick.length} shift(s): ${pick.join(', ')}\n${full ? '• Full test banega\n' : ''}${secSel ? '• Section-wise tests banenge\n' : ''}\nSahi hai?`)) return;
      const btn = $('pk-go'); btn.disabled = true;
      try {
        const hiCol = await hasHiCol(); base.hiCol = hiCol;
        if (!hiCol) log('⚠ questions table me image_url_hi column nahi hai — Hindi images save nahi hongi.\nSQL: alter table questions add column image_url_hi text;\n');
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
          report += `\n${head}: ${qs.length} questions` + (bad.length ? ` (⚠ ${bad.length} check: ` + bad.slice(0, 8).map(q => 'Q' + q.n + ' ' + q.flags[0]).join('; ') + ')' : '');
          if (!todo.length) { report += ' — sab tests pehle se hain'; continue; }
          await uploadQs(qs, `pdfkey/${Date.now()}-${no}`, m => { $('pk-log').textContent = report + `\n[${head}] ` + m; });
          for (const w of todo) {
            const list = w.kind === 'full' ? qs : qs.filter(q => q.sec === w.sec);
            try { await insertTest(w.title, w.section, list, { ...base, dur: w.dur }); made++; report += `\n  ✅ ${w.title} (${list.length} Qs)`; }
            catch (e) { report += `\n  ❌ ${w.title}: ${e.message || e}`; }
          }
          log(report);
        }
        log(report + `\n\n${made} tests ban gaye. ⚠ wale questions Questions edit se check kar lena.`);
        loadTests();
      } catch (e) { addLog('Error: ' + (e.message || e)); }
      finally { btn.disabled = false; }
    };
  }

  window.PdfKey = { scanPdf, processShift };
  if (typeof document !== 'undefined' && document.getElementById('t-add')) build();
  else addEventListener('DOMContentLoaded', () => document.getElementById('t-add') && build());
})();
