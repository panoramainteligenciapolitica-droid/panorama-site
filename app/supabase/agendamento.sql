-- Agenda a coleta de proposições para todo dia às 7h (horário de Brasília, 10h UTC).
-- Rode depois de publicar a função coletar-proposicoes. Pode rodar de novo: o agendamento é refeito.
--
-- A função só aceita o agendamento com um segredo (a chave pública anon sozinha não basta). Uma vez:
--   1. Gere um valor longo e aleatório (por exemplo, uma senha de 40 caracteres de um gerenciador de senhas).
--   2. Edge Functions > Secrets: crie COLETA_SEGREDO com esse valor.
--   3. SQL Editor: select vault.create_secret('<o mesmo valor>', 'coleta_segredo');
--      (para trocar depois: select vault.update_secret((select id from vault.secrets where name = 'coleta_segredo'), '<novo>');)
-- O valor fica no Vault do Supabase, nunca neste arquivo nem no repositório.
-- A chave anon abaixo é a mesma chave pública que está em app/config.js (só serve para passar pela porta das funções).
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'coletar-proposicoes';

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
