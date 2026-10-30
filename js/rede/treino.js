/* Monta o dataset a partir de LUA.intentData e treina/carrega a rede do nível atual (assíncrono, com cache). */
window.LUA = window.LUA || {};
LUA.training = {
  samples: [], done: false, busy: null, info: { fromCache: false, accuracy: 0, epochs: 0, ms: 0 },
  build() { this.samples = []; LUA.intentData.forEach((row, label) => row[1].forEach((text) => this.samples.push({ text, label }))); return this.samples; },
  signature() { let h = 5381; for (const s of this.samples) { const t = s.label + ':' + s.text; for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) | 0; } return 'v2-' + LUA.config.inputSize + '-' + this.samples.length + '-' + (h >>> 0); },
  /* Garante que a rede atual esteja pronta. Chamadas simultâneas compartilham a mesma promessa. */
  ensure(onStatus) {
    const net = LUA.levels.network; if (!net) return Promise.resolve(null);
    if (net.trained) { this.done = true; return Promise.resolve(this.info); }
    if (this.busy && this.busyNet === net) return this.busy;
    this.done = false; this.busyNet = net;
    this.busy = (async () => {
      const t0 = performance.now(); if (!this.samples.length) this.build(); const sig = this.signature();
      if (await net.load(sig)) { this.info = { fromCache: true, accuracy: net.accuracy, epochs: 0, ms: performance.now() - t0 }; }
      else {
        const r = await net.trainAsync(this.samples, { onProgress: (e, acc) => { if (onStatus) onStatus('Treinando rede (' + LUA.levels.label() + ') · época ' + e + ' · acerto ' + Math.round(acc * 100) + '%'); } });
        await net.save(sig); this.info = { fromCache: false, accuracy: r.accuracy, epochs: r.epochs, ms: performance.now() - t0 };
      }
      this.done = net.trained; this.busy = null; return this.info;
    })().catch((e) => { this.busy = null; this.info = { error: e.message }; return this.info; });
    return this.busy;
  }
};
LUA.training.build();
