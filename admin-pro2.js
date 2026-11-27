// admin-pro2.js : trash, schedule, leaderboard PDF, duplicate check, question bank
(function () {
  const $ = id => document.getElementById(id);
  const nk = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const tn = id => (allTests.find(t => t.id === id) || {}).title || '?';
  const mkBox = (tab, html, id) => { const b = document.createElement('div'); b.className = 'box'; b.dataset.tab = tab; if (id) b.id = id; b.innerHTML = html; $('main').appendChild(b); return b; };
  const loc = iso => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const iso = v => v ? new Date(v).toISOString() : null;

  // ---------- Trash (7 din) ----------
  mkBox('test', '<h3>🗑 Trash (7 din tak wapas la sakte ho)</h3><div id="tr-list">Loading...</div>');
  window.delTest = async id => {
    if (!confirm('Test Trash me jayega, 7 din tak restore ho sakta hai. Pakka?')) return;
    const { error } = await sb.from('tests').update({ deleted_at: new Date().toISOString(), published: false }).eq('id', id);
    if (error) return alert(error.message); loadTests(); loadTrash();
  };
  window.loadTrash = async () => {
    const old = new Date(Date.now() - 7 * 864e5).toISOString();
    await sb.from('tests').delete().lt('deleted_at', old);
    const { data, error } = await sb.from('tests').select('id,title,deleted_at').not('deleted_at', 'is', null).order('deleted_at', { ascending: false });
    if (error) { $('tr-list').textContent = 'SQL migration chalao: ' + error.message; return; }
    $('tr-list').innerHTML = (data || []).map(t => `<div class="trow"><b style="flex:1">${esc(t.title)}</b><small>${new Date(t.deleted_at).toLocaleDateString()}</small>
      <button class="btn-s" onclick="trRestore('${t.id}')">Restore</button><button class="btn-s red" onclick="trKill('${t.id}')">Hamesha delete</button></div>`).join('') || 'Trash khaali hai';
  };
  window.trRestore = async id => { await sb.from('tests').update({ deleted_at: null }).eq('id', id); loadTests(); loadTrash(); };
  window.trKill = async id => { if (confirm('Hamesha ke liye delete (questions aur attempts bhi)?')) { await sb.from('tests').delete().eq('id', id); loadTrash(); } };
  loadTrash();

  // ---------- Schedule / type / answer-key release ----------
  window.moreTest = id => {
    const t = allTests.find(x => x.id === id); if (!t) return;
    const d = document.createElement('div'); d.className = 'modal on';
    const types = ['', 'Full Mock', 'Sectional', 'Topic-wise', 'PYQ'];
    d.innerHTML = `<div class="mbox"><h3>⚙ ${esc(t.title)}</h3>
      <div class="row"><label>Type <select id="mo-t">${types.map(x => `<option${x === (t.test_type || '') ? ' selected' : ''}>${x}</option>`).join('')}</select></label></div>
      <div class="row"><label>Live hoga (start) <input type="datetime-local" id="mo-s" value="${loc(t.starts_at)}"></label></div>
      <div class="row"><label>Band hoga (end) <input type="datetime-local" id="mo-e" value="${loc(t.ends_at)}"></label></div>
      <div class="row"><label>Answer key kab khulegi <input type="datetime-local" id="mo-k" value="${loc(t.key_release_at)}"></label></div>
      <p style="font-size:12px;color:var(--muted)">Khaali = koi limit nahi.</p>
      <div class="row" style="justify-content:flex-end"><button class="btn-s ghost" id="mo-x" type="button">Cancel</button><button class="btn-s" id="mo-ok" type="button">Save</button></div></div>`;
    document.body.appendChild(d); $('mo-x').onclick = () => d.remove();
    $('mo-ok').onclick = async () => {
      const { error } = await sb.from('tests').update({ test_type: $('mo-t').value || null, starts_at: iso($('mo-s').value), ends_at: iso($('mo-e').value), key_release_at: iso($('mo-k').value) }).eq('id', id);
      if (error) return alert(error.message); d.remove(); loadTests();
    };
  };

  // ---------- Leaderboard PDF (seedha download; Hindi naam bhi sahi) ----------
  const loadJs = src => new Promise((ok, no) => { if (document.querySelector(`script[src="${src}"]`)) return ok(); const x = document.createElement('script'); x.src = src; x.onload = ok; x.onerror = () => no(new Error('PDF library load nahi hui (internet/CSP check karo)')); document.head.appendChild(x); });
  window.lbPdf = async id => {
    const t = allTests.find(x => x.id === id); if (!t) return;
    const lim = prompt('Top kitne students? (10 / 50 / all)', 'all'); if (lim === null) return;
    const msg = document.createElement('div'); msg.textContent = '⏳ Leaderboard PDF ban rahi hai...';
    msg.style.cssText = 'position:fixed;left:50%;top:14px;transform:translateX(-50%);background:#111;color:#fff;padding:10px 16px;border-radius:10px;z-index:9999;font-size:14px';
    document.body.appendChild(msg);
    try {
      const { data: at, error } = await sb.from('attempts').select('*').eq('test_id', id).eq('status', 'submitted').eq('attempt_no', 1);
      if (error) throw error;
      if (!at || !at.length) throw new Error('Koi submitted attempt nahi mila. Agar students ne test diya hai to admin-upgrade.sql dobara chalao.');
      const uk = ['user_id', 'profile_id', 'user'].find(k => k in at[0]);
      const ids = [...new Set(at.map(x => x[uk]).filter(Boolean))], names = {};
      for (let i = 0; i < ids.length; i += 80) { const { data } = await sb.from('profiles').select('id,name').in('id', ids.slice(i, i + 80)); (data || []).forEach(p => names[p.id] = p.name); }
      at.sort((x, y) => y.score - x.score || (x.time_taken || 0) - (y.time_taken || 0));
      const n = /^\d+$/.test(lim.trim()) ? +lim : at.length, tot = (tcnt[id] || 0) * t.pos_marks;
      const mm = s => Math.floor((s || 0) / 60) + ':' + String((s || 0) % 60).padStart(2, '0');
      const rows = at.slice(0, n).map((x, i) => { const att = x.correct + x.wrong; return `<tr style="${i === 0 ? 'background:#fff3c4;font-weight:700' : i === 1 ? 'background:#e8ecf2;font-weight:700' : i === 2 ? 'background:#f7e0cd;font-weight:700' : ''}"><td>${i + 1}</td><td style="text-align:left">${esc(names[x[uk]] || 'Student')}</td><td>${(+x.score).toFixed(2).replace(/\.?0+$/, '')}</td><td>${x.correct}</td><td>${x.wrong}</td><td>${x.unattempted}</td><td>${att ? Math.round(x.correct / att * 100) : 0}%</td><td>${mm(x.time_taken)}</td></tr>`; }).join('');
      await loadJs('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadJs('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;left:-10000px;top:0;width:794px;background:#fff;padding:28px;font:13px system-ui,sans-serif;color:#111;box-sizing:border-box';
      box.innerHTML = `<style>#lbx table{border-collapse:collapse;width:100%}#lbx th,#lbx td{border:1px solid #ccc;padding:6px 8px;text-align:center}#lbx th{background:#2f6fed;color:#fff}</style><div id="lbx"><div style="font-size:24px;font-weight:800;color:#2f6fed">Quantify</div><div style="font-size:18px;font-weight:700;margin:2px 0">${esc(t.title)} · Leaderboard</div><div style="color:#555;margin-bottom:12px">${at.length} students · Max marks ${tot} · ${new Date().toLocaleDateString('en-GB')}</div><table><tr><th>Rank</th><th>Naam</th><th>Score</th><th>Sahi</th><th>Galat</th><th>Skip</th><th>Accuracy</th><th>Time</th></tr>${rows}</table></div>`;
      document.body.appendChild(box);
      const canvas = await html2canvas(box, { scale: 2, backgroundColor: '#ffffff' }); box.remove();
      const pdf = new window.jspdf.jsPDF('p', 'pt', 'a4'), pw = pdf.internal.pageSize.getWidth(), ph = pdf.internal.pageSize.getHeight();
      const pageH = Math.floor(canvas.width * ph / pw); let y = 0, first = true;
      while (y < canvas.height) {
        const c2 = document.createElement('canvas'); c2.width = canvas.width; c2.height = Math.min(pageH, canvas.height - y);
        c2.getContext('2d').drawImage(canvas, 0, y, canvas.width, c2.height, 0, 0, canvas.width, c2.height);
        if (!first) pdf.addPage(); pdf.addImage(c2.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, c2.height * pw / canvas.width); y += pageH; first = false;
      }
      pdf.save((t.title || 'test').replace(/[^\w\u0900-\u097F]+/g, '-') + '-leaderboard.pdf');
      if (!Object.keys(names).length) alert('PDF ban gayi, par naam nahi mile ("Student" likha hai). admin-upgrade.sql chalao.');
    } catch (e) { alert('Leaderboard nahi bana: ' + (e.message || e)); }
    finally { msg.remove(); }
  };

  // ---------- Duplicate check (Excel upload) ----------
  const origUp = $('q-up').onclick;
  $('q-up').onclick = async () => {
    const tid = $('q-test').value;
    if (tid && rows && rows.length) {
      const { data } = await sb.from('questions').select('q_text').eq('test_id', tid);
      const seen = new Set((data || []).map(x => nk(x.q_text))), out = []; let dup = 0;
      rows.forEach(r => { const q = normRow(r); if (!q) return out.push(r); const k = nk(q.q_text); if (seen.has(k)) dup++; else { seen.add(k); out.push(r); } });
      if (dup) { if (!confirm(`${dup} duplicate questions mile (test me pehle se ya file me dobara). Unhe chhod kar baaki upload karein?`)) return; rows = out; }
    }
    return origUp();
  };

  // ---------- Question bank + bulk actions + duplicate finder ----------
  mkBox('q', `<h3>🏦 Question bank (saare tests)</h3>
    <div class="row"><input id="bq-s" placeholder="Question text" style="flex:1"><input id="bq-t" placeholder="Topic" style="width:110px"><select id="bq-f" style="width:auto"></select><button class="btn-s" id="bq-go">Search</button></div>
    <div id="bq-list" style="max-height:30vh;overflow:auto"></div>
    <div class="row"><select id="bq-to" style="width:auto"></select><button class="btn-s" id="bq-cp">Copy</button><button class="btn-s ghost" id="bq-mv">Move</button><button class="btn-s red" id="bq-del">Delete</button></div>
    <div class="row"><input id="bq-tp" placeholder="Topic set" style="width:110px"><button class="btn-s ghost" id="bq-stp">Set topic</button><select id="bq-df" style="width:auto"><option>easy</option><option>medium</option><option>hard</option></select><button class="btn-s ghost" id="bq-sdf">Set difficulty</button><button class="btn-s ghost" id="bq-dup">🔍 Duplicates (upar wale test me)</button></div>`);
  const sel = () => [...document.querySelectorAll('.bq:checked')].map(x => x.value);
  const fill = () => { const o = allTests.map(t => `<option value="${t.id}">${esc(t.title)}</option>`).join(''); $('bq-f').innerHTML = '<option value="">Saare tests</option>' + o; $('bq-to').innerHTML = o; };
  setInterval(() => { if ($('bq-f').options.length !== allTests.length + 1) fill(); }, 1500);
  $('bq-go').onclick = async () => {
    let q = sb.from('questions').select('id,test_id,position,q_text,topic,difficulty').order('test_id').order('position').limit(150);
    if ($('bq-s').value.trim()) q = q.ilike('q_text', '%' + $('bq-s').value.trim() + '%');
    if ($('bq-t').value.trim()) q = q.ilike('topic', '%' + $('bq-t').value.trim() + '%');
    if ($('bq-f').value) q = q.eq('test_id', $('bq-f').value);
    const { data, error } = await q; if (error) return alert(error.message);
    $('bq-list').innerHTML = (data || []).map(x => `<label class="qrow" style="display:flex;gap:8px;align-items:center"><input type="checkbox" class="bq" value="${x.id}" style="width:auto"><small style="color:var(--muted)">${esc(tn(x.test_id).slice(0, 22))} #${x.position}</small><span class="qt">${esc(String(x.q_text).slice(0, 70))}</span>${x.topic ? `<span class="tag">${esc(x.topic)}</span>` : ''}</label>`).join('') || 'Kuch nahi mila';
  };
  const need = () => { const s = sel(); if (!s.length) alert('Pehle questions tick karo'); return s; };
  $('bq-cp').onclick = async () => {
    const s = need(); if (!s.length) return; const to = $('bq-to').value;
    const { data } = await sb.from('questions').select('*').in('id', s); const { count } = await sb.from('questions').select('*', { count: 'exact', head: true }).eq('test_id', to);
    const rows2 = (data || []).map(({ id: _i, created_at: _c, ...q }, i) => ({ ...q, test_id: to, position: (count || 0) + i + 1 }));
    const r = await sb.from('questions').insert(rows2); alert(r.error ? r.error.message : rows2.length + ' questions copy ho gaye'); loadTests();
  };
  $('bq-mv').onclick = async () => {
    const s = need(); if (!s.length) return; const to = $('bq-to').value; const { count } = await sb.from('questions').select('*', { count: 'exact', head: true }).eq('test_id', to);
    await Promise.all(s.map((id, i) => sb.from('questions').update({ test_id: to, position: (count || 0) + i + 1 }).eq('id', id))); alert('Move ho gaye'); loadTests(); $('bq-go').onclick();
  };
  $('bq-del').onclick = async () => { const s = need(); if (!s.length || !confirm(s.length + ' questions delete honge (wapas nahi aayenge). Pakka?')) return; await sb.from('questions').delete().in('id', s); loadTests(); $('bq-go').onclick(); };
  $('bq-stp').onclick = async () => { const s = need(); if (s.length) { await sb.from('questions').update({ topic: $('bq-tp').value.trim() || null }).in('id', s); $('bq-go').onclick(); } };
  $('bq-sdf').onclick = async () => { const s = need(); if (s.length) { await sb.from('questions').update({ difficulty: $('bq-df').value }).in('id', s); alert('Ho gaya'); } };
  $('bq-dup').onclick = async () => {
    const tid = $('m-test').value; if (!tid) return alert('Upar "Questions edit" me test chuno');
    const { data } = await sb.from('questions').select('id,q_text,options,position').eq('test_id', tid).order('position');
    const seen = new Set(), extra = [];
    (data || []).forEach(q => { if (/^Q\.\d+$/.test(q.q_text)) return; const k = nk(q.q_text) + '|' + nk((q.options || []).join('|')); if (seen.has(k)) extra.push(q.id); else seen.add(k); });
    if (!extra.length) return alert('Koi duplicate nahi mila ✅ (image wale Q.1, Q.2 type questions check nahi hote)');
    if (confirm(`${extra.length} duplicate questions mile (pehla rakha jayega). Extra hata dein?`)) { await sb.from('questions').delete().in('id', extra); loadTests(); }
  };
})();
