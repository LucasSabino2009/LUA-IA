/* Servidor da LUA: arquivos estáticos + APIs (Groq) + memória em .txt.
   As chaves NUNCA ficam no código: use variáveis de ambiente ou o arquivo .env (veja .env.example). */
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

/* Carrega .env simples (CHAVE=valor), sem dependências. */
(function loadEnv() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '.env'), 'utf8');
    raw.split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
    });
  } catch (_) { /* sem .env: usa só o ambiente */ }
})();

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0'; /* 0.0.0.0 permite abrir pelo celular na mesma rede Wi-Fi */
/* Chaves: as salvas pelo painel de configurações (.chaves.json) têm prioridade; o .env é o plano B. */
const KEYS_FILE = path.join(__dirname, '.chaves.json');
const ENV_KEYS = {
  knowledge: process.env.GROQ_KEY_KNOWLEDGE || process.env.GROQ_API_KEY || '',
  security: process.env.GROQ_KEY_SECURITY || process.env.GROQ_API_KEY || ''
};
const UI_KEYS = { knowledge: '', security: '' };
try {
  const saved = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  for (const k of Object.keys(UI_KEYS)) if (typeof saved[k] === 'string') UI_KEYS[k] = saved[k];
} catch (_) { /* ainda não há chaves salvas pelo painel */ }
const getKey = (which) => UI_KEYS[which] || ENV_KEYS[which] || '';
function saveUiKeys() {
  const tmp = KEYS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(UI_KEYS), { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tmp, KEYS_FILE);
  try { fs.chmodSync(KEYS_FILE, 0o600); } catch (_) {}
}
const keyInfo = (which) => {
  const k = getKey(which);
  return { configured: !!k, source: UI_KEYS[which] ? 'painel' : (ENV_KEYS[which] ? 'env' : null), hint: k ? '…' + k.slice(-4) : '' };
};
const validKey = (k) => typeof k === 'string' && /^[\x21-\x7e]{16,300}$/.test(k); /* sem espaços/quebras: evita injeção no cabeçalho Authorization */
const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const MEMORY_DIR = path.join(__dirname, 'memoria');
const ALLOWED_MEMORY_FILES = ['memoria.txt', 'aprendizado.txt', 'contexto.txt', 'historico_erros.txt'];
const safeMemoryFile = (name) => (ALLOWED_MEMORY_FILES.includes(String(name || '')) ? String(name) : null);
try { if (!fs.existsSync(MEMORY_DIR)) fs.mkdirSync(MEMORY_DIR, { recursive: true }); } catch (_) {}

function groqChat(apiKey, system, user, maxTokens, responseFormat) {
  return new Promise((resolve, reject) => {
    if (!apiKey) return reject(new Error('Chave da Groq não configurada (use ⚙ Configurações).'));
    const bodyObj = { model: MODEL, temperature: 0, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
    if (responseFormat) bodyObj.response_format = responseFormat;
    const body = JSON.stringify(bodyObj);
    const req = https.request('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey, 'Content-Length': Buffer.byteLength(body) },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(new Error('Groq HTTP ' + res.statusCode));
        try {
          const content = (JSON.parse(data).choices?.[0]?.message?.content || '').trim();
          if (!content) return reject(new Error('Resposta vazia do serviço.'));
          resolve(content);
        } catch (_) { reject(new Error('Resposta JSON inválida do serviço.')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Timeout na requisição.')));
    req.on('error', (e) => reject(e));
    req.write(body);
    req.end();
  });
}

/* Teste real de conexão: GET /models na Groq (não gasta tokens). Resultado fica em cache curto para não sobrecarregar. */
const pingCache = new Map();
function groqPing(apiKey, fresh) {
  const id = apiKey || '';
  const c = pingCache.get(id);
  if (c && Date.now() - c.at < (fresh ? 5000 : 30000)) return c.promise;
  const promise = new Promise((resolve) => {
    if (!apiKey) return resolve({ configured: false, ok: false, error: 'Chave não configurada (use ⚙ Configurações).' });
    const t0 = Date.now();
    let settled = false;
    const done = (r) => { if (!settled) { settled = true; resolve(Object.assign({ configured: true, ms: Date.now() - t0 }, r)); } };
    const req = https.request('https://api.groq.com/openai/v1/models', { method: 'GET', headers: { Authorization: 'Bearer ' + apiKey }, timeout: 8000 }, (res) => {
      res.resume();
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) return done({ ok: true });
        const why = res.statusCode === 401 || res.statusCode === 403 ? 'chave inválida ou revogada' : res.statusCode === 429 ? 'limite de uso da Groq atingido' : 'Groq respondeu HTTP ' + res.statusCode;
        done({ ok: false, error: why });
      });
    });
    req.on('timeout', () => req.destroy(new Error('tempo esgotado')));
    req.on('error', (e) => done({ ok: false, error: 'sem conexão com a Groq (' + (e.message || 'erro') + ')' }));
    req.end();
  });
  pingCache.set(id, { at: Date.now(), promise });
  return promise;
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 1e6) { reject(new Error('Payload muito grande')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (_) { reject(new Error('JSON inválido')); } });
    req.on('error', reject);
  });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json; charset=utf-8', '.ico': 'image/x-icon', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };
/* Nunca serve o código do servidor, as chaves nem a memória por URL estática.
   A checagem é feita DEPOIS de normalizar o caminho (senão "/a/..%2f.env" escapava do filtro) e olha o caminho final no disco. */
const BLOCKED = [/^\/server\.js$/i, /^\/package(-lock)?\.json$/i, /^\/memoria(\/|$)/i, /^\/iniciar\.(sh|bat)$/i, /^\/\.env/i, /(^|\/)\./];
const isBlocked = (p) => BLOCKED.some((re) => re.test(p));

function serveStatic(req, res) {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch (_) { res.writeHead(400); return res.end('Bad request'); }
  if (pathname.includes('\0') || pathname.includes('\\')) { res.writeHead(400); return res.end('Bad request'); }
  pathname = path.posix.normalize('/' + pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.join(__dirname, pathname);
  const rel = '/' + path.relative(__dirname, filePath).split(path.sep).join('/');
  if (!filePath.startsWith(__dirname + path.sep) || isBlocked(pathname) || isBlocked(rel)) { res.writeHead(404); return res.end('Not Found'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not Found'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

/* Só aceita mudar configurações vindas do próprio app (mesma origem) e de rede local: bloqueia outros sites e a internet. */
function isPrivateAddr(a) {
  a = String(a || '').replace(/^::ffff:/, '');
  return a === '::1' || /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a) || /^f[cd][0-9a-f]{2}:/i.test(a) || /^fe80:/i.test(a);
}
function configAllowed(req) {
  if (!isPrivateAddr(req.socket.remoteAddress)) return false;
  const origin = req.headers.origin;
  if (req.method === 'POST' && (!origin || (() => { try { return new URL(origin).host !== req.headers.host; } catch (_) { return true; } })())) return false;
  return true;
}

const server = http.createServer(async (req, res) => {
  let parsed;
  try { parsed = new URL(req.url, 'http://x'); } catch (_) { res.writeHead(400); return res.end('Bad request'); } /* URL malformada (ex.: "//") não pode derrubar o servidor */
  const route = parsed.pathname;

  if (route === '/api/knowledge' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const topic = String(body.topic || '').trim().slice(0, 300);
      if (!topic) return sendJson(res, 400, { error: 'Tópico vazio.' });
      const system = 'Retorne somente fatos e trechos objetivos em português do Brasil sobre o assunto solicitado, com fontes/URLs quando disponíveis. Não responda diretamente ao usuário e não decida intenção. Se não conhecer o assunto, diga isso em uma frase.';
      const raw = await groqChat(getKey('knowledge'), system, topic, 700, null);
      return sendJson(res, 200, { title: topic, text: raw, link: null, source: 'api' });
    } catch (e) { return sendJson(res, 502, { error: e.message || 'Falha na API de conhecimento.' }); }
  }

  if (route === '/api/security' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const prompt = JSON.stringify({
        topico: body.topico, pergunta: body.pergunta, resposta: body.resposta, fonte: String(body.fonte || '').slice(0, 3000), contexto: body.contexto, modo: body.modo,
        problemasAnteriores: body.problemasAnteriores || [],
        criterios: ['relevância ao assunto perguntado', 'fatos sustentados pela fonte', 'coerência', 'atendimento ao tamanho pedido'],
        instrucoes: 'Você decide se esta resposta pode ser gravada na memória permanente. Avalie apenas, sem reescrever. REPROVE se: (1) tratar de outro assunto que não o da pergunta; (2) afirmar fatos que o campo "fonte" não sustenta ou que contradigam a fonte; (3) for vazia, repetitiva ou sem sentido; (4) disser que não encontrou informação. Se não houver "fonte", reprove qualquer afirmação factual específica que você saiba estar errada. Aprove somente respostas relevantes, coerentes e sustentadas. Responda em JSON estrito: {"approved":boolean,"issues":string[],"corrections":string[],"score":number}.'
      });
      const system = 'Você é um avaliador de qualidade. Responda APENAS com JSON válido, sem markdown, com exatamente as chaves: approved (boolean), issues (array de strings), corrections (array de strings), score (number).';
      const raw = await groqChat(getKey('security'), system, prompt, 500, { type: 'json_object' });
      let j;
      try { j = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim()); }
      catch (_) { return sendJson(res, 502, { error: 'A API de segurança retornou avaliação em formato inválido.' }); }
      if (typeof j.approved !== 'boolean' || !Array.isArray(j.issues) || !Array.isArray(j.corrections)) return sendJson(res, 502, { error: 'Formato de avaliação inválido.' });
      return sendJson(res, 200, { approved: j.approved, issues: j.issues, corrections: j.corrections, score: Number(j.score) || 0 });
    } catch (e) { return sendJson(res, 502, { error: e.message || 'Falha na API de segurança.' }); }
  }

  if (route === '/api/memory/append' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const file = safeMemoryFile(body.file);
      if (!file) return sendJson(res, 400, { error: 'Arquivo de memória inválido.' });
      const content = String(body.content || '').slice(0, 20000);
      fs.appendFileSync(path.join(MEMORY_DIR, file), content, 'utf8');
      return sendJson(res, 200, { ok: true });
    } catch (e) { return sendJson(res, 502, { error: e.message || 'Falha ao gravar memória.' }); }
  }

  if (route === '/api/memory/read' && req.method === 'GET') {
    const file = safeMemoryFile(parsed.searchParams.get('file'));
    if (!file) return sendJson(res, 400, { error: 'Arquivo de memória inválido.' });
    let content = '';
    try { content = fs.readFileSync(path.join(MEMORY_DIR, file), 'utf8'); } catch (_) {}
    return sendJson(res, 200, { content });
  }

  if (route === '/api/config') {
    if (!configAllowed(req)) return sendJson(res, 403, { error: 'Configuração só é aceita pelo próprio app, na rede local.' });
    if (req.method === 'GET') return sendJson(res, 200, { knowledge: keyInfo('knowledge'), security: keyInfo('security') }); /* nunca devolve a chave inteira */
    if (req.method === 'POST') {
      try {
        const body = await readBody(req);
        const next = Object.assign({}, UI_KEYS);
        for (const which of Object.keys(UI_KEYS)) {
          if (body[which] === undefined || body[which] === null) continue; /* campo ausente = não mexe */
          const v = String(body[which]).trim();
          if (v === '') { next[which] = ''; continue; } /* vazio = apagar a chave salva no painel */
          if (!validKey(v)) return sendJson(res, 400, { error: 'Chave de ' + (which === 'knowledge' ? 'Conhecimento' : 'Segurança') + ' inválida: use 16+ caracteres, sem espaços.' });
          next[which] = v;
        }
        Object.assign(UI_KEYS, next);
        saveUiKeys();
        pingCache.clear();
        return sendJson(res, 200, { ok: true, knowledge: keyInfo('knowledge'), security: keyInfo('security') });
      } catch (e) { return sendJson(res, 400, { error: e.message || 'Falha ao salvar as chaves.' }); }
    }
    res.writeHead(405); return res.end('Method Not Allowed');
  }

  if (route === '/api/status') {
    const out = { backend: true, checkedAt: Date.now() };
    if (parsed.searchParams.get('check') === '1') {
      const fresh = parsed.searchParams.get('fresh') === '1';
      const [k, s] = await Promise.all([groqPing(getKey('knowledge'), fresh), groqPing(getKey('security'), fresh)]);
      out.knowledge = k; out.security = s;
    } else {
      out.knowledge = { configured: !!getKey('knowledge') }; out.security = { configured: !!getKey('security') };
    }
    return sendJson(res, 200, out);
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end('Method Not Allowed'); }
  serveStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log('\nLUA rodando!');
  console.log('  No computador: http://localhost:' + PORT);
  const nets = os.networkInterfaces();
  Object.values(nets).flat().filter((n) => n && n.family === 'IPv4' && !n.internal).forEach((n) => console.log('  No celular (mesmo Wi-Fi): http://' + n.address + ':' + PORT));
  if (!getKey('knowledge') || !getKey('security')) console.log('\n  Aviso: chaves da Groq não configuradas. A LUA funciona com a Wikipédia; abra o app e use o botão ⚙ Configurações (ou o arquivo .env) para ativar as APIs.');
  console.log('');
});
