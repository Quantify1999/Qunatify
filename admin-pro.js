// admin-pro.js : admin.js ke baad load hota hai. Cards+subcards, test rename/copy, section-wise time, sidebar items
(function () {
  const $ = id => document.getElementById(id);
  const top = () => secs.filter(s => !s.parent_id);
  let tcnt = {};
  const hint = e => /parent_id|nav_items|sec_cfg/.test(e.message || '') ? 'SQL migration (admin-upgrade.sql) Supabase me chalao.\n' + e.message : e.message;

  // ---------- cards + subcards ----------
  window.secOpts = function (sel) {
    let h = '';
    top().forEach(p => {
      h += `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>${esc(p.name)}</option>`;
      secs.filter(c => c.parent_id === p.id).forEach(c => h += `<option value="${c.id}"${c.id === sel ? ' selected' : ''}>&nbsp;&nbsp;↳ ${esc(p.name)} › ${esc(c.name)}</option>`);
    });
    return h;
  };
  const parOpts = (id, sel) => '<option value="">Main card</option>' + top().filter(p => p.id !== id).map(p => `<option value="${p.id}"${p.id === sel ? ' selected' : ''}>Subcard of ${esc(p.name)}</option>`).join('');
  window.renderSecs = function () {
    const sp = $('sec-par'); if (sp) sp.innerHTML = parOpts(null, null);
    const row = s => `<div class="trow" style="${s.parent_id ? 'margin-left:22px;border-left:3px solid var(--brand,#2f6fed)' : ''}">
      ${s.icon_url ? `<img src="${esc(s.icon_url)}" alt="" style="width:32px;height:32px;border-radius:8px;object-fit:cover">` : '<span style="font-size:22px">📘</span>'}
      <input type="text" id="sn-${s.id}" value="${esc(s.name)}" style="flex:1;min-width:140px;width:auto">
      <select id="sq-${s.id}" style="width:auto">${parOpts(s.id, s.parent_id)}</select>
      <label>Order <input type="number" id="sp-${s.id}" value="${s.position}"></label>
      <input type="url" id="sl-${s.id}" value="${esc(s.link_url || '')}" placeholder="Link (optional)" style="flex:1 1 160px;width:auto">
      <label class="btn-s ghost" style="cursor:pointer">🖼<input type="file" accept="image/*" hidden onchange="upIcon('${s.id}', this)"></label>
      <button class="btn-s ghost" onclick="dlSecXlsx('${s.id}')">📊</button>
      <button class="btn-s" onclick="saveSec('${s.id}')">Save</button><button class="btn-s red" onclick="delSec('${s.id}')">✕</button></div>`;
    $('sec-list').innerHTML = top().map(p => row(p) + secs.filter(c => c.parent_id === p.id).map(row).join('')).join('') || 'Koi card nahi';
  };
  window.saveSec = async function (id) {
    const { error } = await sb.from('sections').update({ name: $('sn-' + id).value.trim(), parent_id: $('sq-' + id).value || null, position: +$('sp-' + id).value || 0, link_url: $('sl-' + id).value.trim() || null }).eq('id', id);
    if (error) return alert(hint(error)); loadTests();
  };
  const sp = document.createElement('select'); sp.id = 'sec-par'; sp.style.width = 'auto'; $('sec-name').parentElement.insertBefore(sp, $('sec-add'));
  $('sec-add').onclick = async () => {
    const name = $('sec-name').value.trim(); if (!name) return alert('Naam daalo');
    const { error } = await sb.from('sections').insert({ name, parent_id: $('sec-par').value || null, position: secs.length + 1 });
    if (error) return alert(hint(error)); $('sec-name').value = ''; loadTests();
  };

  // ---------- tests ----------
  $('t-list').insertAdjacentHTML('beforebegin', '<div class="row"><input id="t-q" placeholder="🔍 Test dhundo" style="flex:1"><select id="t-f" style="width:auto"></select></div>');
  window.loadTests = async function () {
    const [{ data: tests }, { data: qs }, { data: sx }] = await Promise.all([sb.from('tests').select('*').is('deleted_at', null).order('created_at'), sb.from('questions').select('test_id'), sb.from('sections').select('*').order('position')]);
    allTests = tests || []; secs = sx || []; tcnt = {}; (qs || []).forEach(q => tcnt[q.test_id] = (tcnt[q.test_id] || 0) + 1); window.__tcnt = tcnt;
    $('t-sec').innerHTML = '<option value="">— Card chuno —</option>' + secOpts(null);
    $('t-f').innerHTML = '<option value="">Saare cards</option><option value="-">Bina card</option>' + secOpts(null);
    renderSecs();
    const opts = allTests.map(t => `<option value="${t.id}">${esc(t.title)} (${tcnt[t.id] || 0} Qs)</option>`).join('');
    const kM = $('m-test').value, kQ = $('q-test').value;
    $('q-test').innerHTML = '<option value="">— Test chuno —</option>' + opts; $('m-test').innerHTML = opts;
    if (kM) $('m-test').value = kM; if (kQ) $('q-test').value = kQ;
    renderTests(); loadQs();
  };
  window.renderTests = function () {
    const q = ($('t-q').value || '').toLowerCase(), f = $('t-f').value;
    const list = allTests.filter(t => (!q || t.title.toLowerCase().includes(q)) && (!f || (f === '-' ? !t.section_id : t.section_id === f)));
    $('t-list').innerHTML = list.map(t => `<div class="trow">
      <input id="ti-${t.id}" value="${esc(t.title)}" style="flex:1 1 220px;width:auto;min-width:150px">
      <small style="color:var(--muted)">${tcnt[t.id] || 0} Qs${t.sec_cfg ? ' · ⏱' + t.sec_cfg.length + ' sec' : ''}</small>
      <select id="s-${t.id}" style="width:auto"><option value="">(no card)</option>${secOpts(t.section_id)}</select>
      <label>Min <input type="number" id="d-${t.id}" value="${t.duration_min}"></label>
      <label>+ <input type="number" step="0.25" id="p-${t.id}" value="${t.pos_marks}"></label>
      <label>− <input type="number" step="0.25" id="n-${t.id}" value="${t.neg_marks}"></label>
      <button class="btn-s" onclick="saveTest('${t.id}')">Save</button>
      <button class="btn-s ghost" onclick="secTime('${t.id}')">⏱ Sections</button>
      <button class="btn-s ghost" onclick="tog('${t.id}','published',${!t.published})">${t.published ? '🟢 Live' : '⚪ Draft'}</button>
      <button class="btn-s ghost" onclick="tog('${t.id}','is_free',${!t.is_free})">${t.is_free ? 'FREE' : 'PAID'}</button>
      <button class="btn-s ghost" onclick="dupTest('${t.id}')">⧉</button><button class="btn-s ghost" onclick="moreTest('${t.id}')">⚙</button><button class="btn-s ghost" onclick="lbPdf('${t.id}')">🏆</button><button class="btn-s ghost" onclick="adTest('${t.id}')">📢</button>
      <button class="btn-s ghost" onclick="dlXlsx('${t.id}')">📊</button><button class="btn-s ghost" onclick="dlPpt('${t.id}')">📽</button>
      <button class="btn-s red" onclick="delTest('${t.id}')">✕</button></div>`).join('') || 'Koi test nahi';
  };
  $('t-q').oninput = $('t-f').onchange = renderTests;
  window.saveTest = async function (id) {
    const title = $('ti-' + id).value.trim(); if (!title) return alert('Naam khaali nahi ho sakta');
    const { error } = await sb.from('tests').update({ title, section_id: $('s-' + id).value || null, duration_min: +$('d-' + id).value || 60, pos_marks: +$('p-' + id).value, neg_marks: Math.abs(+$('n-' + id).value || 0) }).eq('id', id);
    if (error) return alert(error.message); loadTests();
  };
  window.dupTest = async function (id) {
    const t = allTests.find(x => x.id === id); if (!t) return;
    const { id: _i, created_at: _c, ...rest } = t;
    const { data: nt, error } = await sb.from('tests').insert({ ...rest, title: t.title + ' (Copy)', published: false }).select('id').single();
    if (error) return alert(error.message);
    const { data: qs } = await sb.from('questions').select('*').eq('test_id', id).order('position');
    const rows = (qs || []).map(({ id: _q, created_at: _d, ...q }) => ({ ...q, test_id: nt.id }));
    for (let i = 0; i < rows.length; i += 100) { const r = await sb.from('questions').insert(rows.slice(i, i + 100)); if (r.error) return alert(r.error.message); }
    loadTests();
  };

  // ---------- section-wise time (tests.sec_cfg = [{name,mins,n}]) ----------
  window.secTime = function (id) {
    const t = allTests.find(x => x.id === id); if (!t) return;
    const d = document.createElement('div'); d.className = 'modal on';
    d.innerHTML = `<div class="mbox"><h3>⏱ Section-wise time</h3><p style="font-size:12px;color:var(--muted)">${esc(t.title)} · Naam | Minutes | Kitne Qs. Sab khaali = lock nahi, total time upar wala.</p><div id="sc-rows"></div>
      <div class="row"><button class="btn-s ghost" id="sc-add" type="button">+ Section</button><span id="sc-sum" style="color:var(--muted)"></span></div>
      <div class="row" style="justify-content:flex-end"><button class="btn-s ghost" id="sc-x" type="button">Cancel</button><button class="btn-s" id="sc-s" type="button">Save</button></div></div>`;
    document.body.appendChild(d);
    const add = c => { const r = document.createElement('div'); r.className = 'row sc';
      r.innerHTML = `<input class="a" placeholder="Reasoning" value="${esc(c.name || '')}" style="flex:2"><input class="b" type="number" placeholder="Min" value="${c.mins || ''}" style="width:70px"><input class="c" type="number" placeholder="Qs" value="${c.n || ''}" style="width:70px"><button class="btn-s red" type="button">✕</button>`;
      r.querySelector('button').onclick = () => { r.remove(); sum(); }; r.oninput = sum; $('sc-rows').appendChild(r); };
    const sum = () => { const m = [...d.querySelectorAll('.sc .b')].reduce((a, i) => a + (+i.value || 0), 0); $('sc-sum').textContent = 'Total: ' + m + ' min'; };
    (t.sec_cfg || []).forEach(add); if (!(t.sec_cfg || []).length) add({}); sum();
    $('sc-add').onclick = () => add({}); $('sc-x').onclick = () => d.remove();
    $('sc-s').onclick = async () => {
      const cfg = [...d.querySelectorAll('.sc')].map(r => ({ name: r.querySelector('.a').value.trim(), mins: +r.querySelector('.b').value || 0, n: +r.querySelector('.c').value || 0 })).filter(c => c.name && c.mins > 0);
      if (cfg.length > 1) { const sn = cfg.reduce((a, c) => a + c.n, 0), tq = tcnt[id] || 0; if (sn !== tq && !confirm(`Sections ke Qs ka total ${sn} hai, test me ${tq} questions hain. Aise me section lock kaam nahi karega. Phir bhi save?`)) return; }
      const upd = { sec_cfg: cfg.length ? cfg : null }; if (cfg.length) upd.duration_min = cfg.reduce((a, c) => a + c.mins, 0);
      const { error } = await sb.from('tests').update(upd).eq('id', id);
      if (error) return alert(hint(error)); d.remove(); loadTests();
    };
  };

  // ---------- dashboard sidebar items ----------
  const nb = document.createElement('div'); nb.className = 'box'; nb.dataset.tab = 'nav';
  nb.innerHTML = `<h3>Dashboard sidebar (Settings/Rating ke saath)</h3>
    <div class="row"><button class="btn-s" id="nv-free">+ Free Tests</button><button class="btn-s" id="nv-paid">+ Paid Tests</button></div>
    <div class="row"><input id="nv-l" placeholder="Naam" style="flex:1"><input id="nv-i" placeholder="🔗" style="width:56px"><select id="nv-k" style="width:auto"><option value="section">Card kholo</option><option value="link">Link</option></select><select id="nv-s" style="width:auto"></select><input id="nv-u" placeholder="https://..." style="flex:1;display:none"><button class="btn-s" id="nv-add">Add</button></div>
    <div id="nv-list"></div>`;
  $('main').appendChild(nb);
  const nvk = () => { const L = $('nv-k').value === 'link'; $('nv-s').style.display = L ? 'none' : ''; $('nv-u').style.display = L ? '' : 'none'; $('nv-s').innerHTML = secOpts(null); };
  $('nv-k').onchange = nvk; setTimeout(nvk, 1500);
  const nvAdd = async o => { const { error } = await sb.from('nav_items').insert({ position: 10 + Math.floor(Date.now() / 1000) % 100000, ...o }); if (error) return alert(hint(error)); loadNav(); };
  $('nv-free').onclick = () => nvAdd({ label: 'Free Tests', icon: '🆓', kind: 'free' });
  $('nv-paid').onclick = () => nvAdd({ label: 'Paid Tests', icon: '💎', kind: 'paid' });
  $('nv-add').onclick = () => { const k = $('nv-k').value, l = $('nv-l').value.trim(); if (!l) return alert('Naam daalo');
    const tg = k === 'link' ? $('nv-u').value.trim() : $('nv-s').value; if (!tg) return alert('Card/link chuno');
    nvAdd({ label: l, icon: $('nv-i').value.trim() || '🔗', kind: k, target: tg }); $('nv-l').value = ''; };
  window.loadNav = async function () {
    const { data, error } = await sb.from('nav_items').select('*').order('position');
    if (error) { $('nv-list').textContent = hint(error); return; }
    $('nv-list').innerHTML = (data || []).map(n => `<div class="trow"><input id="ni-${n.id}" value="${esc(n.icon || '')}" style="width:56px"><input id="nl-${n.id}" value="${esc(n.label)}" style="flex:1;width:auto"><small style="color:var(--muted)">${esc(n.kind)}</small>
      <label>Order <input type="number" id="no-${n.id}" value="${n.position}"></label><label><input type="checkbox" id="nh-${n.id}" ${n.visible !== false ? 'checked' : ''} style="width:auto"> Dikhao</label>
      <button class="btn-s" onclick="nvSave('${n.id}')">Save</button><button class="btn-s red" onclick="nvDel('${n.id}')">✕</button></div>`).join('') || 'Abhi sirf default (Home, Settings, Rating)';
  };
  window.nvSave = async id => { const { error } = await sb.from('nav_items').update({ icon: $('ni-' + id).value.trim(), label: $('nl-' + id).value.trim(), position: +$('no-' + id).value || 0, visible: $('nh-' + id).checked }).eq('id', id); if (error) alert(error.message); else loadNav(); };
  window.nvDel = async id => { if (confirm('Hatayein?')) { await sb.from('nav_items').delete().eq('id', id); loadNav(); } };
  loadNav();
})();
