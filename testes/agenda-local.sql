-- Imita o mínimo de pg_cron, pg_net e Vault do Supabase, para melhorias.sql rodar num Postgres comum (testes/regras.sh).
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text);
create or replace function cron.schedule(nome text, quando text, comando text) returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (nome, quando, comando)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command returning jobid $$;
create or replace function cron.unschedule(nome text) returns boolean language sql as $$
  delete from cron.job where jobname = nome returning true $$;
create schema if not exists vault;
create table if not exists vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets values ('coleta_segredo', 'segredo-de-teste-com-mais-de-16') on conflict do nothing;
-- Mesma função de agendamento.sql (a coleta e as funções novas leem o segredo por ela; só a chave de serviço pode)
create or replace function public.segredo_coleta() returns text
language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'coleta_segredo'
$$;
revoke execute on function public.segredo_coleta() from public, anon, authenticated;
