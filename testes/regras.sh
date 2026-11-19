#!/bin/bash
# Testa as regras de acesso do banco (RLS) num Postgres local que imita o Supabase.
# Precisa de um Postgres vazio: PGHOST/PGPORT/PGUSER apontando para ele (o usuário precisa poder criar bancos).
# Uso: testes/regras.sh        Sai com erro se algum caso falhar.
set -u
D=$(cd "$(dirname "$0")/../app/supabase" && pwd); T=$(cd "$(dirname "$0")" && pwd)
BANCO=panorama_teste_$$
psql -qX -d postgres -c "create database $BANCO" >/dev/null || exit 2
trap 'psql -qX -d postgres -c "drop database if exists $BANCO" >/dev/null' EXIT
P="psql -qX -v ON_ERROR_STOP=1 -d $BANCO"
falhas=0
ok()    { echo "ok    $1"; }
falha() { echo "FALHA $1"; falhas=$((falhas + 1)); }
espera() { if [ "$2" = "$3" ]; then ok "$1"; else falha "$1 (veio: $2; esperado: $3)"; fi; }
rodar() { $P -f "$D/$1" >/dev/null 2>/tmp/erro_sql_$$ && return 0; cat /tmp/erro_sql_$$ | grep -v NOTICE | head -3; return 1; }
como() { $P -Atc "set role $1; set request.jwt.claim.sub='$2'; $3" 2>&1 | grep -v '^SET$' | head -1; }
A=00000000-0000-0000-0000-00000000000a; B=00000000-0000-0000-0000-00000000000b; C=00000000-0000-0000-0000-00000000000c
L=11111111-1111-1111-1111-111111111111

$P -f "$T/supabase-local.sql" >/dev/null 2>&1 || { echo "não consegui preparar o banco"; exit 2; }
$P -f "$T/agenda-local.sql" >/dev/null 2>&1 || { echo "não consegui imitar cron e Vault"; exit 2; }
for f in esquema.sql clientes.sql niveis.sql relgov.sql contas-email.sql melhorias.sql; do rodar $f && ok "instala $f" || falha "instala $f"; done

$P >/dev/null <<SQL
insert into auth.users (id, email) values ('$A', 'a@x.com'), ('$B', 'b@x.com'), ('$C', 'c@x.com');
update perfis set papel = 'atendimento', organizacao_id = (select id from organizacoes where nome = 'Serafim');
update perfis set papel = 'coordenador' where user_id = '$C';
insert into acessos values ('$A', (select id from clientes where nome = 'ATRICON')), ('$B', (select id from clientes where nome = 'ANEC'));
insert into contatos (cliente_id, nome) values ((select id from clientes where nome = 'ANEC'), 'Contato da ANEC');
insert into proposicoes (cliente_id, casa, sigla, numero, ano, ementa, id_casa) values ((select id from clientes where nome = 'ANEC'), 'CD', 'PL', '1', '2026', 'x', '999');
insert into tramitacoes (ref, quando, descricao, marca) values ('CD:999', now(), 'Apresentação', 'seq:1');
insert into avisos (cliente_id, tipo, titulo) values ((select id from clientes where nome = 'ANEC'), 'tramitacao', 'Aviso da ANEC');
insert into config_servidor (chave, valor) values ('teste', 'x') on conflict do nothing;
insert into listas_email (id, cliente_id, nome) values ('$L', (select id from clientes where nome = 'ANEC'), 'Lista ANEC');
insert into descadastros (cliente_id, email) values ((select id from clientes where nome = 'ANEC'), 'saiu@x.com');
insert into campanhas_email (cliente_id, assunto, corpo, status) values ((select id from clientes where nome = 'ANEC'), 'Enviada', 'x', 'enviada');
SQL
ATRICON=$($P -Atc "select id from clientes where nome = 'ATRICON'"); ANEC=$($P -Atc "select id from clientes where nome = 'ANEC'")

verificar() {
  local fase=$1
  espera "[$fase] atendimento da ATRICON não vê contatos da ANEC" "$(como authenticated $A 'select count(*) from contatos')" 0
  espera "[$fase] atendimento da ATRICON não vê proposições da ANEC" "$(como authenticated $A 'select count(*) from proposicoes')" 0
  espera "[$fase] atendimento da ANEC vê os próprios contatos" "$(como authenticated $B 'select count(*) from contatos')" 1
  espera "[$fase] nenhuma regra aberta (using true) além de entradas" "$($P -Atc "select count(*) from pg_policies where qual = 'true' and tablename <> 'entradas'")" 0
  r=$(como authenticated $A "insert into lista_membros (lista_id, cliente_id, email) values ('$L', '$ATRICON', 'intruso@x.com') returning 'gravou'")
  [ "$r" != "gravou" ] && ok "[$fase] não grava na lista de outro cliente" || falha "[$fase] gravou e-mail na lista de outro cliente"
  r=$(como authenticated $A "insert into campanhas_email (cliente_id, lista_id, assunto, corpo) values ('$ATRICON', '$L', 'x', 'x') returning 'gravou'")
  [ "$r" != "gravou" ] && ok "[$fase] campanha não usa lista de outro cliente" || falha "[$fase] campanha aceitou lista de outro cliente"
  r=$(como authenticated $B "insert into lista_membros (lista_id, cliente_id, email) values ('$L', '$ANEC', 'novo-$fase@x.com') returning 'gravou'")
  espera "[$fase] grava na lista do próprio cliente" "$r" "gravou"
  r=$(como authenticated $B "insert into interacoes (cliente_id, assunto, contato_id) select '$ANEC', 'Reunião', id from contatos limit 1 returning 'gravou'")
  espera "[$fase] registra reunião com contato do próprio cliente" "$r" "gravou"
  espera "[$fase] atendimento não vira master mudando o próprio perfil" "$(como authenticated $A "update perfis set papel = 'master' where user_id = auth.uid() returning 'mudou'")" ""
  espera "[$fase] coordenador não vira master mudando o próprio perfil" "$(como authenticated $C "update perfis set papel = 'master' where user_id = auth.uid() returning 'mudou'")" ""
  espera "[$fase] atendimento não apaga descadastros" "$(como authenticated $B "delete from descadastros returning 'apagou'")" ""
  espera "[$fase] campanha enviada não pode ser apagada" "$(como authenticated $C "delete from campanhas_email where status = 'enviada' returning 'apagou'")" ""
  r=$(como authenticated $C "insert into alertas (cliente_id, titulo, link) values ('$ANEC', 'x', 'javascript:alert(1)') returning 'gravou'")
  [ "$r" != "gravou" ] && ok "[$fase] alerta não aceita link javascript:" || falha "[$fase] alerta aceitou link javascript:"
  espera "[$fase] atendimento da ATRICON não vê a tramitação de proposição só da ANEC" "$(como authenticated $A 'select count(*) from tramitacoes')" 0
  espera "[$fase] atendimento da ANEC vê a tramitação da própria proposição" "$(como authenticated $B 'select count(*) from tramitacoes')" 1
  espera "[$fase] atendimento da ATRICON não vê avisos da ANEC" "$(como authenticated $A 'select count(*) from avisos')" 0
  espera "[$fase] atendimento da ANEC vê os avisos do próprio cliente" "$(como authenticated $B 'select count(*) from avisos')" 1
  como authenticated $C 'select count(*) from config_servidor' | grep -qi "permission denied" && ok "[$fase] ninguém do app lê as chaves do servidor" || falha "[$fase] app leu config_servidor"
  r=$(como authenticated $A "select count(*) from public.equipe_do_cliente('$ANEC')")
  espera "[$fase] não lista a equipe de cliente que não vê" "$r" 0
  r=$(como authenticated $A "select public.segredo_coleta()")
  echo "$r" | grep -qi "permission denied" && ok "[$fase] app não lê o segredo do agendamento" || falha "[$fase] app leu o segredo do agendamento ($r)"
  espera "[$fase] sem login não lê nada" "$(como anon '' 'select count(*) from contatos')" 0
  r=$(como anon '' "select public.definir_envio_email('$A', true)")
  echo "$r" | grep -qi "permission denied" && ok "[$fase] sem login não chama funções do banco" || falha "[$fase] sem login chamou função do banco ($r)"
}
verificar "1ª instalação"

# O LEIAME manda rodar os arquivos de novo depois de atualizações: as regras têm de continuar fechadas
for f in esquema.sql clientes.sql niveis.sql relgov.sql contas-email.sql melhorias.sql esquema.sql; do rodar $f && ok "roda $f de novo" || falha "roda $f de novo"; done
verificar "depois de rodar tudo de novo"

echo; echo "falhas: $falhas"; exit $(( falhas > 0 ))
