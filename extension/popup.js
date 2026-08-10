/* popup.js — salva config no chrome.storage (o storage-bridge repassa ao inject) */
const $ = s => document.querySelector(s);
chrome.storage.local.get(['ativo', 'velocidade'], c => {
  $('#ativo').checked = c.ativo !== undefined ? c.ativo : true;
  if (c.velocidade) $('#velocidade').value = c.velocidade;
});
$('#ativo').addEventListener('change', e => chrome.storage.local.set({ ativo: e.target.checked }));
$('#velocidade').addEventListener('change', e => chrome.storage.local.set({ velocidade: e.target.value }));
