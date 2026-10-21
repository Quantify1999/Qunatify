const $ = id => document.getElementById(id);
function show(type, text){ const m = $('msg'); m.className = 'msg ' + type; m.textContent = text; }
function busy(b){ $('go').disabled = b; }
const page = document.body.dataset.page;

// already logged in -> dashboard (except reset page)
if(page === 'login' || page === 'signup'){
  sb.auth.getSession().then(({data}) => { if(data.session) location.href = 'dashboard.html'; });
}

$('form').addEventListener('submit', async e => {
  e.preventDefault(); busy(true); $('msg').className = 'msg';
  try{
    if(page === 'login'){
      const { error } = await sb.auth.signInWithPassword({ email:$('email').value.trim(), password:$('pass').value });
      if(error) throw error;
      location.href = 'dashboard.html';
    }
    if(page === 'signup'){
      if($('pass').value.length < 6) throw new Error('Password kam se kam 6 character ka rakho');
      const { data, error } = await sb.auth.signUp({
        email:$('email').value.trim(), password:$('pass').value,
        options:{ data:{ name:$('name').value.trim() }, emailRedirectTo: location.origin + location.pathname.replace('signup.html','login.html') }
      });
      if(error) throw error;
      if(data.session) location.href = 'dashboard.html';
      else show('ok', 'Account ban gaya! Email pe verification link bheja hai, verify karke login karo.');
    }
    if(page === 'forgot'){
      const { error } = await sb.auth.resetPasswordForEmail($('email').value.trim(),
        { redirectTo: location.href.replace('forgot.html','reset.html') });
      if(error) throw error;
      show('ok', 'Reset link email pe bhej diya. Spam folder bhi check kar lena.');
    }
    if(page === 'reset'){
      if($('pass').value !== $('pass2').value) throw new Error('Dono password match nahi kar rahe');
      if($('pass').value.length < 6) throw new Error('Password kam se kam 6 character ka rakho');
      const { error } = await sb.auth.updateUser({ password:$('pass').value });
      if(error) throw error;
      show('ok', 'Password change ho gaya! Login page pe ja rahe hain...');
      setTimeout(() => location.href = 'login.html', 1500);
    }
  }catch(err){
    show('err', err.message === 'Invalid login credentials' ? 'Email ya password galat hai' : err.message);
  }
  busy(false);
});
