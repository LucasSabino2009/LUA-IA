/* Detecta a intenção combinando regras lexicais (palavra inteira) com a rede neural treinada. */
window.LUA = window.LUA || {};
LUA.intent = {
  lexical(text) {
    const n = ' ' + LUA.utils.norm(text) + ' ';
    let best = { name: 'fallback', confidence: 0.2, neural: false };
    for (const row of LUA.intentData) {
      let score = 0;
      for (const ex of row[1]) {
        const e = LUA.utils.norm(ex);
        if (e && n.includes(' ' + e + ' ')) score = Math.max(score, Math.min(0.99, 0.58 + (e.length / Math.max(30, n.length)) * 0.3 + (e.split(' ').length > 2 ? 0.05 : 0)));
      }
      if (score > best.confidence) best = { name: row[0], confidence: score, neural: false };
    }
    return best;
  },
  detect(text) {
    const lex = this.lexical(text), net = LUA.levels.network;
    let neural = null;
    if (net?.trained) {
      const p = net.predict(text), row = LUA.intentData[p.index];
      neural = { name: row?.[0] || 'fallback', confidence: p.confidence, probabilities: p.probabilities, neural: true };
    }
    if (neural && neural.confidence >= 0.5 && (neural.confidence >= lex.confidence || neural.name === lex.name)) return neural;
    if (neural) lex.probabilities = neural.probabilities;
    return lex;
  }
};
