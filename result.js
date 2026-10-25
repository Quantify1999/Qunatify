(async () => {
  if (!await requireAuth()) return;
  const a = qp('a'); if (!a) { location.href = 'dashboard.html'; return; }
  const { data: at } = await sb.from('attempts').select('*').eq('id', a).single();
  if (!at || at.status !== 'submitted') { location.href = 'dashboard.html'; return; }
  const [{ data: test }, { data: st }, { data: rs }, { data: all }] = await Promise.all([
    sb.from('tests').select('*').eq('id', at.test_id).single(),
    sb.from('test_stats').select('*').eq('test_id', at.test_id).single(),
    sb.rpc('result_stats', { a }),
    sb.from('attempts').select('id,attempt_no,status').eq('test_id', at.test_id).order('attempt_no')
  ]);
  const r = (rs && rs[0]) || {};
  const first = (all || []).find(x => x.attempt_no === 1);
  $('ttl').textContent = test.title;
  tabs('a', at.test_id, a);

  const sc = +at.score, tot = st.q_count * test.pos_marks;
  const attempted = at.correct + at.wrong;
  const acc = attempted ? at.correct / attempted * 100 : 0;
  const canRe = (all || []).length === 1 && at.attempt_no === 1;
  const pct = tot > 0 ? Math.max(0, Math.min(100, sc / tot * 100)) : 0;
  const line = (ico, cls, lbl, val) => `<div class="ln"><span class="ico ${cls}">${ico}</span><b>${lbl}</b><span class="v" style="font-size:17px">${val}</span></div>`;

  $('app').innerHTML = `
    ${canRe ? `<a class="reat" href="test.html?id=${test.id}" onclick="return confirm('Reattempt sirf 1 baar milta hai. Shuru karein?')">Reattempt Test ➜</a>` : ''}
    ${at.attempt_no === 2 ? `<div class="note">Ye aapka reattempt hai. Rank, percentile, average aur best score <b>original attempt</b> par based hain. <a href="result.html?a=${first.id}">Original result dekho</a></div>` : ''}
    <div class="qsh">QUICK SUMMARY</div>
    <div class="c1"><span class="ico r">🏁</span><b>Rank</b><span class="v">${r.rnk ?? '-'}<small>/${r.total ?? st.participants}</small></span></div>
    <div class="c2">
      <div class="r1"><span class="ico">🏆</span><b>Score</b><span class="v">${num(sc)}<small>/${num(tot)}</small></span></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
      <div class="r2"><span>Average Score: <b>${num(r.avg_score)}</b></span><span>Best Score: <b>${num(r.best_score)}</b></span></div>
    </div>
    <div class="c3">
      ${line('📊', '', 'Percentile', num(r.percentile) + ' %')}
      ${line('🎯', 'g', 'Accuracy', num(acc) + ' %')}
      ${line('📝', 'b', 'Qs. Attempted', `${attempted}<small>/${st.q_count}</small>`)}
    </div>
    <div class="qsh">DETAILED BREAKDOWN</div>
    <div class="c3">
      ${line('✅', 'g', 'Correct', at.correct)}
      ${line('❌', 'r', 'Wrong', at.wrong)}
      ${line('⏭', 'o', 'Unattempted', at.unattempted)}
      ${line('⏱', 'b', 'Time Taken', `${mmss(at.time_taken)}<small> / ${test.duration_min}:00 min</small>`)}
    </div>
    <p style="font-size:12px;color:var(--muted);text-align:center">Marking: +${num(test.pos_marks)} sahi, −${num(test.neg_marks)} galat</p>`;
})();
