const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let rows = null, cur = null, imgUrl = null, secs = [];

(async () => {
  if (!await requireAuth()) return;
  const { data } = await sb.from('profiles').select('is_admin').single();
  if (!data || !data.is_admin) { alert('Admin access nahi hai'); location.href = 'dashboard.html'; return; }
  $('main').style.display = '';
  loadTests();
})();

async function loadTests() {
  const { data: tests } = await sb.from('tests').select('*').order('created_at');
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
  cur = q; imgUrl = q.image_url;
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
    explanation: $('e-ex').value.trim() || null, explanation_hi: $('e-exh').value.trim() || null
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
  $('sec-list').innerHTML = secs.map(s => `<div class="trow"><input type="text" id="sn-${s.id}" value="${esc(s.name)}" style="flex:1;min-width:160px;width:auto">
    <label>Order <input type="number" id="sp-${s.id}" value="${s.position}"></label>
    <button class="btn-s" onclick="saveSec('${s.id}')">Save</button><button class="btn-s red" onclick="delSec('${s.id}')">Delete</button></div>`).join('') || 'Koi section nahi';
}
$('sec-add').onclick = async () => {
  const name = $('sec-name').value.trim(); if (!name) return alert('Naam daalo');
  const { error } = await sb.from('sections').insert({ name, position: secs.length + 1 });
  if (error) return alert(error.message); $('sec-name').value = ''; loadTests();
};
async function saveSec(id) {
  const { error } = await sb.from('sections').update({ name: $('sn-' + id).value.trim(), position: +$('sp-' + id).value || 0 }).eq('id', id);
  alert(error ? error.message : 'Saved ✅'); loadTests();
}
async function delSec(id) {
  if (!confirm('Section delete hoga. Uske tests delete nahi honge, bas "no section" ho jayenge. Pakka?')) return;
  await sb.from('sections').delete().eq('id', id); loadTests();
                                                        }
  
