# LUA — IA experimental em JavaScript puro (PC e celular)

Protótipo de IA que roda no navegador: rede neural própria (JS puro), Wikipédia, API opcional (Groq) e memória local.
**Não é um modelo de linguagem moderno.** Quando não há fonte, a LUA diz isso em vez de inventar texto.

## ⚠️ Segurança — faça isto primeiro
As versões anteriores traziam chaves da Groq escritas no `server.js`. **Revogue essas chaves** no console da Groq e crie novas.
Agora as chaves ficam só no arquivo `.env` (nunca vai para o navegador, nem é servido por URL, nem deve ir ao GitHub — já está no `.gitignore`).

## Configurações (botão ⚙)
O botão **⚙ Configurações** (canto superior direito do chat) abre uma janela com:
- **Duas chaves de API** (Conhecimento e Segurança), com botão de mostrar/ocultar. Ao salvar, o servidor testa cada chave na Groq e mostra o resultado na hora. Ficam guardadas no servidor, em `.chaves.json` (permissão 600, ignorado pelo Git, nunca servido por URL); o navegador só recebe os 4 últimos caracteres. As chaves salvas no painel têm prioridade sobre o `.env`.
- **Interruptores** para Conhecimento API, Segurança API, Wikipédia e Rede neural, além do nível da rede. São os mesmos botões da barra de controles: mudar em um muda no outro.
- Só aceita salvar chaves vindas do próprio app e de rede local (PC/celular no mesmo Wi-Fi); pedidos de outros sites ou da internet são recusados. Em hospedagem estática (sem `server.js`) não há onde guardar chaves, e a janela avisa.

## Como rodar

### No computador (Windows / Mac / Linux)
1. Instale o Node.js 18+ (nodejs.org).
2. Windows: dê dois cliques em `iniciar.bat`. Mac/Linux: `./iniciar.sh` (ou `node server.js`).
3. Abra http://localhost:3000.
4. Para ligar as APIs: abra o app, toque em **⚙ Configurações**, cole as duas chaves e use **Salvar e testar chaves** (ou, se preferir, edite o `.env` e reinicie).

### No celular — duas opções
- **Mesma rede Wi-Fi:** com o servidor rodando no PC, o terminal mostra um endereço como `http://192.168.x.x:3000`. Abra-o no navegador do celular.
- **Sem PC ligado:** hospede a pasta como site estático (GitHub Pages, Netlify, Cloudflare Pages — **sem** o `server.js` e **sem** o `.env`). Tudo funciona no navegador (rede neural, Wikipédia, memória); só as APIs Groq e os arquivos `.txt` exigem o servidor. Em HTTPS dá para “Adicionar à tela inicial” e usar como app (PWA, funciona offline).

No celular a LUA começa no nível **Baixa (1.000 neurônios)**, mais leve. Você pode trocar o nível no seletor.

## O que mudou nesta versão
- Chaves removidas do código; servidor protegido (não serve `server.js`, `.env` nem `memoria/`); escuta em `0.0.0.0` para o celular acessar.
- Rede neural refeita: entrada de 256 posições (palavras + trigramas), treino assíncrono (não trava o celular), parada antecipada, pesos salvos no IndexedDB. ~99% de acerto no treino e 11/11 em frases novas de teste, em ~0,3–1,1 s.
- Mais exemplos de intenção; correção de “como funciona”, “crie uma história”, “muito grato”, etc.
- Gerador de caracteres (texto ilegível) substituído por montagem a partir de fontes (`redacao.js`) e recuperação do corpus.
- Validação local de verdade (reprova vazio, corrompido, repetitivo, sem sentido); sem aprovação, a LUA não entrega como se fosse boa.
- Acentos corrompidos e `\n` literal no painel corrigidos; painel mostra as probabilidades de intenção em barras.
- Layout responsivo, alvos de toque maiores, sem zoom no iOS, animações pesadas desligadas no celular, PWA.
- Memória: só cita conversas anteriores quando a pergunta é realmente parecida.

## Avisos de conexão das APIs
Logo abaixo do título da LUA há uma faixa que mostra, em tempo real, se tudo está funcionando:
- **Verde** — APIs conectadas e em uso. **Amarelo** — conectada, mas o botão está desligado, ou só uma das duas APIs está no ar. **Vermelho** — nenhuma API conectada (a LUA segue com Wikipédia e rede neural).
- Toque na faixa para ver o detalhe de **Servidor**, **Conhecimento API**, **Segurança API** e **Wikipédia**, com o motivo quando algo falha (chave não configurada, chave inválida/revogada, limite de uso, sem internet…).
- O teste é real: o servidor consulta a Groq com cada chave (`GET /api/status?check=1`, não gasta tokens) e o navegador testa o servidor e a Wikipédia.
- Reverifica a cada 60 s, ao voltar para a aba, ao ficar online/offline, quando uma chamada de API falha e no botão **Verificar agora**. Quando uma API conecta ou cai, aparece um aviso flutuante.
- Em hospedagem estática (sem `server.js`) a faixa informa que as APIs Groq ficam indisponíveis.

## Memória só com verificação da API de segurança
A LUA só grava no `memoria.txt` (pergunta + resposta), `aprendizado.txt` e `contexto.txt` — e no banco do navegador — o que a **Segurança API** aprovou. A API recebe a pergunta, a resposta e o texto da fonte (Wikipédia/API) para conferir assunto e fatos. Segurança API desligada, indisponível, resposta reprovada ou resposta direta (saudação, hora, nome) = **nada é gravado**. O painel mostra o estado em “Memória:”. Isso reduz, mas não elimina, informação errada: a API também pode errar.

## Limitações conhecidas
- A LUA organiza fatos de fontes; **não inventa histórias, poemas ou cartas**.
- Sem internet e sem corpus relevante, ela não responde pesquisas.
- A rede classifica 13 intenções; frases muito fora dos exemplos podem cair em “não tenho certeza”.

## Estrutura
`server.js` (backend) · `js/ui/configuracoes.js` + `css/configuracoes.css` (painel ⚙) · `api/api.js` (APIs + validação) · `js/rede/` (neural, níveis, treino) · `js/conversa/` (intenção, contexto, resposta) · `js/conhecimento/` (Wikipédia, fontes) · `js/gerador/` (corpus, redação, tamanho) · `js/ui/` (inclui `status-apis.js`) · `css/` · `sw.js` + `manifest.webmanifest` (PWA) · `memoria/` (arquivos .txt)

## Aviso automático de instalação (PWA)
Ao abrir a LUA em um navegador que permite instalar, aparece um aviso discreto ("Instale a LUA-IA") com **Instalar agora** e **Agora não** — não há botão permanente.
- Chrome/Edge (Android e Windows): usa o evento nativo `beforeinstallprompt`; a instalação é detectada por `appinstalled`.
- iPhone/iPad (Safari): mostra o passo a passo "Compartilhar → Adicionar à Tela de Início".
- Não aparece no app já instalado (modo standalone), após instalar, nem por 7 dias depois de "Agora não". A escolha fica no `localStorage` (chave `lua_pwa_install`; `LUA.pwaInstall.resetar()` no console limpa).
- Exige HTTPS (ou `localhost`). Código: `js/pwa-instalacao.js` e `css/instalar.css`.
