(function(){
  const t = localStorage.getItem('q-theme') ||
    (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', t);
  window.toggleTheme = function(){
    const n = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', n);
    localStorage.setItem('q-theme', n);
    document.querySelectorAll('.theme-btn').forEach(b => b.textContent = n === 'dark' ? '☀️' : '🌙');
  };
  addEventListener('DOMContentLoaded', () => document.querySelectorAll('.theme-btn').forEach(b => {
    b.textContent = t === 'dark' ? '☀️' : '🌙'; b.onclick = toggleTheme; }));
})();
