/* storage-bridge.js — world ISOLATED
   Ponte entre chrome.storage (só acessível no mundo isolado) e o
   inject.js (world MAIN). Repassa config (ativo/velocidade).

   Corrida evitada: como este script roda em document_start e o
   inject.js só roda em document_idle, o primeiro envio abaixo pode
   sair antes do inject.js estar escutando (a mensagem se perde,
   sem buffer). Por isso também respondemos sob demanda a um pedido
   ("__leitorVlibrasSolicitarCfg") que o inject.js dispara assim que
   liga seu próprio listener — garantindo que a config real (inclusive
   ativo:false) sempre chegue. */
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
  window.addEventListener('message', function (ev) {
    if (ev.data && ev.data.__leitorVlibrasSolicitarCfg === true) {
      chrome.storage.local.get(['ativo', 'velocidade'], enviar);
    }
  });
})();
