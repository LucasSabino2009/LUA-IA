/* Aviso automático para instalar a LUA como aplicativo (PWA).
   Usa só recursos nativos: beforeinstallprompt, appinstalled e display-mode: standalone.
   O PWA em si (manifest.webmanifest + sw.js, registrado em main.js) já existia; aqui só se pergunta ao usuário.
   Carregado antes dos demais scripts para não perder o evento beforeinstallprompt. */
(function () {
  'use strict';
  var KEY = 'lua_pwa_install';
  var COOLDOWN_DIAS = 7;            /* "Agora não": espera 7 dias para perguntar de novo */
  var ATRASO_MS = 4000;             /* deixa a LUA abrir antes de mostrar o aviso */
  var DIA_MS = 24 * 60 * 60 * 1000;

  /* ---------- Estado persistido (localStorage) ---------- */
  function ler() {
    try { var v = JSON.parse(localStorage.getItem(KEY) || 'null'); return v && typeof v === 'object' ? v : {}; } catch (_) { return {}; }
  }
  function gravar(estado) {
    try { localStorage.setItem(KEY, JSON.stringify(estado)); return true; } catch (_) { return false; }
  }
  function storageOk() {
    try { var t = '__lua_pwa_teste'; localStorage.setItem(t, '1'); localStorage.removeItem(t); return true; } catch (_) { return false; }
  }
  function marcar(campos) { var e = ler(); for (var k in campos) e[k] = campos[k]; return gravar(e); }

  /* ---------- Detecção de ambiente ---------- */
  function emStandalone() {
    try {
      if (window.navigator.standalone === true) return true; /* iOS */
      var modos = ['standalone', 'fullscreen', 'minimal-ui', 'window-controls-overlay'];
      for (var i = 0; i < modos.length; i++) if (window.matchMedia('(display-mode: ' + modos[i] + ')').matches) return true;
    } catch (_) {}
    return false;
  }
  function ehIOS() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); /* iPadOS se identifica como Mac */
  }
  function ehSafariIOS() { /* Chrome/Firefox/Edge no iOS têm menu diferente; as instruções valem para o Safari */
    return ehIOS() && !/CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\//.test(navigator.userAgent || '');
  }
  function podePerguntar() {
    var e = ler();
    if (e.installed) return false;
    if (emStandalone()) return false;
    if (e.dismissedAt && Date.now() - e.dismissedAt < COOLDOWN_DIAS * DIA_MS) return false;
    return true;
  }

  /* ---------- Estado em memória ---------- */
  var adiado = null;        /* evento beforeinstallprompt guardado (só pode ser usado uma vez) */
  var el = null;            /* elemento do aviso */
  var timer = null;
  var modoIOS = false;

  /* ---------- Interface ---------- */
  function criar() {
    var box = document.createElement('aside');
    box.className = 'lua-pwa';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Instalar a LUA-IA');
    box.setAttribute('aria-live', 'polite');
    box.innerHTML =
      '<img class="lua-pwa-icone" src="icons/icon-192.png" alt="" width="44" height="44">' +
      '<div class="lua-pwa-corpo">' +
      '<strong class="lua-pwa-titulo">Instale a LUA-IA</strong>' +
      '<p class="lua-pwa-texto">Tenha sua própria LUA-IA como aplicativo, com acesso rápido diretamente pela tela inicial.</p>' +
      '<ol class="lua-pwa-passos" hidden>' +
      '<li>Toque em <b>Compartilhar</b> <span class="lua-pwa-share" aria-hidden="true">' +
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M8 7l4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg></span> na barra do Safari.</li>' +
      '<li>Escolha <b>Adicionar à Tela de Início</b>.</li>' +
      '<li>Confirme em <b>Adicionar</b>.</li></ol>' +
      '<div class="lua-pwa-acoes">' +
      '<button type="button" class="lua-pwa-instalar">Instalar agora</button>' +
      '<button type="button" class="lua-pwa-depois">Agora não</button></div></div>';
    box.querySelector('.lua-pwa-instalar').addEventListener('click', instalar);
    box.querySelector('.lua-pwa-depois').addEventListener('click', agoraNao);
    box.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') agoraNao(); });
    return box;
  }

  function mostrar() {
    if (el || !podePerguntar() || !storageOk()) return; /* sem localStorage não dá para lembrar a escolha: não incomoda */
    if (!modoIOS && !adiado) return;                    /* nada nativo para chamar: não mostra botão que não funciona */
    el = criar();
    document.body.appendChild(el);
    void el.offsetWidth;                                /* força o início da transição */
    el.classList.add('lua-pwa-on');
  }

  function esconder(depois) {
    clearTimeout(timer);
    if (!el) return;
    var alvo = el; el = null;
    alvo.classList.remove('lua-pwa-on');
    alvo.classList.add('lua-pwa-saindo');
    var fim = function () { if (alvo.parentNode) alvo.parentNode.removeChild(alvo); if (depois) depois(); };
    alvo.addEventListener('transitionend', fim, { once: true });
    setTimeout(fim, 500);                               /* garante a remoção mesmo sem transição (movimento reduzido) */
  }

  function agendar() {
    clearTimeout(timer);
    if (!podePerguntar()) return;
    timer = setTimeout(mostrar, ATRASO_MS);
  }

  /* ---------- Ações ---------- */
  function agoraNao() {
    marcar({ dismissedAt: Date.now() });
    esconder();
  }

  function instalar() {
    if (modoIOS) { /* iOS não tem API de instalação: mostra o passo a passo do Safari */
      var passos = el && el.querySelector('.lua-pwa-passos');
      var btn = el && el.querySelector('.lua-pwa-instalar');
      if (passos) passos.hidden = false;
      if (btn) btn.hidden = true;
      var depois = el && el.querySelector('.lua-pwa-depois');
      if (depois) depois.textContent = 'Entendi';
      return;
    }
    var evento = adiado;
    if (!evento) return esconder();
    adiado = null;                                       /* o evento só pode ser usado uma vez */
    esconder();
    try {
      evento.prompt();                                   /* diálogo nativo do navegador */
      evento.userChoice.then(function (r) {
        if (r && r.outcome === 'accepted') marcar({ installed: true, installedAt: Date.now() });
        else marcar({ dismissedAt: Date.now() });        /* recusou no diálogo nativo = "agora não" */
      }, function () { marcar({ dismissedAt: Date.now() }); });
    } catch (_) { marcar({ dismissedAt: Date.now() }); }
  }

  /* ---------- Eventos nativos ---------- */
  window.addEventListener('beforeinstallprompt', function (ev) {
    ev.preventDefault();                                 /* impede o mini-aviso automático; o nosso aviso assume */
    if (!podePerguntar()) { adiado = ev; return; }
    adiado = ev;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', agendar); else agendar();
  });

  window.addEventListener('appinstalled', function () {
    adiado = null;
    marcar({ installed: true, installedAt: Date.now() });
    esconder();
  });

  /* Se o app passar a rodar em standalone (ex.: instalado enquanto a aba estava aberta), some na hora. */
  try {
    var mq = window.matchMedia('(display-mode: standalone)');
    var aoMudar = function (m) { if (m.matches) esconder(); };
    if (mq.addEventListener) mq.addEventListener('change', aoMudar); else if (mq.addListener) mq.addListener(aoMudar);
  } catch (_) {}

  /* ---------- iPhone / iPad (Safari): sem beforeinstallprompt, instrução manual ---------- */
  document.addEventListener('DOMContentLoaded', function () {
    if (ehSafariIOS() && !emStandalone()) { modoIOS = true; agendar(); }
  });

  /* Pequena API para depuração e testes. */
  window.LUA = window.LUA || {};
  window.LUA.pwaInstall = {
    estado: ler, podePerguntar: podePerguntar, emStandalone: emStandalone,
    resetar: function () { try { localStorage.removeItem(KEY); } catch (_) {} }
  };
})();
