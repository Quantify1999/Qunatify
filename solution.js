const T = qp('t');
let test, sols = [], atts = [], cur = null, idx = 0, lang = localStorage.getItem('q-lang') || 'en';
const mk = n => Number.isInteger(n * 10) ? Number(n).toFixed(1) : Number(n).toFixed(2);

(async () => {
  if (!await requireAuth()) return;
  if (!T) { location.href = 'dashboard.html'; return; }
  const [{ data: t }, { data: at }, { data: s }] = await Promise.all([
    sb.from('tests').select('title,pos_marks,neg_marks').eq('id', T).single(),
    sb.from('attempts').select('id,attempt_no,answers,q_times').eq('test_id', T).eq('status', 'submitted').order('attempt_no'),
    sb.rpc('get_solutions', { t: T })
  ]);
  if (!at || !at.length || !s || !s.length) { alert('Solutions test submit karne ke baad milte hain'); location.href = 'dashboard.html'; return; }
  test = t; atts = at; sols = s;
  cur = atts.find(x => x.id === qp('a')) || atts[0];
  idx = Math.min(Math.max((+qp('q') || 1) - 1, 0), sols.length - 1);
  $('ttl').textContent = test ? test.title : '';
  if (sols.some(x => x.q_text_hi)) $('lang').style.display = '';
  render();
})();

const status = q => { const v = (cur.answers || {})[q.id]; return v === undefined ? 'skip' : (v === q.correct_option ? 'ok' : 'bad'); };

function render() {
  const q = sols[idx], st = status(q), mine = (cur.answers || {})[q.id], L = lang === 'hi';
  const txt = (L && q.q_text_hi) || q.q_text, opts = (L && q.options_hi) || q.options, ex = (L && q.explanation_hi) || q.explanation;

  $('qno').textContent = idx + 1;
  $('qtime').textContent = mmss((cur.q_times || {})[q.id] || 0);
  $('chip').innerHTML = st === 'ok' ? `<span class="chip2 ok">Correct +${mk(+test.pos_marks)}</span>`
    : st === 'bad' ? `<span class="chip2 bad">Wrong −${mk(+test.neg_marks)}</span>` : '<span class="chip2 skip">Skipped</span>';
  $('qtext').innerHTML = esc(txt) + (q.image_url ? `<img src="${q.image_url}" alt="diagram">` : '');
  $('opts').innerHTML = opts.map((o, i) => {
    const c = i === q.correct_option ? ' ok' : (i === mine ? ' bad' : '');
    const tag = i === q.correct_option ? '<em>✔ Correct</em>' : (i === mine ? '<em>✘ Your answer</em>' : '');
    return `<div class="opt${c}"><span class="no">${i + 1}.</span><span>${esc(o)}</span>${tag}</div>`;
  }).join('');
  $('ex').innerHTML = ex ? `<div class="exb"><b>Solution</b><br>${esc(ex)}</div>` : '';

  // palette
  const cnt = { ok: 0, bad: 0, skip: 0 }; sols.forEach(x => cnt[status(x)]++);
  $('leg').innerHTML = `<span><i class="a"></i>Correct (${cnt.ok})</span><span><i class="v"></i>Wrong (${cnt.bad})</span><span><i></i>Skipped (${cnt.skip})</span>`;
  $('pgrid').innerHTML = sols.map((x, i) => { const s = status(x); return `<button class="pb${s === 'ok' ? ' a' : s === 'bad' ? ' v' : ''}${i === idx ? ' cur' : ''}" data-i="${i}">${i + 1}</button>`; }).join('');
  document.querySelectorAll('.pb').forEach(b => b.onclick = () => { idx = +b.dataset.i; render(); closePal(); window.scrollTo(0, 0); });
  $('attw').innerHTML = atts.length > 1 ? `<select id="asel" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--line);background:var(--card);color:var(--text)">${atts.map(x => `<option value="${x.id}"${x.id === cur.id ? ' selected' : ''}>Attempt ${x.attempt_no}</option>`).join('')}</select>` : '';
  if ($('asel')) $('asel').onchange = e => { cur = atts.find(x => x.id === e.target.value); render(); };

  $('back').href = 'result.html?a=' + cur.id;
  $('toRes').href = 'result.html?a=' + cur.id;
  $('toLb').href = 'leaderboard.html?t=' + T + '&a=' + cur.id;
  $('prev').disabled = idx === 0; $('next').disabled = idx === sols.length - 1;
  $('prev').style.opacity = idx === 0 ? .45 : 1; $('next').style.opacity = idx === sols.length - 1 ? .45 : 1;
}

const go = d => { const n = idx + d; if (n < 0 || n >= sols.length) return; idx = n; render(); window.scrollTo(0, 0); };
$('prev').onclick = () => go(-1); $('next').onclick = () => go(1);
addEventListener('keydown', e => { if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); });
$('lang').onclick = () => { lang = lang === 'en' ? 'hi' : 'en'; localStorage.setItem('q-lang', lang); render(); };

const openPal = () => { $('pal').classList.add('on'); $('bd').classList.add('on'); };
const closePal = () => { $('pal').classList.remove('on'); $('bd').classList.remove('on'); };
$('menu').onclick = openPal; $('pclose').onclick = closePal; $('bd').onclick = closePal;
