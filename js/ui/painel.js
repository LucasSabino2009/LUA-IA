/* Painel lateral: status, times de neurônios, top 10 neurônios, probabilidades de intenção e estatísticas. */
window.LUA = window.LUA || {};
LUA.panel = {
  el(tag, cls, txt) { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; },
  bar(rowCls, nameCls, trackCls, fillCls, pctCls, name, pct, pctText) {
    const row = this.el('div', rowCls), track = this.el('div', trackCls), fill = this.el('div', fillCls);
    requestAnimationFrame(() => { fill.style.width = pct + '%'; }); track.appendChild(fill);
    row.append(this.el('div', nameCls, name), track, this.el('div', pctCls, pctText)); return row;
  },
  placeholder() { const g = document.getElementById('grid'); g.textContent = ''; g.appendChild(this.el('div', 'neuron-empty', 'O mapa exibe os times e os 10 neurônios mais ativos após cada resposta.')); },
  init() { this.placeholder(); },
  resizeMap() { this.placeholder(); },
  status(s) { const e = document.getElementById('status'); if (e) e.textContent = s; },
  show(r) {
    const g = document.getElementById('grid'); g.textContent = '';
    for (const lv of [{ key: 'baixa', label: 'Baixa' }, { key: 'media', label: 'Média' }, { key: 'alta', label: 'Alta' }]) {
      const sel = lv.label === r.level, section = this.el('div', 'team-level' + (sel ? ' selected' : ''), '');
      section.appendChild(this.el('div', 'team-level-title', lv.label + (sel ? ' (selecionado)' : '')));
      const data = (r.teams || {})[lv.key];
      if (!data) section.appendChild(this.el('div', 'neuron-empty', 'inativo'));
      else for (const t of data) section.appendChild(this.bar('team-row', 'team-name', 'team-track', 'team-fill ' + (t.temp <= 33 ? 'cold' : t.temp <= 66 ? 'mid' : 'hot'), 'team-pct', t.id + ' · ' + t.size, t.temp, t.temp + '% · ' + t.active + ' ativos'));
      g.appendChild(section);
    }
    const acts = Array.from(r.activations || []).map((v, i) => ({ i, v: Math.abs(Number(v) || 0) })), max = acts.reduce((m, x) => Math.max(m, x.v), 0) || 1;
    const half = Math.floor((r.hidden || acts.length) / 2), top = acts.sort((a, b) => b.v - a.v).slice(0, 10);
    if (top.length) {
      g.appendChild(this.el('div', 'team-level-title', 'Top 10 neurônios'));
      for (const it of top) { const pct = Math.round((it.v / max) * 100); g.appendChild(this.bar('neuron-row', 'neuron-name', 'neuron-track', 'neuron-fill ' + (pct <= 33 ? 'low' : pct <= 66 ? 'mid' : 'high'), 'neuron-pct', (it.i < half ? 'T1' : 'T2') + ' #' + (it.i + 1), pct, pct + '%')); }
    }
    const st = r.sourceStats || {}, api = st.api || {}, wiki = st.wiki || {};
    document.getElementById('stats').textContent =
      'Nível ' + r.level + ': ' + r.hidden + ' neurônios ocultos · ' + (r.activeNeurons || 0) + ' ativos nesta inferência\n' +
      'Camadas: entrada ' + LUA.config.inputSize + ' → oculta ' + r.hidden + ' → saída ' + LUA.intentData.length + '\n' +
      'Parâmetros treináveis: ' + (r.parameters || 0).toLocaleString('pt-BR') + ' · atualizações de treino: ' + (r.weightUpdates || 0).toLocaleString('pt-BR') + '\n' +
      'Intenção: ' + r.intent + ' (' + Math.round(r.confidence * 100) + '%) · geração ' + r.generationMs.toFixed(1) + ' ms · validação ' + r.validationMs.toFixed(1) + ' ms\n' +
      'Conhecimento API: ' + (api.calls || 0) + ' chamadas · Wikipédia: ' + (wiki.calls || 0) + ' chamadas\n' +
      'Respostas na sessão: ' + LUA.session.count;
    const bars = document.getElementById('bars'); bars.textContent = '';
    if (r.probs && r.probs.length) for (const p of r.probs) { const pct = Math.round(p.p * 100); bars.appendChild(this.bar('neuron-row', 'neuron-name', 'neuron-track', 'neuron-fill ' + (pct <= 33 ? 'low' : pct <= 66 ? 'mid' : 'high'), 'neuron-pct', p.name, pct, pct + '%')); }
    else bars.appendChild(this.el('div', 'neuron-empty', 'Sem probabilidades (rede ainda treinando ou desligada).'));
    document.getElementById('lastText').textContent = r.text;
    const sec = LUA.securityStats;
    document.getElementById('securityStats').textContent = 'Estado: ' + sec.state + ' · validações: ' + sec.validations + ' · correções: ' + sec.corrections + ' · aprovadas: ' + sec.approved + ' · rejeitadas: ' + sec.rejected + '\nMemória: ' + sec.memory + (sec.lastIssue ? '\nÚltimo problema: ' + sec.lastIssue : '');
    this.status((r.approved ? 'Pronta · nível ' + r.level + ' · resposta validada' : 'Resposta não aprovada') + ' · ' + r.ms.toFixed(0) + ' ms');
  }
};
