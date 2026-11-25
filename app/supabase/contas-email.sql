-- Contas de e-mail próprias (Gmail ou Outlook): cada pessoa da equipe conecta a sua conta e os envios do app
-- (e-mails em massa e testes) saem por ela, em vez do Resend. Rode no SQL Editor depois de relgov.sql.
-- Pode rodar de novo: o que já existe é mantido.
--
-- Segurança: os tokens ficam só aqui e só as funções do servidor (chave de serviço) leem esta tabela.
-- O app enxerga apenas o provedor e o endereço conectado, pela função minha_conta_email().

create table if not exists public.contas_email (
  user_id uuid primary key references auth.users (id) on delete cascade,
  provedor text not null check (provedor in ('google', 'microsoft')),
  email text not null,
  nome text,
  refresh_token text not null,
  access_token text,
  expira_em timestamptz,
  conectado_em timestamptz not null default now(),
  usado_em timestamptz
);

-- RLS ligado e nenhuma regra para usuários: ninguém lê nem grava pelo app, só o servidor.
alter table public.contas_email enable row level security;
revoke all on public.contas_email from anon, authenticated;

-- O que o app pode saber da própria conta (sem tokens)
create or replace function public.minha_conta_email()
returns table (provedor text, email text, nome text, conectado_em timestamptz, usado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select provedor, email, nome, conectado_em, usado_em from public.contas_email where user_id = auth.uid()
$$;
grant execute on function public.minha_conta_email() to authenticated;

create or replace function public.desconectar_conta_email() returns void
language sql security definer set search_path = public as $$
  delete from public.contas_email where user_id = auth.uid()
$$;
grant execute on function public.desconectar_conta_email() to authenticated;

-- Registro de por onde cada campanha saiu (ex.: "fulano@gmail.com (Gmail)" ou "Resend")
alter table public.campanhas_email add column if not exists enviado_por text;
