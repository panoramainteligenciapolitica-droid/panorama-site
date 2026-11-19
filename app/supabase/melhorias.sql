-- Melhorias de novembro de 2026. Rode no SQL Editor depois de relgov.sql, agendamento.sql e contas-email.sql. Pode rodar de novo.
--
-- 1. Segurança: funções internas deixam de poder ser chamadas sem login
-- 2. Similaridade mínima e relatório mensal por cliente (no banco, iguais para toda a equipe)
-- 3. Tramitação automática das monitoradas (linha do tempo, relator, regime, situação)
-- 4. Central de avisos (no app, notificação no celular e no Windows, resumo diário por e-mail)
-- 5. Tarefas com responsável da equipe e prazos criados pela tramitação
-- 6. Recebidos por cliente, notas técnicas, resumo por IA
-- 7. Histórico de alterações (quem fez o quê)
-- 8. Agendamentos: tramitação às 7h20, avisos a cada 15 minutos, resumo diário às 8h (Brasília)

-- ---------- 1. segurança ----------
-- Mesma regra do relgov.sql: quem não tem login não executa nenhuma função do banco. Quem tem login fica só com as que
-- receberam permissão explícita (relgov.sql, contas-email.sql e as deste arquivo, mais abaixo). Nada é aberto aqui.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
  end loop;
end $$;
-- Funções criadas daqui para a frente também nascem fechadas para quem não tem login
alter default privileges in schema public revoke execute on functions from public, anon;

-- ---------- 2. preferências por cliente ----------
alter table public.clientes add column if not exists limiar int not null default 20;
alter table public.clientes drop constraint if exists clientes_limiar_check;
alter table public.clientes add constraint clientes_limiar_check check (limiar between 5 and 80);
-- Relatório mensal: no dia 1, o app prepara o rascunho do e-mail para esta lista (alguém revisa e envia)
alter table public.clientes add column if not exists relatorio_lista_id uuid references public.listas_email (id) on delete set null;

-- ---------- 3. tramitação ----------
alter table public.proposicoes add column if not exists id_casa text;             -- id na Câmara ou id do processo no Senado
alter table public.proposicoes add column if not exists regime text;
alter table public.proposicoes add column if not exists apreciacao text;
alter table public.proposicoes add column if not exists orgao_atual text;
alter table public.proposicoes add column if not exists relator text;
alter table public.proposicoes add column if not exists tramitando boolean;
alter table public.proposicoes add column if not exists ultima_tramitacao_em timestamptz;
alter table public.proposicoes add column if not exists tramitacao_conferida_em timestamptz;
alter table public.proposicoes add column if not exists resumo_ia text;
alter table public.proposicoes add column if not exists resumo_ia_em timestamptz;

-- Linha do tempo de cada proposição, comum a todos os clientes (dados públicos das Casas)
create table if not exists public.tramitacoes (
  id bigint generated always as identity primary key,
  ref text not null,                 -- 'CD:2270800' ou 'SF:8441243'
  quando timestamptz not null,
  orgao text,
  descricao text,
  despacho text,
  situacao text,
  url text,
  marca text not null,               -- impressão digital do passo, para não repetir
  criado_em timestamptz not null default now(),
  unique (ref, marca)
);
create index if not exists tramitacoes_ref_quando on public.tramitacoes (ref, quando desc);
create index if not exists proposicoes_casa_id_casa on public.proposicoes (casa, id_casa);
alter table public.tramitacoes enable row level security;
drop policy if exists "Equipe com login lê a tramitação" on public.tramitacoes;
-- Lê quem vê algum cliente que monitora aquela proposição (ref = Casa:id da proposição na Casa)
create policy "Equipe com login lê a tramitação" on public.tramitacoes for select to authenticated using (
  exists (select 1 from public.proposicoes p where p.id_casa is not null and p.casa || ':' || p.id_casa = tramitacoes.ref and public.pode_ver(p.cliente_id)));

-- ---------- 4. avisos ----------
create table if not exists public.avisos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid references public.clientes (id) on delete cascade,
  user_id uuid references auth.users (id) on delete cascade,   -- só para esta pessoa (ex.: tarefa dela); vazio = todos do cliente
  tipo text not null,          -- nova, tramitacao, pauta, relator, prazo, tarefa, relatorio, alerta
  titulo text not null,
  texto text,
  link text,                   -- rota dentro do app, como ?proposicao=<id>
  proposicao_id uuid references public.proposicoes (id) on delete cascade,
  criado_em timestamptz not null default now(),
  push_enviado boolean not null default false
);
create index if not exists avisos_cliente_data on public.avisos (cliente_id, criado_em desc);
create index if not exists avisos_push on public.avisos (push_enviado) where not push_enviado;
alter table public.avisos enable row level security;
drop policy if exists "Vê os avisos dos seus clientes" on public.avisos;
create policy "Vê os avisos dos seus clientes" on public.avisos for select to authenticated
  using ((cliente_id is null or public.pode_ver(cliente_id)) and (user_id is null or user_id = auth.uid()));

create table if not exists public.avisos_lidos (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  aviso_id uuid not null references public.avisos (id) on delete cascade,
  lido_em timestamptz not null default now(),
  primary key (user_id, aviso_id)
);
alter table public.avisos_lidos enable row level security;
drop policy if exists "Cada um marca os seus" on public.avisos_lidos;
create policy "Cada um marca os seus" on public.avisos_lidos for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Celulares e computadores que aceitaram notificações (Web Push)
create table if not exists public.push_inscricoes (
  endpoint text primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  p256dh text not null,
  auth text not null,
  aparelho text,
  criado_em timestamptz not null default now()
);
alter table public.push_inscricoes enable row level security;
drop policy if exists "Cada um cuida dos seus aparelhos" on public.push_inscricoes;
create policy "Cada um cuida dos seus aparelhos" on public.push_inscricoes for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Chaves do servidor (par VAPID das notificações): RLS ligado e nenhuma regra, só as funções do servidor leem
create table if not exists public.config_servidor (
  chave text primary key,
  valor text not null,
  criado_em timestamptz not null default now()
);
alter table public.config_servidor enable row level security;
revoke all on public.config_servidor from anon, authenticated;

-- Preferências de cada pessoa
alter table public.perfis add column if not exists aviso_email boolean not null default true;
alter table public.perfis add column if not exists aviso_push boolean not null default true;
alter table public.perfis add column if not exists resumo_enviado_em date;
create or replace function public.salvar_preferencias_aviso(email_diario boolean, notificacoes boolean) returns void
language sql security definer set search_path = public as $$
  update public.perfis set aviso_email = email_diario, aviso_push = notificacoes where user_id = auth.uid()
$$;
revoke execute on function public.salvar_preferencias_aviso(boolean, boolean) from public, anon;
grant execute on function public.salvar_preferencias_aviso(boolean, boolean) to authenticated;

-- ---------- 5. tarefas ----------
alter table public.tarefas add column if not exists responsavel_id uuid references auth.users (id) on delete set null;
alter table public.tarefas add column if not exists origem text;   -- ex.: 'emendas:CD:2270800:2026-11-20', criada pela tramitação
create unique index if not exists tarefas_cliente_origem on public.tarefas (cliente_id, origem) where origem is not null;

-- Pessoas que podem ser responsáveis pelas tarefas de um cliente (quem vê o cliente)
create or replace function public.equipe_do_cliente(cliente uuid)
returns table (user_id uuid, nome text, email text)
language sql stable security definer set search_path = public as $$
  select p.user_id, p.nome, p.email from public.perfis p
  join public.clientes c on c.id = cliente
  where public.pode_ver(cliente) and (
    p.papel = 'master'
    or (p.papel = 'coordenador' and p.organizacao_id = c.organizacao_id)
    or exists (select 1 from public.acessos a where a.user_id = p.user_id and a.cliente_id = cliente))
  order by coalesce(p.nome, p.email)
$$;
revoke execute on function public.equipe_do_cliente(uuid) from public, anon;
grant execute on function public.equipe_do_cliente(uuid) to authenticated;

-- ---------- 6. recebidos, notas técnicas ----------
alter table public.notas add column if not exists cliente_id uuid references public.clientes (id) on delete cascade;

create table if not exists public.notas_tecnicas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  proposicao_id uuid references public.proposicoes (id) on delete set null,
  titulo text not null,
  contexto text,
  analise text,
  impacto text,
  posicionamento text,
  proposta text,
  status text not null default 'rascunho' check (status in ('rascunho', 'revisao', 'aprovada', 'enviada')),
  autor uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists notas_tecnicas_cliente on public.notas_tecnicas (cliente_id, atualizado_em desc);
alter table public.notas_tecnicas enable row level security;
drop policy if exists "Cada cliente no seu banco: notas_tecnicas" on public.notas_tecnicas;
create policy "Cada cliente no seu banco: notas_tecnicas" on public.notas_tecnicas for all to authenticated
  using (public.pode_ver(cliente_id)) with check (public.pode_ver(cliente_id));

-- ---------- 7. histórico de alterações ----------
create table if not exists public.historico (
  id bigint generated always as identity primary key,
  quando timestamptz not null default now(),
  user_id uuid,
  quem text,
  cliente_id uuid,
  tabela text not null,
  acao text not null,           -- criou, alterou, apagou
  registro_id text,
  resumo text,
  dados jsonb
);
create index if not exists historico_cliente_quando on public.historico (cliente_id, quando desc);
create index if not exists historico_quando on public.historico (quando desc);
alter table public.historico enable row level security;
drop policy if exists "Master e coordenadores leem o histórico" on public.historico;
create policy "Master e coordenadores leem o histórico" on public.historico for select to authenticated
  using (public.sou_master() or (cliente_id is not null and public.gere_cliente(cliente_id)));

create or replace function public.registrar_historico() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  novo jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  velho jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  linha jsonb := coalesce(novo, velho);
  mudou jsonb;
  quem_nome text;
begin
  -- Mudanças feitas pelo servidor (coleta, tramitação) não entram: só as das pessoas
  if auth.uid() is null then return null; end if;
  if tg_op = 'UPDATE' then
    select jsonb_object_agg(k, novo -> k) into mudou from jsonb_object_keys(novo) k
      where k not in ('inteiro_teor', 'atualizado_em') and (novo -> k) is distinct from (velho -> k);
    if mudou is null then return null; end if;
  end if;
  select coalesce(nome, email) into quem_nome from public.perfis where user_id = auth.uid();
  insert into public.historico (user_id, quem, cliente_id, tabela, acao, registro_id, resumo, dados)
  values (auth.uid(), quem_nome,
    case when tg_table_name = 'clientes' then (linha ->> 'id')::uuid else (linha ->> 'cliente_id')::uuid end,
    tg_table_name,
    case tg_op when 'INSERT' then 'criou' when 'UPDATE' then 'alterou' else 'apagou' end,
    linha ->> 'id',
    left(coalesce(linha ->> 'titulo', linha ->> 'assunto', linha ->> 'nome', linha ->> 'termo',
      nullif(concat_ws(' ', linha ->> 'sigla', (linha ->> 'numero') || '/' || (linha ->> 'ano')), '')), 200),
    case when tg_op = 'UPDATE' then mudou when tg_op = 'DELETE' then velho - 'inteiro_teor' else null end);
  return null;
end $$;
revoke execute on function public.registrar_historico() from public, anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array['proposicoes', 'palavras', 'especialidades', 'contatos', 'interacoes', 'tarefas', 'mapa_parlamentares',
    'listas_email', 'campanhas_email', 'alertas', 'notas_tecnicas', 'clientes'] loop
    execute format('drop trigger if exists historico_%1$s on public.%1$I', t);
    execute format('create trigger historico_%1$s after insert or update or delete on public.%1$I for each row execute function public.registrar_historico()', t);
  end loop;
end $$;

-- ---------- 8. agendamentos ----------
-- Mesma chave pública (anon) e mesmo segredo do Vault de agendamento.sql: as funções só aceitam o agendamento com o
-- cabeçalho x-coleta-segredo. Rode depois de agendamento.sql e de publicar as funções novas.
do $$
declare
  chave text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyc2hlbGN2bnlpc2VjdWVrbnpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMDUwODUsImV4cCI6MjEwODc4MTA4NX0.sSrzefLVppDXdjayGk4b3Ooz6FzL2N2-nuI_CLVgVmw';
  base text := 'https://crshelcvnyisecueknzd.supabase.co/functions/v1/';
  j record;
begin
  for j in select * from (values
    ('acompanhar-tramitacao', '20 10 * * *', 'acompanhar-tramitacao', '{}'),
    ('avisos-notificar', '*/15 * * * *', 'avisos', '{"acao": "notificar"}'),
    ('avisos-resumo', '0 11 * * *', 'avisos', '{"acao": "resumo"}')
  ) as x(nome, quando, funcao, corpo) loop
    if exists (select 1 from cron.job where jobname = j.nome) then perform cron.unschedule(j.nome); end if;
    perform cron.schedule(j.nome, j.quando, format(
      $f$select net.http_post(url := %L, headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', %L,
        'x-coleta-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'coleta_segredo')), body := %L::jsonb, timeout_milliseconds := 150000)$f$,
      base || j.funcao, 'Bearer ' || chave, j.corpo));
  end loop;
end $$;

-- As funções do servidor (chave de serviço) continuam podendo chamar tudo
grant execute on all functions in schema public to service_role;
