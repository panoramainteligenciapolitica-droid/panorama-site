# Regras para programar neste repositório

1. **Comece pelo `CODEMAP.md`.** Ele diz onde está cada parte (arquivos, seções, painéis, tabelas, funções). Abra só os
   arquivos que o mapa indicar e, em arquivos grandes, busque a âncora (`grep -n nome arquivo`) e leia só o trecho.
2. **Toda mudança atualiza o mapa no mesmo commit**: arquivo novo, removido ou renomeado; seção do site, painel ou tela
   do app; tabela ou função SQL; Edge Function; módulo JS; mudança no fluxo de publicação. Mantenha o mapa curto: uma linha
   por coisa, sem números de linha.
3. **Antes de commitar, rode `python3 testes/mapa.py`.** Ele aponta o que ficou fora do mapa ou o que o mapa cita e não
   existe mais. O CI (`.github/workflows/testes.yml`) roda o mesmo teste em todo PR.
4. Mudou arquivo do app? Aumente `VERSAO` em `app/sw.js`. Módulo novo do app entra em `app/index.html`, `app/sw.js` e
   `ferramentas/montar-previa.py`.
5. Nada em produção (SQL no Supabase, deploy de funções, segredos, merge) sem aprovação explícita do Nando.
6. Textos do site: até cerca de 3 linhas, centralizados; mais longos, justificados; nunca alinhados à esquerda.

## Banca de revisão

A banca (revisores + auditoria de segurança) lê o `CODEMAP.md` primeiro e usa as tabelas dele para escolher o que abrir:
segurança do banco em `app/supabase/*.sql` e nas Edge Functions, telas pelo painel do app, site pelas âncoras de
`index.html`. Ao fim de cada rodada, confira que `python3 testes/mapa.py` passa.
