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

1. Rode de novo `supabase/esquema.sql` (cria as tabelas de proposições).
2. Edge Functions > Deploy a new function > Via Editor: publique `coletar-proposicoes` e `inteiro-teor`, cada uma com o seu `index.ts`.
3. Database > Extensions: ligue `pg_cron` e `pg_net`. Depois rode `supabase/agendamento.sql` no SQL Editor.

## Aba Geral (entradas por tipo)

Conta quantas proposições deram entrada nas duas Casas, por tipo (PL, PEC, REQ...), no período escolhido: último dia com registros, 7 dias, 15 dias, semana atual, mês atual ou datas livres.

- Tocar no tipo abre a lista daquele tipo; tocar no número da Câmara ou do Senado abre só as daquela Casa. Cada item tem "Monitorar" e o link para a Casa.
- Os números vêm da tabela `entradas`, que a coleta diária preenche com tudo o que foi apresentado. Rode de novo `supabase/esquema.sql` para criá-la, junto com a função `contar_entradas`.
- A contagem começa no dia em que a coleta passar a rodar. Para preencher meses passados, chame a função com um período de até 31 dias por vez, por exemplo no SQL Editor:

```sql
select net.http_post(
  url := 'https://crshelcvnyisecueknzd.supabase.co/functions/v1/coletar-proposicoes',
  headers := '{"Content-Type": "application/json", "Authorization": "Bearer <chave anon>"}'::jsonb,
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
`RESEND_API_KEY` e `EMAIL_REMETENTE` em Edge Functions > Secrets. Master e coordenadores enviam; atendimentos só quando liberados
em Configurações > Perfis e permissões. Todo e-mail leva o link de descadastro (`descadastro.html`).

### Enviar pelo próprio Gmail ou Outlook
Cada pessoa da equipe pode conectar a própria conta em Configurações > Minha conta > "Meu e-mail para envios". Os envios dela
(em massa e testes) passam a sair do endereço dela, com as respostas na caixa dela e cópia em Enviados. Sem conta conectada,
o envio continua pelo Resend. Na hora de enviar dá para escolher entre "Minha conta" e "Servidor do app".

- O app pede só a permissão de enviar (Gmail: `gmail.send`; Microsoft: `Mail.Send`). Não lê a caixa de entrada.
- Os tokens ficam na tabela `contas_email`, com RLS ligado e sem regra nenhuma para usuários: só as funções do servidor leem.
  O app vê apenas o provedor e o endereço, pela função `minha_conta_email()`.
- Envio pela conta é um e-mail por vez (Gmail cerca de 2 por segundo; Outlook até 30 por minuto). Se o tempo da função acaba,
  o app chama de novo sozinho até terminar. Se o Gmail ou o Outlook avisarem que a cota do dia acabou, o envio para e fica
  "Parcialmente enviada" para continuar depois.

Para ligar (uma vez):
1. SQL Editor: rode `supabase/contas-email.sql`.
2. Edge Functions: publique `conta-email` com "Verify JWT" **desligado** (o Google e a Microsoft voltam para ela sem o login
   do app) e atualize `enviar-emails` com o código novo.
3. Google Cloud (console.cloud.google.com): crie um projeto, ative a Gmail API, configure a tela de consentimento (Externo,
   domínio autorizado `crshelcvnyisecueknzd.supabase.co`, escopos `openid`, `email`, `profile` e `gmail.send`), publique
   o app ("Em produção") e crie um ID do cliente OAuth do tipo "Aplicativo da Web" com o URI de redirecionamento
   `https://crshelcvnyisecueknzd.supabase.co/functions/v1/conta-email`.
4. Microsoft (entra.microsoft.com > Registros de aplicativo): novo registro para "contas em qualquer diretório organizacional
   e contas Microsoft pessoais", URI de redirecionamento Web igual ao de cima, um segredo do cliente e as permissões
   delegadas do Microsoft Graph `Mail.Send`, `User.Read`, `offline_access`, `openid`, `email` e `profile`.
5. Edge Functions > Secrets: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID` e `MICROSOFT_CLIENT_SECRET`.

Enquanto o app do Google não passar pela verificação, quem conecta vê o aviso "O Google não verificou este app" (clicar em
"Avançado" e continuar) e o limite é de 100 contas. Se o app ficar em "Teste", a conexão cai a cada 7 dias. Em empresas que
usam Microsoft 365, o administrador pode ter que aprovar o app uma vez para a organização.

## Avisos, tramitação, resumo por IA e demais melhorias (melhorias.sql)

Rode `supabase/melhorias.sql` no SQL Editor depois de `relgov.sql` e `contas-email.sql`. Ele:

- tira das funções internas (SECURITY DEFINER) a permissão de quem não entrou no app;
- cria `tramitacoes`, `avisos`, `avisos_lidos`, `push_inscricoes`, `config_servidor`, `notas_tecnicas` e `historico`;
- acrescenta limiar por cliente, responsável nas tarefas, preferências de aviso e campos de tramitação nas proposições;
- agenda três tarefas: `acompanhar-tramitacao` (todo dia às 7h20 de Brasília), `avisos` a cada 15 minutos (notificações) e
  `avisos` às 8h (resumo diário por e-mail, tarefas que vencem e rascunho do relatório mensal no dia 1).

Edge Functions (todas com "Verify JWT" ligado):

| Função | O que faz | Segredos |
| --- | --- | --- |
| `coletar-proposicoes` | coleta diária, agora por cliente, com palavras-chave e similaridade, e avisos de novas | — |
| `acompanhar-tramitacao` | lê andamento, relator, situação e prazos de emendas das monitoradas e avisa as mudanças | — |
| `avisos` | notificações no celular e no PC (Web Push), resumo diário por e-mail, avisos de tarefas | `RESEND_API_KEY`, `EMAIL_REMETENTE` |
| `resumir` | resumo da proposição pelo Claude, a partir do inteiro teor | `ANTHROPIC_API_KEY` |

As chaves das notificações (VAPID) são criadas sozinhas na primeira vez e ficam na tabela `config_servidor`, que só o servidor lê.
Cada pessoa liga as notificações em Configurações > Minha conta, em cada aparelho. No iPhone, só funciona com o app
adicionado à tela de início (iOS 16.4 ou mais novo). No programa do Windows, o app confere os avisos a cada 3 minutos
enquanto estiver aberto.

## Programa para Windows
A pasta `desktop/` gera o instalador do Panorama RelGov (veja `desktop/LEIAME.md`). O programa abre este app publicado, então
recebe as novidades sem reinstalar. A partir da versão 1.1.0, o próprio programa também se atualiza: procura versão nova
nas Releases do GitHub ao abrir, baixa em segundo plano e instala ao fechar (menu Ajuda > Procurar atualização do programa).

## Prévia dentro do Claude

`python3 ferramentas/montar-previa.py . app-panorama.html` gera uma página única em modo de demonstração.

## Ao mudar arquivos

Aumente `VERSAO` em `sw.js` para os celulares que já instalaram o app baixarem a versão nova.
