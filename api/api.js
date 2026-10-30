/* Configuração central das APIs. As chamadas passam pelo backend Node (server.js): as chaves ficam só no servidor (.env). */
(function () {
  const config = {
    conhecimento: { provider: 'backend', modelo: 'openai/gpt-oss-20b', maxTokens: 700, timeoutMs: 15000, enabled: false },
    seguranca: { provider: 'backend', modelo: 'openai/gpt-oss-20b', maxTokens: 500, timeoutMs: 15000, enabled: false },
    limites: { maxTentativas: 3, similaridadeMinima: 0.12 }
  };

  /* Validação local REAL (usada quando a API de segurança está desligada ou indisponível): reprova texto vazio,
     corrompido, repetitivo ou sem sentido, em vez de aprovar tudo. */
  const localValidate = (resposta, topico) => {
    const text = String(resposta || '').trim(), issues = [];
    if (text.length < 3) issues.push(text.length ? 'Resposta curta demais.' : 'Resposta vazia.');
    if (/Ã[\u0080-\u00bf]|â€|\ufffd/.test(text)) issues.push('Texto com caracteres corrompidos.');
    const words = text.toLowerCase().split(/\s+/).map((w) => w.replace(/[^\p{L}]/gu, '')).filter(Boolean);
    if (words.length >= 12 && new Set(words).size / words.length < 0.3) issues.push('Repetição excessiva de palavras.');
    const long = words.filter((w) => w.length >= 4);
    if (long.length >= 6 && long.filter((w) => !/[aeiouáéíóúâêôãõà]/.test(w)).length / long.length > 0.25) issues.push('Texto sem sentido (palavras sem vogais).');
    if (words.length >= 12 && words.filter((w) => w.length <= 2).length / words.length > 0.6) issues.push('Texto sem sentido (fragmentos curtos).');
    const approved = issues.length === 0;
    return { approved, issues, corrections: approved ? [] : ['Reescrever usando fatos da fonte consultada.'], score: approved ? 0.6 : 0.1, local: true };
  };

  const callBackend = async (path, body) => {
    if (location.protocol === 'file:') throw Error('API indisponível ao abrir o arquivo direto. Rode "node server.js" (ou iniciar.bat) para usar as APIs.');
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), 15000);
    try {
      const r = await fetch((window.API_BASE || '') + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(j.error || 'HTTP ' + r.status);
      return j;
    } catch (e) { if (LUA.apiStatus) LUA.apiStatus.refresh(); let msg = e.message || ''; if (e.name === 'AbortError') msg = 'Servidor fora do ar ou acordando, tente de novo em 1 minuto'; else if (/Failed to fetch|NetworkError/i.test(msg)) msg = 'Servidor fora do ar ou acordando, tente de novo em 1 minuto'; else if (/HTTP 401|HTTP 403/.test(msg)) msg = 'Chave inválida'; else if (/HTTP 404|HTTP 405/.test(msg)) msg = 'Rota errada no servidor'; throw Error(msg); }
    finally { clearTimeout(timer); }
  };

  window.LUA = window.LUA || {};
  LUA.API = {
    config, localValidate,
    async buscar(topico) {
      if (!config.conhecimento.enabled) throw Error('Serviço desligado.');
      const j = await callBackend('/api/knowledge', { topic: topico });
      return { title: j.title || topico, text: j.text, link: j.link || null, source: j.source || 'api' };
    },
    async validar({ pergunta, resposta, contexto, modo, topico, fonte, problemasAnteriores }) {
      const local = localValidate(resposta, topico);
      if (!local.approved) return local; /* reprovação local vale sempre, mesmo sem API */
      if (!config.seguranca.enabled) return local;
      try {
        const j = await callBackend('/api/security', { pergunta, resposta, contexto, modo, topico, fonte: fonte || '', problemasAnteriores: problemasAnteriores || [] });
        if (typeof j.approved !== 'boolean' || !Array.isArray(j.issues) || !Array.isArray(j.corrections)) throw Error('Formato de avaliação inválido.');
        return { approved: j.approved, issues: j.issues, corrections: j.corrections, score: Number(j.score) || 0 };
      } catch (e) {
        config.seguranca.enabled = false;
        if (LUA.controls && LUA.controls.state) { LUA.controls.state.security = false; LUA.utils.store.set('lua_controls', LUA.controls.state); if (LUA.controls.paint) LUA.controls.paint(); }
        return Object.assign({}, local, { degraded: true, note: 'API de segurança indisponível (' + String(e.message || '').slice(0, 100) + '); usei a validação local e desliguei o botão.' });
      }
    }
  };
})();
