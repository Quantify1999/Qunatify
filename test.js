const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(/\n/g, '<br>');
const pad = n => String(n).padStart(2, '0');
const hms = s => { s = Math.max(0, s | 0); return pad(Math.floor(s / 3600)) + ':' + pad(Math.floor(s % 3600 / 60)) + ':' + pad(s % 60); };
const ms = s => { s = Math.max(0, s | 0); return pad(Math.floor(s / 60)) + ':' + pad(s % 60); };
const mk = n => Number.isInteger(n * 10) ? Number(n).toFixed(1) : Number(n).toFixed(2);

let secName = 'Maths';
let test, att, qs = [], idx = 0, ans = {}, qt = {}, marked = new Set(), bm = new Set();
let rem = 0, last = 0, active = false, done = false, hasHi = false, lang = localStorage.getItem('q-lang') || 'en';

const pack = () => Object.assign({}, ans, { _m: [...marked], _b: [...bm] });
const save = pause => sb.rpc('save_attempt', { a: att.id, ans: pack(), qt, rem, pause: !!pause });
function toast(t) { const e = $('toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(toast.t); toast.t = setTimeout(() => e.style.display = 'none', 1800); }

(async () => {
  if (!await requireAuth()) return;
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.href = 'dashboard.html'; return; }
  const [{ data: t }, { data: a, error }, { data: q }, { data: pf }] = await Promise.all([
    sb.from('tests').select('*, sections(name)').eq('id', id).single(),
    sb.rpc('start_attempt', { t: id }),
    sb.from('questions_public').select('*').eq('test_id', id).order('position'),
    sb.from('profiles').select('name').single()
  ]);
  if (error) {
    alert(/locked/.test(error.message) ? 'Ye test locked hai, pehle unlock karo.' : /no attempts/.test(error.message) ? 'Is test ke attempts khatam ho gaye.' : error.message);
    location.href = 'dashboard.html'; return;
  }
  if (!t) { alert('Test nahi mila'); location.href = 'dashboard.html'; return; }
  test = t; att = a;
  if (!q || !q.length) { alert('Is test mein abhi questions nahi hain'); location.href = 'dashboard.html'; return; }
  qs = q; hasHi = q.some(x => x.q_text_hi);
  const sv = att.answers || {};
  marked = new Set(sv._m || []); bm = new Set(sv._b || []);
  Object.keys(sv).forEach(k => { if (k[0] !== '_') ans[k] = sv[k]; });
  qt = att.q_times || {};
  rem = att.remaining_sec ?? test.duration_min * 60;
  secName = (t.sections && t.sections.name) || 'Maths';
  ['ttl', 'ttl2', 'ttl3'].forEach(i => $(i).textContent = test.title);
  $('cand').textContent = 'Candidate: ' + ((pf && pf.name) || '');
  $('ptab').textContent = secName; $('secname').textContent = secName;
  if (hasHi) { $('lang').style.display = ''; $('langsel').dataset.on = '1'; $('langsel').value = lang; }
  $('leg').innerHTML = '<span><i class="a"></i>Answered</span><span><i class="v"></i>Not Answered</span><span><i class="m"></i>Marked</span><span><i></i>Not Visited</span>';
  go(0); last = Date.now(); active = true;
  setInterval(tick, 1000);
  setInterval(() => { if (active && !done) save(false); }, 10000);
})();

function tick() {
  if (!active || done) return;
  const dt = Math.floor((Date.now() - last) / 1000);
  if (dt < 1) return;
  last += dt * 1000;
  rem -= dt;
  const id = qs[idx].id; qt[id] = (qt[id] || 0) + dt;
  paint();
  if (rem <= 0) { rem = 0; toast('Time up! Test submit ho raha hai'); doSubmit(); }
}
function paint() { $('timer').textContent = hms(rem); $('qtime').textContent = ms(qt[qs[idx].id] || 0); }

function go(i) {
  idx = i; const q = qs[i];
  if (qt[q.id] === undefined) qt[q.id] = 0;
  render();
}
function pick(q, l) { // language fallback
  return (l === 'hi' && q.q_text_hi) ? { t: q.q_text_hi, o: q.options_hi || q.options } : { t: q.q_text, o: q.options };
}
function render() {
  const q = qs[idx], v = pick(q, lang);
  $('qno').textContent = idx + 1; $('qh').textContent = idx + 1;
  $('mks').innerHTML = `<span class="p">+${mk(+test.pos_marks)}</span><span class="n">−${mk(+test.neg_marks)}</span>`;
  $('star').textContent = bm.has(q.id) ? '★' : '☆'; $('star').classList.toggle('on', bm.has(q.id));
  $('qtext').innerHTML = esc(v.t) + (q.image_url ? `<img src="${q.image_url}" alt="diagram">` : '');
  $('opts').innerHTML = v.o.map((o, i) => `<div class="opt${ans[q.id] === i ? ' sel' : ''}" data-i="${i}"><span class="rd"></span><span class="no">${i + 1}.</span><span>${esc(o)}</span></div>`).join('');
  document.querySelectorAll('.opt').forEach(el => el.onclick = () => { ans[q.id] = +el.dataset.i; render(); });
  paint(); palette();
}
function stat(q, i) {
  const a = ans[q.id] !== undefined, m = marked.has(q.id), v = qt[q.id] !== undefined;
  return (a ? ' a' : '') + (m ? ' m' : '') + (!a && !m && v ? ' v' : '') + (i === idx ? ' cur' : '');
}
function palette() {
  $('pgrid').innerHTML = qs.map((q, i) => `<button class="pb${stat(q, i)}" data-i="${i}">${i + 1}</button>`).join('');
  document.querySelectorAll('.pb').forEach(b => b.onclick = () => { go(+b.dataset.i); closePal(); });
  updAna();
}
function updAna() {
  const a = qs.filter(q => ans[q.id] !== undefined).length, m = qs.filter(q => marked.has(q.id)).length;
  $('ansTotal').textContent = a;
  $('ana').innerHTML = `<tr><th colspan="2">${esc(secName)} Analysis</th></tr><tr><td>Answered</td><td class="y">${a}</td></tr><tr><td>Not Answered</td><td class="y">${qs.length - a}</td></tr><tr><td>Mark for Review</td><td class="y">${m}</td></tr>`;
}
const openPal = () => { $('pal').classList.add('on'); $('bd').classList.add('on'); };
const closePal = () => { $('pal').classList.remove('on'); $('bd').classList.remove('on'); };
$('menu').onclick = openPal; $('pclose').onclick = closePal; $('bd').onclick = closePal;

function setLang(l) { lang = l; localStorage.setItem('q-lang', l); $('langsel').value = l; render(); }
$('lang').onclick = () => setLang(lang === 'en' ? 'hi' : 'en');
$('langsel').onchange = e => setLang(e.target.value);
$('star').onclick = () => { const id = qs[idx].id; bm.has(id) ? bm.delete(id) : bm.add(id); render(); };

function next() { if (idx < qs.length - 1) go(idx + 1); else { render(); toast('Ye last question hai'); } save(false); }
$('next').onclick = next;
$('mark').onclick = () => { const id = qs[idx].id; marked.has(id) ? marked.delete(id) : marked.add(id); next(); };
$('clear').onclick = () => { delete ans[qs[idx].id]; render(); };

// pause / resume
$('pause').onclick = async () => {
  if (done) return; active = false; $('ptime').textContent = hms(rem);
  $('pov').classList.add('on'); await save(true);
};
$('resume').onclick = async () => { $('pov').classList.remove('on'); last = Date.now(); active = true; await save(false); };

// submit
$('submit').onclick = () => {
  const a = qs.filter(q => ans[q.id] !== undefined).length, m = qs.filter(q => marked.has(q.id)).length;
  $('sum').innerHTML = `<div><b>${a}</b>Answered</div><div><b>${qs.length - a}</b>Not answered</div><div><b>${m}</b>Marked</div><div><b>${hms(rem)}</b>Time left</div>`;
  $('cov').classList.add('on');
};
$('cno').onclick = () => $('cov').classList.remove('on');
$('cyes').onclick = doSubmit;
async function doSubmit() {
  if (done) return; done = true; active = false;
  $('cyes').disabled = true;
  await save(false); // time_taken server pe saved remaining_sec se banta hai
  const { error } = await sb.rpc('submit_attempt', { a: att.id, ans: pack(), qt });
  if (error) { alert(error.message); done = false; active = true; last = Date.now(); $('cyes').disabled = false; return; }
  location.href = 'result.html?a=' + att.id;
}
addEventListener('beforeunload', e => { if (!done && active) { save(false); e.preventDefault(); e.returnValue = ''; } });

// ---- desktop CBT extras ----
let zoom = 1;
const setZ = d => { zoom = Math.min(1.6, Math.max(0.8, +(zoom + d).toFixed(2))); document.documentElement.style.setProperty('--z', zoom); };
$('zin').onclick = () => setZ(0.1); $('zout').onclick = () => setZ(-0.1);
$('full').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();
$('submit2').onclick = () => $('submit').click();
function info(kind) {
  if (!test) return;
  if (kind === 'sym') {
    $('ihead').textContent = 'Symbols';
    $('ibody').innerHTML = '<div class="leg" style="grid-template-columns:1fr;font-size:14px;color:var(--text)"><span><i></i>Not Visited</span><span><i class="v"></i>Not Answered</span><span><i class="a"></i>Answered</span><span><i class="m"></i>Marked for Review</span></div>';
  } else {
    $('ihead').textContent = 'Instructions';
    $('ibody').innerHTML = `<ol style="padding-left:18px"><li>Total duration: <b>${test.duration_min} minutes</b>.</li>
      <li>Correct answer: <b>+${mk(+test.pos_marks)}</b>, wrong answer: <b>−${mk(+test.neg_marks)}</b>, not attempted: 0.</li>
      <li>Click an option to select it. Use <b>Clear Response</b> to remove your answer.</li>
      <li><b>Save &amp; Next</b> saves your answer and moves ahead. <b>Mark for Review</b> flags the question and moves ahead.</li>
      <li>Use the question palette to jump to any question.</li>
      <li>You can pause the test (timer stops) and resume later.</li>
      <li>Click <b>Submit Test</b> when done. The test is submitted automatically when time ends.</li></ol>`;
  }
  $('iov').classList.add('on');
}
$('lnkSym').onclick = () => info('sym'); $('lnkIns').onclick = () => info('ins');
$('iclose').onclick = () => $('iov').classList.remove('on');
