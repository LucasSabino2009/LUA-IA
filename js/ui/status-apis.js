/* Avisos de conexão: mostra se o servidor, as APIs (Groq) e a Wikipédia estão funcionando de verdade.
   - O servidor testa cada chave na Groq (/api/status?check=1); o navegador testa o servidor e a Wikipédia.
   - Reverifica a cada 60 s, ao voltar à aba, ao ficar online/offline e quando uma chamada de API falha.
   - Avisa com um aviso flutuante quando uma API conecta ou cai. */
window.LUA = window.LUA || {};
LUA.apiStatus = {
  raw: null, busy: null, checking: false, timer: null, retry: null, toastTimer: null,
  INTERVAL: 60000,
  ICON: { good: '✓', warn: '!', bad: '✕', wait: '…' },

  init() {
    const box = document.getElementById('apiStatus');
    if (!box) return;
    if (!window.matchMedia('(max-width:850px)').matches) box.open = true; /* no celular começa recolhido */
    document.getElementById('apiRecheck').addEventListener('click', () => this.check(true));
    window.addEventListener('online', () => this.check(true));
    window.addEventListener('offline', () => this.check(true));
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.check(); });
    this.paint();
    this.check();
    this.timer = setInterval(() => { if (!document.hidden) this.check(); }, this.INTERVAL);
  },

  /* Chamado quando uma requisição à API falha: reverifica logo (com pequeno atraso para juntar falhas seguidas). */
  refresh() { clearTimeout(this.retry); this.retry = setTimeout(() => this.check(true), 1500); },

  async timed(url, ms) {
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
    try { return await fetch(url, { signal: ctl.signal, cache: 'no-store' }); } finally { clearTimeout(t); }
  },

  async checkServer(fresh) {
    if (location.protocol === 'file:') return { ok: false, error: 'página aberta direto do arquivo — rode "node server.js" (ou iniciar.bat)' };
    const t0 = performance.now();
    try {
      const r = await this.timed((window.API_BASE || '') + '/api/status?check=1' + (fresh ? '&fresh=1' : ''), 12000);
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || j.backend !== true) return { ok: false, error: 'servidor da LUA não encontrado (site estático?)' };
      return { ok: true, ms: Math.round(performance.now() - t0), knowledge: j.knowledge || {}, security: j.security || {} };
    } catch (e) { return { ok: false, error: e.name === 'AbortError' ? 'tempo esgotado ao falar com o servidor' : 'servidor não respondeu' }; }
  },

  async checkWiki() {
    const t0 = performance.now();
    try {
      const r = await this.timed('https://pt.wikipedia.org/w/api.php?origin=*&format=json&action=query&meta=siteinfo', 8000);
      if (!r.ok) return { ok: false, error: 'HTTP ' + r.status };
      await r.json();
      return { ok: true, ms: Math.round(performance.now() - t0) };
    } catch (_) { return { ok: false, error: navigator.onLine === false ? 'sem internet' : 'sem acesso' }; }
  },

  async check(fresh) {
    if (this.busy) return this.busy;
    this.busy = (async () => {
      const before = this.raw && this.derive(this.raw);
      this.setChecking(true);
      const [server, wiki] = await Promise.all([this.checkServer(fresh), this.checkWiki()]);
      this.raw = { server, wiki, at: Date.now() };
      this.setChecking(false);
      this.paint();
      if (before) this.notify(before, this.derive(this.raw));
    })().finally(() => { this.busy = null; });
    return this.busy;
  },

  /* Combina o resultado dos testes com o estado dos botões (ligado/desligado). */
  derive(raw) {
    const st = (LUA.controls && LUA.controls.state) || {};
    const srv = raw.server, list = [];
    list.push(srv.ok
      ? { id: 'server', label: 'Servidor', state: 'good', connected: true, text: 'rodando · ' + srv.ms + ' ms' }
      : { id: 'server', label: 'Servidor', state: 'bad', connected: false, text: srv.error });
    for (const [id, label, on] of [['knowledge', 'Conhecimento API', st.api], ['security', 'Segurança API', st.security]]) {
      const item = { id, label, api: true };
      const r = srv.ok ? (srv[id] || {}) : null;
      if (!srv.ok) Object.assign(item, { state: 'bad', connected: false, text: 'indisponível sem o servidor' });
      else if (!r.configured) Object.assign(item, { state: 'bad', connected: false, text: 'chave não configurada (abra ⚙ Configurações)' });
      else if (!r.ok) Object.assign(item, { state: 'bad', connected: false, text: 'falhou: ' + (r.error || 'erro desconhecido') });
      else if (on) Object.assign(item, { state: 'good', connected: true, text: 'conectada e em uso · ' + r.ms + ' ms' });
      else Object.assign(item, { state: 'warn', connected: true, text: 'conectada, mas o botão está desligado' });
      list.push(item);
    }
    const w = raw.wiki;
    list.push(!w.ok
      ? { id: 'wiki', label: 'Wikipédia', state: 'bad', connected: false, text: 'não responde (' + w.error + ')' }
      : st.wiki !== false
        ? { id: 'wiki', label: 'Wikipédia', state: 'good', connected: true, text: 'funcionando · ' + w.ms + ' ms' }
        : { id: 'wiki', label: 'Wikipédia', state: 'warn', connected: true, text: 'acessível, mas o botão está desligado' });

    const apis = list.filter((s) => s.api), up = apis.filter((s) => s.connected), idle = up.filter((s) => s.state === 'warn');
    const wiki = list.find((s) => s.id === 'wiki');
    let level, text;
    if (!up.length) {
      level = 'bad';
      text = 'Nenhuma API conectada — ' + (wiki.connected ? 'usando só a Wikipédia e a rede neural' : 'usando só a rede neural');
    } else if (up.length < apis.length) {
      level = 'warn';
      const down = apis.filter((s) => !s.connected).map((s) => s.label).join(', ');
      text = 'Só ' + up.length + ' de ' + apis.length + ' APIs conectada (' + up.map((s) => s.label).join(', ') + ') · com problema: ' + down;
    } else if (idle.length) {
      level = 'warn';
      text = 'APIs conectadas, mas ' + idle.map((s) => s.label).join(' e ') + ' ' + (idle.length > 1 ? 'estão desligadas' : 'está desligada') + ' no botão';
    } else {
      level = 'good';
      text = 'APIs funcionando — Conhecimento e Segurança conectadas';
    }
    if (!wiki.connected && up.length) { if (level === 'good') level = 'warn'; text += ' · Wikipédia fora do ar'; }
    return { list, summary: { level, text } };
  },

  setSummary(level, text) {
    const sum = document.getElementById('apiSummary'), dot = document.getElementById('apiDot');
    sum.className = 'api-summary ' + level;
    dot.className = 'dot ' + level;
    dot.textContent = this.ICON[level];
    document.getElementById('apiSummaryText').textContent = text;
  },

  setChecking(on) {
    const btn = document.getElementById('apiRecheck'), chk = document.getElementById('apiChecked');
    if (!btn) return;
    this.checking = on; btn.disabled = on;
    if (on) chk.textContent = 'Verificando…';
    if (on && !this.raw) this.setSummary('wait', 'Verificando as APIs…');
  },

  paint() {
    const list = document.getElementById('apiList');
    if (!list || !this.raw) return;
    const d = this.derive(this.raw);
    this.setSummary(d.summary.level, d.summary.text);
    list.textContent = '';
    for (const s of d.list) {
      const li = document.createElement('li'), dot = document.createElement('span'), box = document.createElement('span');
      const name = document.createElement('span'), txt = document.createElement('span');
      li.className = 'api-item';
      dot.className = 'dot ' + s.state; dot.textContent = this.ICON[s.state]; dot.setAttribute('aria-hidden', 'true');
      name.className = 'api-name'; name.textContent = s.label;
      txt.className = 'api-text'; txt.textContent = s.text;
      box.append(name, txt); li.append(dot, box); list.appendChild(li);
    }
    if (!this.checking) document.getElementById('apiChecked').textContent = 'Última verificação: ' + new Date(this.raw.at).toLocaleTimeString('pt-BR');
  },

  /* Aviso flutuante quando algo conecta ou cai (não aparece na primeira verificação). */
  notify(before, now) {
    const msgs = [];
    for (const s of now.list) {
      const old = before.list.find((o) => o.id === s.id);
      if (!old || old.connected === s.connected) continue;
      msgs.push(s.connected ? s.label + ': conectado ✓' : s.label + ': perdeu a conexão — ' + s.text);
    }
    if (msgs.length) this.toast(msgs.join('\n'), now.list.every((s) => s.connected) ? 'good' : 'bad');
  },

  toast(text, level) {
    let t = document.getElementById('apiToast');
    if (!t) {
      t = document.createElement('div'); t.id = 'apiToast';
      t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite');
      document.body.appendChild(t);
    }
    t.className = 'api-toast show ' + level; t.textContent = text;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => { t.className = 'api-toast ' + level; }, 7000);
  }
};
