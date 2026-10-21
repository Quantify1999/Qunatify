const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(/\n/g, '<br>');
const pad = n => String(n).padStart(2, '0');
const mmss = s => { s = Math.max(0, s | 0); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); };
const num = n => (n === null || n === undefined || isNaN(n)) ? '-' : Number(n).toFixed(2).replace(/\.?0+$/, '');
const fmtK = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(n);
const fdate = d => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const qp = k => new URLSearchParams(location.search).get(k);
function tabs(on, t, a) {
  const q = a ? '&a=' + a : '';
  $('tabs').innerHTML = [['Analysis', a ? 'result.html?a=' + a : 'dashboard.html', 'a'], ['Solutions', 'solution.html?t=' + t + q, 's'], ['Leaderboard', 'leaderboard.html?t=' + t + q, 'l']]
    .map(([n, h, k]) => `<a href="${h}" class="${on === k ? 'on' : ''}">${n}</a>`).join('');
}
