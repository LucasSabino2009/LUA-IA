/* Service worker: guarda os arquivos do app para abrir offline; as APIs e a Wikipédia sempre vão para a rede. */
const CACHE = 'lua-v5';
const FILES = ['./', 'index.html', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'api/api.js', 'css/base.css', 'css/chat.css', 'css/painel.css', 'css/controles.css', 'css/status.css', 'css/configuracoes.css', 'css/tech.css', 'css/mobile.css', 'css/instalar.css', 'js/pwa-instalacao.js', 'js/config.js', 'js/utils.js', 'js/rede/neural.js', 'js/rede/niveis.js', 'js/rede/treino.js', 'js/dados/intencoes.js', 'js/dados/corpus.js', 'js/gerador/modelo-linguagem.js', 'js/gerador/redacao.js', 'js/gerador/tamanho.js', 'js/conversa/contexto.js', 'js/conversa/intencao.js', 'js/conversa/resposta.js', 'js/memoria.js', 'js/conhecimento/wikipedia.js', 'js/conhecimento/fontes.js', 'js/ui/painel.js', 'js/ui/controles.js', 'js/ui/status-apis.js', 'js/ui/configuracoes.js', 'js/ui/chat.js', 'js/main.js'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin || u.pathname.startsWith('/api/')) return;
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request).then((m) => m || caches.match('index.html'))));
});
