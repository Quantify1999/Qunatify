const T = qp('t');
let showAns = localStorage.getItem('q-showans') !== '0';
let test, sols = [], atts = [], cur = null, idx = 0, stats = {}, lang = localStorage.getItem('q-lang') || 'en';
const mk = n => Number.isInteger(n * 10) ? Number(n).toFixed(1) : Number(n).toFixed(2);
const tfmt = s => { s = Math.max(0, Math.round(s)); return s < 60 ? s + 'sec' : mmss(s); };

(async () => {
  if (!await requireAuth()) return;
  if (!T) { location.href = 'dashboard.html'; return; }
  const [{ data: t }, { data: at }, { data: s }, st] = await Promise.all([
    sb.from('tests').select('title,pos_marks,neg_marks').eq('id', T).single(),
    sb.from('attempts').select('id,attempt_no,answers,q_times').eq('test_id', T).eq('status', 'submitted').order('attempt_no'),
    sb.rpc('get_solutions', { t: T }),
    sb.rpc('question_stats', { t: T })
  ]);
  if (!at || !at.length || !s || !s.length) { alert('Solutions test submit karne ke baad milte hain'); location.href = 'dashboard.html'; return; }
  test = t; atts = at; sols = s;
  ((st && st.data) || []).forEach(x => stats[x.qid] = x);
  cur = atts.find(x => x.id === qp('a')) || atts[0];
  idx = Math.min(Math.max((+qp('q') || 1) - 1, 0), sols.length - 1);
  $('ttl').textContent = test ? test.title : '';
  $('showans').checked = showAns;
  if (sols.some(x => x.q_text_hi)) { $('lang').style.display = ''; $('langsel').dataset.on = '1'; $('langsel').value = lang; }
  render();
})();

const status = q => { const v = (cur.answers || {})[q.id]; return v === undefined ? 'skip' : (v === q.correct_option ? 'ok' : 'bad'); };

function render() {
  const q = sols[idx], st = status(q), mine = (cur.answers || {})[q.id], L = lang === 'hi', sx = stats[q.id];
  const txt = (L && q.q_text_hi) || q.q_text, opts = (L && q.options_hi) || q.options, ex = (L && q.explanation_hi) || q.explanation;

  // header row (status + time + avg + marks) -- hamesha dikhta hai
  $('qno').textContent = idx + 1; $('qno').className = 'qn ' + st;
  $('qtime').textContent = tfmt((cur.q_times || {})[q.id] || 0);
  $('avg').textContent = sx && sx.avg_time !== null && sx.avg_time !== undefined ? 'Avg ' + tfmt(+sx.avg_time) : '';
  $('mks').innerHTML = `<span class="p">+${mk(+test.pos_marks)}</span><span class="n">−${mk(+test.neg_marks)}</span>`;
  $('chip').innerHTML = st === 'ok' ? '<span class="chip2 ok">Correct</span>' : st === 'bad' ? '<span class="chip2 bad">Wrong</span>' : '<span class="chip2 skip">Skipped</span>';

  $('qtext').innerHTML = esc(txt) + (q.image_url ? `<img src="${q.image_url}" alt="diagram">` : '');

  // options: Show Answer OFF => bilkul neutral (na apna answer, na sahi answer)
  $('opts').innerHTML = opts.map((o, i) => {
    const c = !showAns ? '' : (i === q.correct_option ? ' ok' : (i === mine ? ' bad' : ''));
    const tag = !showAns ? '' : (i === q.correct_option ? '<em>✔ Correct</em>' : (i === mine ? '<em>✘ Your answer</em>' : ''));
    return `<div class="opt${c}"><span class="no">${i + 1}.</span><span>${esc(o)}</span>${tag}</div>`;
  }).join('');

  // % got this right (hamesha) + Correct option number (sirf Show Answer ON)
  const pct = sx && sx.pct_correct !== null && sx.pct_correct !== undefined ? `<b>${Math.round(sx.pct_correct)}%</b> got this right` : '';
  $('stat').innerHTML = `<span>${showAns ? `Correct Answers Is: <b>${q.correct_option + 1}</b>` : ''}</span><span>${pct}</span>`;
  $('ex').innerHTML = (showAns && ex) ? `<div class="exb"><b>Solution</b><br>${esc(ex)}</div>` : '';

  // palette + top strip: correct/wrong/skipped hamesha
  const cnt = { ok: 0, bad: 0, skip: 0 }; sols.forEach(x => cnt[status(x)]++);
  $('leg').innerHTML = `<span><i class="a"></i>Correct (${cnt.ok})</span><span><i class="v"></i>Wrong (${cnt.bad})</span><span><i></i>Skipped (${cnt.skip})</span>`;
  $('pgrid').innerHTML = sols.map((x, i) => { const s = status(x); return `<button class="pb${s === 'ok' ? ' a' : s === 'bad' ? ' v' : ''}${i === idx ? ' cur' : ''}" data-i="${i}">${i + 1}</button>`; }).join('');
  document.querySelectorAll('.pb').forEach(b => b.onclick = () => { idx = +b.dataset.i; render(); closePal(); window.scrollTo(0, 0); });
  $('strip').innerHTML = sols.map((x, i) => `<button class="sc2 ${status(x)}${i === idx ? ' cur' : ''}" data-i="${i}">${i + 1}</button>`).join('');
  document.querySelectorAll('.sc2').forEach(b => b.onclick = () => { idx = +b.dataset.i; render(); window.scrollTo(0, 0); });
  const c = $('strip').querySelector('.cur'); if (c) c.scrollIntoView({ inline: 'center', block: 'nearest' });

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
function setLang(l) { lang = l; localStorage.setItem('q-lang', l); $('langsel').value = l; render(); }
$('lang').onclick = () => setLang(lang === 'en' ? 'hi' : 'en');
$('langsel').onchange = e => setLang(e.target.value);
$('showans').onchange = e => { showAns = e.target.checked; localStorage.setItem('q-showans', showAns ? '1' : '0'); render(); };

const openPal = () => { $('pal').classList.add('on'); $('bd').classList.add('on'); };
const closePal = () => { $('pal').classList.remove('on'); $('bd').classList.remove('on'); };
$('menu').onclick = openPal; $('pclose').onclick = closePal; $('bd').onclick = closePal;
