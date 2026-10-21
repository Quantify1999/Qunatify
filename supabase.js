// Supabase Dashboard -> Project Settings -> API se values daalo (anon key public hoti hai, safe)
const SUPABASE_URL = 'supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_pPs5d4i3NHg8mpS1OjiPxA_cOaaO02jH';
window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.requireAuth = async function(){
const { data:{ session } } = await sb.auth.getSession();
if(!session){ location.href = 'login.html'; return null; }
return session;};
