/* Níveis de capacidade (1.000 / 2.000 / 3.000 neurônios ocultos) e estatísticas por "time". */
window.LUA = window.LUA || {};
LUA.levels = {
  current: 'low', network: null, teamCache: { baixa: null, media: null, alta: null },
  levelToKey: { low: 'baixa', mid: 'media', high: 'alta' }, keyToLevel: { baixa: 'low', media: 'mid', alta: 'high' },
  /* Cria a rede do nível; o treino/carregamento é assíncrono (LUA.training.ensure). */
  set(v) {
    if (!['low', 'mid', 'high'].includes(v)) v = 'low';
    if (v !== this.current || !this.network) { this.current = v; this.network = new LUA.Neural(LUA.LEVELS[v].hidden, v); }
    return this.network;
  },
  count() { return this.network?.hidden || 0; },
  label() { return ({ low: 'Baixa', mid: 'Média', high: 'Alta' })[this.current]; },
  updateCache(key, stats) { this.teamCache[key] = stats; },
  getTeams() { const o = {}; for (const k of ['baixa', 'media', 'alta']) o[k] = this.teamCache[k] || null; return o; }
};
