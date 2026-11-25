const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtK = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
const num = n => Number(n).toFixed(2).replace(/\.?0+$/, '');
document.querySelectorAll('.out').forEach(b => b.onclick = async () => { await sb.auth.signOut(); location.href = 'login.html'; });

(async () => {
  const s = await requireAuth(); if (!s) return;
  const uid = s.user.id;
  const [t, p, a, me, ts, lb, sx, nv] = await Promise.all([
    sb.from('tests').select('*').eq('published', true).is('deleted_at', null).order('created_at'),
    sb.from('purchases').select('id').eq('status', 'paid').limit(1),
    sb.from('attempts').select('id,test_id,attempt_no,status,score,submitted_at').order('attempt_no'),
    sb.from('profiles').select('name,is_admin,avatar_url').eq('id', uid).single(),
    sb.from('test_stats').select('*'),
    sb.rpc('my_ranks'),
    sb.from('sections').select('*').order('position'),
    sb.from('nav_items').select('*').order('position')
  ]);
  const paid = (p.data || []).length > 0;
  const tests = t.data || [];
  const S = {}; (ts.data || []).forEach(x => S[x.test_id] = x);
  const R = {}; (lb.data || []).forEach(x => R[x.test_id] = x.rnk);
  let uname = '';
  if (me.data) {
    uname = me.data.name || '';
    if (me.data.is_admin) document.querySelectorAll('.adm').forEach(e => e.style.display = '');
    document.getElementById('av').innerHTML = me.data.avatar_url ? `<img src="${esc(me.data.avatar_url)}" alt="">` : esc((uname || 'Q').trim().charAt(0).toUpperCase() || 'Q');
  }

  const navHref = n => n.kind === 'free' ? 'dashboard.html?v=free' : n.kind === 'paid' ? 'dashboard.html?v=paid' : n.kind === 'section' ? 'dashboard.html?s=' + encodeURIComponent(n.target || '') : (n.target || '#');
  (nv.data || []).filter(n => n.visible !== false).forEach(n => document.querySelectorAll('.rail,.bnav').forEach(el => {
    const out = el.querySelector('.out'); if (!out) return;
    out.insertAdjacentHTML('beforebegin', `<a class="ri" href="${esc(navHref(n))}"><span class="i">${esc(n.icon || '🔗')}</span>${esc(n.label)}</a>`);
  }));
  const secs = sx.data || [];
  const hasOther = tests.some(x => !x.section_id || !secs.find(y => y.id === x.section_id));
  const chips = secs.filter(x => !x.parent_id).map(x => ({ id: x.id, name: x.name, icon: x.icon_url, link: x.link_url || null })).concat(hasOther ? [{ id: 'other', name: 'Other', icon: null }] : []);
  const allc = chips.concat(secs.filter(x => x.parent_id).map(x => ({ id: x.id, name: x.name, icon: x.icon_url, link: null, parent: x.parent_id })));
  const inSec = (test, id) => id === 'other' ? (!test.section_id || !secs.find(y => y.id === test.section_id)) : test.section_id === id;

  const view = document.getElementById('view'), crumb = document.getElementById('crumb'), hi = document.getElementById('hi');

  function showHome() {
    crumb.innerHTML = '';
    hi.textContent = 'Hi ' + uname + ' 👋';
    if (!chips.length) { view.innerHTML = '<p style="color:var(--muted)">Abhi koi section nahi hai. Jaldi aayenge!</p>'; return; }
    view.innerHTML = `<div class="mhead"><h3>Modules</h3><small>${chips.length}</small></div>
      <div class="mgrid">${chips.map(c => `<button class="mc" type="button" data-id="${esc(c.id)}" aria-label="${esc(c.name)}">${c.link ? '<span class="mlink">↗</span>' : ''}${c.icon ? `<img src="${esc(c.icon)}" alt="${esc(c.name)}">` : `<span class="mcn">${esc(c.name)}</span>`}</button>`).join('')}</div>`;
    view.querySelectorAll('.mc').forEach(b => b.onclick = () => { const c = chips.find(x => x.id === b.dataset.id); c && c.link ? openLink(c.link) : go(b.dataset.id); });
  }

  function showSec(c) {
    const shown = tests.filter(x => inSec(x, c.id));
    const par = c.parent ? chips.find(x => x.id === c.parent) : null, kids = secs.filter(x => x.parent_id === c.id);
    crumb.innerHTML = `<a id="cHome">Home</a> › ${par ? `<a id="cPar">${esc(par.name)}</a> › ` : ''}<b>${esc(c.name)}</b>`;
    document.getElementById('cHome').onclick = () => go(null);
    if (par) document.getElementById('cPar').onclick = () => go(par.id);
    hi.textContent = '';
    view.innerHTML = `${kids.length ? `<div class="mhead"><h3>Sub-sections</h3><small>${kids.length}</small></div><div class="mgrid">${kids.map(k => `<button class="mc" type="button" data-id="${esc(k.id)}"><span class="mcn">${esc(k.name)}</span></button>`).join('')}</div>` : ''}<div class="mhead"><h3>${esc(c.name)}</h3><small>${shown.length} tests</small></div><div class="tgrid" id="list"></div>`;
    const list = document.getElementById('list');
    view.querySelectorAll('.mc').forEach(b => b.onclick = () => go(b.dataset.id));
    if (!shown.length && kids.length) { list.remove(); return; }
    if (!shown.length) { list.innerHTML = '<p style="color:var(--muted)">Is section mein abhi koi test nahi hai. Jaldi aayenge!</p>'; return; }
    list.innerHTML = shown.map(testCard).join('');
  }

  function testCard(test) {
    const st = S[test.id] || { q_count: 0, participants: 0, has_hi: false };
    const total = st.q_count * test.pos_marks;
    const locked = !test.is_free && !paid;
    const my = (a.data || []).filter(x => x.test_id === test.id);
    const open = my.find(x => x.status !== 'submitted');
    const done = my.filter(x => x.status === 'submitted');
    const first = done.find(x => x.attempt_no === 1);
    const badge = test.is_free ? '<span class="bg2 free">FREE</span>' : (locked ? '<span class="bg2 paid">🔒 PAID</span>' : '<span class="bg2 unl">UNLOCKED</span>');
    const info = `${st.q_count} Qs · ${test.duration_min} mins · ${num(total)} Marks`;
    const lang = (test.test_type ? test.test_type + ' · ' : '') + (st.has_hi ? 'English, Hindi' : 'English');
    const upc = test.starts_at && new Date(test.starts_at) > Date.now(), over = test.ends_at && new Date(test.ends_at) < Date.now();
    if ((upc || over) && !my.length) return `<div class="tc"><div class="bd2">${badge}<h4>${esc(test.title)}</h4><div class="mt"><span>${info}</span><span>${upc ? '🕒 ' + new Date(test.starts_at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Ended'}</span></div></div><div class="ft"><span>${lang}</span></div></div>`;
    let mid, foot;
    if (locked) {
      mid = `<span>${info}</span><button onclick="unlock()">Unlock</button>`; foot = `<span>${lang}</span>`;
    } else if (open) {
      mid = `<span>${info}</span><a href="test.html?id=${test.id}">▶ Resume</a>`;
      foot = `<span>${open.status === 'paused' ? 'Paused' : 'In progress'}${first ? ' (reattempt)' : ''}</span>` + (first ? `<a href="result.html?a=${first.id}">View Results</a>` : '');
    } else if (!first) {
      mid = `<span>${info}</span><a href="test.html?id=${test.id}">Start Test</a>`; foot = `<span>${lang}</span>`;
    } else {
      const rk = R[test.id] ? ` · ${fmtK(R[test.id])}/${fmtK(st.participants)} Rank` : '';
      const pct = total > 0 ? Math.max(0, Math.min(100, first.score / total * 100)) : 0;
      mid = `<span>${num(first.score)}/${num(total)} Marks${rk}</span><a href="result.html?a=${first.id}">View Results</a>`;
      const re = done.length === 1
        ? `<a href="test.html?id=${test.id}" onclick="return confirm('Reattempt sirf 1 baar milta hai. Shuru karein?')">Reattempt ➜</a>`
        : `<a href="result.html?a=${done[1].id}">Reattempt result ➜</a>`;
      foot = `<span>Attempted on ${new Date(first.submitted_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>${re}`;
      return `<div class="tc"><div class="bd2">${badge}<h4>${esc(test.title)}</h4><div class="mt">${mid}</div><div class="pb2"><i style="width:${pct}%"></i></div></div><div class="ft">${foot}</div></div>`;
    }
    return `<div class="tc"><div class="bd2">${badge}<h4>${esc(test.title)}</h4><div class="mt">${mid}</div></div><div class="ft">${foot}</div></div>`;
  }

  function showFilter(v) {
    const shown = tests.filter(x => v === 'free' ? x.is_free : !x.is_free), nm = v === 'free' ? 'Free Tests' : 'Paid Tests';
    crumb.innerHTML = '<a id="cHome">Home</a> › <b>' + nm + '</b>';
    document.getElementById('cHome').onclick = () => go(null);
    hi.textContent = '';
    view.innerHTML = `<div class="mhead"><h3>${nm}</h3><small>${shown.length} tests</small></div><div class="tgrid">${shown.map(testCard).join('') || '<p style="color:var(--muted)">Abhi koi test nahi hai.</p>'}</div>`;
  }
  function route() {
    const v = new URLSearchParams(location.search).get('v');
    if (v === 'free' || v === 'paid') return showFilter(v);
    const id = new URLSearchParams(location.search).get('s');
    const c = id && allc.find(x => x.id === id);
    c ? showSec(c) : showHome();
  }
  function go(id) {
    history.pushState({}, '', id ? 'dashboard.html?s=' + encodeURIComponent(id) : 'dashboard.html');
    route(); window.scrollTo(0, 0);
  }
  addEventListener('popstate', route);
  route();
})();

function unlock() {
  if (window.startPayment) startPayment();
  else alert('Payment module (payment.js) abhi add hona baaki hai');
}

// Telegram / external link: phone par app khulega, laptop par Telegram Web
function openLink(url) {
  let u = String(url || '').trim();
  if (!/^https?:\/\//i.test(u)) return;
  const desktop = !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const m = u.match(/^https?:\/\/(?:t\.me|telegram\.me)\/([^?#]+)/i);
  if (m && desktop) {
    const p = m[1].replace(/\/$/, '');
    if (p[0] === '+') u = 'https://web.telegram.org/k/#?tgaddr=' + encodeURIComponent('tg://join?invite=' + p.slice(1));
    else if (/^joinchat\//i.test(p)) u = 'https://web.telegram.org/k/#?tgaddr=' + encodeURIComponent('tg://join?invite=' + p.slice(9));
    else u = 'https://web.telegram.org/k/#@' + p.split('/')[0];
  }
  window.open(u, '_blank', 'noopener');
    }
    
