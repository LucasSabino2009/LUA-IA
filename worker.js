/* Cloudflare Worker - backend da LUA-IA (chaves Groq + proxy).
   Rotas:
     GET  /status   -> estado das chaves (so os 4 ultimos caracteres)
     POST /keys     -> salva/valida as duas chaves
     POST /chat     -> proxy para a Groq (conhecimento)
     POST /validate -> proxy para a Groq (seguranca)
   Armazena as chaves em KV (binding LUA_KEYS).
   CORS: aceita apenas a origem do GitHub Pages (+ localhost para dev). */
const ALLOWED_ORIGINS = [
  'https://lucassabino2009.github.io',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
];
const GROQ_MODELS = 'https://api.groq.com/openai/v1/models';
const GROQ_CHAT = 'https://api.groq.com/openai/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b';

function isAllowed(origin) { return ALLOWED_ORIGINS.includes(origin); }
function corsHeaders(origin) {
  const allowed = isAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}
function json(obj, status, origin) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders(origin) },
  });
}
function hint(key) { return key ? '...' + String(key).slice(-4) : ''; }

async function getStored(env, name) {
  try { return (env && env.LUA_KEYS) ? await env.LUA_KEYS.get(name) : null; } catch (_) { return null; }
}
async function setStored(env, name, value) {
  try { if (env && env.LUA_KEYS) { await env.LUA_KEYS.put(name, value); return true; } } catch (_) {}
  return false;
}
async function validateKey(key) {
  if (!key || typeof key !== 'string') return { ok: false, error: 'chave vazia' };
  try {
    const r = await fetch(GROQ_MODELS, { headers: { Authorization: 'Bearer ' + key } });
    if (r.ok) return { ok: true };
    if (r.status === 401 || r.status === 403) return { ok: false, error: 'chave invalida' };
    return { ok: false, error: 'Groq HTTP ' + r.status };
  } catch (e) {
    return { ok: false, error: 'sem conexao com a Groq' };
  }
}

async function groqChat(env, key, system, user, maxTokens, responseFormat) {
  const model = (env && env.GROQ_MODEL) || DEFAULT_MODEL;
  const body = { model, temperature: 0, max_tokens: maxTokens, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] };
  if (responseFormat) body.response_format = responseFormat;
  const r = await fetch(GROQ_CHAT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  let j = {};
  try { j = JSON.parse(txt); } catch (_) {}
  if (!r.ok) throw new Error((j && j.error && j.error.message) || ('Groq HTTP ' + r.status));
  return (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content || '').trim();
}

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (origin && !isAllowed(origin)) {
      return json({ error: 'Origem nao permitida.' }, 403, origin);
    }

    if (path === '/status' && request.method === 'GET') {
      const check = url.searchParams.get('check') === '1';
      const k = await getStored(env, 'knowledge');
      const s = await getStored(env, 'security');
      const out = { backend: true, checkedAt: Date.now(), knowledge: { configured: !!k, hint: hint(k) }, security: { configured: !!s, hint: hint(s) } };
      if (check) {
        if (k) { const t0 = Date.now(); const v = await validateKey(k); out.knowledge.ok = v.ok; out.knowledge.ms = Date.now() - t0; if (!v.ok) out.knowledge.error = v.error; }
        if (s) { const t0 = Date.now(); const v = await validateKey(s); out.security.ok = v.ok; out.security.ms = Date.now() - t0; if (!v.ok) out.security.error = v.error; }
      }
      return json(out, 200, origin);
    }

    if (path === '/keys' && request.method === 'POST') {
      let body = {};
      try { body = await request.json(); } catch (_) { body = {}; }
      const knowledge = typeof body.knowledge === 'string' ? body.knowledge.trim() : '';
      const security = typeof body.security === 'string' ? body.security.trim() : '';
      const res = { conhecimento: 'erro', seguranca: 'erro' };
      const out = { knowledge: { configured: false, hint: '' }, security: { configured: false, hint: '' } };

      if (knowledge) {
        const v = await validateKey(knowledge);
        if (v.ok) { await setStored(env, 'knowledge', knowledge); res.conhecimento = 'ok'; out.knowledge = { configured: true, hint: hint(knowledge) }; }
        else { res.conhecimento = 'erro'; out.knowledge = { configured: false, hint: '', error: v.error }; }
      } else if (body.knowledge === '') {
        await setStored(env, 'knowledge', ''); res.conhecimento = 'ok';
      }
      if (security) {
        const v = await validateKey(security);
        if (v.ok) { await setStored(env, 'security', security); res.seguranca = 'ok'; out.security = { configured: true, hint: hint(security) }; }
        else { res.seguranca = 'erro'; out.security = { configured: false, hint: '', error: v.error }; }
      } else if (body.security === '') {
        await setStored(env, 'security', ''); res.seguranca = 'ok';
      }
      return json({ ...res, ...out }, 200, origin);
    }

    if (path === '/chat' && request.method === 'POST') {
      const key = await getStored(env, 'knowledge');
      if (!key) return json({ error: 'Chave de conhecimento nao configurada.' }, 400, origin);
      let body = {};
      try { body = await request.json(); } catch (_) { body = {}; }
      const topic = String(body.topic || '').trim().slice(0, 300);
      if (!topic) return json({ error: 'Topico vazio.' }, 400, origin);
      const system = 'Retorne somente fatos e trechos objetivos em portugues do Brasil sobre o assunto solicitado, com fontes/URLs quando disponiveis. Nao responda diretamente ao usuario e nao decida intencao. Se nao conhecer o assunto, diga isso em uma frase.';
      try {
        const text = await groqChat(env, key, system, topic, 700, null);
        return json({ title: topic, text, link: null, source: 'api' }, 200, origin);
      } catch (e) {
        return json({ error: e.message || 'Falha na API de conhecimento.' }, 502, origin);
      }
    }

    if (path === '/validate' && request.method === 'POST') {
      const key = await getStored(env, 'security');
      if (!key) return json({ error: 'Chave de seguranca nao configurada.' }, 400, origin);
      let body = {};
      try { body = await request.json(); } catch (_) { body = {}; }
      const prompt = JSON.stringify({
        topico: body.topico, pergunta: body.pergunta, resposta: body.resposta,
        fonte: String(body.fonte || '').slice(0, 3000), contexto: body.contexto, modo: body.modo,
        problemasAnteriores: body.problemasAnteriores || [],
        criterios: ['relevancia ao assunto perguntado', 'fatos sustentados pela fonte', 'coerencia', 'atendimento ao tamanho pedido'],
        instrucoes: 'Voce decide se esta resposta pode ser gravada na memoria permanente. Avalie apenas, sem reescrever. REPROVE se: (1) tratar de outro assunto que nao o da pergunta; (2) afirmar fatos que o campo fonte nao sustenta ou que contradigam a fonte; (3) for vazia, repetitiva ou sem sentido; (4) disser que nao encontrou informacao. Se nao houver fonte, reprove qualquer afirmacao factual especifica que voce saiba estar errada. Aprove somente respostas relevantes, coerentes e sustentadas. Responda em JSON estrito: {approved:boolean,issues:string[],corrections:string[],score:number}.'
      });
      const system = 'Voce e um avaliador de qualidade. Responda APENAS com JSON valido, sem markdown, com exatamente as chaves: approved (boolean), issues (array de strings), corrections (array de strings), score (number).';
      try {
        const raw = await groqChat(env, key, system, prompt, 500, { type: 'json_object' });
        let j = {};
        try { j = JSON.parse(raw.replace(/^```json\s*/i, '').replace(/```$/, '').trim()); } catch (_) {
          return json({ error: 'A API de seguranca retornou avaliacao em formato invalido.' }, 502, origin);
        }
        if (typeof j.approved !== 'boolean' || !Array.isArray(j.issues) || !Array.isArray(j.corrections)) {
          return json({ error: 'Formato de avaliacao invalido.' }, 502, origin);
        }
        return json({ approved: j.approved, issues: j.issues, corrections: j.corrections, score: Number(j.score) || 0 }, 200, origin);
      } catch (e) {
        return json({ error: e.message || 'Falha na API de seguranca.' }, 502, origin);
      }
    }

    return json({ error: 'Rota nao encontrada.' }, 404, origin);
  },
};
