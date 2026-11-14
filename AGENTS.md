# AGENTS.md — leia ANTES de começar qualquer projeto novo

Este diretório é a **memória dos projetos**. Antes de criar qualquer aplicativo,
site ou automação nova, leia este manual inteiro (ou ao menos os arquivos
indicados abaixo). Ele existe para não pagar duas vezes o mesmo apuro.

> **Regra nº 1:** se você aprender algo novo num projeto, **volte aqui e
> registre**. O valor deste manual é não repetir erro.

---

## Ordem de leitura

| # | Arquivo | Quando ler |
|---|---|---|
| 0 | [README.md](README.md) | sempre — índice geral |
| 1 | [01-inventario-de-projetos.md](01-inventario-de-projetos.md) | para saber **o que já existe** e não refazer |
| 2 | [02-roteiro-novo-app.md](02-roteiro-novo-app.md) | **antes de codar** — checklist do zero |
| 3 | [03-stack-e-arquitetura.md](03-stack-e-arquitetura.md) | ao escolher estrutura e pastas |
| 4 | [04-pwa-apk-e-versao.md](04-pwa-apk-e-versao.md) | se for PWA, instalável ou APK |
| 5 | [05-dados-seguranca-e-sync.md](05-dados-seguranca-e-sync.md) | ao ligar banco, login ou offline |
| 6 | [06-infraestrutura-local.md](06-infraestrutura-local.md) | ao rodar servidor, porta, túnel ou automação |
| 7 | [07-armadilhas.md](07-armadilhas.md) | **sempre que algo quebrar** — tabela de erros reais |
| 8 | [08-testes-e-verificacao.md](08-testes-e-verificacao.md) | antes de dizer "está pronto" |
| 9 | [09-publicacao.md](09-publicacao.md) | só na hora de publicar |
| 10 | [10-comandos-prontos.md](10-comandos-prontos.md) | copiar e colar |
| 11 | [11-projeto-planilha-de-gastos.md](11-projeto-planilha-de-gastos.md) | referência completa (regras de negócio, PDF, sync, 124 testes) |
| 12 | [12-projeto-saveloot.md](12-projeto-saveloot.md) | referência completa (API proxy, leitor de código, Electron, vistoria) |
| 13 | [13-indice-de-credenciais.md](13-indice-de-credenciais.md) | **onde** vive cada segredo (nunca o segredo) |
| 14 | [14-projeto-app-carro.md](14-projeto-app-carro.md) | referência completa (KARPRIME/Vercel/Supabase) |
| 15 | [15-projeto-card-games.md](15-projeto-card-games.md) | referência completa (coleção Xbox/PS + servidor Node) |
| 16 | [16-projeto-historico-veicular.md](16-projeto-historico-veicular.md) | referência completa (Flutter/SQLite offline) |
| 17 | [17-projeto-controle-de-pressao.md](17-projeto-controle-de-pressao.md) | referência completa (HTML puro, zero dependências) |
| 18 | [18-projeto-rewards.md](18-projeto-rewards.md) | referência completa (Microsoft Rewards, IndexedDB) |
| 19 | [templates/README.md](templates/README.md) | **templates copiáveis** (vite.config, schema, scripts) |

---

## As 10 lições que mais se repetem

1. **O service worker serve a versão antiga.** Depois de publicar, limpe SW +
   `caches.delete()` + `?nc=` na URL. Senão você testa código velho e jura que
   o deploy falhou.
2. **A regra tem que estar no banco, não só na tela.** Esconder no React é
   teatro — qualquer um lê a API na mão. Faça a policy RLS bloquear.
3. **UI otimista não prova que gravou.** Confirme a escrita numa leitura
   separada, depois.
4. **Cada projeto na sua própria porta.** `4173` é a porta padrão do
   `vite preview` e **três projetos desta máquina disputam a 5173 de dev**.
   E: *HTTP 200 não prova que é o seu app* — confira o `<title>`.
5. **`mtime` não prova que dados mudaram.** Escrita atômica regrava sem mudar
   conteúdo. Só **conteúdo** é prova.
6. **Túnel rápido da Cloudflare é descartável.** Nunca vire dependência — morre
   no reinício e o endereço nunca volta. Ngrok serve pro app; Cloudflare serve
   só pro build do APK.
7. **Trocou a assinatura do APK → desinstalar antes.** Atualizar sem perder
   dados exige reexportar o keystore.
8. **Nunca publicar produção sem aprovação explícita.** Beta é livre,
   produção não. Mostre print antes de perguntar.
9. **Teste destrutivo exige passo de restauração no mesmo script.**
10. **Quem religa sozinho não pode abrir janela** (nem navegador, nem terminal).

---

## Onde estão as fontes originais

Este manual **consolida**, mas a verdade continua nos projetos:

| Fonte | Caminho |
|---|---|
| Playbook de erros (Card Games) | `..\APP_CARD_GAMES\reuso\conhecimento\PLAYBOOK.md` |
| Kit de reuso (scripts, templates, testes) | `..\APP_CARD_GAMES\reuso\` |
| Aprendizados (Carro) | `..\APP_CARRO\aprendizados\` |
| Credenciais (fora do Git) | `CREDENCIAIS.txt` em cada projeto |

> **Segredos nunca entram neste manual.** Tokens, senhas e chaves ficam no
> `CREDENCIAIS.txt` de cada projeto. Aqui só se documenta **onde** fica.

---

## Sobre este diretório

```
MANUAL_IA_UTEIS/
├── AGENTS.md              ← você está aqui (entrada automática)
├── README.md              ← índice para humanos
├── 01..10-*.md            ← o manual
└── snippets/              ← trechos prontos pra copiar
```

`AGENTS.md` é carregado automaticamente quando este diretório é o de trabalho.
Num projeto novo, **copie este arquivo para a raiz do projeto** — assim o
manual continua disponível lá dentro.
