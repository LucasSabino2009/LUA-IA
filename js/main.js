/* Inicialização coordenada: nível, treino assíncrono, controles, painel, chat, memória e PWA. */
window.LUA = window.LUA || {};
LUA.session = { count: 0 };
(function () {
  const mobile = window.matchMedia('(max-width:850px)').matches;
  LUA.levels.set(LUA.utils.store.get('lua_level', mobile ? 'low' : 'mid')); /* celular começa no nível leve */
  LUA.generator.train(); LUA.controls.init(); LUA.panel.init(); LUA.chat.init(); LUA.apiStatus.init(); LUA.settings.init();
  LUA.panel.status('Treinando a rede neural…');
  LUA.training.ensure((m) => LUA.panel.status(m)).then((i) => {
    if (i && i.error) return LUA.panel.status('Erro ao treinar a rede: ' + i.error + ' (usando só as regras lexicais)');
    LUA.panel.status('Pronta · ' + LUA.training.samples.length + ' exemplos · rede com ' + Math.round((i.accuracy || 0) * 100) + '% de acerto' + (i.fromCache ? ' (carregada do cache)' : ' (treinada em ' + Math.round(i.ms) + ' ms)'));
  });
  LUA.memory.init().then(() => {
    const on = (id, ev, fn) => { const e = document.getElementById(id); if (e) e.addEventListener(ev, fn); };
    on('syncMemoryFiles', 'click', () => LUA.memory.syncFiles()); on('exportMemory', 'click', () => LUA.memory.exportMemory());
    on('importMemoryFile', 'change', (e) => { if (e.target.files && e.target.files[0]) LUA.memory.importMemory(e.target.files[0]); e.target.value = ''; });
    on('clearMemory', 'click', () => LUA.memory.clearMemory());
  });
  LUA.chat.add('bot', 'Olá! Sou a LUA, um protótipo local. Posso conversar, lembrar seu nome, pesquisar fatos na Wikipédia (ou na API, se ligada) e montar resumos e redações a partir das fontes. Não sou um modelo de linguagem moderno: quando não encontro uma fonte, digo isso em vez de inventar.');
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
