// Excel row -> question object (Hindi/English split)
const DEV = /[\u0900-\u097F]/;
const PRASHN = /^\s*\u092a\u094d\u0930\u0936\u094d\u0928\s*[:\uff1a]\s*/;

function splitLang(v) {
  const s = String(v == null ? '' : v).replace(/\r/g, '');
  const lines = s.split('\n');
  const i = lines.findIndex(l => DEV.test(l));
  if (i < 0) return [s.trim(), ''];
  return [lines.slice(0, i).join('\n').trim(), lines.slice(i).join('\n').replace(PRASHN, '').trim()];
}

function normRow(r) {
  const k = {};
  Object.keys(r).forEach(x => k[x.toLowerCase().trim()] = r[x]);
  const [q, qh] = splitLang(k.question_text ?? k.question ?? k.q);
  const raw = [k.option_a ?? k.a, k.option_b ?? k.b, k.option_c ?? k.c, k.option_d ?? k.d];
  const sp = raw.map(splitLang);
  const options = sp.map((x, i) => x[0] || String(raw[i] ?? '').trim());
  const hasHi = sp.some(x => x[1]);
  const options_hi = hasHi ? sp.map((x, i) => x[1] || options[i]) : null;
  const L = { A: 0, B: 1, C: 2, D: 3 };
  let a = String(k.correct_answer ?? k.answer ?? k.ans ?? '').trim().toUpperCase();
  const ans = L[a] !== undefined ? L[a] : (+a >= 1 && +a <= 4 ? +a - 1 : -1);
  if (!q || options.some(o => !o) || ans < 0) return null;
  const [ex, exh] = splitLang(k.explanation ?? k.solution);
  const img = String(k.image_url || '').trim();
  return {
    q_text: q, q_text_hi: qh || null, options, options_hi,
    correct_option: ans, explanation: ex || null, explanation_hi: exh || null,
    has_diagram: /^(yes|true|1)$/i.test(String(k.has_diagram || '')),
    image_url: /^https?:\/\//i.test(img) ? img : null,
    topic: k.topic || null, difficulty: k.difficulty || null
  };
}
if (typeof module !== 'undefined') module.exports = { splitLang, normRow };
