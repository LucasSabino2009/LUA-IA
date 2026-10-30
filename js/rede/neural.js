/* MLP em JS puro: entrada esparsa (palavras + trigramas de caracteres), 1 camada oculta tanh, saída softmax.
   Treino por backpropagation (SGD) em lotes assíncronos para não travar o celular; pesos salvos no IndexedDB. */
window.LUA = window.LUA || {};
LUA.LEVELS = {
  low: { hidden: 1000, teams: [{ id: 'Time 1', size: 500 }, { id: 'Time 2', size: 500 }] },
  mid: { hidden: 2000, teams: [{ id: 'Time 1', size: 1000 }, { id: 'Time 2', size: 1000 }] },
  high: { hidden: 3000, teams: [{ id: 'Time 1', size: 1500 }, { id: 'Time 2', size: 1500 }] }
};
LUA.Neural = class {
  constructor(hidden = 1000, levelKey = 'low') {
    this.hidden = hidden; this.levelKey = levelKey;
    this.input = LUA.config.inputSize; this.output = LUA.intentData.length;
    this.w1 = new Float32Array(this.input * hidden); this.b1 = new Float32Array(hidden);
    this.w2 = new Float32Array(hidden * this.output); this.b2 = new Float32Array(this.output);
    this.lastHidden = new Float32Array(hidden); this.lastOut = new Float32Array(this.output);
    this.trained = false; this.updates = 0; this.accuracy = 0; this.loaded = false;
    this.init();
  }
  init() { /* inicialização determinística (mulberry32) => treino reproduzível */
    let a = 0x9e3779b9 ^ this.hidden;
    const rnd = () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const s1 = Math.sqrt(6 / (this.input + this.hidden)), s2 = Math.sqrt(6 / (this.hidden + this.output));
    for (let i = 0; i < this.w1.length; i++) this.w1[i] = (rnd() * 2 - 1) * s1;
    for (let i = 0; i < this.w2.length; i++) this.w2[i] = (rnd() * 2 - 1) * s2;
    this._rnd = rnd;
  }
  hash(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  /* Metade das posições para palavras inteiras, metade para trigramas: generaliza melhor que só palavras. */
  encode(text) {
    const half = this.input >> 1, x = new Float32Array(this.input);
    const words = LUA.utils.norm(text).split(/\s+/).filter(Boolean);
    for (const w of words) {
      x[this.hash('w' + w) % half] += 1;
      const p = '^' + w + '$';
      for (let i = 0; i + 3 <= p.length; i++) x[half + (this.hash('t' + p.slice(i, i + 3)) % half)] += 0.5;
    }
    let n = 0; for (let i = 0; i < x.length; i++) n += x[i] * x[i];
    n = Math.sqrt(n) || 1; for (let i = 0; i < x.length; i++) x[i] /= n;
    return x;
  }
  forward(x) {
    const H = this.hidden, O = this.output, I = this.input, a = this.lastHidden, y = this.lastOut;
    const nz = []; for (let i = 0; i < I; i++) if (x[i] !== 0) nz.push(i);
    for (let j = 0; j < H; j++) { let s = this.b1[j]; const off = j * I; for (let q = 0; q < nz.length; q++) { const i = nz[q]; s += this.w1[off + i] * x[i]; } a[j] = Math.tanh(s); }
    let max = -Infinity;
    for (let k = 0; k < O; k++) { let s = this.b2[k]; const off = k * H; for (let j = 0; j < H; j++) s += this.w2[off + j] * a[j]; y[k] = s; if (s > max) max = s; }
    let sum = 0; for (let k = 0; k < O; k++) { y[k] = Math.exp(y[k] - max); sum += y[k]; } for (let k = 0; k < O; k++) y[k] /= sum;
    this._nz = nz; return y;
  }
  step(x, label, lr) { /* uma atualização SGD; devolve a perda */
    const H = this.hidden, O = this.output, I = this.input, p = this.forward(x), nz = this._nz, dh = new Float32Array(H);
    for (let k = 0; k < O; k++) { const err = p[k] - (k === label ? 1 : 0), off = k * H; this.b2[k] -= lr * err; for (let j = 0; j < H; j++) { dh[j] += err * this.w2[off + j]; this.w2[off + j] -= lr * err * this.lastHidden[j]; } }
    for (let j = 0; j < H; j++) { const d = dh[j] * (1 - this.lastHidden[j] * this.lastHidden[j]); this.b1[j] -= lr * d; const off = j * I; for (let q = 0; q < nz.length; q++) { const i = nz[q]; this.w1[off + i] -= lr * d * x[i]; } }
    this.updates++; return -Math.log(Math.max(p[label], 1e-9));
  }
  evaluate(encoded) { let ok = 0; for (const e of encoded) { const p = this.forward(e.x); let b = 0; for (let k = 1; k < p.length; k++) if (p[k] > p[b]) b = k; if (b === e.label) ok++; } return ok / (encoded.length || 1); }
  /* Treino assíncrono: cede o controle ao navegador a cada época e para cedo ao atingir a meta. */
  async trainAsync(samples, opt = {}) {
    if (!Array.isArray(samples) || !samples.length) return { updates: this.updates, trained: this.trained, accuracy: this.accuracy, epochs: 0 };
    const maxEpochs = opt.maxEpochs || 60, target = opt.target || 0.985, lr0 = opt.lr || 0.25;
    const enc = samples.map((s) => ({ x: this.encode(s.text), label: s.label }));
    const order = enc.map((_, i) => i); let epoch = 0, acc = 0;
    for (; epoch < maxEpochs; epoch++) {
      for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(this._rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      const lr = lr0 * (epoch < maxEpochs * 0.6 ? 1 : 0.4);
      for (const idx of order) this.step(enc[idx].x, enc[idx].label, lr);
      acc = this.evaluate(enc);
      if (opt.onProgress) opt.onProgress(epoch + 1, acc);
      if (acc >= target && epoch >= 3) { epoch++; break; }
      await new Promise((r) => setTimeout(r, 0));
    }
    this.trained = true; this.accuracy = acc; return { updates: this.updates, trained: true, accuracy: acc, epochs: epoch };
  }
  teamStats() {
    const h = this.hidden, half = Math.floor(h / 2), g = [{ id: 'Time 1', size: half, vals: [] }, { id: 'Time 2', size: h - half, vals: [] }];
    for (let j = 0; j < h; j++) g[j < half ? 0 : 1].vals.push(Math.abs(this.lastHidden[j]));
    return g.map((t) => ({ id: t.id, size: t.size, temp: Math.round((t.vals.reduce((s, v) => s + v, 0) / (t.vals.length || 1)) * 100), active: t.vals.filter((v) => v > 0.5).length }));
  }
  predict(text) { const p = Array.from(this.forward(this.encode(text))); let index = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[index]) index = i; return { index, confidence: p[index], probabilities: p }; }
  get parameterCount() { return this.w1.length + this.b1.length + this.w2.length + this.b2.length; }
  /* Persistência em IndexedDB (Float32Array direto, sem limite de 5 MB do localStorage). */
  static db() {
    return new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') return rej(new Error('sem IndexedDB'));
      const r = indexedDB.open('lua_neural_db', 1);
      r.onupgradeneeded = () => r.result.createObjectStore('w');
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async save(sig) {
    try {
      const db = await LUA.Neural.db();
      await new Promise((res, rej) => { const tx = db.transaction('w', 'readwrite'); tx.objectStore('w').put({ sig, hidden: this.hidden, input: this.input, output: this.output, updates: this.updates, accuracy: this.accuracy, w1: this.w1, b1: this.b1, w2: this.w2, b2: this.b2 }, 'h' + this.hidden); tx.oncomplete = res; tx.onerror = () => rej(tx.error); });
      return true;
    } catch (_) { return false; }
  }
  async load(sig) {
    try {
      const db = await LUA.Neural.db();
      const d = await new Promise((res, rej) => { const r = db.transaction('w').objectStore('w').get('h' + this.hidden); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
      if (!d || d.sig !== sig || d.hidden !== this.hidden || d.input !== this.input || d.output !== this.output || d.w1.length !== this.w1.length || d.w2.length !== this.w2.length) return false;
      this.w1.set(d.w1); this.b1.set(d.b1); this.w2.set(d.w2); this.b2.set(d.b2);
      this.updates = d.updates || 0; this.accuracy = d.accuracy || 0; this.trained = true; this.loaded = true; return true;
    } catch (_) { return false; }
  }
};
