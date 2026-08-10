/* content-youtube.js — lê a legenda do YouTube e envia ao iframe VLibras */
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

  const SELETORES = ['.ytp-caption-segment', '.ytp-caption-window-segment', '.captions-text span', '#caption-window span'];
  function lerLegenda() {
    for (const sel of SELETORES) {
      const nodes = document.querySelectorAll(sel);
      if (nodes.length) return Array.from(nodes).map(n => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    }
    return '';
  }
  let ultima = '';
  function tick() {
    const texto = lerLegenda();
    if (texto && texto !== ultima) { ultima = texto; enviarLegendaFrame(texto); }
  }
  function iniciar() {
    if (!document.body) { setTimeout(iniciar, 300); return; }
    iniciarFrameComConfig();
    setInterval(tick, 300);
    console.log('[Leitor VLibras] captura YouTube ativa');
  }
  iniciar();
})();
