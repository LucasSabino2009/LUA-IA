/* Painel de Configurações (botão ⚙): onde a pessoa cola as duas chaves de API e liga/desliga cada recurso.
   - As chaves vão para o servidor (POST /api/config) e ficam só lá; o navegador nunca recebe a chave inteira, só os 4 últimos dígitos.
   - Os interruptores usam o mesmo estado dos botões da barra de controles (LUA.controls), então os dois ficam sempre iguais. */
window.LUA = window.LUA || {};
LUA.settings = {
  dlg: null, info: null, busy: false,
  SWITCHES: [
    { key: 'api', label: 'Conhecimento API', desc: 'Busca fatos na Groq (usa a chave de Conhecimento).' },
    { key: 'security', label: 'Segurança API', desc: 'Confere cada resposta antes de gravar na memória (chave de Segurança).' },
    { key: 'wiki', label: 'Wikipédia', desc: 'Pesquisa fatos na Wikipédia em português.' },
    { key: 'neural', label: 'Rede neural (neurônios)', desc: 'Entende a intenção da pergunta com a rede própria.' }
  ],
  KEYS: [
    { id: 'knowledge', label: 'Chave da API de Conhecimento', stateKey: 'api' },
    { id: 'security', label: 'Chave da API de Segurança', stateKey: 'security' }
  ],

  el(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) { if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v); }
    for (const c of kids) if (c) e.append(c);
    return e;
  },

  init() {
    const head = document.querySelector('.chat > header');
    if (!head || document.getElementById('openSettings')) return;
    const btn = this.el('button', { id: 'openSettings', type: 'button', 'class': 'settings-open', 'aria-haspopup': 'dialog', 'aria-label': 'Abrir configurações' }, this.el('span', { 'aria-hidden': 'true', text: '⚙' }), this.el('span', { 'class': 'settings-open-text', text: 'Configurações' }));
    head.appendChild(btn);
    btn.addEventListener('click', () => this.open());
    this.build();
  },

  build() {
    const el = this.el.bind(this);
    const dlg = el('dialog', { id: 'settingsDlg', 'class': 'settings', 'aria-labelledby': 'settingsTitle' });
    const form = el('form', { method: 'dialog', 'class': 'settings-box', novalidate: '' });
    form.append(el('div', { 'class': 'settings-head' }, el('h2', { id: 'settingsTitle', text: 'Configurações' }), el('button', { type: 'button', id: 'settingsClose', 'class': 'settings-x', 'aria-label': 'Fechar' }, '✕')));

    /* --- Chaves --- */
    const secKeys = el('section', { 'class': 'settings-sec' }, el('h3', { text: 'Chaves das APIs' }), el('p', { 'class': 'settings-help', text: 'Cole as duas chaves da Groq (console.groq.com → API Keys). Elas ficam guardadas só no servidor da LUA e nunca voltam para a tela inteiras. Pode usar a mesma chave nas duas.' }));
    for (const k of this.KEYS) {
      const inp = el('input', { type: 'password', id: 'key-' + k.id, autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: 'Cole a chave aqui (gsk_…)', 'class': 'key-input' });
      const eye = el('button', { type: 'button', 'class': 'key-eye', 'aria-label': 'Mostrar ou ocultar a chave', 'aria-pressed': 'false' }, '👁');
      eye.addEventListener('click', () => { const show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; eye.setAttribute('aria-pressed', String(show)); });
      const rm = el('button', { type: 'button', id: 'rm-' + k.id, 'class': 'key-remove' }, 'Remover');
      rm.addEventListener('click', () => this.save({ [k.id]: '' }, 'Chave removida do painel.'));
      secKeys.append(el('div', { 'class': 'key-row' }, el('label', { 'for': 'key-' + k.id, text: k.label }), el('div', { 'class': 'key-line' }, inp, eye), el('div', { 'class': 'key-meta' }, el('span', { id: 'hint-' + k.id, 'class': 'key-hint' }), rm)));
    }
    const save = el('button', { type: 'button', id: 'saveKeys', 'class': 'settings-primary' }, 'Salvar e testar chaves');
    save.addEventListener('click', () => {
      const body = {};
      for (const k of this.KEYS) { const v = document.getElementById('key-' + k.id).value.trim(); if (v) body[k.id] = v; }
      if (!Object.keys(body).length) return this.msg('Cole pelo menos uma chave para salvar.', 'bad');
      this.save(body, 'Chaves salvas.');
    });
    secKeys.append(save, el('p', { id: 'settingsMsg', 'class': 'settings-msg', role: 'status', 'aria-live': 'polite' }));
    form.append(secKeys);

    /* --- Liga/desliga --- */
    const secSw = el('section', { 'class': 'settings-sec' }, el('h3', { text: 'Ligar e desligar' }));
    for (const s of this.SWITCHES) {
      const sw = el('button', { type: 'button', role: 'switch', id: 'sw-' + s.key, 'class': 'switch', 'aria-checked': 'false', 'aria-describedby': 'swd-' + s.key }, el('span', { 'class': 'switch-track', 'aria-hidden': 'true' }, el('span', { 'class': 'switch-knob' })), el('span', { 'class': 'switch-label', text: s.label }), el('span', { 'class': 'switch-state', id: 'sws-' + s.key }));
      sw.addEventListener('click', () => LUA.controls.toggle(s.key));
      secSw.append(el('div', { 'class': 'switch-row' }, sw, el('p', { id: 'swd-' + s.key, 'class': 'switch-desc', text: s.desc })));
    }
    const lvl = el('select', { id: 'settingsLevel' }, ...Array.from(document.getElementById('level').options).map((o) => el('option', { value: o.value, text: o.textContent })));
    lvl.addEventListener('change', () => { const main = document.getElementById('level'); main.value = lvl.value; main.dispatchEvent(new Event('change')); });
    secSw.append(el('div', { 'class': 'switch-row level-row' }, el('label', { 'for': 'settingsLevel', text: 'Nível da rede neural' }), lvl));
    form.append(secSw);

    const done = el('button', { type: 'button', id: 'settingsDone', 'class': 'settings-done' }, 'Pronto');
    form.append(el('div', { 'class': 'settings-foot' }, done));
    dlg.append(form);
    document.body.appendChild(dlg);
    this.dlg = dlg;
    for (const id of ['settingsClose', 'settingsDone']) document.getElementById(id).addEventListener('click', () => this.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) this.close(); }); /* clicar fora fecha */
    dlg.addEventListener('close', () => { const b = document.getElementById('openSettings'); if (b) b.focus(); });
  },

  msg(text, level) { const m = document.getElementById('settingsMsg'); if (!m) return; m.textContent = text; m.className = 'settings-msg ' + (level || ''); },

  async open() {
    if (!this.dlg) return;
    this.msg('', '');
    this.sync();
    this.dlg.showModal();
    await this.load();
  },
  close() { if (this.dlg && this.dlg.open) this.dlg.close(); },

  /* Lê quais chaves existem no servidor (só "…últimos 4", nunca a chave). */
  async load() {
    if (location.protocol === 'file:') { this.info = null; this.paintKeys(); return this.msg('Aberto direto do arquivo: para salvar chaves, rode "node server.js" (ou iniciar.bat) e abra http://localhost:3000.', 'warn'); }
    try {
      const r = await fetch('/api/config', { cache: 'no-store' });
      const j = await r.json().catch(() => null);
      if (!r.ok || !j || !j.knowledge) throw Error(j && j.error ? j.error : 'servidor da LUA não encontrado');
      this.info = j;
      this.paintKeys();
    } catch (e) {
      this.info = null; this.paintKeys();
      this.msg('Não consegui falar com o servidor da LUA (' + String(e.message || e).slice(0, 120) + '). Em hospedagem estática as APIs não funcionam: use "node server.js".', 'warn');
    }
  },

  paintKeys() {
    for (const k of this.KEYS) {
      const i = this.info && this.info[k.id], hint = document.getElementById('hint-' + k.id), rm = document.getElementById('rm-' + k.id), inp = document.getElementById('key-' + k.id);
      inp.value = '';
      if (!i) { hint.textContent = 'Estado desconhecido'; hint.className = 'key-hint'; rm.hidden = true; continue; }
      hint.textContent = !i.configured ? 'Nenhuma chave configurada' : (i.source === 'painel' ? 'Salva pelo painel · termina em ' + i.hint : 'Vem do arquivo .env · termina em ' + i.hint);
      hint.className = 'key-hint ' + (i.configured ? 'ok' : '');
      rm.hidden = i.source !== 'painel';
    }
  },

  async save(body, okText) {
    if (this.busy) return;
    this.busy = true;
    const btn = document.getElementById('saveKeys'); btn.disabled = true;
    this.msg('Salvando…', '');
    try {
      if (location.protocol === 'file:') throw Error('abra pelo servidor (node server.js) para salvar chaves');
      const r = await fetch('/api/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Error(j.error || 'HTTP ' + r.status);
      this.info = j; this.paintKeys();
      this.msg(okText + ' Testando a conexão…', '');
      if (LUA.apiStatus) { await LUA.apiStatus.check(true); this.report(okText); }
    } catch (e) { this.msg('Não salvou: ' + String(e.message || e).slice(0, 160), 'bad'); }
    finally { this.busy = false; btn.disabled = false; }
  },

  /* Resultado do teste real de cada chave (vem do servidor, que consulta a Groq). */
  report(prefix) {
    const srv = LUA.apiStatus && LUA.apiStatus.raw && LUA.apiStatus.raw.server;
    if (!srv || !srv.ok) return this.msg(prefix + ' Mas o servidor não respondeu ao teste.', 'warn');
    const parts = [];
    let all = true;
    for (const [id, name] of [['knowledge', 'Conhecimento'], ['security', 'Segurança']]) {
      const r = srv[id] || {};
      if (!r.configured) { parts.push(name + ': sem chave'); all = false; }
      else if (r.ok) parts.push(name + ': conectada ✓');
      else { parts.push(name + ': ' + (r.error || 'falhou')); all = false; }
    }
    this.msg(prefix + ' ' + parts.join(' · '), all ? 'good' : 'warn');
  },

  /* Deixa os interruptores iguais ao estado real (chamado a cada mudança pelos controles). */
  sync() {
    const st = (LUA.controls && LUA.controls.state) || {};
    for (const s of this.SWITCHES) {
      const b = document.getElementById('sw-' + s.key), t = document.getElementById('sws-' + s.key);
      if (!b) continue;
      const on = !!st[s.key];
      b.setAttribute('aria-checked', String(on));
      t.textContent = on ? 'Ligado' : 'Desligado';
    }
    const lvl = document.getElementById('settingsLevel'), main = document.getElementById('level');
    if (lvl && main) lvl.value = main.value;
  }
};
