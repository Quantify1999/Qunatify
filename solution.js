const T = qp('t'); let sols = [], atts = [], cur = null, filter = 'all', lang = localStorage.getItem('q-lang') || 'en';

(async () => {
  if (!await requireAuth()) return;
  if (!T) { location.href = 'dashboard.html'; return; }
  const [{ data: test }, { data: at }, { data: s }] = await Promise.all([
    sb.from('tests').select('title').eq('id', T).single(),
    sb.from('attempts').select('id,attempt_no,answers,q_times').eq('test_id', T).eq('status', 'submitted').order('attempt_no'),
    sb.rpc('get_solutions', { t: T })
  ]);
  if (!at || !at.length || !s || !s.length) { alert('Solutions submit karne ke baad milte hain'); location.href = 'dashboard.html'; return; }
  atts = at; sols = s; cur = atts.find(x => x.id === qp('a')) || atts[0];
  $('ttl').textContent = test ? test.title : 'Solutions';
  if (sols.some(x => x.q_text_hi)) { $('lang').style.display = ''; $('lang').onclick = () => { lang = lang === 'en' ? 'hi' : 'en'; localStorage.setItem('q-lang', lang); draw(); }; }
  draw();
})();

const status = q => { const v = (cur.answers || {})[q.id]; return v === undefined ? 'skip' : (v === q.correct_option ? 'ok' : 'bad'); };

function draw() {
  tabs('s', T, cur.id);
  const cnt = { all: sols.length, ok: 0, bad: 0, skip: 0 }; sols.forEach(q => cnt[status(q)]++);
  const names = { all: 'All', ok: 'Correct', bad: 'Wrong', skip: 'Skipped' };
  $('chips').innerHTML = Object.keys(names).map(k => `<button class="chp${filter === k ? ' on' : ''}" data-k="${k}">${names[k]} (${cnt[k]})</button>`).join('') +
    (atts.length > 1 ? `<select id="asel">${atts.map(x => `<option value="${x.id}"${x.id === cur.id ? ' selected' : ''}>Attempt ${x.attempt_no}</option>`).join('')}</select>` : '');
  document.querySelectorAll('.chp').forEach(b => b.onclick = () => { filter = b.dataset.k; draw(); });
  if ($('asel')) $('asel').onchange = e => { cur = atts.find(x => x.id === e.target.value); draw(); };

  const L = lang === 'hi';
  $('app').innerHTML = sols.map(q => ({ q, st: status(q) })).filter(x => filter === 'all' || x.st === filter).map(({ q, st }) => {
    const txt = (L && q.q_text_hi) || q.q_text, opts = (L && q.options_hi) || q.options, ex = (L && q.explanation_hi) || q.explanation;
    const mine = (cur.answers || {})[q.id], tm = (cur.q_times || {})[q.id] || 0;
    return `<div class="sc"><div class="sh"><span class="qn">${q.position}</span>
      <span class="tag2 ${st}">${{ ok: 'Correct', bad: 'Wrong', skip: 'Skipped' }[st]}</span><span style="margin-left:auto">⏱ ${mmss(tm)}</span></div>
      <div class="sq">${esc(txt)}${q.image_url ? `<img src="${q.image_url}" alt="diagram">` : ''}</div>
      ${opts.map((o, i) => `<div class="so ${i === q.correct_option ? 'ok' : (i === mine ? 'bad' : '')}"><span class="no">${i + 1}.</span><span>${esc(o)}</span>
        ${i === q.correct_option ? '<em>✔ Correct</em>' : (i === mine ? '<em>✘ Your answer</em>' : '')}</div>`).join('')}
      ${ex ? `<div class="ex"><b>Solution</b><br>${esc(ex)}</div>` : '<div style="height:6px"></div>'}</div>`;
  }).join('') || '<p style="color:var(--muted)">Is filter mein koi question nahi.</p>';
}
