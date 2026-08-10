# Análise de Arquitetura — Tradução de YouTube em Libras

> Documento de decisão. Resume o que testamos, por que cada caminho trava,
> e as saídas viáveis com prós/contras honestos.

## O conflito central (resumo dos testes já feitos)

| Camada | O que descobrimos | Evidência |
|--------|-------------------|-----------|
| Legenda do YouTube | Não é acessível por JS de app externo | `cuechange` não existe; div `.ytp-caption-segment` é cross-origin; `getOption('captions')` só dá metadados (`is_servable:false`) |
| Ler legenda dentro do YT | Só extensão (content script) ou backend consegue | CaptionMute (extensão) lê o DOM; neurelectra usa InnerTube (server) |
| VLibras na página do YT | Bloqueado pela CSP do YouTube | `script-src 'self'` recusa `vlibras.gov.br` |
| VLibras numa página da extensão (MV3) | Bloqueado pela CSP do Manifest V3 | MV3 proíbe QUALQUER script remoto |
| VLibras empacotado local | Não basta — webpack code-splitting | `publicPath = "https://www.vlibras.gov.br/app/"` puxa `vlibras-plugin.chunk.js`, `UnityLoader.js`, `playerweb.json`, `.unityweb` (vários MB) e dicionário |

**Raiz do problema:** VLibras carrega múltiplos scripts JS remotos em runtime × Manifest V3 proíbe scripts remotos. São incompatíveis por design.

---

## As saídas viáveis

### Opção 1 — Extensão que abre uma PÁGINA WEB HOSPEDADA (nossa)
A extensão só faz duas coisas leves na aba do YouTube: (a) lê a legenda do DOM
(`.ytp-caption-segment`, como o CaptionMute) e (b) repassa o texto. O **VLibras
roda numa página web normal** que nós hospedamos (Google Sites / GitHub Pages),
aberta em janela/aba lateral. Essa página não é MV3 → carrega o VLibras sem restrição.

- ✅ Contorna as DUAS CSPs (YouTube e MV3)
- ✅ VLibras roda "normal", como no app Vimeo (já validado)
- ✅ Extensão fica mínima (só lê legenda + envia)
- ⚠️ Precisa comunicação entre a aba do YT e a página do VLibras (postMessage entre janelas / storage)
- ⚠️ Experiência: duas janelas (vídeo + avatar)

### Opção 2 — Extensão com VLibras 100% empacotado local
Baixar `vlibras-plugin.js` + `vlibras-plugin.chunk.js` + `UnityLoader.js` +
`playerweb.json` + todos os `.unityweb`/wasm + assets, e reescrever `publicPath`
e `ROOT_PATH`/`dictionaryUrl` para apontar ao pacote local (o dicionário talvez
tenha de continuar remoto via `connect-src`).

- ✅ Tudo dentro da extensão, sem página externa
- ❌ Trabalho grande e frágil (dezenas de MB de assets Unity)
- ❌ Quebra a cada atualização do VLibras
- ❌ O dicionário (`dicionario2.vlibras.gov.br`) provavelmente continua remoto → `connect-src` ok, mas o Unity pode exigir mais ajustes
- ⚠️ Peso da extensão dispara (Unity WebGL é pesado)

### Opção 3 — App único hospedado + backend p/ legenda (sem extensão)
App web (Google Sites/Pages) com player YouTube (IFrame API p/ tempo) + VLibras.
A legenda vem de um **backend** (ex: lib neurelectra/youtube-captions em Node num
servidor do SENAI) que busca via InnerTube.

- ✅ Sem instalar extensão; funciona em qualquer navegador
- ✅ VLibras roda normal (página web comum)
- ✅ Dinâmico (professor cola URL)
- ❌ Exige backend hospedado (servidor SENAI) e mantido
- ⚠️ InnerTube pode bloquear IP de datacenter → usar servidor institucional

### Opção 4 — Extensão captura legenda + injeta VLibras via página em iframe hospedado
Combinação: content script lê a legenda do YT e injeta um `<iframe src="https://
SEU-SITE/vlibras-frame.html">` (página HOSPEDADA por nós, não da extensão).
Como o iframe aponta para um site normal (não `chrome-extension://`), o VLibras
carrega sem MV3 e sem a CSP do YouTube (o iframe tem a origem do NOSSO site).

- ✅ Contorna as duas CSPs (o VLibras roda na origem do nosso site dentro do iframe)
- ✅ Uma janela só (iframe sobreposto no YouTube)
- ✅ Extensão continua simples
- ⚠️ Precisa hospedar `vlibras-frame.html` (Google Sites não serve arquivo solto p/ iframe; GitHub Pages sim)
- ⚠️ Comunicação legenda → iframe via postMessage (cross-origin, mas permitido)

---

## Recomendação

**Opção 4** parece o melhor equilíbrio: mantém a experiência de uma janela só,
a extensão fica leve (só lê a legenda), e o VLibras roda num iframe da NOSSA
origem hospedada (GitHub Pages) — o que contorna tanto a CSP do YouTube quanto
a do Manifest V3, sem empacotar os MB do Unity.

Ordem de robustez × esforço:
1. **Opção 4** — melhor custo/benefício (recomendada)
2. **Opção 1** — igual à 4, mas em janela separada (UX inferior)
3. **Opção 3** — mais "produto", mas exige backend
4. **Opção 2** — evitar (frágil, pesada)

## Pré-requisito comum a todas
Hospedar a página do VLibras em **GitHub Pages** (já temos o repo `Leitor_Vlibras`).
GitHub Pages serve HTML por HTTPS, sem CSP restritiva — o VLibras carrega ali como
no app Vimeo já validado.
