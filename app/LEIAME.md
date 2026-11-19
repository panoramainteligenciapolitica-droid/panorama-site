# App Panorama (área do cliente)

App instalável em `panoramaip.com.br/app`, publicado pelo GitHub Pages junto com o site. Não tem build: os arquivos desta pasta são servidos como estão.

- Login com e-mail e senha, só para clientes cadastrados. "Esqueci minha senha" manda um link para criar ou trocar a senha.
- Lista de alertas, cada um com link próprio (`/app/?alerta=<id>`) e botão para compartilhar em outros apps.
- No Android, o app instalado aparece no menu Compartilhar de outros apps; o que chega fica em "Recebidos".
- Funciona sem internet depois da primeira visita (a casca do app fica guardada; os dados precisam de rede).

Sem o Supabase configurado, o app abre em modo de demonstração: a aba Geral e a busca de Novas consultam a Câmara e o Senado direto do navegador (`casas.js`), e o que você cadastra fica guardado no próprio aparelho.

Em qualquer tela, tocar no número da proposição abre o inteiro teor, com download em PDF e Word.

## Ligar o Supabase (uma vez)

1. Em [supabase.com](https://supabase.com), crie um projeto.
2. SQL Editor: cole e rode o arquivo `supabase/esquema.sql`.
3. Authentication > Sign In / Providers: deixe o Email ligado e desligue "Allow new users to sign up", para que só clientes convidados entrem.
4. Authentication > URL Configuration: Site URL `https://panoramaip.com.br/app/`.
5. Antes de abrir aos clientes, configure um SMTP próprio (Authentication > Emails > SMTP Settings). O envio grátis do Supabase só manda e-mail para quem é da equipe do projeto.
6. Project Settings > API: copie a Project URL e a chave anon public para `config.js`.
7. Para liberar um cliente: Authentication > Users > Add user. Ele cria a senha pelo "Esqueci minha senha" na tela de entrada.
8. Para publicar um alerta: Table Editor > alertas > Insert row.

## Proposições (Câmara e Senado)

- Cadastro manual ou a partir das coletadas, com especialidade, prioridade, posicionamento, situação e próximo passo.
- Coleta diária: a função `supabase/functions/coletar-proposicoes` traz tudo o que foi apresentado ontem e hoje nas duas Casas (APIs de dados abertos). O app mostra em "Novas" o que tem alguma palavra-chave ou é parecido com o que já é monitorado, acima da similaridade mínima.
- Similaridade (`similaridade.js`): TF-IDF com cosseno sobre as ementas, sem as palavras de praxe ("dispõe", "altera", "lei"...). A especialidade sugerida é a de maior média entre as duas monitoradas mais parecidas.

Para ligar a coleta:

1. Rode de novo os arquivos do banco, sempre nesta ordem: `esquema.sql`, `clientes.sql`, `niveis.sql`, `relgov.sql` (veja "Banco: ordem dos arquivos").
2. Edge Functions > Deploy a new function > Via Editor: publique `coletar-proposicoes` e `inteiro-teor`, cada uma com o seu `index.ts`.
   As duas só atendem quem tem login no app (a coleta também aceita o agendamento, com o segredo abaixo).
3. Crie o segredo da coleta, um valor longo e aleatório: em Edge Functions > Secrets como `COLETA_SEGREDO` e, no SQL Editor,
   `select vault.create_secret('<o mesmo valor>', 'coleta_segredo');`. O valor nunca vai para este repositório.
4. Database > Extensions: ligue `pg_cron` e `pg_net`. Depois rode `supabase/agendamento.sql` no SQL Editor.

## Aba Geral (entradas por tipo)

Conta quantas proposições deram entrada nas duas Casas, por tipo (PL, PEC, REQ...), no período escolhido: último dia com registros, 7 dias, 15 dias, semana atual, mês atual ou datas livres.

- Tocar no tipo abre a lista daquele tipo; tocar no número da Câmara ou do Senado abre só as daquela Casa. Cada item tem "Monitorar" e o link para a Casa.
- Os números vêm da tabela `entradas`, que a coleta diária preenche com tudo o que foi apresentado (criada por `esquema.sql`, junto com a função `contar_entradas`).
- A contagem começa no dia em que a coleta passar a rodar. Para preencher meses passados, chame a função com um período de até 31 dias por vez, por exemplo no SQL Editor:

```sql
select net.http_post(
  url := 'https://crshelcvnyisecueknzd.supabase.co/functions/v1/coletar-proposicoes',
  headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <chave anon>',
    'x-coleta-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'coleta_segredo')),
  body := '{"inicio": "2026-10-01", "fim": "2026-10-31", "soEntradas": true}'::jsonb,
  timeout_milliseconds := 150000
);
```

## Organizações, clientes e pessoas
Rode `supabase/clientes.sql` e depois `supabase/niveis.sql` no SQL Editor. Níveis de acesso:
- **Master** (dono do app): vê e configura todas as organizações, clientes e pessoas, e muda o nível de qualquer um.
- **Organização** (Serafim, Panorama...): agrupa clientes e pessoas.
- **Coordenador**: vê todos os clientes da sua organização, cria clientes, cadastra atendimentos e libera clientes para eles.
- **Atendimento**: vê só os clientes liberados para ele.

Cada cliente tem banco próprio de especialidades, palavras-chave, proposições monitoradas, novas e alertas.
O botão **Configurações** separa os temas: Minha conta (todos), Organizações (master), Clientes e Pessoas
(master e coordenador). Cadastro, senha, remoção e nível passam pela função `gerenciar-pessoas`.
Os alertas são publicados pelo Table Editor escolhendo o cliente na coluna `cliente_id`. A coleta diária roda para cada cliente.

A aba Geral lê do banco (tabela `entradas`, preenchida pela coleta diária) os dias até ontem e consulta na hora só o dia de hoje.

## Funções de relações governamentais (menu lateral)
Rode `supabase/relgov.sql` no SQL Editor (depois de `niveis.sql`). O menu lateral organiza o app em seções:

- **Painel geral**: resumo do cliente (monitoradas, tarefas atrasadas, prazos da semana, reuniões, apoios mapeados) e as entradas por tipo.
- **Legislativo**: proposições monitoradas, novas, palavras-chave e especialidades, e a **Agenda do Congresso** (comissões e plenários
  das duas Casas, com as monitoradas em pauta em destaque).
- **Parlamentares**: deputados e senadores em exercício (dados oficiais), perfil com gabinete, comissões e autorias, e o **mapa de
  stakeholders** do cliente (apoiador a opositor, influência, temas e notas).
- **Relacionamento**: contatos (com importação e exportação de planilha), reuniões e interações, tarefas e prazos.
- **Comunicação**: alertas (publicados pelo app por coordenadores), **envio de e-mails em massa** e listas de e-mail, recebidos.
- **Relatórios**: relatório do cliente por período, para imprimir, salvar em PDF ou baixar em Word.

Envio de e-mails: publique as funções `enviar-emails` e `descadastrar` (esta com "Verify JWT" desligado) e crie os segredos
`RESEND_API_KEY`, `EMAIL_REMETENTE` e `DESCADASTRO_SEGREDO` (valor longo e aleatório) em Edge Functions > Secrets.
Sem `DESCADASTRO_SEGREDO` a assinatura dos links usa a chave de serviço; ao criá-lo, os links de e-mails já enviados deixam de valer.
Cada e-mail traz o descadastro em um clique dos provedores (cabeçalho `List-Unsubscribe-Post`), que chama `descadastrar` direto.
O envio reserva a campanha: duas chamadas ao mesmo tempo não mandam em dobro, e um envio parado há mais de 10 minutos pode continuar. Master e coordenadores enviam; atendimentos só quando liberados
em Configurações > Perfis e permissões. Todo e-mail leva o link de descadastro (`descadastro.html`).

## Banco: ordem dos arquivos
Sempre `esquema.sql`, `clientes.sql`, `niveis.sql`, `relgov.sql`. Todos podem rodar de novo sem abrir nada: o `relgov.sql`, por último,
também fecha regras antigas, confere que listas, contatos e proposições ligados a um registro são do mesmo cliente, aceita só links
http(s) em alertas e recebidos, e tira de quem não tem login o acesso às funções do banco. Os testes em `testes/` conferem isso.

## Segurança: o que conferir no painel do Supabase (não está no código)
- Authentication > Sign In / Providers: "Allow new users to sign up" desligado.
- Authentication > Rate Limits: limites de login e de e-mail ligados; Authentication > Attack Protection: proteção contra senhas vazadas.
- MFA para as contas master.
- Project Settings > API: "Max rows" em 1000 (o app e as funções leem em páginas desse tamanho).
- A chave `service_role` só nas funções (variável de ambiente), nunca em `config.js`.

## Programa para Windows
A pasta `desktop/` gera o instalador do Panorama RelGov (veja `desktop/LEIAME.md`). O programa abre este app publicado, então
recebe as novidades sem reinstalar.

## Prévia dentro do Claude

`python3 ferramentas/montar-previa.py . app-panorama.html` gera uma página única em modo de demonstração.

## Ao mudar arquivos

Aumente `VERSAO` em `sw.js` para os celulares que já instalaram o app baixarem a versão nova.
