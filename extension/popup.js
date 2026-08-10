/* Popup — salva config no chrome.storage e avisa a aba ativa */
const ativoEl = document.getElementById('ativo');
const velEl = document.getElementById('velocidade');

// carrega config salva
chrome.storage.local.get(['ativo', 'velocidade'], (cfg) => {
  if (cfg.ativo !== undefined) ativoEl.checked = cfg.ativo;
  if (cfg.velocidade) velEl.value = cfg.velocidade;
});

function salvar() {
  const cfg = { ativo: ativoEl.checked, velocidade: velEl.value };
  chrome.storage.local.set(cfg);
}

ativoEl.addEventListener('change', salvar);
velEl.addEventListener('change', salvar);
