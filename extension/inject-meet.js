/* =========================================================
   inject-meet.js — roda no Google Meet (world ISOLATED — aqui já
   temos acesso direto ao chrome.storage, sem precisar do
   storage-bridge.js usado no YouTube/Vimeo).

   Diferença central para YouTube/Vimeo: a legenda do Meet é AO VIVO
   (transcrição incremental). O Meet injeta uma <div role="region">
   com uma linha por fala; a ÚLTIMA linha vai crescendo palavra a
   palavra (o texto vai mudando) até a pessoa parar de falar — só
   então uma nova linha é criada para a próxima fala.

   Por isso, em vez de "clique/cue completo" como no YouTube/Vimeo,
   aqui: 1) observamos sempre a ÚLTIMA linha; 2) mandamos só o TRECHO
   NOVO ao avatar quando o texto fica parado por um tempo (pausa na
   fala) OU quando uma nova linha aparece (a anterior encerrou); 3)
   fila ordenada com espera por gloss:end, igual ao YouTube — nada é
   perdido, o avatar fica atrás se a fala for mais rápida que ele.

   Evitamos depender das classes CSS do Meet (ex.: "nMcdL", "ygicle"),
   que são ofuscadas pelo Closure Compiler e mudam a cada atualização
   do Google. Usamos só: aria-label do painel (estável, é acessibilidade)
   e a ESTRUTURA de cada linha (tem <img> do avatar + 2 blocos: nome
   e texto) — isso tende a sobreviver a trocas de nome de classe. */
(function () {
  'use strict';
  if (window.__leitorVlibrasInjectMeet) return;
  window.__leitorVlibrasInjectMeet = true;

  const LOG = '[Leitor VLibras/meet]';
  function log() { try { console.log.apply(console, [LOG].concat([].slice.call(arguments))); } catch (e) {} }

  const FRAME_URL = 'https://rhumfloripa.github.io/Leitor_Vlibras/vlibras-frame.html';
  const DEBOUNCE_MS = 700; // sem mudança no texto por esse tempo = pausa na fala

  const STATE = {
    ativo: true,
    velocidade: '2.5x',
    frame: null,
    framePronto: false,
    fila: [],           // trechos de texto ainda não enviados, em ordem
    traduzindo: false,  // avatar ocupado (aguardando gloss:end)
    timerSeguranca: null,
  };

  /* ---------- 1) iframe do VLibras (mesmo overlay do YouTube/Vimeo) ---------- */
  function injetarFrame() {
    if (STATE.frame) return;
    const iframe = document.createElement('iframe');
    iframe.id = 'leitor-vlibras-frame';
    iframe.src = FRAME_URL;
    iframe.setAttribute('allow', 'autoplay');
    Object.assign(iframe.style, {
      position: 'fixed', right: '20px', bottom: '20px',
      width: '300px', height: '440px', border: '0',
      zIndex: '2147483647', background: 'transparent',
      pointerEvents: 'auto', borderRadius: '14px', overflow: 'hidden'
    });
    document.body.appendChild(iframe);
    STATE.frame = iframe;
    log('iframe VLibras injetado ->', FRAME_URL);
  }
  function removerFrame() {
    if (!STATE.frame) return;
    STATE.frame.remove();
    STATE.frame = null;
    STATE.framePronto = false;
    STATE.fila = [];
    STATE.traduzindo = false;
    clearTimeout(STATE.timerSeguranca);
    log('iframe VLibras removido (desativado pelo usuário)');
  }
  function aplicarAtivo() {
    if (STATE.ativo) injetarFrame();
    else removerFrame();
  }
  function postFrame(msg) {
    const w = STATE.frame && STATE.frame.contentWindow;
    if (w) w.postMessage(Object.assign({ __leitorVlibras: true }, msg), '*');
  }

  /* ---------- 2) fila ordenada (mesmo princípio do YouTube: nada se perde) ---------- */
  function processarFila() {
    if (!STATE.ativo || STATE.traduzindo || !STATE.framePronto || !STATE.fila.length) return;
    const texto = STATE.fila.shift();
    STATE.traduzindo = true;
    postFrame({ tipo: 'legenda', texto: texto });
    log('enviado:', texto);
    clearTimeout(STATE.timerSeguranca);
    STATE.timerSeguranca = setTimeout(function () {
      if (STATE.traduzindo) { STATE.traduzindo = false; processarFila(); }
    }, 10000);
  }
  function enfileirarTrecho(texto) {
    texto = (texto || '').replace(/\s+/g, ' ').trim();
    if (!texto || !STATE.ativo) return;
    STATE.fila.push(texto);
    processarFila();
  }

  /* ---------- 3) leitura do painel de legendas ao vivo ---------- */
  function acharContainerLegendas() {
    return document.querySelector('div[aria-label="Legendas"]')
      || document.querySelector('div[aria-label="Captions"]')
      || document.querySelector('div[aria-label="Subtítulos"]')
      || document.querySelector('div[role="region"][jsaction*="ffrh3d"]');
  }
  // linha de legenda = filho direto do painel que tem <img> (avatar do
  // falante); isso descarta os outros elementos do painel (ex.: botão
  // "ir para o fim") sem depender do nome da classe
  function linhasDeLegenda(container) {
    return Array.prototype.filter.call(container.children, function (el) {
      return el.tagName === 'DIV' && el.querySelector('img');
    });
  }
  function textoDaLinha(linha) {
    const textoEl = linha.lastElementChild || linha;
    return (textoEl.textContent || '').replace(/\s+/g, ' ').trim();
  }

  let linhaAtual = null;       // nó DOM da linha sendo acompanhada
  let textoObservado = '';     // último texto completo visto nessa linha
  let textoEnviadoDaLinha = ''; // quanto dessa linha já foi enviado ao avatar
  let timerDebounce = null;

  function enviarRestante(linha, jaEnviado) {
    const completo = textoDaLinha(linha);
    const resto = completo.slice(jaEnviado.length).trim();
    if (resto) enfileirarTrecho(resto);
  }

  function processarPainel(container) {
    const linhas = linhasDeLegenda(container);
    if (!linhas.length) return;
    const ultima = linhas[linhas.length - 1];

    if (linhaAtual && linhaAtual !== ultima) {
      // uma nova linha apareceu → a anterior encerrou: manda o que faltar dela
      clearTimeout(timerDebounce);
      enviarRestante(linhaAtual, textoEnviadoDaLinha);
      textoEnviadoDaLinha = '';
      textoObservado = '';
    }
    linhaAtual = ultima;

    const completo = textoDaLinha(ultima);
    if (completo === textoObservado) return;
    textoObservado = completo;
    clearTimeout(timerDebounce);
    timerDebounce = setTimeout(function () {
      const resto = completo.slice(textoEnviadoDaLinha.length).trim();
      if (resto) { enfileirarTrecho(resto); textoEnviadoDaLinha = completo; }
    }, DEBOUNCE_MS);
  }

  let painelAtual = null;
  let observerPainel = null;
  function ligarPainel(container) {
    if (painelAtual === container) return;
    painelAtual = container;
    linhaAtual = null;
    textoObservado = '';
    textoEnviadoDaLinha = '';
    if (observerPainel) observerPainel.disconnect();
    observerPainel = new MutationObserver(function () { processarPainel(container); });
    observerPainel.observe(container, { childList: true, subtree: true, characterData: true });
    log('painel de legendas do Meet conectado');
    processarPainel(container);
  }

  // o Meet ativa a legenda "por sob demanda" para necessário economizar
  // custo (VLibras precisa dela); tentamos ligar automaticamente o
  // botão de CC quando estiver desligado. Best-effort: baseado no ícone
  // (google-symbols "closed_caption_off") e, como fallback, no
  // aria-label. Se o Meet mudar esse botão, isso pode parar de achar —
  // nesse caso o usuário ainda pode ligar a legenda manualmente.
  function garantirLegendaAtivaMeet() {
    if (!STATE.ativo) return;
    let btn = null;
    const icone = Array.prototype.find.call(
      document.querySelectorAll('i.google-symbols, i.material-icons, i.material-icons-extended'),
      function (i) { return (i.textContent || '').trim() === 'closed_caption_off'; }
    );
    if (icone) btn = icone.closest('button');
    if (!btn) {
      btn = document.querySelector(
        'button[aria-label*="Ativar legenda" i], button[aria-label*="Turn on caption" i], button[aria-label*="Activar subt" i]'
      );
    }
    if (btn) { btn.click(); log('legenda (CC) do Meet ativada automaticamente — necessária para o VLibras'); }
  }

  function varrer() {
    const container = acharContainerLegendas();
    if (container) ligarPainel(container);
    else garantirLegendaAtivaMeet();
  }
  const observerGlobal = new MutationObserver(varrer);
  observerGlobal.observe(document.documentElement, { childList: true, subtree: true });
  varrer();
  setInterval(varrer, 2000); // o Meet recria o painel ao entrar/sair de chamada

  /* ---------- 4) config (chrome.storage direto — mundo ISOLATED) ---------- */
  function aplicarConfig(cfg) {
    STATE.ativo = cfg.ativo !== undefined ? cfg.ativo : true;
    STATE.velocidade = cfg.velocidade || '2.5x';
    aplicarAtivo();
    if (STATE.framePronto) postFrame({ tipo: 'config', config: { velocidade: STATE.velocidade } });
  }
  chrome.storage.local.get(['ativo', 'velocidade'], aplicarConfig);
  chrome.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'local') return;
    chrome.storage.local.get(['ativo', 'velocidade'], aplicarConfig);
  });

  /* ---------- 5) mensagens vindas do frame VLibras ---------- */
  window.addEventListener('message', function (ev) {
    const d = ev.data;
    if (!d || d.__leitorVlibras !== true) return;
    if (d.tipo === 'pronto') {
      STATE.framePronto = true;
      postFrame({ tipo: 'config', config: { velocidade: STATE.velocidade } });
      log('frame VLibras pronto');
      processarFila();
    } else if (d.tipo === 'gloss:end') {
      clearTimeout(STATE.timerSeguranca);
      STATE.traduzindo = false;
      setTimeout(processarFila, 100);
    }
  });

  log('inject-meet ativo em', location.href);
})();
