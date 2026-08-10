/* storage-bridge.js — world ISOLATED
   Ponte entre chrome.storage (só acessível no mundo isolado) e o
   inject.js (world MAIN). Repassa config (ativo/velocidade). */
(function () {
  function enviar(cfg) {
    window.postMessage({
      __leitorVlibrasCfg: true,
      ativo: cfg.ativo !== undefined ? cfg.ativo : true,
      velocidade: cfg.velocidade || '2.5x'
    }, '*');
  }
  chrome.storage.local.get(['ativo', 'velocidade'], enviar);
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    chrome.storage.local.get(['ativo', 'velocidade'], enviar);
  });
})();
