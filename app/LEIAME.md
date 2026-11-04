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

## Prévia dentro do Claude

`python3 ferramentas/montar-previa.py . app-panorama.html` gera uma página única em modo de demonstração.

## Ao mudar arquivos

Aumente `VERSAO` em `sw.js` para os celulares que já instalaram o app baixarem a versão nova.
