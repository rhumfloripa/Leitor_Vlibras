/* =========================================================
   vlibras-frame.js — roda DENTRO do iframe da extensão.
   Aqui o VLibras carrega sem a CSP do YouTube. Recebe legendas
   do content script (página) via postMessage e traduz.
   ========================================================= */
(function () {
  'use strict';
  const LOG = '[Leitor VLibras/frame]';
  function log(m){ console.log(LOG, m); }

  let config = { velocidade: '2.5x', intervaloMax: 4000, ativo: true };

  // inicializa o widget
  (function initVLibras(n){ n=n||0;
    try{
      if (window.VLibras && window.VLibras.Widget){
        new window.VLibras.Widget('https://vlibras.gov.br/app');
        log('widget inicializado');
        ligarSincronia(0); autoAbrir(0); aplicarVelocidadeQuandoPronto(0);
      } else if (n<40){ setTimeout(function(){initVLibras(n+1);},300); }
      else log('⚠ VLibras.Widget não disponível');
    }catch(e){ log('⚠ init: '+e.message); }
  })(0);

  function getPlugin(){
    if (window.plugin && window.plugin.player && typeof window.plugin.translate==='function') return window.plugin;
    for (const k in window){ try{ const v=window[k];
      if (v && typeof v==='object' && v.player && typeof v.translate==='function' && v.player.loaded!==undefined) return v;
    }catch(e){} }
    return null;
  }

  // fila sincronizada por gloss:end
  let pendente=null, enviando=false, ultimo='', timer=null;
  function traduzir(t){
    t=(t||'').replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();
    if(!t) return false;
    const p=getPlugin(); if(!p) return false;
    try{ p.translate(t); return true; }catch(e){ return false; }
  }
  function processar(){
    if(enviando||!pendente) return;
    const t=pendente; pendente=null; enviando=true;
    if(traduzir(t)) ultimo=t;
    clearTimeout(timer);
    timer=setTimeout(function(){ enviando=false; processar(); }, config.intervaloMax);
  }
  function liberar(){ clearTimeout(timer); enviando=false; processar(); }
  function ligarSincronia(n){ n=n||0;
    const p=getPlugin();
    if(p && p.player && typeof p.player.on==='function'){ p.player.on('gloss:end', liberar); log('gloss:end ativo'); }
    else if(n<120) setTimeout(function(){ligarSincronia(n+1);},500);
  }

  // velocidade
  const ORDEM=['0.5x','1x','1.5x','2x','2.5x'];
  function aplicarVelocidade(alvo){
    const btn=document.querySelector('.vpw-button-speed'); if(!btn) return false;
    let g=0; while((btn.textContent||'').trim()!==alvo && g<ORDEM.length+1){ btn.click(); g++; }
    return (btn.textContent||'').trim()===alvo;
  }
  function aplicarVelocidadeQuandoPronto(n){ n=n||0;
    if(aplicarVelocidade(config.velocidade)){ log('velocidade '+config.velocidade); return; }
    if(n<60) setTimeout(function(){aplicarVelocidadeQuandoPronto(n+1);},500);
  }

  // auto-abrir painel
  function autoAbrir(n){ n=n||0;
    if(document.querySelector('.vpw-container,[class*="vpw"]')||window.plugin) return;
    const b=document.querySelector('[vw-access-button]'); if(b){ try{b.click();}catch(e){} }
    if(n<60) setTimeout(function(){autoAbrir(n+1);},300);
  }

  // recebe mensagens do content script (a página)
  window.addEventListener('message', function(ev){
    const d=ev.data;
    if(!d || d.__leitorVlibras!==true) return;
    if(d.tipo==='legenda'){
      if(config.ativo && d.texto && d.texto!==ultimo){ pendente=d.texto; processar(); }
    } else if(d.tipo==='config'){
      config=Object.assign(config, d.config||{});
      if(d.config && d.config.velocidade) aplicarVelocidade(d.config.velocidade);
    }
  });

  // avisa a página que o frame está pronto
  log('frame pronto');
})();
