-- Banco do app Panorama. Rode uma vez no Supabase: SQL Editor > New query > cole tudo > Run.
-- As regras (row level security) é que protegem os dados: sem login, nada é lido.

-- Alertas publicados pela Panorama. A equipe cadastra pelo Table Editor do Supabase.
create table if not exists public.alertas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  resumo text,
  conteudo text,
  tema text,
  link text,
  publicado_em timestamptz not null default now()
);
alter table public.alertas enable row level security;
create policy "Clientes com login leem os alertas"
  on public.alertas for select to authenticated using (true);

-- O que cada cliente recebe de outros apps pelo menu Compartilhar. Cada um vê só o que é seu.
create table if not exists public.notas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  titulo text,
  texto text,
  link text,
  criado_em timestamptz not null default now()
);
alter table public.notas enable row level security;
create policy "Cada cliente lê as próprias notas"
  on public.notas for select to authenticated using (user_id = auth.uid());
create policy "Cada cliente cria as próprias notas"
  on public.notas for insert to authenticated with check (user_id = auth.uid());
create policy "Cada cliente apaga as próprias notas"
  on public.notas for delete to authenticated using (user_id = auth.uid());
