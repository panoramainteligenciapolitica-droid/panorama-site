-- Agenda a coleta de proposições para todo dia às 7h (horário de Brasília, 10h UTC).
-- Rode depois de publicar a função coletar-proposicoes.
-- Antes, ligue as extensões pg_cron e pg_net em Database > Extensions.
-- A chave abaixo é a mesma chave pública (anon) que está em app/config.js.

select cron.schedule(
  'coletar-proposicoes',
  '0 10 * * *',
  $$
  select net.http_post(
    url := 'https://crshelcvnyisecueknzd.supabase.co/functions/v1/coletar-proposicoes',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNyc2hlbGN2bnlpc2VjdWVrbnpkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyMDUwODUsImV4cCI6MjEwODc4MTA4NX0.sSrzefLVppDXdjayGk4b3Ooz6FzL2N2-nuI_CLVgVmw'
    ),
    body := '{}'::jsonb
  );
  $$
);
