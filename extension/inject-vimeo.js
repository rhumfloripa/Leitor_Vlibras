/* =========================================================
   inject-vimeo.js — roda DENTRO do iframe do player.vimeo.com
   (matches: player.vimeo.com, all_frames: true), seja esse iframe
   aberto pela própria vimeo.com ou incorporado por qualquer site
   de terceiros (ex.: EAD). Por rodar na mesma origem do vídeo,
   lemos a legenda direto pela TextTrack API nativa do <video>
   (video.textTracks + evento "cuechange" do próprio navegador) —
   sem depender do SDK/postMessage do Vimeo.

   Motivo de não usar o SDK oficial (@vimeo/player) aqui: no player
   nativo usado pela própria vimeo.com, o handshake postMessage não
   segue o protocolo JSON documentado (o iframe manda strings soltas
   "ready"/"ping"), então o Player.js público trava em player.ready()
   e o "cuechange" nunca dispara. Ler o <video> diretamente evita
   esse desacordo de protocolo e funciona nos dois cenários (vimeo.com
   e embeds de terceiros), pois o Vimeo já usa <track> nativo por trás
   da legenda customizada.

   Protocolo com o iframe do VLibras (igual ao inject.js do YouTube):
     { tipo:'legenda', texto }, { tipo:'gloss:end' }, { tipo:'config' }
   ========================================================= */
(function () {
  'use strict';
  if (window.__leitorVlibrasInjectVimeo) return;
  window.__leitorVlibrasInjectVimeo = true;

  const LOG = '[Leitor VLibras/vimeo]';
  function log() { try { console.log.apply(console, [LOG].concat([].slice.call(arguments))); } catch (e) {} }

  const FRAME_URL = 'https://rhumfloripa.github.io/Leitor_Vlibras/vlibras-frame.html';

  const STATE = {
    ativo: true,
    velocidade: '2.5x',
    configRecebida: false,
    frame: null,
    framePronto: false,
    videos: new WeakSet(),
    videoDetectado: false,
  };

  /* ---------- 1) fila "sempre a legenda mais recente" ----------
     Ao contrário do YouTube, o cuechange só informa a legenda ATUAL
     (sem lista de cues futuras com timestamp), então guardamos só a
     mais recente — igual ao protótipo original (js/app.js). */
  let pendente = null, enviando = false, ultimo = '';
  function postFrame(msg) {
    const w = STATE.frame && STATE.frame.contentWindow;
    if (w) w.postMessage(Object.assign({ __leitorVlibras: true }, msg), '*');
  }
  function processar() {
    if (enviando || !pendente || !STATE.framePronto) return;
    const t = pendente; pendente = null; enviando = true; ultimo = t;
    postFrame({ tipo: 'legenda', texto: t });
    log('enviado:', t);
  }
  function enfileirar(texto) {
    texto = (texto || '').replace(/\s+/g, ' ').trim();
    if (!texto || !STATE.ativo || texto === ultimo) return;
    pendente = texto;
    processar();
  }

  /* ---------- 2) iframe do VLibras (mesmo overlay do YouTube) ----------
     Fica sobreposto DENTRO deste próprio iframe (o do player), então
     aparece encostado no vídeo mesmo se ele estiver embutido num
     cantinho de uma página maior de terceiros. */
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
    pendente = null;
    enviando = false;
    log('iframe VLibras removido (desativado pelo usuário)');
  }

  // aplica o estado ativo/inativo: mostra ou remove o avatar da tela
  function aplicarAtivo() {
    if (STATE.ativo) { if (STATE.videoDetectado) injetarFrame(); }
    else removerFrame();
  }

  /* ---------- 3) legenda via TextTrack nativa do <video> ---------- */
  function textoDaCue(cue) {
    return (cue.text || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  }
  function ligarTrack(track) {
    if (track.__leitorVlibrasLigado) return;
    track.__leitorVlibrasLigado = true;
    track.addEventListener('cuechange', function () {
      const cues = track.activeCues;
      const texto = cues && cues.length ? textoDaCue(cues[0]) : '';
      if (texto) enfileirar(texto);
    });
  }
  function processarTracks(video) {
    const tracks = video.textTracks;
    if (!tracks || !tracks.length) return;
    const algumaAtiva = Array.prototype.some.call(tracks, function (t) { return t.mode !== 'disabled'; });
    if (!algumaAtiva) {
      const pt = Array.prototype.filter.call(tracks, function (t) { return /^pt/i.test(t.language || ''); })[0] || tracks[0];
      if (pt) { pt.mode = 'hidden'; log('legenda auto-ativada:', pt.language || pt.label); }
    }
    Array.prototype.forEach.call(tracks, ligarTrack);
  }
  function ligarVideo(video) {
    if (STATE.videos.has(video)) return;
    STATE.videos.add(video);
    STATE.videoDetectado = true;
    if (STATE.ativo) injetarFrame(); // avatar aparece assim que há um <video>, mesmo antes da legenda funcionar
    processarTracks(video);
    if (video.textTracks) video.textTracks.addEventListener('addtrack', function () { processarTracks(video); });
    log('vídeo conectado, tracks:', video.textTracks ? video.textTracks.length : 0);
  }

  /* ---------- 4) descoberta de <video> (inicial + inserido dinamicamente) ---------- */
  function varrer() {
    document.querySelectorAll('video').forEach(ligarVideo);
  }
  const observer = new MutationObserver(varrer);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  varrer();

  // diagnóstico: se depois de um tempo nenhum vídeo com legenda foi achado
  // NESTE frame, avisa no console para facilitar identificar onde o vídeo
  // realmente está (útil porque o Vimeo às vezes usa iframes utilitários,
  // como proxy.html, que não têm vídeo nenhum).
  setTimeout(function () {
    const videos = document.querySelectorAll('video').length;
    if (!videos) { log('nenhum <video> encontrado neste frame'); return; }
    const comTrack = Array.prototype.filter.call(
      document.querySelectorAll('video'),
      function (v) { return v.textTracks && v.textTracks.length; }
    ).length;
    log(videos + ' <video>(s) encontrado(s), ' + comTrack + ' com textTracks');
  }, 4000);

  /* ---------- 5) mensagens vindas do frame VLibras e da config ---------- */
  window.addEventListener('message', function (ev) {
    const d = ev.data;
    if (!d) return;

    if (d.__leitorVlibras === true) {
      if (d.tipo === 'pronto') {
        STATE.framePronto = true;
        postFrame({ tipo: 'config', config: { velocidade: STATE.velocidade } });
        log('frame VLibras pronto');
        processar();
      } else if (d.tipo === 'gloss:end') {
        enviando = false;
        processar();
      }
      return;
    }

    if (d.__leitorVlibrasCfg === true) {
      STATE.configRecebida = true;
      if (typeof d.ativo === 'boolean') STATE.ativo = d.ativo;
      if (d.velocidade) STATE.velocidade = d.velocidade;
      aplicarAtivo();
      if (STATE.framePronto) postFrame({ tipo: 'config', config: { velocidade: STATE.velocidade } });
    }
  });

  // pede a config real (ativo/velocidade) ao storage-bridge; se ela não
  // chegar logo, assume o padrão (ativo=true) para não travar o recurso
  window.postMessage({ __leitorVlibrasSolicitarCfg: true }, '*');
  setTimeout(function () { if (!STATE.configRecebida) aplicarAtivo(); }, 400);

  log('inject-vimeo ativo em', location.href);
})();