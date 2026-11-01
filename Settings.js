(function () {
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let uid = null, avatar = null, pname = '';
  function show(id, type, t) { const m = $(id); m.className = 'msg ' + type; m.textContent = t; }
  function paint() {
    $('pav').innerHTML = avatar ? `<img src="${esc(avatar)}" alt="">` : esc((($('pname').value || pname || 'Q').trim().charAt(0) || 'Q').toUpperCase());
  }

  // koi bhi error ho to screen par dikhao
  window.addEventListener('error', e => show('pmsg', 'err', 'Error: ' + e.message));
  window.addEventListener('unhandledrejection', e => show('pmsg', 'err', 'Error: ' + ((e.reason && e.reason.message) || e.reason)));

  $('pfile').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    if (!uid) return show('pmsg', 'err', 'Login check ho raha hai, thodi der baad try karo');
    if (!f.type.startsWith('image/')) return show('pmsg', 'err', 'Sirf image file chuno');
    if (f.size > 2 * 1024 * 1024) return show('pmsg', 'err', 'Image 2 MB se choti rakho');
    show('pmsg', 'ok', 'Upload ho raha hai...');
    const ext = (f.name.split('.').pop() || 'png').toLowerCase();
    const path = `avatars/${uid}/${Date.now()}.${ext}`;
    const { error } = await sb.storage.from('assets').upload(path, f, { contentType: f.type });
    if (error) return show('pmsg', 'err', 'Upload fail: ' + error.message);
    avatar = sb.storage.from('assets').getPublicUrl(path).data.publicUrl;
    paint(); show('pmsg', 'ok', 'Photo upload ho gayi. Ab Save Profile dabao.');
  };

  $('pname').oninput = () => { if (!avatar) paint(); };

  $('psave').onclick = async () => {
    const name = $('pname').value.trim();
    if (!name) return show('pmsg', 'err', 'Naam khaali nahi ho sakta');
    $('psave').disabled = true;
    const { error } = await sb.rpc('update_my_profile', { p_name: name, p_avatar: avatar });
    $('psave').disabled = false;
    if (error) return show('pmsg', 'err', 'Save fail: ' + error.message);
    pname = name; show('pmsg', 'ok', 'Profile save ho gayi ✅');
  };

  $('psave2').onclick = async () => {
    const a = $('np').value, b = $('np2').value;
    if (a.length < 6) return show('pmsg2', 'err', 'Password kam se kam 6 character ka rakho');
    if (a !== b) return show('pmsg2', 'err', 'Dono password match nahi kar rahe');
    $('psave2').disabled = true;
    const { error } = await sb.auth.updateUser({ password: a });
    $('psave2').disabled = false;
    if (error) return show('pmsg2', 'err', error.message);
    $('np').value = ''; $('np2').value = ''; show('pmsg2', 'ok', 'Password change ho gaya ✅');
  };

  (async () => {
    if (typeof sb === 'undefined' || typeof requireAuth !== 'function') return show('pmsg', 'err', 'supabase.js load nahi hui');
    const s = await requireAuth(); if (!s) return;
    uid = s.user.id;
    const { data, error } = await sb.from('profiles').select('name,avatar_url').eq('id', uid).single();
    if (error) return show('pmsg', 'err', 'Profile load fail: ' + error.message);
    pname = (data && data.name) || ''; avatar = data && data.avatar_url;
    $('pname').value = pname; paint();
  })();
})();
