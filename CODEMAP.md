# Mapa do código

Leia isto antes de abrir arquivos: diz onde está cada parte, para abrir só o necessário.
Referências: `arquivo#nome` = id no HTML ou nome de função/tabela no arquivo (busque com `grep -n nome arquivo`).
Sem números de linha de propósito: eles mudam a cada edição. `python3 testes/mapa.py` confere este mapa (roda no CI).

## Visão geral

Sem build. Produtos servidos pelo GitHub Pages a partir da `main` (domínio em `CNAME`, `.nojekyll` desliga o Jekyll):

| Produto | Onde | Endereço |
|---|---|---|
| Site institucional (uma página) | `index.html`, `assets/`, `404.html` | panoramaip.com.br |
| App da área do cliente (PWA, Supabase) | `app/` | panoramaip.com.br/app |
| Programa para Windows (Electron, abre o app publicado) | `desktop/` | Release no GitHub |

Publicar = merge na `main`. Banco e funções do Supabase NÃO publicam sozinhos (ver Supabase).

## Site institucional: `index.html`

Arquivo único: CSS no `<style>` do `<head>` (tokens de cor em `:root`), HTML, e um `<script>` no fim (formulário de contato via `mailto:`, brilho do vidro, animações). Sem CSP de propósito (só texto estático).

| Seção | Âncora |
|---|---|
| Cabeçalho (cápsula de vidro, menu, Entrar, Fale conosco) | `index.html` `<header class="top">` |
| Abertura | `index.html#inicio` (`<main>`, `.hero`) |
| Quem somos | `index.html#quem-somos` |
| Por que atuar | `index.html#por-que` |
| Serviços (eixos) | `index.html#servicos` |
| Setores | `index.html#setores` |
| Contato (formulário) | `index.html#contato`, `index.html#contact-form` |
| Rodapé | `index.html` `<footer>` (ano em `index.html#ano`) |

- `assets/`: símbolo (`simbolo.svg`, favicon) e fotos de Brasília.
- `sw.js` e `service-worker.js` (raiz): só apagam o service worker do site antigo (GoDaddy). Não mexer.

## App: `app/`

Carregamento: `app/index.html` (CSP no `<meta>`, todas as telas) → `app/vendor/supabase-2.45.4.js` → `app/config.js` (URL e chave anon, `demo: true` força a demonstração) → módulos → `app.js` por último.
Cada módulo faz `PanoramaModulos.push(function (P) {...})` e devolve `{ aoAbrirAba(nome, sub), aoTrocarCliente() }`; `P` são as utilidades de `app.js` (`$`, `el`, `sb`, `tabela`, `estado`, `irPara`, `chamarFuncao`...).
Sem Supabase configurado roda em demonstração, com dados no `localStorage`.

**Núcleo, `app/app.js`**: login (`app/app.js#renderLogin`), conta e cliente atual (`app/app.js#carregarConta`, `app/app.js#trocarCliente`), rotas por `?secao=`/`?alerta=`/`?config=1` (`app/app.js#rotear`, `app/app.js#irPara`), mapa seção→painel (`app/app.js#SECOES`, `app/app.js#selecionarAba`), acesso a tabelas com modo demo (`app/app.js#tabela`), alertas e recebidos (`app/app.js#renderAlertas`, `app/app.js#renderRecebidos`), helpers `app/app.js#el` (cria DOM, nunca innerHTML), `app/app.js#linkSeguro`, `app/app.js#confirmar`.

| Menu (`?secao=`) | Painel em `app/index.html` | Módulo | Tabelas / funções |
|---|---|---|---|
| geral | `app/index.html#painel-geral` | `app/geral.js` (entradas por tipo) + `app/relgov.js#renderResumo` | entradas, contar_entradas |
| monitoradas, novas, filtros | `app/index.html#painel-proposicoes` | `app/proposicoes.js` (+ `app/similaridade.js`) | proposicoes, candidatas, palavras, especialidades; fn coletar-proposicoes, inteiro-teor |
| agenda | `app/index.html#painel-agenda` | `app/agenda.js` | APIs das Casas |
| deputados, senadores | `app/index.html#painel-parlamentares` | `app/parlamentares.js#renderLista`, `app/parlamentares.js#renderPerfil` | APIs das Casas |
| mapa | `app/index.html#painel-mapa` | `app/parlamentares.js#renderMapa` | mapa_parlamentares |
| contatos, interacoes, tarefas | `app/index.html#painel-contatos`, `app/index.html#painel-interacoes`, `app/index.html#painel-tarefas` | `app/relacionamento.js` | contatos, interacoes, tarefas |
| emails, listas | `app/index.html#painel-emails`, `app/index.html#painel-listas` | `app/emails.js` | campanhas_email, envios_email, listas_email, lista_membros, descadastros; fn enviar-emails |
| alertas, recebidos | `app/index.html#painel-alertas`, `app/index.html#painel-recebidos` | `app/app.js` (+ publicar em `app/relgov.js`) | alertas, notas |
| relatorio | `app/index.html#painel-relatorio` | `app/relatorio.js` (imprimir/PDF/Word) | lê várias |
| config (`?config=1`) | `app/index.html#tela-config` | `app/equipe.js#renderConfig` (conta, organizações, clientes, pessoas) | perfis, organizacoes, clientes, acessos; fn gerenciar-pessoas |
| config: perfis, e-mail, programa | `app/index.html#painel-perfis`, `app/index.html#painel-emailcfg`, `app/index.html#painel-programa` | `app/relgov.js#renderPerfis`, `app/relgov.js#renderEmailCfg`, `app/relgov.js#renderPrograma` | definir_envio_email |

Outras peças do app:
- `app/relgov.js`: peças comuns em `window.PanoramaRG` (formulário em janela `app/relgov.js#formulario` → `app/index.html#dialogo-form`, CSV `app/relgov.js#lerCsv`/`app/relgov.js#baixarCsv`, selos, datas).
- `app/casas.js`: consulta direta à Câmara e ao Senado (`window.PanoramaCasas`, cache de 10 min, `app/casas.js#urlInteiroTeor`).
- Inteiro teor: `app/proposicoes.js#abrirTeor` → `app/index.html#dialogo-teor`.
- Telas fora do menu: `app/index.html#tela-login`, `app/index.html#tela-alerta`, `app/index.html#tela-entradas`, `app/index.html#tela-parlamentar`, `app/index.html#tela-proposicao`, `app/index.html#tela-form-prop`, `app/index.html#tela-recebido`.
- `app/app.css`: estilos do app. `app/manifest.webmanifest` + `app/icones/`: instalação (inclui o alvo de Compartilhar do Android).
- `app/sw.js`: modo offline. **Ao mudar qualquer arquivo do app, aumente `app/sw.js#VERSAO`** e mantenha a lista de arquivos dele em dia.
- `app/descadastro.html` + `app/descadastro.js`: página pública de descadastro de e-mails.
- `app/vendor/`: supabase-js fixo (não editar). `app/LEIAME.md`: manual de configuração para o dono do app.

## Supabase (projeto `crshelcvnyisecueknzd`)

Banco em `app/supabase/`, sempre nesta ordem, todos idempotentes (podem rodar de novo):

| Arquivo | Cria |
|---|---|
| `app/supabase/esquema.sql` | alertas, notas, especialidades, palavras, proposicoes, candidatas, entradas, `contar_entradas` |
| `app/supabase/clientes.sql` | clientes, perfis, acessos, `criar_perfil`, `sou_admin`, `pode_ver`, `salvar_meu_nome` |
| `app/supabase/niveis.sql` | organizacoes, níveis master/coordenador/atendimento: `meu_papel`, `minha_org`, `org_de`, `sou_master`, `sou_admin`, `gere_org`, `gere_cliente`, `pode_ver` (versão final) |
| `app/supabase/relgov.sql` | mapa_parlamentares, contatos, interacoes, tarefas, listas_email, lista_membros, campanhas_email, envios_email, descadastros, coletas, `pode_enviar`, `definir_envio_email`, `conferir_mesmo_cliente`; fecha regras antigas e acesso anônimo às funções |
| `app/supabase/agendamento.sql` | pg_cron diário 7h (Brasília) chamando a coleta; segredo no Vault (`segredo_coleta`) |

Segurança mora no RLS: toda tabela é por `cliente_id` e passa por `pode_ver`. Mudou regra? Rode `testes/regras.sh`.

Edge Functions (`app/supabase/functions/<nome>/index.ts`, Deno, publicadas à mão no painel):

| Função | Faz | Login |
|---|---|---|
| `app/supabase/functions/coletar-proposicoes/index.ts` | coleta diária das Casas → candidatas e entradas | login ou segredo do agendamento |
| `app/supabase/functions/inteiro-teor/index.ts` | baixa o PDF da Casa e extrai o texto | login |
| `app/supabase/functions/gerenciar-pessoas/index.ts` | criar, senha, remover, mudar nível de pessoas | master/coordenador |
| `app/supabase/functions/enviar-emails/index.ts` | campanhas pelo Resend, com descadastro assinado | quem pode enviar |
| `app/supabase/functions/descadastrar/index.ts` | descadastro (página e um clique do Gmail) | sem login (HMAC) |

Produção (SQL, deploy de funções, segredos) só com aprovação explícita do Nando.

## Programa para Windows: `desktop/`

`desktop/main.js` (janela, menu por seções, atalhos Ctrl+1..7, links externos no navegador), `desktop/preload.js`, `desktop/copiar-app.js` (copia `app/` para o instalador, usado offline), `desktop/package.json` (versão e lista `build.files`), `desktop/package-lock.json`, `desktop/build/` (ícones), `desktop/.gitignore`. Manual: `desktop/LEIAME.md`.

## Testes e CI

`.github/workflows/testes.yml` roda em todo PR (manual em `testes/LEIAME.md`):
- `testes/regras.sh` + `testes/supabase-local.sql`: RLS num Postgres que imita o Supabase.
- `testes/estaticos.py`: sintaxe, ids usados pelo JS existem no HTML, lista do `app/sw.js`, CSP, nada de innerHTML nem service_role.
- `testes/sintaxe-funcoes.js`: sintaxe das Edge Functions.
- `testes/app-demo.js`: Playwright no modo demonstração.
- `testes/mapa.py`: este mapa está em dia.

`.github/workflows/programa-windows.yml`: gera o instalador do Windows (push na main em `app/` ou `desktop/`, ou à mão).

## Ferramentas e docs

- `ferramentas/montar-previa.py`: junta o app numa página só (demo) para prévia no Claude. Lista de módulos fixa: módulo novo entra aqui também.
- `README.md` (visão curta), `CLAUDE.md` (regras para quem programa), este `CODEMAP.md`.
