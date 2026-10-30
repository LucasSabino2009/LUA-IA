/* Busca fatos na Wikipédia em português (funciona direto do navegador, no PC e no celular). */
window.LUA = window.LUA || {};
LUA.wikipedia = {
  async buscar(topic) {
    if (!LUA.controls.state.wiki) return null;
    const q = LUA.utils.cleanTopic(topic); if (!q) return null;
    const base = 'https://pt.wikipedia.org/w/api.php?origin=*&format=json&';
    const get = async (u) => { const r = await fetch(u); if (!r.ok) throw Error('Wikipédia HTTP ' + r.status); return r.json(); };
    const s = await get(base + 'action=query&list=search&srlimit=3&srsearch=' + encodeURIComponent(q));
    const hits = s.query?.search || []; if (!hits.length) return null;
    const keys = LUA.utils.keywords(q);
    /* prefere o resultado cujo título contém mais palavras do assunto */
    const score = (h) => { const t = LUA.utils.norm(h.title); return keys.reduce((n, k) => n + (t.includes(k) ? 1 : 0), 0); };
    const hit = hits.slice().sort((a, b) => score(b) - score(a))[0];
    const e = await get(base + 'action=query&prop=extracts&explaintext=1&exchars=3000&redirects=1&titles=' + encodeURIComponent(hit.title));
    const page = Object.values(e.query.pages)[0];
    if (!page?.extract) return null;
    const text = page.extract.split('\n').filter((l) => l.trim() && !/^=+\s.*\s=+$/.test(l.trim())).join('\n');
    return { title: hit.title, text, link: 'https://pt.wikipedia.org/wiki/' + encodeURIComponent(hit.title.replace(/ /g, '_')), source: 'wiki' };
  }
};
