/* =========================================================
   inject.js — roda em world:MAIN na página do YouTube.
   Técnica (inspirada no Ketuvia): intercepta as requisições de
   legenda (timedtext) do próprio YouTube, força fmt=json3 e extrai
   os segmentos {texto, startMs, endMs}. Depois, em ORDEM, envia
   cada legenda ao iframe do VLibras e ESPERA o avatar terminar
   (gloss:end) antes de enviar a próxima.
   ========================================================= */
(function () {
  'use strict';
  if (window.__leitorVlibrasInject) return;
  window.__leitorVlibrasInject = true;

  const LOG = '[Leitor VLibras/inject]';
  function log() { try { console.log.apply(console, [LOG].concat([].slice.call(arguments))); } catch (e) {} }

  const FRAME_URL = 'https://rhumfloripa.github.io/Leitor_Vlibras/vlibras-frame.html';

  const STATE = {
    cues: [],            // [{startMs, endMs, text}] ordenados por tempo
    ativo: true,
    frame: null,
    frameWin: null,
    framePronto: false,
    // controle de fila/sincronização
    traduzindo: false,   // avatar ocupado (aguardando gloss:end)
    ultimoIndiceEnviado: -1,
    timerSeguranca: null,
  };

  /* ---------- 1) INTERCEPTAÇÃO das requisições timedtext ---------- */
  function rewriteTimedtextUrl(url) {
    try { const u = new URL(url, location.href); u.searchParams.set('fmt', 'json3'); return u.toString(); }
    catch (e) { return url; }
  }
  function parseJson3(body) {
    const out = [];
    try {
      const data = typeof body === 'string' ? JSON.parse(body) : body;
      if (!data || !Array.isArray(data.events)) return out;
      for (const ev of data.events) {
        if (!ev.segs) continue;
        const text = ev.segs.map(s => s.utf8 || '').join('').replace(/\s+/g, ' ').trim();
        if (!text) continue;
        const startMs = ev.tStartMs || 0;
        const durMs = ev.dDurationMs || 0;
        out.push({ startMs: startMs, endMs: startMs + durMs, text: text });
      }
    } catch (e) { log('parseJson3 erro', e.message); }
    return out;
  }
  function onTimedtextBody(url, body) {
    const cues = parseJson3(body);
    if (cues.length) {
      cues.sort((a, b) => a.startMs - b.startMs);
      STATE.cues = cues;
      log('legenda capturada:', cues.length, 'segmentos');
    }
  }

  const _origFetch = window.fetch;
  window.fetch = function (input) {
    let url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
    if (url.indexOf('timedtext') > -1) {
      const newUrl = rewriteTimedtextUrl(url);
      _origFetch.call(window, newUrl).then(r => r.text()).then(t => onTimedtextBody(newUrl, t)).catch(() => {});
    }
    return _origFetch.apply(this, arguments);
  };
  const _open = XMLHttpRequest.prototype.open;
  const _send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    this.__isTimedtext = (typeof url === 'string' && url.indexOf('timedtext') > -1);
    if (this.__isTimedtext) this.__ttUrl = rewriteTimedtextUrl(url);
    return _open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    if (this.__isTimedtext && this.__ttUrl) {
      _origFetch.call(window, this.__ttUrl).then(r => r.text()).then(t => onTimedtextBody(this.__ttUrl, t)).catch(() => {});
    }
    return _send.apply(this, arguments);
  };

  /* ---------- 2) IFRAME do VLibras (maior + sobreposto) ---------- */
  function injetarFrame() {
    if (STATE.frame) return;
    const iframe = document.createElement('iframe');
    iframe.id = 'leitor-vlibras-frame';
    iframe.src = FRAME_URL;
    iframe.setAttribute('allow', 'autoplay');
    Object.assign(iframe.style, {
      position: 'fixed',
      right: '20px',
      bottom: '20px',
      width: '300px',
      height: '440px',                 // MAIOR na altura (avatar + controles)
      border: '0',
      zIndex: '2147483647',            // acima de tudo do YouTube
      background: 'transparent',
      pointerEvents: 'auto',
      boxShadow: '0 6px 32px rgba(0,0,0,.5)',
      borderRadius: '14px',
      overflow: 'hidden'
    });
    document.body.appendChild(iframe);
    STATE.frame = iframe;
    iframe.addEventListener('load', () => { STATE.frameWin = iframe.contentWindow; });
    log('iframe VLibras injetado ->', FRAME_URL);
  }

  function postFrame(msg) {
    const w = STATE.frame && STATE.frame.contentWindow;
    if (w) w.postMessage(Object.assign({ __leitorVlibras: true }, msg), '*');
  }

  /* ---------- 3) FILA SINCRONIZADA (espera gloss:end) ----------
     Em vez de "empurrar" o cue ativo a cada tick, seguimos os cues
     em ORDEM: enviamos um, marcamos traduzindo=true, e só liberamos
     o próximo quando o frame avisar 'gloss:end' (ou por timeout de
     segurança). Isso evita atropelar o avatar. */
  function getVideo() { return document.querySelector('video.html5-main-video') || document.querySelector('video'); }

  // índice do cue que corresponde ao tempo atual do vídeo
  function indiceCueNoTempo(ms) {
    let idx = -1;
    for (let i = 0; i < STATE.cues.length; i++) {
      if (ms >= STATE.cues[i].startMs) idx = i; else break;
    }
    return idx;
  }

  function enviarProximo() {
    if (!STATE.ativo || STATE.traduzindo || !STATE.framePronto || !STATE.cues.length) return;
    const v = getVideo();
    if (!v) return;
    const ms = v.currentTime * 1000;
    const idxAtual = indiceCueNoTempo(ms);
    // só envia se há um cue novo (à frente do último enviado) já "ativo" no tempo
    if (idxAtual > STATE.ultimoIndiceEnviado) {
      const proximo = STATE.ultimoIndiceEnviado + 1;
      const cue = STATE.cues[proximo];
      if (!cue) return;
      STATE.ultimoIndiceEnviado = proximo;
      STATE.traduzindo = true;
      postFrame({ tipo: 'legenda', texto: cue.text });
      log('→ enviado [' + proximo + ']:', cue.text.slice(0, 40));
      // segurança: se gloss:end não vier em 8s, libera
      clearTimeout(STATE.timerSeguranca);
      STATE.timerSeguranca = setTimeout(function () {
        if (STATE.traduzindo) { log('⏱ timeout gloss:end — liberando'); STATE.traduzindo = false; }
      }, 8000);
    }
  }

  // se o usuário pular no vídeo (seek), re-sincroniza o índice
  function ressincronizarSeSeek() {
    const v = getVideo();
    if (!v || !STATE.cues.length) return;
    const ms = v.currentTime * 1000;
    const idxAtual = indiceCueNoTempo(ms);
    // se voltou atrás ou pulou muito à frente, realinha
    if (idxAtual < STATE.ultimoIndiceEnviado - 1 || idxAtual > STATE.ultimoIndiceEnviado + 3) {
      STATE.ultimoIndiceEnviado = idxAtual - 1;
      STATE.traduzindo = false;
      log('seek detectado — re-sincronizado para índice', idxAtual);
    }
  }

  function tick() {
    ressincronizarSeSeek();
    enviarProximo();
  }

  /* ---------- 4) init ---------- */
  function init() {
    injetarFrame();
    setInterval(tick, 250);
    log('inject ativo');
  }
  if (document.body) init();
  else document.addEventListener('DOMContentLoaded', init);

  /* ---------- 5) mensagens vindas do frame e da config ---------- */
  window.addEventListener('message', function (ev) {
    const d = ev.data;
    if (!d) return;

    // do frame do VLibras
    if (d.__leitorVlibras === true) {
      if (d.tipo === 'pronto') {
        STATE.framePronto = true;
        log('frame VLibras pronto');
      } else if (d.tipo === 'gloss:end') {
        // avatar terminou → libera o próximo
        clearTimeout(STATE.timerSeguranca);
        STATE.traduzindo = false;
      }
      return;
    }

    // da config (storage-bridge, world ISOLATED)
    if (d.__leitorVlibrasCfg === true) {
      if (typeof d.ativo === 'boolean') STATE.ativo = d.ativo;
      if (d.velocidade) postFrame({ tipo: 'config', config: { velocidade: d.velocidade } });
    }
  });
})();
