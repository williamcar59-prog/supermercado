# SuperMercado — Lista de Compras

Lista de compras de supermercado com **total estimado**, progresso por categoria,
**histórico** com "repetir lista" em um toque — **busca de preço + lojas perto
de você por GPS** ao adicionar cada produto — e a aba **💰 Preços**, que responde
**"sua lista sai R$ X mais barata no Y"**. PWA instalável (ícone no celular,
abre offline), roda no celular e no computador. Dados guardados no próprio
aparelho (sem login) — e, opcionalmente, **compartilhados com a comunidade**
via Supabase (preço que você registra ajuda quem pesquisa).

**▶ No ar: <https://williamcar59-prog.github.io/supermercado/>**
(PWA instalável em qualquer aparelho. Publicado automático pelo GitHub
Actions a cada push em `main` — ver `.github/workflows/deploy.yml`.)

## Rodar

```powershell
npm.cmd install
npm.cmd run dev        # http://localhost:5179  (porta reservada)
npm.cmd run build      # gera dist/ (com SW + manifest do PWA)
npm.cmd run preview    # http://localhost:4178  (porta reservada)
npm.cmd run typecheck  # checagem de tipos
npm.cmd run lint       # oxlint
npm.cmd run teste      # 156 verificações da lógica (dados, busca, marca, promoções, nuvem)
npm.cmd run icons      # regera public/icons/*.png (gerador próprio, sem deps)
```

> Neste ambiente o PowerShell bloqueia `npm.ps1` — use sempre **`npm.cmd`**.

Portas reservadas deste projeto (registradas em `MANUAL_IA_UTEIS/01-inventario-de-projetos.md`):
**dev 5179 · preview 4178**. Não troque sem atualizar o inventário.

## O que tem hoje

**Lista (MVP)**
- Itens com nome, quantidade, unidade, categoria e preço unitário opcional.
- Marcação "no carrinho" com barra de progresso; total estimado + aviso de itens sem preço.
- Agrupamento por categoria, excluir com "Desfazer", concluir → histórico com **Repetir**.
- Lista de demonstração na primeira abertura (não volta depois de apagar).
- Versão visível no rodapé (`v0.6.0` + carimbo de build).

**Busca ao adicionar produto (novidade 0.2)**
- **📍 Lojas perto de você** — GPS (`navigator.geolocation`) + Nominatim do
  OpenStreetMap com `viewbox` limitado a ~5 km: nome, **distância**, horário,
  telefone e botão **Rota** (Google Maps). Segunda onda com o termo "mercado"
  se a primeira vier vazia (respeita o limite de 1 req/s do Nominatim).
  - Sem GPS (http em LAN, permissão negada) → **busca por cidade** ("Campinas, SP").
  - Última coordenada é guardada: não repede o pedido a cada item.
- **💰 Preços** — base própria (produto+loja normalizados, sem acento) com botão
  **Usar** (preenche o campo), **tentativa de preço real do Mercado Livre**
  (com timeout; se a API recusar, segue o app) e **"Registrar o preço que eu vi"**
  — mesmo produto+loja atualiza, não duplica.
- **🛒 Comparar agora** — Google Shopping, Mercado Livre, Buscapé e Zoom com a
  busca já pronta (valores em 1 toque).
- **📱 Aplicativos de entrega** — iFood, 99Compras e Rappi **não têm busca
  pública**: o botão abre o site **e copia o nome do produto** para colar.
  O preço visto lá é registrado na base e passa a valer para sempre.

> **Por que honesto assim:** iFood/99 não expõem API de preços (testado em
> 13/11/2026); a API do Mercado Livre bloqueou busca anônima (403); Overpass
> do OSM estava 502 (por isso Nominatim). Não há scraping — a base de preços é
> colaborativa, sua.

**Aba 💰 Preços (novidade 0.3) — "sua lista sai R$ X mais barata no Y"**
- Cruza **lista ativa × base de preços** (`src/lib/carrinho.ts`): total por loja,
  item a item, com barra de cobertura (`5/8 itens`).
- **Comparação justa:** o título de "mais barata" só disputa lojas que cobrem a
  **mesma** quantidade de itens — comparar loja que acha 8 com loja que acha 3
  seria mentira. A economia mostrada é a diferença entre as elegíveis.
- Itens sem preço nenhum aparecem em **"❔ Sem preço na base"** com o caminho
  para cobrir a lacuna (→ aba Lista → 🔍 Buscar preço).

**PWA instalável (novidade 0.3)**

- `vite-plugin-pwa` com `registerType: 'prompt'` + `injectRegister: false` —
  **nosso** componente (`src/app/Pwa.tsx`) controla o aviso: versão nova mostra
  "🔄 Nova versão disponível → Atualizar" (nunca força reload).
- Botão **📲 Instalar** (`beforeinstallprompt`) no Chrome/Android/Edge; no iOS
  (que não dispara o evento) aparece a dica **Compartilhar → Adicionar à Tela
  de Início**.
- Ícones gerados por script próprio (`scripts/gen-icons.mjs`, zero dependências):
  192, 512, **maskable-512** (sem ele o Android reclama) e apple-touch 180.
  Regenere com `npm.cmd run icons`.
- Offline: precache de js/css/html + runtime `NetworkFirst` do Nominatim (7 dias).

**Base compartilhada (novidade 0.4) — "quem registra, ajuda quem busca"**
- **Automático, sem cadastro:** ao registrar um preço ele é gravado local na
  hora e **entra numa fila** que sobe para a base colaborativa quando houver
  rede (offline? espera — nada se perde). Ao abrir o app (ou voltar a rede),
  baixa os preços da comunidade e **mescla** com a sua base.
- **Região junto:** o preço leva **cidade/UF** (reverse geocoding Nominatim,
  com cache por coordenada — 1 req só, falha não trava o registro).
- **Regra de mescla** (1 registro por produto+loja): preço da **sua cidade**
  vence → senão o **mais recente** → empate → o **local**. Nada se perde dos
  dois lados. Selo 👥 "comunidade" e nota de quantos preços vieram de fora.
- **Infra:** Supabase (plano grátis) — leitura pública, escrita **só** pela
  função `registrar_preco` (valida + limite 120/dia por aparelho anônimo, sem
  policy de insert direto). Ver `supabase/schema.sql`.
- **Sem `.env`, tudo isto fica desligado** e o app segue 100% local, sem erro.

### Ativar o compartilhamento (5 min, só uma vez)

1. Crie um projeto em [supabase.com](https://supabase.com) (grátis).
2. **SQL Editor → New query** → cole o conteúdo de `supabase/schema.sql` → **Run**.
3. **Project Settings → API** → copie *Project URL* e *anon key*.
4. `copy .env.example .env` e preencha as duas variáveis (`VITE_SUPABASE_*`).
5. `npm.cmd run build && npm.cmd run preview` (http://localhost:4178).

> Cuidado: o plano grátis **pausa o projeto após ~7 dias sem uso** (manual 05
> §12) — receita do ping cron está lá. Sem `.env` no build, o rodapé do app é
> local e a nuvem simplesmente não é chamada.

**Marca do produto + melhor preço (novidade 0.5)**
- Campo **"Marca (opcional)"** no item da lista → vai junto no registro de
  preço, aparece na busca e entra na **base compartilhada** (coluna `marca` no
  Supabase) para virar sugestão de quem pesquisar depois.
- Buscando "café": a base devolve **🏆 Melhor preço** (valor + loja + marca +
  cidade) e a **marca que você pediu aparece primeiro** com borda verde e ⭐ —
  as outras continuam listadas (destacar, não filtrar).
- Chave do preço passou a ser **produto + loja + marca**: "Café Pilão no Assaí"
  e "Café 3 Corações no Assaí" convivem, sem um apagar o outro.
- **Comparadores** (Google Shopping/Buscapé/Zoom/Mercado Livre) agora recebem
  **produto + marca** na busca.

> **Sobre "achar promoção":** testamos ao vivo em 13/11/2026 Mercado Livre
> (403), Open Food Facts (503), "API" do Zoom (404) e Buscapé (200 sem CORS).
> **Nenhuma fonte pública de promoção brasileira funciona** — as promoções que
> o app mostra são as da **base colaborativa** (você + comunidade), que é
> exatamente o que a v0.4 passou a compartilhar.

**Promoções ativas 🔥 + ofertas da web 🌐 (novidade 0.6)**
- **🔥 Promoções ativas:** no registro de preço, campo **"Promoção ativa até"**
  (data, máx 90 dias). O preço vira promoção na busca e na aba 💰 Preços com
  selo 🔥, loja, marca, cidade e **válida até dd/mm** — e o 🔥 **some sozinho**
  quando a validade passa (vira preço normal). Quem registra, compartilha: a
  validade viaja na fila e vai pro banco (coluna `validade`).
- **🌐 Ofertas na web (Google Shopping):** o app chama a **Edge Function
  `promocoes`** do Supabase (Deno), que fala com o **SerpAPI** do lado do
  servidor — resolve CORS e esconde a chave. Resultado: valor, loja e link
  "ver oferta", com a sua marca em destaque ⭐.
  - Proteção do plano grátis: **cache 72 h por termo** + **5 buscas novas/dia**
    (tabela `buscas_cache`); o app cacheia 24 h. Estourou → aviso discreto e a
    base colaborativa continua. Sem `SERPAPI_KEY` configurada → some a seção,
    nada quebra.
  - Configurar: Dashboard → Edge Functions → **Secrets** → `SERPAPI_KEY`
    (conta grátis em serpapi.com; a chave NUNCA entra no repositório).

## Estrutura (padrão do manual 03)

```
src/
  app/          contextos: ListaContext (dados), Toast (avisos), Pwa (SW + instalar)
  components/   ItemModal (form + marca), BuscaPreco (GPS + preços + atalhos)
  pages/        TelaLista, TelaPrecos (comparação), TelaHistorico
  lib/          api.ts (camada de dados ÚNICA), carrinho.ts (lista × preços),
                geoloc.ts (GPS/distância/região), lojas.ts (Nominatim),
                comparar.ts (preços + promoções), nuvem.ts (fila + download +
                mescla da base compartilhada), ofertas.ts (Google Shopping via
                Edge Function), categorias, format
  data/         demo.ts (semente de demonstração)
  types.ts      todos os tipos — Item (com marca), Lista, Preco (cidade/uf/marca/validade)
scripts/        gen-icons.mjs (ícones PNG do PWA, sem dependências)
supabase/       schema.sql (RLS + registrar_preco) — colar no SQL Editor
                functions/promocoes/index.ts — Edge Function (SerpAPI no servidor)
testes/         entrada.ts — 156 verificações (npm run teste)
```

### Camada de dados

Todo acesso a dados passa por **`src/lib/api.ts`** (localStorage) e a base
compartilhada por **`src/lib/nuvem.ts`** (fila + Supabase REST). Chaves:

| Chave | Conteúdo |
|---|---|
| `supermercado:listas:v1` | todas as listas (ativa + histórico) |
| `supermercado:precos:v1` | base de preços local |
| `supermercado:coord:v1` | última coordenada aceita (cache do GPS) |
| `supermercado:regiao:v1` | cidade/UF da última coordenada (cache) |
| `supermercado:semeou:v1` | flag: já semearia a demo (lista)? |
| `supermercado:semeouprecos:v1` | flag: já semearia a demo (preços)? |
| `supermercado:dispositivo:v1` | id anônimo do aparelho (anti-limite) |
| `supermercado:filaenvio:v1` | fila de envio pendente (cap 200) |
| `supermercado:precosnuvem:v1` | cache da base compartilhada baixada |
| `supermercado:ofertas:v1` | cache das ofertas da web por termo (24 h) |

## Avisos

- **GPS exige contexto seguro** (HTTPS ou `localhost`). Pelo IP da Wi-Fi
  (`http://192.168.x.x`) o navegador bloqueia — o app cai na busca por cidade.
- **Instalação do PWA em `http://` também é limitada**: pelo `localhost` funciona;
  pelo IP da Wi-Fi, o Chrome Android normalmente não oferece o botão Instalar.
  Para instalar de verdade, é HTTPS (túnel/ngrok) — ver manual 04.
- Nominatim: máx. 1 consulta/s, uso educacional — sem chave, sem cadastro.
- Testando versão nova com SW no ar? Limpe o cache antes (lição nº 1 do manual):
  DevTools → Application → Service Workers → Unregister + caches.delete().

## Próximos passos

1. Criar o projeto Supabase e ativar o compartilhamento (5 passos acima) —
   é **manual**, só você pode fazer.
2. Publicar (beta) — produção só com aprovação explícita (regra nº 8).
