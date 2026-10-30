/* Coordena intenção, contexto, fontes, gerador e validação. */
window.LUA = window.LUA || {};
LUA.securityStats = { memory: 'nada salvo ainda', state: 'ociosa', validations: 0, corrections: 0, approved: 0, rejected: 0, lastIssue: '' };

LUA.cutDegenerate = function (str) {
  let out = String(str || '');
  out = out.replace(/(?<![\p{L}])(\p{L}{2,})(?:\s+\1(?![\p{L}])){4,}/giu, '$1');
  out = out.replace(/(https?:\/\/\S+?)(?:\s*\1){2,}/gi, '$1');
  out = out.replace(/(.)\1{9,}/g, '$1$1$1');
  return out.trim();
};

LUA.reply = {
  NO_ANSWER: 'Não consegui produzir uma resposta confiável para isso. Ligue a Wikipédia ou a API de conhecimento, ou me ensine com “aprenda: pergunta => resposta”.',
  extractSubject(text) {
    let s = LUA.utils.norm(text);
    s = s.replace(/^(por favor\s+)?(voce consegue|voce pode|pode|consegue|quero que voce|quero)?\s*(crie|cria|criar|escreva|escrever|redija|faca|fazer|fazer um|gere|gerar|elabore|produza|conte|invente)\s+(uma|um)?\s*(redacao|texto|historia|resumo|artigo|ensaio|poema|carta|conto|paragrafo)?\s*(sobre|acerca de|a respeito de|de|do|da)?\s*/, '');
    s = s.replace(/^(me\s+)?(o que e|o que sao|quem foi|quem e|pesquise sobre|pesquise|busque sobre|explique o que e|explique como funciona|explique|me explique|me fale sobre|fale sobre|como funciona)\s*/, '');
    return LUA.utils.cleanTopic(s) || LUA.context.topic || LUA.utils.norm(text);
  },
  async make(raw) {
    const t0 = performance.now(), text = raw.trim(), n = LUA.utils.norm(text), u = LUA.utils;
    let intent = LUA.intent.detect(text);
    if (/meu nome (e|é)|me chamo|chamar de /i.test(text)) intent = { name: 'nome', confidence: 1, neural: false };
    if (/qual (é|e) (meu|o) nome|lembra (meu )?nome|quem sou eu|diga meu nome/i.test(text)) intent = { name: 'meu_nome', confidence: 1, neural: false };
    /* frase curta sem intenção clara (ex.: "pikachu") vira pesquisa */
    if (intent.name === 'fallback' && intent.confidence < 0.6 && n.split(' ').length <= 4 && /[a-z]{3}/.test(n) && !/^(ajuda|help)$/.test(n)) intent = { name: 'pesquisa', confidence: 0.6, neural: false, probabilities: intent.probabilities };
    const searchy = ['pesquisa', 'texto', 'redacao'].includes(intent.name);
    let mode = LUA.sizeMode.choose(text, intent.name), topic = searchy ? this.extractSubject(text) : (n.replace(/[?!.]+$/, '') || LUA.context.topic);
    const networkOn = LUA.controls.state.neural;
    let facts = '', label = topic, answer = '', skipPost = false, link = null, sourceStats = { api: { calls: 0, received: 0, used: 0 }, wiki: { calls: 0, received: 0, used: 0 } };
    const memoryContext = searchy ? await LUA.memory.retrieveContext(text).catch(() => '') : '';
    const teach = text.match(/^aprenda:\s*(.+?)\s*=>\s*(.+)$/i);

    if (teach) {
      const learned = u.store.get('lua_taught', []); learned.push({ q: u.norm(teach[1]), a: teach[2] }); u.store.set('lua_taught', learned);
      answer = 'Aprendi essa associação e salvei neste aparelho.'; LUA.context.lastAction = 'salvou um exemplo ensinado'; skipPost = true;
    } else if (/^resuma o que falamos/i.test(text)) {
      answer = LUA.context.history.slice(-8).map((x) => (x.role === 'user' ? 'Você: ' : 'LUA: ') + x.text).join('\n') || 'Ainda não conversamos nada.'; LUA.context.lastAction = 'resumiu o histórico recente';
    } else if (/o que voce acabou de fazer|ultima acao/i.test(n)) {
      answer = 'Minha última ação foi: ' + LUA.context.lastAction + '.';
    } else if (intent.name === 'nome') {
      const cand = text.trim().replace(/[.!?]+$/, '').split(/\s+/).pop();
      if (cand) { LUA.context.name = cand; u.store.set('lua_name', cand); answer = 'Prazer, ' + cand + '! Vou lembrar seu nome.'; } else answer = 'Como você gostaria que eu te chamasse?';
    } else if (intent.name === 'meu_nome') answer = LUA.context.name ? 'Seu nome é ' + LUA.context.name + '.' : 'Ainda não sei seu nome. Diga “meu nome é …”.';
    else if (intent.name === 'hora') answer = 'Agora são ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.';
    else if (intent.name === 'data') answer = 'Hoje é ' + new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '.';
    else if (intent.name === 'saudacao') answer = 'Olá' + (LUA.context.name ? ', ' + LUA.context.name : '') + '! Como posso ajudar?';
    else if (intent.name === 'despedida') answer = 'Até mais! Quando quiser, podemos continuar.';
    else if (intent.name === 'agradecimento') answer = 'De nada! Fico feliz em ajudar.';
    else if (intent.name === 'conversa' && n.includes('piada')) answer = 'Por que o computador foi ao médico? Porque estava com um vírus.';
    else if (intent.name === 'conversa' && n.includes('triste')) answer = 'Sinto muito que esteja passando por isso. Se quiser, pode me contar um pouco mais.';
    else if (intent.confidence < 0.6) { answer = 'Não tenho certeza do que você quer. Você pode reformular ou especificar melhor?'; skipPost = true; }
    else if (searchy) {
      const taught = u.store.get('lua_taught', []).find((x) => n.includes(x.q) || x.q.includes(n));
      const creative = intent.name === 'texto' && /\b(cri[ae]|escreva|conte|invente|faca|fazer|gere)\s+(uma?\s+)?(historia|conto|poema|poesia|carta|cancao)\b/.test(n);
      if (taught) answer = taught.a;
      else if (creative) { answer = 'Ainda não sei inventar histórias, poemas ou cartas: meu gerador só organiza fatos de fontes. Posso pesquisar “' + topic + '” e montar um texto informativo — peça “escreva um texto sobre ' + topic + '”.'; skipPost = true; mode = 'medio'; }
      else if (!LUA.controls.state.api && !LUA.controls.state.wiki && !networkOn) { answer = 'Não há fontes externas nem rede neural ativas. Ligue uma fonte ou os neurônios para eu responder.'; skipPost = true; }
      else {
        if (LUA.controls.state.api || LUA.controls.state.wiki) {
          const sr = await LUA.sources.buscar(topic); sourceStats = sr.stats;
          if (sr.found.length) { facts = sr.found.map((r) => r.text).join('\n\n'); link = sr.found[0].link; label = sr.found[0].title || topic; LUA.context.saveTopic(label); sourceStats[sr.found[0].source].used = facts.length; }
        }
        if (facts) {
          answer = networkOn ? LUA.essay.compose(label, facts, mode, intent.name) : facts.slice(0, 1800);
          LUA.context.lastAction = 'pesquisou ' + topic + (networkOn ? ' e organizou os fatos' : ' e mostrou o trecho sem reescrita');
        } else {
          const own = networkOn ? LUA.generator.generate(topic + ' ' + text, mode === 'longo' ? 900 : 350) : '';
          if (own) { answer = own; LUA.context.lastAction = 'respondeu com o corpus local'; }
          else { const why = sourceStats.api.error || sourceStats.wiki.error; answer = 'Não encontrei informações confiáveis sobre “' + topic + '”.' + (why ? ' (' + why + ')' : '') + ' Verifique o assunto, a conexão ou me ensine com “aprenda: pergunta => resposta”.'; skipPost = true; mode = 'medio'; }
        }
      }
    } else {
      const learned = u.store.get('lua_taught', []).find((x) => n.includes(x.q) || x.q.includes(n));
      if (learned) answer = learned.a;
      else if (intent.name === 'identidade') answer = 'Sou a LUA, uma IA experimental em JavaScript puro. Minha rede e meu gerador são protótipos pequenos, com limitações importantes.';
      else answer = LUA.intentData.find((r) => r[0] === intent.name)?.[2] || 'Ainda não sei responder bem a isso. Você pode me ensinar com “aprenda: pergunta => resposta”.';
      LUA.context.lastAction = 'respondeu usando regras locais e o corpus';
    }

    /* nota discreta de memória: só para pesquisas e só se a pergunta anterior for realmente parecida */
    const prev = memoryContext && (memoryContext.split('\n')[0].match(/^Pergunta: (.*?) \|/) || [])[1];
    if (prev && answer && !skipPost && u.norm(prev) !== n) answer += '\n\nJá falamos de algo parecido antes: “' + prev.slice(0, 120) + '”.';

    const draftMs = performance.now() - t0;
    const context = LUA.context.recent() + (memoryContext ? '\n\nMemória recuperada:\n' + memoryContext : '');
    answer = LUA.cutDegenerate(answer);

    /* validação: respostas diretas passam; as demais passam pela validação (API se ligada, senão local). Sem aprovação, nada é entregue como se fosse boa. */
    const securityOn = !!LUA.API.config.seguranca.enabled, direct = ['nome', 'meu_nome', 'saudacao', 'despedida', 'agradecimento', 'hora', 'data'].includes(intent.name) || skipPost;
    let approved = false, candidate = answer, lastEval = null, validationMs = 0, note = '';
    if (direct) { approved = true; LUA.securityStats.state = 'direta (sem validação)'; }
    else {
      const max = LUA.API.config.limites.maxTentativas;
      for (let attempt = 1; attempt <= max && !approved; attempt++) {
        LUA.securityStats.state = 'validando'; LUA.panel.status('Validando resposta (' + attempt + '/' + max + ')…');
        const vt = performance.now();
        lastEval = await LUA.API.validar({ pergunta: text, resposta: candidate, contexto: context, modo: mode, topico: topic, fonte: facts.slice(0, 3000), problemasAnteriores: lastEval?.issues || [] });
        validationMs += performance.now() - vt; LUA.securityStats.validations++;
        if (lastEval.note) note = lastEval.note;
        if (lastEval.approved) { approved = true; LUA.securityStats.approved++; LUA.securityStats.state = lastEval.local ? 'aprovada (validação local)' : 'aprovada (API)'; break; }
        LUA.securityStats.rejected++; LUA.securityStats.corrections++; LUA.securityStats.lastIssue = (lastEval.issues || []).join('; ').slice(0, 300); LUA.securityStats.state = 'corrigindo';
        const regen = LUA.generator.generate(topic + ' ' + (lastEval.corrections || []).join(' '), mode === 'longo' ? 900 : 350);
        candidate = LUA.cutDegenerate(regen && regen !== candidate ? regen : candidate);
      }
      if (!approved) { candidate = this.NO_ANSWER; LUA.securityStats.state = 'reprovada (nada entregue como válido)'; }
    }
    if (note) LUA.securityStats.lastIssue = note;

    const net = LUA.levels.network;
    if (net?.trained) { net.predict(text); LUA.levels.updateCache(LUA.levels.levelToKey[LUA.levels.current], net.teamStats()); }
    LUA.context.add('user', text); LUA.context.add('lua', candidate);
    const srcName = sourceStats.api.calls && sourceStats.api.used ? 'API de conhecimento' : (sourceStats.wiki.calls && sourceStats.wiki.used ? 'Wikipédia' : 'interna');
    /* Só entra na memória (.txt e banco do navegador) o que a API de segurança verificou e aprovou: pergunta + resposta juntas. */
    const apiVerified = approved && !direct && !!lastEval && !lastEval.local && !lastEval.degraded;
    if (apiVerified) {
      await LUA.memory.saveConversation({ question: text, answer: candidate, intent: intent.name, confidence: intent.confidence, method: intent.neural ? 'rede neural + memória' : 'lexical + memória', memoryContext, sources: srcName, validation: 'aprovada pela API de segurança (nota ' + (Number(lastEval.score) || 0).toFixed(2) + ')' });
      if (srcName !== 'interna') await LUA.memory.saveLearning({ content: candidate.slice(0, 800), origin: 'resposta', source: srcName === 'Wikipédia' ? 'wikipedia' : 'api', confidence: Math.max(0.5, Number(lastEval.score) || intent.confidence || 0.5), related: 'Pergunta: ' + text.slice(0, 160) + (link ? ' | Link: ' + link : ''), status: 'validado pela API de segurança' });
      await LUA.memory.saveContext('Último assunto: ' + topic + '; pergunta: ' + text.slice(0, 160));
      LUA.securityStats.memory = 'salva (pergunta + resposta verificadas pela API)';
    } else {
      LUA.securityStats.memory = direct ? 'não salva (resposta direta, sem verificação da API)'
        : !approved ? 'não salva (resposta reprovada)'
        : !securityOn ? 'não salva (ligue a Segurança API para gravar na memória)'
        : lastEval && lastEval.degraded ? 'não salva (API de segurança indisponível)'
        : 'não salva (sem aprovação da API)';
    }

    const probs = (intent.probabilities || []).map((p, i) => ({ name: LUA.intentData[i]?.[0], p })).sort((a, b) => b.p - a.p).slice(0, 4);
    return { text: candidate, approved, intent: intent.name, confidence: intent.confidence, mode, ms: performance.now() - t0, generationMs: draftMs, validationMs, sourceStats, link, probs,
      neurons: LUA.levels.count(), hidden: LUA.levels.count(), activeNeurons: net ? net.lastHidden.reduce((c, v) => c + (Math.abs(v) > 0.15 ? 1 : 0), 0) : 0, activations: Array.from(net?.lastHidden || []),
      parameters: net ? net.parameterCount : 0, weightUpdates: net ? net.updates : 0, networkOn, level: LUA.levels.label(), teams: LUA.levels.getTeams() };
  }
};
