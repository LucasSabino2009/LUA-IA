/* Normalização, armazenamento seguro e helpers puros. */
window.LUA = window.LUA || {};
LUA.utils = {
  norm: (s) => String(s || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9?!. ]/g, ' ').replace(/\s+/g, ' ').trim(),
  store: {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } }
  },
  esc: (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])),
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  stop: new Set('o a os as um uma uns umas de do da dos das em no na nos nas por para com sem sobre entre ate que e ou mas se ao aos como qual quais quem foi era sao ser tem ter meu minha seu sua isso isto esse essa este esta aquele aquela me te lhe nos voce voces eu ele ela tema assunto texto redacao historia artigo resumo escreva escrever crie criar cria faca fazer fale falar explique pesquise pesquisar conte conta gere gerar elabore redija pode poderia quero preciso favor'.split(' ')),
  /* Palavras-chave de um texto (normalizadas, sem palavras vazias). */
  keywords(text) { return LUA.utils.norm(text).replace(/[?!.]/g, ' ').split(/\s+/).filter((t) => t.length > 2 && !LUA.utils.stop.has(t)); },
  /* Remove artigos iniciais e pontuação final do assunto: "o pokemon pikachu" -> "pokemon pikachu". */
  cleanTopic(t) { return String(t || '').replace(/[?!.]+$/g, '').replace(/^\s*(o|a|os|as|um|uma|uns|umas)\s+/i, '').trim(); }
};
