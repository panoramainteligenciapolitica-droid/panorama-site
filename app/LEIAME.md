# App Panorama (área do cliente)

App instalável em `panoramaip.com.br/app`, publicado pelo GitHub Pages junto com o site. Não tem build: os arquivos desta pasta são servidos como estão.

- Login por código enviado ao e-mail, só para clientes cadastrados.
- Lista de alertas, cada um com link próprio (`/app/?alerta=<id>`) e botão para compartilhar em outros apps.
- No Android, o app instalado aparece no menu Compartilhar de outros apps; o que chega fica em "Recebidos".
- Funciona sem internet depois da primeira visita (a casca do app fica guardada; os dados precisam de rede).

Sem o Supabase configurado, o app abre em modo de demonstração com dados de exemplo.

## Ligar o Supabase (uma vez)

1. Em [supabase.com](https://supabase.com), crie um projeto.
2. SQL Editor: cole e rode o arquivo `supabase/esquema.sql`.
3. Authentication > Sign In / Providers: deixe o Email ligado e desligue "Allow new users to sign up", para que só clientes convidados entrem.
4. Authentication > URL Configuration: Site URL `https://panoramaip.com.br/app/`.
5. Authentication > Emails > Magic Link: inclua o código no texto, por exemplo `Seu código de acesso: {{ .Token }}`. No iPhone, o app instalado precisa do código, porque o link do e-mail abre no Safari.
6. Project Settings > API: copie a Project URL e a chave anon public para `config.js`.
7. Para liberar um cliente: Authentication > Users > Invite user (ou Add user).
8. Para publicar um alerta: Table Editor > alertas > Insert row.

## Ao mudar arquivos

Aumente `VERSAO` em `sw.js` para os celulares que já instalaram o app baixarem a versão nova.
