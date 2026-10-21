// Supabase Dashboard -> Project Settings -> API se values daalo (anon key public hoti hai, safe)
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';
window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

window.requireAuth = async function(){
  const { data:{ session } } = await sb.auth.getSession();
  if(!session){ location.href = 'login.html'; return null; }
  return session;
};
