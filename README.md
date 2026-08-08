# 🤟 Leitor VLibras

Aplicação web que traduz **automaticamente** as legendas de um vídeo para **Libras**
(Língua Brasileira de Sinais), usando o avatar oficial do [VLibras](https://vlibras.gov.br/).

A cada legenda exibida no vídeo, o texto é enviado por código ao VLibras, que sinaliza
em Libras — **sem clique e sem seleção de texto** do usuário.

> Feito para acessibilidade de conteúdo em vídeo (aulas, tutoriais, institucional).

---

## ✨ Funcionalidades

- 📺 **Campo de URL** — cole o link do vídeo e carregue no player
- 🎯 **Vimeo** suportado (YouTube planejado)
- 🔤 **Legenda PT ativada automaticamente**
- 🤟 **Tradução automática** a cada legenda (via `Player.translate()` interno do VLibras)
- ⏭️ **Sincronização inteligente** — aguarda o avatar terminar de sinalizar antes de enviar a próxima legenda (descarta as intermediárias para não acumular atraso)
- ⚡ **Velocidade do avatar** ajustável (padrão 2.5x); aplicada automaticamente
- 🚪 **Painel do VLibras abre sozinho** ao carregar
- 🩺 **Painel de diagnóstico** com log em tempo real

---

## 📁 Estrutura do projeto

```
Leitor_Vlibras/
├── index.html                 # a aplicação (HTML)
├── css/
│   └── style.css              # estilos
├── js/
│   └── app.js                 # toda a lógica (Vimeo SDK + VLibras + fila sincronizada)
├── servers/
│   ├── servidor.js            # servidor local em Node.js (sem dependências)
│   ├── servidor.ps1           # servidor local em PowerShell
│   └── servidor.py            # servidor local em Python 3
├── launchers/
│   ├── iniciar_servidor_node.bat
│   ├── iniciar_servidor_powershell.bat
│   └── iniciar_servidor.bat
├── README.md
├── LICENSE                    # MIT
└── .gitignore
```

---

## 🚀 Como usar

A aplicação depende de scripts externos (Vimeo SDK e VLibras), então precisa ser
servida por um servidor HTTP local (não funciona abrindo o arquivo direto via `file://`).

Use um dos launchers na pasta `launchers/` (todos abrem o navegador automaticamente
em `http://localhost:8000/index.html`):

| Runtime | Launcher |
|---------|----------|
| **Node.js** (recomendado) | `launchers/iniciar_servidor_node.bat` |
| **PowerShell** (já vem no Windows) | `launchers/iniciar_servidor_powershell.bat` |
| **Python 3** | `launchers/iniciar_servidor.bat` |

> Os servidores em `servers/` servem a raiz do projeto (um nível acima), então o
> `index.html`, `css/` e `js/` são servidos corretamente.

Depois, na página:
1. **Clique no boneco do VLibras** (canto direito) para carregar o avatar — ou aguarde, pois a página tenta abri-lo sozinho.
2. Cole a URL de um vídeo do Vimeo no campo (ou use o exemplo já preenchido).
3. Dê **play** — as legendas passam a ser traduzidas automaticamente.

---

## 🧩 Como funciona

```
URL colada
   → parser extrai ID + hash (Vimeo)
   → iframe do player é (re)criado
   → Vimeo SDK dispara "cuechange" a cada legenda
   → fila sincronizada (aguarda "gloss:end" do avatar)
   → window.plugin.translate(textoDaLegenda)
   → avatar do VLibras sinaliza em Libras 🤟
```

### Descobertas técnicas que viabilizaram o projeto

1. **`window.plugin.translate(texto)`** — o widget oficial do VLibras
   (`vlibras-plugin.js`) expõe uma instância global (`window.plugin`) cujo método
   `translate()` delega para o `Player.translate()` interno. Permite tradução
   **100% programática**, sem depender de seleção de texto (que exige eventos
   `isTrusted`, impossíveis de simular).

2. **Sincronização por `gloss:end`** — o Player emite o evento `gloss:end` quando o
   avatar termina de sinalizar. A fila escuta esse evento para só então enviar a
   próxima legenda, evitando cortes.

3. **Vídeos privados do Vimeo** — exigem o parâmetro `h=<hash>` na URL do iframe;
   sem ele o Vimeo retorna **403**. O parser extrai o hash de qualquer formato de URL.

4. **Velocidade** — ajustada clicando no botão oficial `.vpw-button-speed`
   (cicla `0.5x → 1x → 1.5x → 2x → 2.5x`).

---

## 📝 Créditos e licença

- Avatar e serviço de tradução: **VLibras** — Governo Federal / UFPB
  (https://vlibras.gov.br/). O VLibras é software livre sob LGPLv3.
- Código desta aplicação: licença **MIT** (veja `LICENSE`).

---

## 🔭 Roadmap

- [ ] Suporte a **YouTube** (captura de legenda por tempo do player)
- [ ] Glossário de termos técnicos (pré-processamento antes de enviar ao VLibras)
- [ ] Detecção/seleção de idioma da legenda
