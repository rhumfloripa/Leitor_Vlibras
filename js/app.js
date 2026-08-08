/* 0) BLINDAGEM: erros de scripts externos não derrubam a página */
window.addEventListener('error', function(e){
  var src = (e && e.filename) || '';
  if (src.indexOf('vlibras.gov.br') > -1 || src.indexOf('vimeo.com') > -1) {
    e.stopImmediatePropagation();
    return true;
  }
}, true);

const $ = s => document.querySelector(s);
const logEl = $('#log');
function log(msg){
  const t = new Date().toLocaleTimeString('pt-BR');
  logEl.textContent += `[${t}] ${msg}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}
$('#clearLog').onclick = ()=> logEl.textContent='';

let ultimaLegenda = '';
let vimeoPlayer = null;

/* Slider de intervalo */
const intervaloEl = $('#intervalo');
const intervaloVal = $('#intervaloVal');
function fmtInt(ms){ return (ms/1000).toString().replace('.',',') + 's'; }
intervaloEl.oninput = ()=> intervaloVal.textContent = fmtInt(+intervaloEl.value);

/* =========================================================
   PARSER DE URL — extrai fonte, ID e hash de vários formatos
   ========================================================= */
function parseVideoUrl(raw){
  raw = (raw || '').trim();
  if(!raw) return { fonte:null, erro:'URL vazia' };

  // ---- VIMEO ----
  // Formatos aceitos:
  //   https://vimeo.com/1215329728
  //   https://vimeo.com/1215329728/054856d6af
  //   https://vimeo.com/1215329728?share=copy
  //   https://vimeo.com/1215329728/054856d6af?share=copy
  //   https://player.vimeo.com/video/1215329728?h=054856d6af
  if(/vimeo\.com/i.test(raw)){
    let id = null, hash = null;

    // player.vimeo.com/video/{id}?h={hash}
    let m = raw.match(/player\.vimeo\.com\/video\/(\d+)/i);
    if(m){
      id = m[1];
      const h = raw.match(/[?&]h=([A-Za-z0-9]+)/);
      if(h) hash = h[1];
    } else {
      // vimeo.com/{id}[/{hash}]
      m = raw.match(/vimeo\.com\/(\d+)(?:\/([A-Za-z0-9]+))?/i);
      if(m){
        id = m[1];
        if(m[2]) hash = m[2];
        // hash também pode vir como ?h=
        const h = raw.match(/[?&]h=([A-Za-z0-9]+)/);
        if(h && !hash) hash = h[1];
      }
    }
    if(id) return { fonte:'vimeo', id, hash };
    return { fonte:'vimeo', erro:'Não consegui extrair o ID do Vimeo' };
  }

  // ---- YOUTUBE (preparado para a próxima etapa) ----
  if(/youtube\.com|youtu\.be/i.test(raw)){
    return { fonte:'youtube', erro:'YouTube ainda não implementado (próxima etapa)' };
  }

  return { fonte:null, erro:'URL não reconhecida (Vimeo ou YouTube)' };
}

/* Monta a URL do iframe do Vimeo */
function montarUrlVimeo({id, hash}){
  let u = 'https://player.vimeo.com/video/' + id + '?';
  const params = [];
  if(hash) params.push('h=' + hash);
  params.push('badge=0','autopause=0','player_id=0','app_id=58479','texttrack=pt');
  return u + params.join('&');
}

/* =========================================================
   CARREGAR VÍDEO — recria o iframe e reconecta o SDK
   ========================================================= */
function carregarVideo(){
  const raw = $('#urlInput').value;
  const info = parseVideoUrl(raw);

  $('#fonteInfo').textContent = 'Fonte: ' + (info.fonte || '—');
  $('#idInfo').textContent   = 'ID: ' + (info.id || '—');
  $('#hashInfo').textContent = 'Hash: ' + (info.hash || '—');

  if(info.erro){
    $('#dot').classList.add('err');
    $('#statusTxt').textContent = info.erro;
    log('✖ ' + info.erro);
    return;
  }

  if(info.fonte === 'vimeo'){
    const src = montarUrlVimeo(info);
    log('Carregando Vimeo ID ' + info.id + (info.hash ? ' (hash '+info.hash+')' : '') + '…');

    // destrói player anterior, se houver
    if(vimeoPlayer && vimeoPlayer.destroy){ try{ vimeoPlayer.destroy(); }catch(e){} vimeoPlayer = null; }

    // recria o iframe do zero
    const frame = $('#videoFrame');
    frame.innerHTML = '';
    const iframe = document.createElement('iframe');
    iframe.id = 'vimeo';
    iframe.src = src;
    iframe.setAttribute('frameborder','0');
    iframe.setAttribute('allow','autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share');
    iframe.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
    iframe.setAttribute('title','Vídeo');
    frame.appendChild(iframe);

    $('#dot').classList.remove('on','err');
    $('#statusTxt').textContent = 'Conectando ao player…';
    $('#legStatus').textContent = 'Legenda: —';

    conectarVimeo(iframe);
  }
}
$('#carregarBtn').onclick = carregarVideo;
$('#urlInput').addEventListener('keydown', e=>{ if(e.key==='Enter') carregarVideo(); });

/* Conecta o Vimeo SDK a um iframe e liga o cuechange */
function conectarVimeo(iframe){
  if (typeof Vimeo === 'undefined' || !Vimeo.Player){
    log('⚠ SDK do Vimeo ainda não disponível — tentando novamente…');
    setTimeout(()=>conectarVimeo(iframe), 400);
    return;
  }
  try{
    const player = new Vimeo.Player(iframe);
    vimeoPlayer = player;

    player.ready().then(()=>{
      $('#dot').classList.remove('err'); $('#dot').classList.add('on');
      $('#statusTxt').textContent = 'Player conectado ✔';
      log('Vimeo Player pronto.');
      player.enableTextTrack('pt').then(t=>{
        log('Legenda ativada: ' + (t.label||t.language));
        $('#legStatus').textContent = 'Legenda: ' + (t.label||t.language);
      }).catch(e=> {
        log('⚠ Vídeo sem legenda PT (ou não ativável): '+ (e && e.name));
        $('#legStatus').textContent = 'Legenda: indisponível';
      });
    }).catch(e=> log('⚠ player.ready falhou: ' + (e && e.message)));

    player.on('cuechange', function(data){
      const cue = (data.cues && data.cues[0]) ? data.cues[0] : null;
      const texto = cue ? (cue.text || '').replace(/\s+/g,' ').trim() : '';
      if(!texto) return;
      ultimaLegenda = texto;
      $('#legendaAtual').innerHTML = '<b>'+texto+'</b>';
      $('#legStatus').textContent = 'Legenda: recebendo ✔';
      if($('#autoSend').checked){ enfileirar(texto); }
    });

    player.on('play', ()=> log('▶ play'));
    player.on('error', e=> log('✖ Erro do player: '+JSON.stringify(e)));
  }catch(err){
    log('✖ Falha ao conectar SDK: ' + err.message);
  }
}

/* =========================================================
   VLibras: inicialização + tradução programática
   ========================================================= */
(function initVLibras(tentativa){
  tentativa = tentativa || 0;
  try {
    if (window.VLibras && window.VLibras.Widget) {
      new window.VLibras.Widget('https://vlibras.gov.br/app');
      log('VLibras: widget inicializado.');
    } else if (tentativa < 30) {
      setTimeout(function(){ initVLibras(tentativa + 1); }, 300);
    } else {
      log('⚠ VLibras: script não carregou (rode via http://localhost).');
    }
  } catch (err) {
    log('⚠ VLibras: falha ao inicializar: ' + (err && err.message));
  }
})();

/* Abre o painel do VLibras automaticamente ao carregar a página.
   O clique programático no botão de acesso é aceito (diferente da tradução),
   e é o que dispara o download do avatar. Assim o usuário não precisa
   clicar no boneco manualmente.
   IMPORTANTE: o widget registra o handler de clique só depois de montado,
   então clicamos cedo demais não funciona. Aqui insistimos até CONFIRMAR
   que o painel realmente abriu (verificando .vpw-container). */
(function autoAbrirVLibras(tentativa){
  tentativa = tentativa || 0;
  // Considera aberto se: existe container do player, OU já existe window.plugin
  // (instância criada ao abrir), OU há controles internos na tela.
  const painelAberto = !!(
    document.querySelector('.vpw-container, [class*="vpw"]') ||
    window.plugin ||
    document.querySelector('[vw-plugin-wrapper] canvas, #gameContainer canvas')
  );
  if (painelAberto){
    if (tentativa > 0) log('VLibras: painel aberto automaticamente ✔');
    return;
  }
  const btn = document.querySelector('[vw-access-button]');
  if (btn){ try{ btn.click(); }catch(e){} }
  if (tentativa < 60){
    setTimeout(function(){ autoAbrirVLibras(tentativa + 1); }, 300);
  } else {
    log('⚠ VLibras: não abriu sozinho — clique no boneco manualmente.');
  }
})();

function getVLibrasPlugin(){
  if (window.plugin && window.plugin.player && typeof window.plugin.translate === 'function') return window.plugin;
  for (const k in window){
    try{
      const v = window[k];
      if (v && typeof v === 'object' && v.player &&
          typeof v.translate === 'function' && v.player.loaded !== undefined) return v;
    }catch(e){}
  }
  return null;
}

(function aguardarPlugin(tentativa){
  tentativa = tentativa || 0;
  const p = getVLibrasPlugin();
  if (p && p.player && p.player.loaded){
    $('#vlibrasDot').classList.add('on');
    $('#vlibrasTxt').textContent = 'VLibras: pronto ✔';
    log('VLibras Player pronto — tradução automática habilitada.');
  } else if (tentativa < 120){
    setTimeout(function(){ aguardarPlugin(tentativa + 1); }, 500);
  } else {
    $('#vlibrasTxt').textContent = 'VLibras: avatar não carregou';
    log('⚠ VLibras: abra o painel do avatar (clique no boneco).');
  }
})();

/* =========================================================
   VELOCIDADE DO AVATAR
   O widget alterna a velocidade pelo botão .vpw-button-speed,
   ciclando: 0.5x → 1x → 1.5x → 2x → 2.5x. A forma mais confiável
   de definir uma velocidade é clicar nesse botão até chegar no
   multiplicador desejado (é a interface oficial).
   ========================================================= */
const ORDEM_VELOCIDADE = ['0.5x','1x','1.5x','2x','2.5x'];

function aplicarVelocidade(alvo){
  const btn = document.querySelector('.vpw-button-speed');
  if(!btn){ return false; }   // widget ainda não pronto
  let guard = 0;
  // clica até o texto do botão bater com o alvo (no máximo uma volta completa)
  while((btn.textContent||'').trim() !== alvo && guard < ORDEM_VELOCIDADE.length + 1){
    btn.click();
    guard++;
  }
  const ok = (btn.textContent||'').trim() === alvo;
  if(ok) log('Velocidade do avatar ajustada para ' + alvo + '.');
  return ok;
}

/* Aplica a velocidade escolhida assim que o avatar estiver pronto.
   Tenta repetidamente porque o botão de velocidade só existe depois
   que o painel abre e o player carrega. */
function aplicarVelocidadeQuandoPronto(tentativa){
  tentativa = tentativa || 0;
  const alvo = (document.getElementById('velocidade')||{}).value || '2.5x';
  if(aplicarVelocidade(alvo)) return;   // conseguiu
  if(tentativa < 60){
    setTimeout(function(){ aplicarVelocidadeQuandoPronto(tentativa + 1); }, 500);
  }
}
// dispara a auto-aplicação (aguarda o avatar)
aplicarVelocidadeQuandoPronto(0);

// quando o usuário troca o seletor, aplica na hora
document.getElementById('velocidade').addEventListener('change', function(){
  aplicarVelocidade(this.value);
});

function traduzirTexto(texto){
  texto = (texto || '').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();
  if(!texto) return false;
  const p = getVLibrasPlugin();
  if(!p){ log('⚠ VLibras ainda não pronto — clique no boneco.'); return false; }
  try{ p.translate(texto); log('→ VLibras: "' + texto.slice(0,60) + (texto.length>60?'…':'') + '"'); return true; }
  catch(err){ log('⚠ Falha ao traduzir: ' + (err && err.message)); return false; }
}

/* =========================================================
   FILA SOB DEMANDA — espera o avatar TERMINAR de sinalizar
   Em vez de um intervalo fixo, escutamos o evento 'gloss:end' do
   Player (dispara quando o avatar termina a animação da glosa) e só
   então enviamos a próxima legenda. Guardamos apenas a legenda mais
   recente (as intermediárias são descartadas), para não acumular
   atraso demais em relação ao vídeo.
   Há um TEMPO MÁXIMO de segurança (maxEspera): se o gloss:end não vier
   nesse tempo, liberamos a fila mesmo assim (evita travar).
   ========================================================= */
let pendente = null, enviando = false, ultimoEnviado = '';
let timerSeguranca = null;

function atualizarFilaStatus(){ $('#filaStatus').textContent = 'Fila: ' + (pendente ? 1 : 0); }

function enfileirar(texto){
  if(!texto || !texto.trim() || texto === ultimoEnviado) return;
  pendente = texto; atualizarFilaStatus();
  processarFila();
}

function processarFila(){
  if(enviando || !pendente) return;
  const texto = pendente; pendente = null; enviando = true; atualizarFilaStatus();
  if(traduzirTexto(texto)) ultimoEnviado = texto;

  // Tempo máximo de segurança (ms) — libera a fila se o gloss:end não chegar.
  // Usa o valor do slider como teto (reaproveitado como "espera máxima").
  const maxEspera = Math.max(4000, +intervaloEl.value * 3);
  clearTimeout(timerSeguranca);
  timerSeguranca = setTimeout(function(){
    if(enviando){ log('⏱ (segurança) avatar demorou — liberando próxima.'); liberarFila(); }
  }, maxEspera);
}

function liberarFila(){
  clearTimeout(timerSeguranca);
  enviando = false;
  processarFila();   // se há legenda mais recente pendente, envia agora
}

/* Liga o gatilho 'gloss:end' ao Player assim que ele estiver pronto */
(function ligarGlossEnd(tentativa){
  tentativa = tentativa || 0;
  const p = getVLibrasPlugin();
  if(p && p.player && typeof p.player.on === 'function'){
    p.player.on('gloss:end', function(){
      // avatar terminou de sinalizar a legenda atual → libera a próxima
      liberarFila();
    });
    log('Sincronização por evento habilitada (aguarda o avatar terminar).');
  } else if(tentativa < 120){
    setTimeout(function(){ ligarGlossEnd(tentativa + 1); }, 500);
  }
})();
$('#manualBtn').onclick = ()=>{
  if(ultimaLegenda){ traduzirTexto(ultimaLegenda); ultimoEnviado = ultimaLegenda; }
  else log('⚠ Nenhuma legenda para reenviar ainda.');
};

/* Aguarda o SDK do Vimeo e carrega o vídeo pré-preenchido automaticamente */
(function aguardarVimeoEcarregar(tentativa){
  tentativa = tentativa || 0;
  if (typeof Vimeo !== 'undefined' && Vimeo.Player) {
    log('SDK do Vimeo detectado.');
    carregarVideo();   // carrega o vídeo de exemplo pré-preenchido
  } else if (tentativa < 40) {
    if (tentativa === 0) log('Aguardando SDK do Vimeo carregar…');
    setTimeout(function(){ aguardarVimeoEcarregar(tentativa + 1); }, 300);
  } else {
    $('#dot').classList.add('err');
    $('#statusTxt').textContent = 'SDK do Vimeo não carregou';
    log('✖ SDK do Vimeo não carregou. Rode via http://localhost (servidor).');
  }
})();
