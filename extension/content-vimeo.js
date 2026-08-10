/* content-vimeo.js — lê a legenda do Vimeo (SDK cuechange) e envia ao iframe VLibras */
(function () {
  'use strict';

/* Injeta o iframe da extensão (VLibras roda lá, sem CSP do YouTube) */
function injetarFrameVLibras() {
  if (document.getElementById('leitor-vlibras-frame')) return;
  const iframe = document.createElement('iframe');
  iframe.id = 'leitor-vlibras-frame';
  iframe.src = chrome.runtime.getURL('vlibras-frame.html');
  iframe.setAttribute('allow', 'autoplay');
  Object.assign(iframe.style, {
    position: 'fixed', right: '0', bottom: '0',
    width: '320px', height: '320px', border: '0', zIndex: '2147483647',
    background: 'transparent', colorScheme: 'normal'
  });
  document.body.appendChild(iframe);
  return iframe;
}

let _frame = null;
function frameWin() { return _frame && _frame.contentWindow; }

function enviarLegendaFrame(texto) {
  const w = frameWin();
  if (w) w.postMessage({ __leitorVlibras: true, tipo: 'legenda', texto: texto }, '*');
}
function enviarConfigFrame(config) {
  const w = frameWin();
  if (w) w.postMessage({ __leitorVlibras: true, tipo: 'config', config: config }, '*');
}

// carrega config salva e envia ao frame quando ele estiver pronto
function iniciarFrameComConfig() {
  _frame = injetarFrameVLibras();
  chrome.storage.local.get(['ativo', 'velocidade'], (cfg) => {
    const config = {
      ativo: cfg.ativo !== undefined ? cfg.ativo : true,
      velocidade: cfg.velocidade || '2.5x',
      intervaloMax: 4000
    };
    // reenvia a config algumas vezes até o frame carregar o VLibras
    let tentativas = 0;
    const t = setInterval(() => {
      enviarConfigFrame(config);
      if (++tentativas > 20) clearInterval(t);
    }, 1000);
  });
}

  function carregarSDK(cb) {
    if (typeof Vimeo !== 'undefined' && Vimeo.Player) { cb(); return; }
    const s = document.createElement('script');
    s.src = 'https://player.vimeo.com/api/player.js';
    s.onload = cb;
    s.onerror = () => console.log('[Leitor VLibras] falha ao carregar Vimeo SDK');
    document.head.appendChild(s);
  }
  function conectar() {
    const iframe = document.querySelector('iframe[src*="player.vimeo.com"], .vp-video');
    try {
      const player = iframe ? new Vimeo.Player(iframe) : null;
      if (!player) { console.log('[Leitor VLibras] player Vimeo não encontrado'); return; }
      player.ready().then(() => { player.enableTextTrack('pt').catch(()=>{}); }).catch(()=>{});
      player.on('cuechange', function (data) {
        const cue = (data.cues && data.cues[0]) ? data.cues[0] : null;
        const texto = cue ? (cue.text || '').replace(/\s+/g, ' ').trim() : '';
        if (texto) enviarLegendaFrame(texto);
      });
      console.log('[Leitor VLibras] Vimeo conectado');
    } catch (e) { console.log('[Leitor VLibras] erro Vimeo:', e.message); }
  }
  function iniciar() {
    if (!document.body) { setTimeout(iniciar, 300); return; }
    iniciarFrameComConfig();
    carregarSDK(conectar);
    console.log('[Leitor VLibras] captura Vimeo ativa');
  }
  iniciar();
})();
