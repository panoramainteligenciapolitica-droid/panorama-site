# Testes

Rodam sozinhos no GitHub a cada pull request (Actions > Testes). Para rodar à mão:

| O que testa | Comando | Precisa de |
|---|---|---|
| Regras de acesso do banco (inclusive contas-email.sql e melhorias.sql: avisos, tramitação, chaves do servidor): um cliente não vê nem grava no outro, ninguém vira master sozinho, descadastro não se apaga, rodar os .sql de novo não abre nada | `testes/regras.sh` | Postgres vazio (`PGHOST`, `PGUSER`...) |
| Sintaxe dos scripts, ids do HTML, lista offline, instalador, CSP, nada de `innerHTML` nem chave de serviço no navegador | `python3 testes/estaticos.py` | Node |
| Sintaxe das funções do Supabase | `node testes/sintaxe-funcoes.js app/supabase/functions/*/index.ts` | pacote `typescript` |
| Uso "errado" do app: clique duplo em Apagar, e-mail repetido, campo vazio, prévia, link `javascript:` | `node testes/app-demo.js` | Playwright |

`supabase-local.sql` imita o mínimo do Supabase (papéis `anon` e `authenticated`, `auth.uid()`) e `agenda-local.sql` imita pg_cron e o Vault, para as regras rodarem num Postgres comum.
Ele não testa as funções (Edge Functions) rodando: elas precisam de verificação no projeto do Supabase depois de publicadas.
