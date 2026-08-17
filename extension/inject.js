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

  function ts() {
    const d = new Date();
    return d.toLocaleTimeString('pt-BR') + '.' + String(d.getMilliseconds()).padStart(3, '0');
  }
  // marca de quando cada legenda foi enviada, para medir a duração até o gloss:end
  let _envioEmMs = 0;

  const FRAME_URL = 'https://rhumfloripa.github.io/Leitor_Vlibras/vlibras-frame.html';

  const STATE = {
    cues: [],            // [{startMs, endMs, text}] ordenados por tempo
    ativo: true,
    velocidade: '2.5x',
    configRecebida: false,
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
      borderRadius: '14px',
      overflow: 'hidden'
    });
    document.body.appendChild(iframe);
    STATE.frame = iframe;
    iframe.addEventListener('load', () => { STATE.frameWin = iframe.contentWindow; });
    log('iframe VLibras injetado ->', FRAME_URL);
  }

  function removerFrame() {
    if (!STATE.frame) return;
    STATE.frame.remove();
    STATE.frame = null;
    STATE.frameWin = null;
    STATE.framePronto = false;
    STATE.traduzindo = false;
    clearTimeout(STATE.timerSeguranca);
    log('iframe VLibras removido (desativado pelo usuário)');
  }

  // aplica o estado ativo/inativo: mostra ou remove o avatar da tela
  function aplicarAtivo() {
    if (STATE.ativo) injetarFrame();
    else removerFrame();
  }

  function postFrame(msg) {
    const w = STATE.frame && STATE.frame.contentWindow;
    if (w) w.postMessage(Object.assign({ __leitorVlibras: true }, msg), '*');
  }

  /* ---------- 3) FILA COMPLETA — traduz TODAS em ordem ----------
     Envia os cues sequencialmente (índice a índice). Só avança para
     o próximo quando o avatar termina (gloss:end). NÃO pula nenhuma
     legenda — o avatar fica naturalmente atrás do vídeo nas falas
     densas, mas nada é perdido. */
  function getVideo() { return document.querySelector('video.html5-main-video') || document.querySelector('video'); }

  // o VLibras depende das legendas (CC) do YouTube para funcionar, e o
  // próprio iframe do avatar cobre parte da barra de controles do player,
  // dificultando clicar no botão manualmente. Por isso, com o avatar
  // ativo, ligamos a legenda automaticamente assim que o botão existir
  // e estiver desligado (nunca desligamos — só forçamos ligado).
  function garantirLegendaAtiva() {
    if (!STATE.ativo) return;
    const btn = document.querySelector('.ytp-subtitles-button');
    if (btn && btn.getAttribute('aria-pressed') === 'false') {
      btn.click();
      log('legenda (CC) ativada automaticamente — necessária para o VLibras');
    }
  }

  // índice do cue correspondente ao tempo atual do vídeo (para começar/re-sincronizar em seek)
  function indiceNoTempo(ms) {
    let idx = -1;
    for (let i = 0; i < STATE.cues.length; i++) {
      if (STATE.cues[i].startMs <= ms) idx = i; else break;
    }
    return idx;
  }

  function enviarProximo() {
    if (!STATE.ativo || STATE.traduzindo || !STATE.framePronto || !STATE.cues.length) return;

    // ainda não começou: só arranca quando o vídeo passar do 1º cue
    const v = getVideo();
    if (!v) return;
    const msAtual = v.currentTime * 1000;

    // se nunca enviou nada, alinha o ponto de partida ao tempo atual do vídeo
    if (STATE.ultimoIndiceEnviado < 0) {
      const idxInicio = indiceNoTempo(msAtual);
      if (idxInicio < 0) return;              // vídeo ainda antes da 1ª legenda
      STATE.ultimoIndiceEnviado = idxInicio - 1; // para o próximo ser idxInicio
    }

    const proximo = STATE.ultimoIndiceEnviado + 1;
    const cue = STATE.cues[proximo];
    if (!cue) return;                          // acabaram as legendas
    // FILA COMPLETA: envia a próxima assim que o avatar liberar, mesmo que
    // o vídeo já tenha passado dela (o avatar fica atrás, mas não perde nada).
    // Só NÃO envia se a legenda ainda está no futuro (vídeo não chegou nela).
    if (cue.startMs > msAtual + 500) return;   // ainda no futuro → espera

    STATE.ultimoIndiceEnviado = proximo;
    STATE.traduzindo = true;
    _envioEmMs = performance.now();
    postFrame({ tipo: 'legenda', texto: cue.text });
    const atraso = ((msAtual - cue.startMs) / 1000).toFixed(1);
    console.log('%c[VLibras] ENVIADO ' + ts() + ' | cue[' + proximo + '/' + STATE.cues.length + '] | vídeo=' + v.currentTime.toFixed(1) + 's | atraso=' + atraso + 's', 'color:#3d7bf0;font-weight:bold');
    console.log('   frase: "' + cue.text + '"');

    // segurança: libera se gloss:end não vier (soletração de termos travа o evento)
    clearTimeout(STATE.timerSeguranca);
    STATE.timerSeguranca = setTimeout(function () {
      if (STATE.traduzindo) { console.log('%c[VLibras] ⏱ timeout — liberando', 'color:#e2a03f'); STATE.traduzindo = false; enviarProximo(); }
    }, 10000);
  }

  // Detecta APENAS seek grande (usuário pulou o vídeo de verdade), medindo
  // salto brusco no currentTime entre ticks — NUNCA confunde com atraso do avatar.
  let _ultimoTempoVideo = 0;
  function checarSeek() {
    const v = getVideo();
    if (!v || !STATE.cues.length) return;
    const ms = v.currentTime * 1000;
    const salto = Math.abs(ms - _ultimoTempoVideo);
    _ultimoTempoVideo = ms;
    // salto > 5s entre dois ticks (250ms) = seek manual real (não é reprodução normal)
    if (salto > 5000 && STATE.ultimoIndiceEnviado >= 0) {
      const idxTempo = indiceNoTempo(ms);
      STATE.ultimoIndiceEnviado = idxTempo - 1;
      STATE.traduzindo = false;
      console.log('%c[VLibras] SEEK manual detectado (salto ' + (salto/1000).toFixed(1) + 's) → cue[' + idxTempo + ']', 'color:#e2a03f');
    }
  }

  function tick() { garantirLegendaAtiva(); checarSeek(); enviarProximo(); }

  /* ---------- 4) init ---------- */
  function init() {
    // pede a config real (ativo/velocidade) ao storage-bridge; enquanto ela
    // não chega, aguarda até 400ms antes de assumir o padrão (ativo=true),
    // evitando mostrar o avatar por um instante quando o usuário o desligou
    window.postMessage({ __leitorVlibrasSolicitarCfg: true }, '*');
    setTimeout(function () { if (!STATE.configRecebida) aplicarAtivo(); }, 400);
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
        postFrame({ tipo: 'config', config: { velocidade: STATE.velocidade } });
        log('frame VLibras pronto');
      } else if (d.tipo === 'gloss:end') {
        // avatar terminou → libera e envia a PRÓXIMA da fila (em ordem)
        clearTimeout(STATE.timerSeguranca);
        const durTraducao = _envioEmMs ? ((performance.now() - _envioEmMs) / 1000).toFixed(1) : '?';
        console.log('%c[VLibras] TERMINOU ' + ts() + ' | avatar levou ' + durTraducao + 's', 'color:#27ae60;font-weight:bold');
        STATE.traduzindo = false;
        setTimeout(enviarProximo, 100);
      }
      return;
    }

    // da config (storage-bridge, world ISOLATED)
    if (d.__leitorVlibrasCfg === true) {
      STATE.configRecebida = true;
      if (typeof d.ativo === 'boolean') STATE.ativo = d.ativo;
      if (d.velocidade) STATE.velocidade = d.velocidade;
      aplicarAtivo();
      if (STATE.framePronto) postFrame({ tipo: 'config', config: { velocidade: STATE.velocidade } });
    }
  });
})();
