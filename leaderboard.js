(async () => {
  const s = await requireAuth(); if (!s) return;
  const T = qp('t'); if (!T) { location.href = 'dashboard.html'; return; }
  const uid = s.user.id;
  const [{ data: test }, { data: top }, { data: mine }, { data: first }] = await Promise.all([
    sb.from('tests').select('title').eq('id', T).single(),
    sb.from('leaderboard').select('*').eq('test_id', T).order('rank').order('time_taken').limit(50),
    sb.from('leaderboard').select('*').eq('test_id', T).eq('user_id', uid),
    sb.from('attempts').select('id').eq('test_id', T).eq('attempt_no', 1).eq('status', 'submitted')
  ]);
  $('ttl').textContent = test ? test.title : 'Leaderboard';
  tabs('l', T, first && first[0] ? first[0].id : null);
  if (!first || !first.length) { $('app').textContent = 'Leaderboard dekhne ke liye pehle test submit karo.'; return; }

  const medal = r => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : r;
  const row = x => `<tr class="${x.user_id === uid ? 'me' : ''}"><td class="rk">${medal(x.rank)}</td><td>${esc(x.name || 'Student')}${x.user_id === uid ? ' (You)' : ''}</td><td>${num(x.score)}</td><td>${x.correct}</td><td>${mmss(x.time_taken)}</td></tr>`;
  const inTop = (top || []).some(x => x.user_id === uid);
  $('app').innerHTML = `<table class="lt"><thead><tr><th>Rank</th><th>Name</th><th>Score</th><th>Correct</th><th>Time</th></tr></thead><tbody>
    ${(top || []).map(row).join('')}
    ${!inTop && mine && mine[0] ? `<tr><td colspan="5" style="text-align:center;color:var(--muted)">• • •</td></tr>${row(mine[0])}` : ''}</tbody></table>`;
})();
