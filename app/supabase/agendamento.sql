-- Agenda a coleta de proposições para todo dia às 7h (horário de Brasília, 10h UTC).
-- Rode depois de publicar a função coletar-proposicoes e de rodar relgov.sql. Pode rodar de novo: o agendamento é refeito.
--
-- A função só aceita o agendamento com um segredo (a chave pública anon sozinha não basta). Este arquivo sorteia o segredo
-- e o guarda no Vault do Supabase ("coleta_segredo"); ninguém precisa ver nem copiar o valor, que nunca vai para o repositório.
-- O agendamento manda o segredo no cabeçalho x-coleta-segredo, e a função o confere lendo o Vault por segredo_coleta(),
-- que só a chave de serviço (a das funções) pode chamar. Para trocar o segredo: apague-o em Vault e rode este arquivo de novo.
-- A chave anon abaixo é a mesma chave pública que está em app/config.js (só serve para passar pela porta das funções).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'coleta_segredo',
  'Segredo do agendamento da coleta de proposições')
where not exists (select 1 from vault.secrets where name = 'coleta_segredo');

create or replace function public.segredo_coleta() returns text
language sql stable security definer set search_path = public as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'coleta_segredo'
$$;
revoke execute on function public.segredo_coleta() from public, anon, authenticated;
grant execute on function public.segredo_coleta() to service_role;


select cron.schedule(
  'coletar-proposicoes',
  '0 10 * * *',
  $$
  select net.http_post(
    url := 'https://crshelcvnyisecueknzd.supabase.co/functions/v1/coletar-proposicoes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyc2hlbGN2bnlpc2VjdWVrbnpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMDUwODUsImV4cCI6MjEwODc4MTA4NX0.sSrzefLVppDXdjayGk4b3Ooz6FzL2N2-nuI_CLVgVmw',
      'x-coleta-segredo', (select decrypted_secret from vault.decrypted_secrets where name = 'coleta_segredo')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 150000
  );
  $$
);
