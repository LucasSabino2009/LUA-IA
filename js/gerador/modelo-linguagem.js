/* Gerador local por RECUPERAÇÃO: monta texto a partir dos trechos do corpus autoral mais relevantes ao pedido.
   (Substitui o antigo modelo de caracteres, que produzia texto ilegível.) Não inventa assunto: sem trecho relevante, devolve ''. */
window.LUA = window.LUA || {};
LUA.generator = {
  index: [],
  train() {
    this.index = [];
    (LUA.corpus || []).forEach((par) => par.split(/(?<=[.!?])\s+/).filter((s) => s.length > 20).forEach((s, i, arr) => this.index.push({ s, keys: new Set(LUA.utils.keywords(s).map((k) => k.slice(0, 5))), par: par }))); 
  },
  generate(seed, max = 600) {
    if (!this.index.length) this.train();
    const q = LUA.utils.keywords(seed).map((k) => k.slice(0, 5)); if (!q.length) return '';
    const scored = this.index.map((e) => ({ e, sc: q.filter((k) => e.keys.has(k)).length })).filter((x) => x.sc > 0);
    if (!scored.length) return '';
    const bestPar = scored.sort((a, b) => b.sc - a.sc)[0].e.par;
    let out = bestPar;
    if (out.length > max) { const parts = out.split(/(?<=[.!?])\s+/); out = ''; for (const p of parts) { if ((out + ' ' + p).length > max && out) break; out += (out ? ' ' : '') + p; } }
    return out.trim();
  }
};
