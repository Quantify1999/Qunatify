const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rows = null, cur = null, imgUrl = null, secs = [], solImg = null, allTests = [];

(async () => {
  if (!await requireAuth()) return;
  const { data: { user } } = await sb.auth.getUser();
const { data } = await sb.from('profiles').select('is_admin').eq('id', user.id).single();
  if (!data || !data.is_admin) { alert('Admin access nahi hai'); location.href = 'dashboard.html'; return; }
  $('main').style.display = '';
  loadTests();
})();

async function loadTests() {
  const { data: tests } = await sb.from('tests').select('*').order('created_at'); allTests = tests || [];
  const { data: qs } = await sb.from('questions').select('test_id');
  const { data: sx } = await sb.from('sections').select('*').order('position'); secs = sx || [];
  $('t-sec').innerHTML = '<option value="">— Section chuno —</option>' + secOpts(null);
  renderSecs();
  const cnt = {}; (qs || []).forEach(q => cnt[q.test_id] = (cnt[q.test_id] || 0) + 1);
  const opts = (tests || []).map(t => `<option value="${t.id}">${esc(t.title)} (${cnt[t.id] || 0} Qs)</option>`).join('');
  const keepM = $('m-test').value, keepQ = $('q-test').value;
  $('q-test').innerHTML = '<option value="">— Test chuno —</option>' + opts; $('m-test').innerHTML = opts;
  if (keepM) $('m-test').value = keepM;
  if (keepQ) $('q-test').value = keepQ;
  $('t-list').innerHTML = (tests || []).map(t => `<div class="trow"><b style="flex:1;min-width:140px">${esc(t.title)} <small style="color:var(--muted)">(${cnt[t.id] || 0} Qs)</small></b>
    <select id="s-${t.id}" style="width:auto;padding:6px"><option value="">(no section)</option>${secOpts(t.section_id)}</select>
    <label>Min <input type="number" id="d-${t.id}" value="${t.duration_min}"></label>
    <label>+ <input type="number" step="0.25" id="p-${t.id}" value="${t.pos_marks}"></label>
    <label>− <input type="number" step="0.25" id="n-${t.id}" value="${t.neg_marks}"></label>
    <button class="btn-s" onclick="saveTest('${t.id}')">Save</button>
    <button class="btn-s ghost" onclick="tog('${t.id}','published',${!t.published})">${t.published ? 'Unpublish' : 'Publish'}</button>
    <button class="btn-s ghost" onclick="tog('${t.id}','is_free',${!t.is_free})">${t.is_free ? 'FREE ✓' : 'Make free'}</button>
    <button class="btn-s ghost" onclick="dlXlsx('${t.id}')">📊 Excel</button>
    <button class="btn-s ghost" onclick="dlPpt('${t.id}')">📽 PPT</button>
    <button class="btn-s red" onclick="delTest('${t.id}')">Delete</button></div>`).join('') || 'Koi test nahi';
  loadQs();
}
async function saveTest(id) {
  const { error } = await sb.from('tests').update({ section_id: $('s-' + id).value || null, duration_min: +$('d-' + id).value || 60, pos_marks: +$('p-' + id).value, neg_marks: Math.abs(+$('n-' + id).value || 0) }).eq('id', id);
  alert(error ? error.message : 'Saved ✅');
}
async function tog(id, f, v) { await sb.from('tests').update({ [f]: v }).eq('id', id); loadTests(); }
async function delTest(id) { if (confirm('Test, questions aur attempts sab delete honge. Pakka?')) { await sb.from('tests').delete().eq('id', id); loadTests(); } }

$('t-add').onclick = async () => {
  const title = $('t-title').value.trim(); if (!title) return alert('Title daalo');
  if (secs.length && !$('t-sec').value) return alert('Section chuno');
  const { error } = await sb.from('tests').insert({ title, section_id: $('t-sec').value || null, duration_min: +$('t-dur').value || 60, pos_marks: +$('t-pos').value, neg_marks: Math.abs(+$('t-neg').value || 0), is_free: $('t-free').checked, published: $('t-pub').checked });
  if (error) return alert(error.message);
  $('t-title').value = ''; loadTests();
};

// ---- Excel upload ----
$('q-file').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  const wb = XLSX.read(await f.arrayBuffer());
  rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  $('q-msg').textContent = rows.length + ' rows mile';
};
$('q-up').onclick = async () => {
  const test_id = $('q-test').value; if (!test_id) return alert('Pehle dropdown se test chuno jisme questions upload karne hain');
  if (!rows || !rows.length) return alert('Excel file chuno');
  const ok = [], bad = [];
  rows.forEach((r, i) => { const n = normRow(r); n ? ok.push(n) : bad.push(i + 2); });
  if (bad.length) return alert('In Excel rows mein question/option/answer check karo: ' + bad.slice(0, 20).join(', '));
  const tname = $('q-test').selectedOptions[0].textContent;
  if (!confirm(`${ok.length} questions is test mein upload honge:\n\n${tname}\n\nSahi hai?`)) return;
  const { count } = await sb.from('questions').select('*', { count: 'exact', head: true }).eq('test_id', test_id);
  const payload = ok.map((q, i) => ({ ...q, test_id, position: (count || 0) + i + 1 }));
  for (let i = 0; i < payload.length; i += 100) {
    const { error } = await sb.from('questions').insert(payload.slice(i, i + 100));
    if (error) return alert(error.message);
  }
  const hi = ok.filter(q => q.q_text_hi).length, dg = ok.filter(q => q.has_diagram && !q.image_url).length;
  $('q-msg').textContent = `✅ ${ok.length} questions upload hue (${hi} Hindi ke saath, ${dg} mein image baaki)`;
  rows = null; $('q-file').value = ''; loadTests();
};

// ---- Question list + editor ----
$('m-test').onchange = loadQs;
async function loadQs() {
  const t = $('m-test').value; if (!t) { $('q-list').textContent = 'Test chuno'; return; }
  const { data } = await sb.from('questions').select('id,position,q_text,q_text_hi,image_url,has_diagram').eq('test_id', t).order('position');
  $('q-list').innerHTML = (data || []).map(q => `<div class="qrow"><b>${q.position}.</b><span class="qt">${esc(q.q_text.slice(0, 90))}</span>
    ${q.image_url ? '<span class="tag g">📷 image</span>' : (q.has_diagram ? '<span class="tag">⚠ image baaki</span>' : '')}
    ${q.q_text_hi ? '' : '<span class="tag">Hindi nahi</span>'}
    <button class="btn-s ghost" onclick="openEdit('${q.id}')">Edit</button></div>`).join('') || 'Is test mein questions nahi';
}
$('q-clear').onclick = async () => {
  const id = $('m-test').value; if (!id || !confirm('Is test ke SAARE questions delete karein?')) return;
  await sb.from('questions').delete().eq('test_id', id); loadTests();
};

async function openEdit(id) {
  const { data: q, error } = await sb.from('questions').select('*').eq('id', id).single();
  if (error) return alert(error.message);
  cur = q; imgUrl = q.image_url; solImg = q.explanation_image_url || null; showSolPrev();
  $('e-title').textContent = 'Question ' + q.position;
  $('e-q').value = q.q_text; $('e-qh').value = q.q_text_hi || '';
  ['a', 'b', 'c', 'd'].forEach((l, i) => { $('e-' + l).value = q.options[i] || ''; $('e-' + l + 'h').value = (q.options_hi || [])[i] || ''; });
  $('e-ans').value = q.correct_option; $('e-diag').checked = !!q.has_diagram;
  $('e-ex').value = q.explanation || ''; $('e-exh').value = q.explanation_hi || '';
  $('e-img').value = ''; $('e-msg').textContent = ''; showPrev();
  $('modal').classList.add('on');
}
function showPrev() { const p = $('e-prev'); p.style.display = imgUrl ? '' : 'none'; if (imgUrl) p.src = imgUrl; }
$('e-x').onclick = () => $('modal').classList.remove('on');
$('e-rm').onclick = () => { imgUrl = null; $('e-img').value = ''; showPrev(); };

$('e-img').onchange = async e => {
  const f = e.target.files[0]; if (!f) return;
  $('e-msg').textContent = 'Uploading...';
  const ext = (f.name.split('.').pop() || 'png').toLowerCase();
  const path = `${cur.id}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('question-images').upload(path, f, { contentType: f.type });
  if (error) { $('e-msg').textContent = ''; return alert(error.message); }
  imgUrl = sb.storage.from('question-images').getPublicUrl(path).data.publicUrl;
  $('e-diag').checked = true; $('e-msg').textContent = 'Image upload ho gayi, Save dabao'; showPrev();
};

$('e-save').onclick = async () => {
  const en = ['a', 'b', 'c', 'd'].map(l => $('e-' + l).value.trim());
  const hi = ['a', 'b', 'c', 'd'].map(l => $('e-' + l + 'h').value.trim());
  if (!$('e-q').value.trim() || en.some(x => !x)) return alert('Question aur English options bharo');
  const upd = {
    q_text: $('e-q').value.trim(), q_text_hi: $('e-qh').value.trim() || null,
    options: en, options_hi: hi.some(x => x) ? hi.map((x, i) => x || en[i]) : null,
    correct_option: +$('e-ans').value, has_diagram: $('e-diag').checked, image_url: imgUrl,
    explanation: $('e-ex').value.trim() || null, explanation_hi: $('e-exh').value.trim() || null, explanation_image_url: solImg
  };
  const { error } = await sb.from('questions').update(upd).eq('id', cur.id);
  if (error) return alert(error.message);
  $('modal').classList.remove('on'); loadQs();
};
$('e-del').onclick = async () => {
  if (!confirm('Ye question delete karein?')) return;
  await sb.from('questions').delete().eq('id', cur.id); $('modal').classList.remove('on'); loadTests();
};

// ---- Sections manager ----
function secOpts(sel) { return secs.map(s => `<option value="${s.id}"${s.id === sel ? ' selected' : ''}>${esc(s.name)}</option>`).join(''); }
function renderSecs() {
  $('sec-list').innerHTML = secs.map(s => `<div class="trow">
    ${s.icon_url ? `<img src="${esc(s.icon_url)}" alt="" style="width:36px;height:36px;border-radius:8px;object-fit:cover">` : '<span style="font-size:24px">📘</span>'}
    <input type="text" id="sn-${s.id}" value="${esc(s.name)}" style="flex:1;min-width:140px;width:auto">
    <label>Order <input type="number" id="sp-${s.id}" value="${s.position}"></label>
    <input type="url" id="sl-${s.id}" value="${esc(s.link_url || '')}" placeholder="Link (Telegram etc., optional)" style="flex:1 1 100%;width:auto;min-width:180px">
    <label class="btn-s ghost" style="cursor:pointer">🖼 Icon<input type="file" accept="image/*" hidden onchange="upIcon('${s.id}', this)"></label>
    <button class="btn-s ghost" onclick="dlSecXlsx('${s.id}')">📊 Section Excel</button>
    <button class="btn-s" onclick="saveSec('${s.id}')">Save</button><button class="btn-s red" onclick="delSec('${s.id}')">Delete</button></div>`).join('') || 'Koi section nahi';
}
async function upIcon(id, el) {
  const f = el.files[0]; if (!f) return;
  if (f.size > 1.5 * 1024 * 1024) return alert('Image 1.5 MB se choti rakho');
  const ext = (f.name.split('.').pop() || 'png').toLowerCase();
  const path = `sections/${id}-${Date.now()}.${ext}`;
  const { error } = await sb.storage.from('assets').upload(path, f, { contentType: f.type });
  if (error) return alert(error.message);
  const url = sb.storage.from('assets').getPublicUrl(path).data.publicUrl;
  const { error: e2 } = await sb.from('sections').update({ icon_url: url }).eq('id', id);
  alert(e2 ? e2.message : 'Icon save ho gaya ✅'); loadTests();
}
$('sec-add').onclick = async () => {
  const name = $('sec-name').value.trim(); if (!name) return alert('Naam daalo');
  const { error } = await sb.from('sections').insert({ name, position: secs.length + 1 });
  if (error) return alert(error.message); $('sec-name').value = ''; loadTests();
};
async function saveSec(id) {
  const { error } = await sb.from('sections').update({ name: $('sn-' + id).value.trim(), position: +$('sp-' + id).value || 0, link_url: ($('sl-' + id).value.trim() || null) }).eq('id', id);
  alert(error ? error.message : 'Saved ✅'); loadTests();
}
async function delSec(id) {
  if (!confirm('Section delete hoga. Uske tests delete nahi honge, bas "no section" ho jayenge. Pakka?')) return;
  await sb.from('sections').delete().eq('id', id); loadTests();
                                                        }

// ================= Solution image (UI inject) =================
(function () {
  const anchor = $('e-exh'); if (!anchor) return;
  const box = document.createElement('div');
  box.innerHTML = '<h4>Solution image (optional)</h4><input type="file" id="e-simg" accept="image/*"><img id="e-sprev" class="prev" style="display:none" alt=""><button type="button" class="btn-s ghost" id="e-srm" style="display:none">Solution image hatao</button>';
  anchor.insertAdjacentElement('afterend', box);
  $('e-srm').onclick = () => { solImg = null; $('e-simg').value = ''; showSolPrev(); };
  $('e-simg').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    $('e-msg').textContent = 'Solution image upload ho rahi hai...';
    const ext = (f.name.split('.').pop() || 'png').toLowerCase();
    const path = `sol-${cur.id}-${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('question-images').upload(path, f, { contentType: f.type });
    if (error) { $('e-msg').textContent = ''; return alert(error.message); }
    solImg = sb.storage.from('question-images').getPublicUrl(path).data.publicUrl;
    $('e-msg').textContent = 'Solution image upload ho gayi, Save dabao'; showSolPrev();
  };
})();
function showSolPrev() {
  const p = $('e-sprev'), r = $('e-srm'); if (!p) return;
  p.style.display = solImg ? '' : 'none'; r.style.display = solImg ? '' : 'none';
  if (solImg) p.src = solImg;
}

// ================= Excel / PPT download =================
const LET = ['A', 'B', 'C', 'D'];
function flash(t) {
  let d = $('flash');
  if (!d) { d = document.createElement('div'); d.id = 'flash'; d.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);background:#111;color:#fff;padding:10px 16px;border-radius:10px;z-index:99;font-size:14px'; document.body.appendChild(d); }
  d.textContent = t; d.style.display = t ? '' : 'none';
}
const safeSheet = s => String(s).replace(/[\\\/:*?"<>|\[\]]/g, '').trim().slice(0, 28) || 'Sheet';
const safeFile = s => String(s).replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '_') || 'file';
function qRows(qs) {
  // parse.js format: Hindi usi cell me English ke neeche (nayi line se)
  const both = (en, hi) => (hi && hi !== en) ? (en || '') + '\n' + hi : (en || '');
  return qs.map(q => ({
    question_text: both(q.q_text, q.q_text_hi),
    option_a: both((q.options || [])[0], (q.options_hi || [])[0]),
    option_b: both((q.options || [])[1], (q.options_hi || [])[1]),
    option_c: both((q.options || [])[2], (q.options_hi || [])[2]),
    option_d: both((q.options || [])[3], (q.options_hi || [])[3]),
    correct_answer: LET[q.correct_option] || '',
    explanation: both(q.explanation, q.explanation_hi),
    image_url: q.image_url || '',
    has_diagram: q.has_diagram ? 'yes' : '',
    solution_image_url: q.explanation_image_url || ''
  }));
}
async function fetchQs(ids) {
  const { data, error } = await sb.from('questions').select('*').in('test_id', ids).order('position');
  if (error) { alert(error.message); return null; }
  return data || [];
}
async function dlXlsx(id) {
  const t = allTests.find(x => x.id === id); if (!t) return;
  const qs = await fetchQs([id]); if (!qs) return;
  if (!qs.length) return alert('Is test mein questions nahi hain');
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qRows(qs)), safeSheet(t.title));
  XLSX.writeFile(wb, safeFile(t.title) + '.xlsx');
}
async function dlSecXlsx(secId) {
  const s = secs.find(x => x.id === secId);
  const ts = allTests.filter(t => t.section_id === secId);
  if (!ts.length) return alert('Is section mein koi test nahi hai');
  const qs = await fetchQs(ts.map(t => t.id)); if (!qs) return;
  const wb = XLSX.utils.book_new(), used = new Set(); let n = 0;
  ts.forEach(t => {
    const mine = qs.filter(q => q.test_id === t.id); if (!mine.length) return;
    let nm = safeSheet(t.title), k = 2;
    while (used.has(nm.toLowerCase())) nm = safeSheet(t.title).slice(0, 24) + '_' + k++;
    used.add(nm.toLowerCase());
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qRows(mine)), nm); n++;
  });
  if (!n) return alert('Is section ke tests mein questions nahi hain');
  XLSX.writeFile(wb, safeFile(s ? s.name : 'section') + '_all_tests.xlsx');
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if (window.PptxGenJS) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s);
  });
}
async function toData(url) {
  try {
    const r = await fetch(url); const b = await r.blob();
    return await new Promise(res => { const f = new FileReader(); f.onload = () => res(String(f.result).replace(/^data:/, '')); f.readAsDataURL(b); });
  } catch (e) { return null; }
}
function imgSize(d) {
  return new Promise(res => {
    if (typeof Image === 'undefined') return res(null);
    const i = new Image(); i.onload = () => res({ w: i.naturalWidth, h: i.naturalHeight }); i.onerror = () => res(null); i.src = 'data:' + d;
  });
}
async function buildPpt(P, t, qs, sub) {
  const p = new P(); p.layout = 'LAYOUT_WIDE'; p.title = t.title;
  let s = p.addSlide(); s.background = { color: 'FFFFFF' };
  s.addText(String(t.title).toUpperCase(), { x: 0.5, y: 1.5, w: 12.33, h: 1.7, align: 'center', valign: 'middle', fontSize: 48, bold: true, color: 'E11D1D', fontFace: 'Arial', fit: 'shrink' });
  if (sub) s.addText(sub, { x: 0.5, y: 3.3, w: 12.33, h: 1.2, align: 'center', valign: 'middle', fontSize: 40, bold: true, color: '16A34A', fontFace: 'Arial' });
  for (const q of qs) {
    s = p.addSlide(); s.background = { color: 'FFFFFF' };
    const runs = [{ text: String(q.q_text || ''), options: { fontFace: 'Calibri', fontSize: 20, breakLine: true } }];
    if (q.q_text_hi) runs.push({ text: String(q.q_text_hi), options: { fontFace: 'Mangal', fontSize: 20, breakLine: true } });
    s.addText(runs, { x: 0.4, y: 0.25, w: 12.5, h: 1.5, valign: 'top', color: '000000', margin: 0, fit: 'shrink' });
    s.addText((q.options || []).map(o => ({ text: String(o), options: { fontFace: 'Calibri', fontSize: 20, breakLine: true } })),
      { x: 0.4, y: 1.85, w: 6.5, h: 1.8, valign: 'top', color: '000000', margin: 0 });
    if (q.image_url) {
      const d = await toData(q.image_url);
      if (d) {
        const sz = (await imgSize(d)) || { w: 4, h: 3 };
        const maxW = 6.2, maxH = 3.5, k = Math.min(maxW / sz.w, maxH / sz.h);
        s.addImage({ data: d, x: 0.4, y: 3.8, w: sz.w * k, h: sz.h * k });
      }
    }
  }
  return p;
}
async function dlPpt(id) {
  const t = allTests.find(x => x.id === id); if (!t) return;
  const sub = prompt('Title ke neeche hari line likho (jaise DAY- 1). Nahi chahiye to khaali chhodo:', '');
  if (sub === null) return;
  flash('PPT ban rahi hai...');
  try {
    const qs = await fetchQs([id]); if (!qs) return flash('');
    if (!qs.length) { flash(''); return alert('Is test mein questions nahi hain'); }
    await loadScript('https://cdn.jsdelivr.net/npm/pptxgenjs@3.12.0/dist/pptxgen.bundle.js');
    const p = await buildPpt(window.PptxGenJS, t, qs, sub.trim());
    await p.writeFile({ fileName: safeFile(t.title) + '.pptx' });
    flash('');
  } catch (e) { flash(''); alert('PPT nahi bani: ' + (e.message || e)); }
}

// ================= Student reviews (login page par kaunsa dikhana hai) =================
(function () {
  const wrap = document.querySelector('.wrap') || document.body;
  const box = document.createElement('div'); box.className = 'box'; box.id = 'rv-box';
  box.innerHTML = '<h4>Student Reviews</h4><p style="font-size:13px;color:var(--muted);margin:4px 0 10px">Jis review par tick lagaoge wahi login page par dikhega.</p><div id="rv-list">Loading...</div>';
  wrap.appendChild(box); loadReviews();
})();
async function loadReviews() {
  const { data, error } = await sb.from('reviews').select('*').order('updated_at', { ascending: false });
  const el = $('rv-list'); if (!el) return;
  if (error) { el.textContent = 'Error: ' + error.message; return; }
  el.innerHTML = (data || []).map(r => `<div class="trow" style="align-items:flex-start;gap:10px">
    <div style="flex:1;min-width:200px"><div style="color:#f5b301;letter-spacing:2px">${'★'.repeat(r.stars)}<span style="color:#c9ced8">${'★'.repeat(5 - r.stars)}</span></div>
    <b>${esc(r.name)}</b><div style="font-size:14px">${esc(r.feedback || '(sirf stars)')}</div></div>
    <label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap"><input type="checkbox" ${r.show_on_login ? 'checked' : ''} onchange="rvShow('${r.id}', this.checked)" style="width:auto"> Login page par dikhao</label>
    <button class="btn-s red" onclick="rvDel('${r.id}')">Delete</button></div>`).join('') || 'Abhi koi review nahi aaya';
}
async function rvShow(id, v) {
  const { error } = await sb.from('reviews').update({ show_on_login: v }).eq('id', id);
  if (error) { alert(error.message); loadReviews(); }
}
async function rvDel(id) {
  if (!confirm('Ye review delete karein?')) return;
  const { error } = await sb.from('reviews').delete().eq('id', id);
  if (error) alert(error.message); loadReviews();
}
