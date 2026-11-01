(function () {
  const $ = id => document.getElementById(id);
  const WORDS = ['', 'Bahut kharab', 'Theek nahi', 'Theek-thaak', 'Accha', 'Bahut badhiya'];
  let stars = 0;
  function show(type, t) { const m = $('rmsg'); m.className = 'msg ' + type; m.textContent = t; }
  function paint() {
    document.querySelectorAll('#stars button').forEach((b, i) => b.classList.toggle('on', i < stars));
    $('hint').textContent = stars ? stars + '/5 · ' + WORDS[stars] : 'Stars chuno';
  }
  $('stars').innerHTML = [1, 2, 3, 4, 5].map(n => `<button type="button" data-n="${n}" aria-label="${n} star">★</button>`).join('');
  document.querySelectorAll('#stars button').forEach(b => b.onclick = () => { stars = +b.dataset.n; paint(); });
  $('fb').oninput = () => { $('cn').textContent = $('fb').value.length; };

  $('send').onclick = async () => {
    if (!stars) return show('err', 'Pehle stars chuno');
    $('send').disabled = true;
    const { error } = await sb.rpc('submit_review', { p_stars: stars, p_feedback: $('fb').value.trim() });
    $('send').disabled = false;
    if (error) return show('err', 'Submit fail: ' + error.message);
    show('ok', 'Thank you! Aapka feedback mil gaya ✅');
  };

  (async () => {
    if (typeof sb === 'undefined' || typeof requireAuth !== 'function') return show('err', 'supabase.js load nahi hui');
    const s = await requireAuth(); if (!s) return;
    const { data } = await sb.from('reviews').select('stars,feedback').eq('user_id', s.user.id).maybeSingle();
    if (data) { stars = data.stars; $('fb').value = data.feedback || ''; $('cn').textContent = $('fb').value.length; paint(); }
  })();
})();
