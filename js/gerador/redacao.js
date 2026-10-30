/* Monta resumos e redações (introdução, desenvolvimento, conclusão) a partir de fatos de uma fonte. Não inventa fatos. */
window.LUA = window.LUA || {};
LUA.essay = {
  sentences(raw) {
    const clean = String(raw || '').replace(/\*\*|__|\*|`|#+ /g, '').replace(/^\s*[-•]\s*/gm, '').replace(/\[[0-9]+\]/g, '').replace(/\s*\n+\s*/g, ' ').replace(/\s+/g, ' ');
    const seen = new Set(), out = [];
    for (const s of clean.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÂÊÔÃÕÇ0-9])/)) { const t = s.trim(), k = LUA.utils.norm(t).slice(0, 60); if (t.length >= 25 && !seen.has(k)) { seen.add(k); out.push(t); } }
    return out;
  },
  title(topic) { const t = LUA.utils.cleanTopic(topic); return t.charAt(0).toUpperCase() + t.slice(1); },
  /* kind: 'pesquisa' (resposta direta) | 'redacao' | 'texto' */
  compose(topic, facts, mode, kind) {
    const s = this.sentences(facts); if (!s.length) return '';
    if (kind === 'pesquisa') return s.slice(0, mode === 'longo' ? 8 : mode === 'medio' ? 4 : 2).join(' ');
    const title = this.title(topic);
    if (mode === 'curto') return s.slice(0, 3).join(' ');
    const intro = s.slice(0, 2).join(' '), body = s.slice(2, mode === 'longo' ? 10 : 6), mid = Math.ceil(body.length / 2);
    const paras = [(kind === 'redacao' ? 'Redação: ' + title + '\n\n' : '') + intro];
    if (body.length) paras.push(body.slice(0, mid).join(' '));
    if (body.length > 1) paras.push(body.slice(mid).join(' '));
    paras.push('Em síntese, os pontos acima reúnem o essencial sobre ' + LUA.utils.cleanTopic(topic) + '. Para se aprofundar, consulte a fonte indicada abaixo.');
    return paras.filter(Boolean).join('\n\n');
  }
};
