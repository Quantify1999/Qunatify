// admin-pro3.js : har test ka ad/poster (1672x941 PNG), download + share
(function () {
  const $ = id => document.getElementById(id);
  const W = 1672, H = 941, F = s => `${s}px Anton, Impact, "Arial Black", sans-serif`;
  const KEY = 'ad_cfg', DEF = { l2: 'MAINS 2026', target: '90/90', tg: '@quantifyi', site: 'quantifyi.online', tick: 'Concept + Practice\nExam Oriented Questions\n100% Selection Focus', photo: '', logo: '' };
  const load = () => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { ...DEF }; } };
  const save = o => { try { localStorage.setItem(KEY, JSON.stringify({ l2: o.l2, target: o.target, tg: o.tg, site: o.site, tick: o.tick, photo: o.photo, logo: o.logo })); } catch (e) { } };
  if (!document.getElementById('anton-font')) { const l = document.createElement('link'); l.id = 'anton-font'; l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Anton&display=swap'; document.head.appendChild(l); }
  const img = src => new Promise(r => { if (!src) return r(null); const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = src; });
  const small = f => new Promise(r => { const i = new Image(), u = URL.createObjectURL(f); i.onload = () => { const s = Math.min(1, 700 / Math.max(i.width, i.height)), c = document.createElement('canvas'); c.width = i.width * s; c.height = i.height * s; c.getContext('2d').drawImage(i, 0, 0, c.width, c.height); URL.revokeObjectURL(u); r(c.toDataURL('image/png')); }; i.onerror = () => r(''); i.src = u; });
  const sp = s => { s = s.trim(); const i = s.lastIndexOf(' '); return i < 0 ? ['', s] : [s.slice(0, i).trim(), s.slice(i + 1)]; };

  function fit(x, t, max, size) { x.font = F(size); while (x.measureText(t).width > max && size > 24) { size -= 4; x.font = F(size); } return size; }
  function band(x, x1, y1, x2, y2, col, k) { k = k || 40; x.fillStyle = col; x.beginPath(); x.moveTo(x1 + k, y1); x.lineTo(x2 + k, y1); x.lineTo(x2 - k, y2); x.lineTo(x1 - k, y2); x.closePath(); x.fill(); }
  function two(x, a, b, cx, cy, max, size, c1, c2, st, lw) {
    const full = a ? a + ' ' + b : b; size = fit(x, full, max, size); x.font = F(size);
    const wa = a ? x.measureText(a + ' ').width : 0, wb = x.measureText(b).width; const sx = cx - (wa + wb) / 2;
    x.textAlign = 'left'; x.textBaseline = 'middle'; x.lineJoin = 'round';
    if (st) { x.lineWidth = lw; x.strokeStyle = st; if (a) x.strokeText(a, sx, cy); x.strokeText(b, sx + wa, cy); }
    x.fillStyle = c1; if (a) x.fillText(a, sx, cy); x.fillStyle = c2; x.fillText(b, sx + wa, cy);
  }
  function rr(x, a, b, w, h, r, col) { x.fillStyle = col; x.beginPath(); x.roundRect ? x.roundRect(a, b, w, h, r) : x.rect(a, b, w, h); x.fill(); }

  function draw(c, o, im) {
    const x = c.getContext('2d'); c.width = W; c.height = H;
    let g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#040818'); g.addColorStop(.5, '#0a2a7c'); g.addColorStop(1, '#040818'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    g = x.createRadialGradient(900, 430, 40, 900, 430, 850); g.addColorStop(0, 'rgba(50,120,255,.55)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
    x.save(); x.globalAlpha = .07; x.fillStyle = '#fff'; for (let i = 0; i < 14; i++) { const a = i * Math.PI / 7; x.beginPath(); x.moveTo(900, 430); x.lineTo(900 + Math.cos(a) * 1900, 430 + Math.sin(a) * 1900); x.lineTo(900 + Math.cos(a + .1) * 1900, 430 + Math.sin(a + .1) * 1900); x.fill(); } x.restore();
    // person / silhouette
    x.save(); x.shadowColor = '#ffb300'; x.shadowBlur = 35;
    if (im.photo) { const s = Math.min(560 / im.photo.width, 780 / im.photo.height); x.drawImage(im.photo, 20, H - im.photo.height * s - 20, im.photo.width * s, im.photo.height * s); }
    else { x.fillStyle = '#070707'; x.beginPath(); x.ellipse(300, 360, 105, 125, 0, 0, 7); x.fill(); x.beginPath(); x.moveTo(40, 760); x.quadraticCurveTo(60, 540, 300, 510); x.quadraticCurveTo(540, 540, 570, 760); x.lineTo(570, 900); x.lineTo(40, 900); x.fill(); x.shadowBlur = 0; x.fillStyle = '#fff'; x.font = F(200); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('?', 300, 360); }
    x.restore();
    // logo + tagline
    x.save(); x.beginPath(); x.arc(120, 110, 92, 0, 7); x.clip(); x.fillStyle = '#06122e'; x.fillRect(20, 10, 200, 200);
    if (im.logo) x.drawImage(im.logo, 28, 18, 184, 184); else { x.fillStyle = '#fff'; x.font = 'bold 36px sans-serif'; x.textAlign = 'center'; x.fillText('Quantify', 120, 120); } x.restore();
    x.lineWidth = 6; x.strokeStyle = '#22b8ff'; x.beginPath(); x.arc(120, 110, 92, 0, 7); x.stroke();
    x.save(); x.translate(250, 120); x.rotate(-.12); x.fillStyle = '#ffd400'; x.font = 'italic bold 60px sans-serif'; x.textAlign = 'left'; x.fillText('Crack', 20, -25); x.fillText('Selection', 0, 35); x.restore();
    // title
    const cx = 925; x.textBaseline = 'middle';
    const l1 = (o.l1 || '').toUpperCase(); x.font = F(fit(x, l1, 860, 200)); x.textAlign = 'center'; x.lineJoin = 'round'; x.lineWidth = 18; x.strokeStyle = '#05091c'; x.strokeText(l1, cx, 175); x.fillStyle = '#fff'; x.fillText(l1, cx, 175);
    band(x, 510, 260, 1320, 380, '#ffd400', 36); const [a2, b2] = sp((o.l2 || '').toUpperCase()); two(x, a2, b2, cx, 322, 780, 125, '#0a0a0a', '#e11d1d');
    band(x, 500, 410, 1330, 590, '#d8141a', 40); const [a3, b3] = sp(o.big || ''); two(x, a3, b3, cx, 500, 790, 190, '#fff', '#ffd400', '#3a0000', 12);
    band(x, 560, 615, 1290, 715, '#fff', 34); x.font = F(58); x.textAlign = 'left'; x.fillStyle = '#0b1e55'; x.fillText('is', 625, 667); rr(x, 705, 628, 270, 78, 14, '#e11d1d'); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(735, 645); x.lineTo(735, 690); x.lineTo(775, 667); x.fill(); x.fillText('LIVE', 790, 668); x.fillStyle = '#0b1e55'; x.fillText('on the site', 1000, 667);
    rr(x, 640, 735, 680, 90, 45, '#ffd400'); x.strokeStyle = '#111'; x.lineWidth = 5; x.beginPath(); x.arc(710, 780, 30, 0, 7); x.moveTo(680, 780); x.lineTo(740, 780); x.moveTo(710, 750); x.lineTo(710, 810); x.stroke();
    x.fillStyle = '#111'; x.font = 'bold 46px sans-serif'; x.fillText('Visit- ' + (o.site || ''), 760, 782);
    // target
    [[100, '#d8141a'], [78, '#fff'], [56, '#d8141a'], [34, '#fff'], [14, '#d8141a']].forEach(([r, col]) => { x.fillStyle = col; x.beginPath(); x.arc(1500, 330, r, 0, 7); x.fill(); });
    x.strokeStyle = '#6b3b12'; x.lineWidth = 9; x.beginPath(); x.moveTo(1500, 330); x.lineTo(1610, 245); x.stroke();
    band(x, 1360, 470, 1640, 700, '#d8141a', 26); x.textAlign = 'center'; x.font = F(80); x.lineWidth = 8; x.strokeStyle = '#3a0000'; x.strokeText('Target', 1500, 530); x.fillStyle = '#fff'; x.fillText('Target', 1500, 530);
    const tg = o.target || ''; x.font = F(fit(x, tg, 270, 130)); x.strokeText(tg, 1500, 630); x.fillStyle = '#ffd400'; x.fillText(tg, 1500, 630);
    // checklist
    rr(x, 10, 740, 470, 170, 16, '#ffd400'); (o.tick || '').split('\n').slice(0, 3).forEach((t, i) => { const y = 780 + i * 52; x.fillStyle = '#111'; x.beginPath(); x.arc(52, y, 20, 0, 7); x.fill(); x.strokeStyle = '#ffd400'; x.lineWidth = 5; x.beginPath(); x.moveTo(42, y); x.lineTo(50, y + 8); x.lineTo(63, y - 9); x.stroke(); x.fillStyle = '#111'; x.font = 'italic bold 34px sans-serif'; x.textAlign = 'left'; let s = 34; while (x.measureText(t).width > 390 && s > 16) { s -= 2; x.font = `italic bold ${s}px sans-serif`; } x.fillText(t, 85, y + 2); });
    // telegram bar
    rr(x, 490, 855, 1160, 72, 36, '#0a0f1f'); x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.roundRect ? x.roundRect(490, 855, 1160, 72, 36) : x.rect(490, 855, 1160, 72); x.stroke();
    x.fillStyle = '#1d9bf0'; x.beginPath(); x.arc(530, 891, 42, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(505, 889); x.lineTo(558, 868); x.lineTo(546, 914); x.lineTo(530, 902); x.lineTo(522, 912); x.lineTo(520, 897); x.closePath(); x.fill();
    x.textAlign = 'left'; x.font = 'italic bold 34px sans-serif'; const pre = 'Telegram for more updates and leaderboard:- '; x.fillStyle = '#fff'; x.fillText(pre, 590, 893); const w = x.measureText(pre).width; x.fillStyle = '#ffd400'; x.font = 'bold 44px sans-serif'; x.fillText(o.tg || '', 590 + w, 893);
  }

  window.adTest = async function (id) {
    const t = allTests.find(z => z.id === id); if (!t) return;
    const o = load(), m = t.title.match(/(module|test|mock|quiz|set)[\s\-_]*(\d+)/i), sec = (secs.find(s => s.id === t.section_id) || {}).name || '';
    o.big = m ? m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + ' ' + m[2] : t.title; o.l1 = m ? t.title.slice(0, m.index).trim() || sec : sec || t.title;
    const d = document.createElement('div'); d.className = 'modal on';
    d.innerHTML = `<div class="mbox" style="max-width:720px;max-height:92vh;overflow:auto"><h3>📢 Ad / Poster</h3><canvas id="ad-c" style="width:100%;border-radius:10px;background:#000"></canvas>
      <div class="row"><input id="ad-l1" placeholder="Upar ka bada naam" style="flex:1"><input id="ad-l2" placeholder="MAINS 2026" style="flex:1"></div>
      <div class="row"><input id="ad-big" placeholder="Module 21" style="flex:1"><input id="ad-target" placeholder="Target" style="width:110px"></div>
      <div class="row"><input id="ad-site" placeholder="site" style="flex:1"><input id="ad-tg" placeholder="@telegram" style="flex:1"></div>
      <textarea id="ad-tick" rows="3" style="width:100%"></textarea>
      <div class="row"><label class="btn-s ghost" style="cursor:pointer">🧑 Photo<input type="file" id="ad-ph" accept="image/*" hidden></label><label class="btn-s ghost" style="cursor:pointer">🖼 Logo<input type="file" id="ad-lg" accept="image/*" hidden></label><button class="btn-s ghost" id="ad-rm" type="button">Photo hatao</button></div>
      <div class="row" style="justify-content:flex-end"><button class="btn-s ghost" id="ad-x" type="button">Band</button><button class="btn-s ghost" id="ad-sh" type="button">Share</button><button class="btn-s" id="ad-dl" type="button">⬇ PNG</button></div></div>`;
    document.body.appendChild(d);
    const f = { l1: 'ad-l1', l2: 'ad-l2', big: 'ad-big', target: 'ad-target', site: 'ad-site', tg: 'ad-tg', tick: 'ad-tick' }; Object.keys(f).forEach(k => $(f[k]).value = o[k]);
    let im = { photo: await img(o.photo), logo: await img(o.logo) };
    try { await document.fonts.load('100px Anton'); } catch (e) { }
    const go = () => { Object.keys(f).forEach(k => o[k] = $(f[k]).value); draw($('ad-c'), o, im); save(o); };
    d.oninput = go; go();
    $('ad-ph').onchange = async e => { if (e.target.files[0]) { o.photo = await small(e.target.files[0]); im.photo = await img(o.photo); go(); } };
    $('ad-lg').onchange = async e => { if (e.target.files[0]) { o.logo = await small(e.target.files[0]); im.logo = await img(o.logo); go(); } };
    $('ad-rm').onclick = () => { o.photo = ''; im.photo = null; go(); }; $('ad-x').onclick = () => d.remove();
    const blob = () => new Promise(r => $('ad-c').toBlob(r, 'image/png')), nm = (o.big || 'ad').replace(/[^\w]+/g, '-') + '-ad.png';
    $('ad-dl').onclick = async () => { const a = document.createElement('a'); a.href = URL.createObjectURL(await blob()); a.download = nm; a.click(); };
    $('ad-sh').onclick = async () => { const file = new File([await blob()], nm, { type: 'image/png' }); if (navigator.canShare && navigator.canShare({ files: [file] })) navigator.share({ files: [file], text: `${o.big} LIVE hai! ${o.site}` }).catch(() => { }); else $('ad-dl').onclick(); };
  };
})();
