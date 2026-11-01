// Login page par approved student reviews ka grid (email/password box ke neeche)
(function () {
  function run() {
    if (typeof sb === 'undefined') return;
    sb.rpc('public_reviews').then(({ data, error }) => {
      if (error || !data || !data.length) return;
      const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
      const st = document.createElement('style');
      st.textContent = `
        .rvg{width:100%;max-width:980px;margin:26px auto 10px;padding:0 14px;box-sizing:border-box}
        .rvg h3{text-align:center;font-size:18px;margin-bottom:14px;color:var(--text,#111)}
        .rvg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px}
        .rvc{background:var(--card,#fff);border:1px solid var(--line,#e3e6ee);border-radius:14px;padding:14px 16px;box-shadow:0 4px 14px rgba(0,0,0,.07);display:flex;flex-direction:column;gap:8px}
        .rvc .s{color:#f5b301;font-size:18px;letter-spacing:2px}
        .rvc .s i{color:#c9ced8;font-style:normal}
        .rvc p{font-size:14px;line-height:1.45;color:var(--text,#222);display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden;margin:0}
        .rvc b{font-size:13px;color:var(--muted,#667)}
        @media(max-width:560px){.rvg-grid{grid-template-columns:repeat(2,1fr);gap:10px}.rvc{padding:10px 12px}.rvc p{font-size:13px;-webkit-line-clamp:4}}`;
      document.head.appendChild(st);
      const sec = document.createElement('section');
      sec.className = 'rvg';
      sec.innerHTML = '<h3>Students kya kehte hain ⭐</h3><div class="rvg-grid">' + data.map(r =>
        `<div class="rvc"><div class="s">${'★'.repeat(r.stars)}<i>${'★'.repeat(5 - r.stars)}</i></div>${r.feedback ? `<p>${esc(r.feedback)}</p>` : ''}<b>— ${esc(r.name)}</b></div>`).join('') + '</div>';
      const form = document.querySelector('form') || document.querySelector('#loginBtn, #login');
      if (form) {
        const host = form.closest('.auth-wrap') || form.closest('.box, .card, .auth-card, .auth, .login, .wrap') || form;
        host.insertAdjacentElement('afterend', sec);
      } else document.body.appendChild(sec);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
