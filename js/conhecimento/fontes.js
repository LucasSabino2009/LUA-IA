/* Orquestra as fontes (API de conhecimento e Wikipédia), mede caracteres e filtra resultados fora do assunto. */
window.LUA = window.LUA || {};
LUA.sources = {
  async buscar(topic) {
    const stats = { api: { calls: 0, received: 0, used: 0 }, wiki: { calls: 0, received: 0, used: 0 } }, found = [];
    const keys = LUA.utils.keywords(topic), need = Math.max(1, Math.ceil(keys.length / 2));
    const isRelevant = (r) => { if (!keys.length) return true; const hay = LUA.utils.norm((r.title || '') + ' ' + (r.text || '')); return keys.filter((k) => hay.includes(k)).length >= need; };
    const tryWiki = async () => {
      try { stats.wiki.calls++; const w = await LUA.wikipedia.buscar(topic); if (w) { stats.wiki.received = w.text.length; if (isRelevant(w)) found.push(w); else stats.wiki.error = 'Resultado sem relação com o assunto.'; } else stats.wiki.error = 'Nada encontrado na Wikipédia.'; }
      catch (e) { stats.wiki.error = e.message === 'Failed to fetch' ? 'Sem conexão com a internet.' : e.message; }
    };
    if (LUA.controls.state.api) {
      try { stats.api.calls++; const r = await LUA.API.buscar(topic); stats.api.received = r.text.length; if (isRelevant(r)) found.push(r); else stats.api.error = 'Resultado sem relação com o assunto.'; }
      catch (e) { stats.api.error = e.message; }
      if (!found.length && LUA.controls.state.wiki) await tryWiki();
    } else if (LUA.controls.state.wiki) await tryWiki();
    return { found, stats };
  }
};
