// Supabase Dashboard -> Project Settings -> API (anon / publishable key public hoti hai, safe)
const SUPABASE_URL = 'https://hqrzjltedigoujxwkubp.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pPs5d4i3NHg8mpS10jiPxA_c0aaO2jH';

function netBanner(msg) {
  if (document.getElementById('netb')) return;
  const b = document.createElement('div'); b.id = 'netb';
  b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999;background:#dc2626;color:#fff;padding:10px 14px;font:14px system-ui,sans-serif;display:flex;gap:12px;align-items:center;justify-content:space-between';
  b.innerHTML = '<span>' + msg + '</span><button style="background:#fff;color:#dc2626;border:0;border-radius:6px;padding:6px 12px;font-weight:700;cursor:pointer" onclick="location.reload()">Retry</button>';
  (document.body || document.documentElement).appendChild(b);
}

if (typeof supabase === 'undefined') {
  netBanner('Site load nahi ho payi (internet ya network block). Retry karo ya dusra network try karo.');
  throw new Error('supabase library missing');
}

// 15s timeout + GET requests pe 2 baar retry (mobile network ke liye). POST/RPC retry nahi hota (double submit se bachne ke liye)
async function tfetch(url, opts) {
  opts = opts || {};
  const idem = !opts.method || opts.method === 'GET' || opts.method === 'HEAD';
  for (let i = 0; i < (idem ? 3 : 1); i++) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), idem ? 15000 : 30000);
    try {
      const r = await fetch(url, opts.signal ? opts : Object.assign({}, opts, { signal: ctl.signal }));
      clearTimeout(t);
      if (r.status < 500 || !idem) return r;
    } catch (e) { clearTimeout(t); if (!idem || i === 2) throw e; }
    await new Promise(r => setTimeout(r, 700 * (i + 1)));
  }
  return fetch(url, opts);
}

window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { global: { fetch: tfetch } });

addEventListener('unhandledrejection', e => {
  if (/fetch|network|abort|timeout|load failed/i.test(String((e.reason && e.reason.message) || e.reason))) netBanner('Internet slow ya band hai. Retry karo.');
});

window.requireAuth = async function () {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { location.href = 'login.html'; return null; }
  return session;
};
