/* Service worker — inicialização mínima (Manifest V3) */
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['ativo', 'velocidade'], (cfg) => {
    if (cfg.ativo === undefined) chrome.storage.local.set({ ativo: true, velocidade: '2.5x' });
  });
});
