-- Banco do app Panorama. Rode no Supabase: SQL Editor > New query > cole tudo > Run.
-- Pode rodar de novo depois de mudanças: o que já existe é mantido.
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
drop policy if exists "Clientes com login leem os alertas" on public.alertas;
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
drop policy if exists "Cada cliente lê as próprias notas" on public.notas;
create policy "Cada cliente lê as próprias notas"
  on public.notas for select to authenticated using (user_id = auth.uid());
drop policy if exists "Cada cliente cria as próprias notas" on public.notas;
create policy "Cada cliente cria as próprias notas"
  on public.notas for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "Cada cliente apaga as próprias notas" on public.notas;
create policy "Cada cliente apaga as próprias notas"
  on public.notas for delete to authenticated using (user_id = auth.uid());

-- ---------- Monitoramento de proposições (uso interno da equipe) ----------
-- Por enquanto, todo usuário com login lê e edita. Se clientes também entrarem no app,
-- estas regras precisam separar equipe e clientes.

create table if not exists public.especialidades (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz not null default now()
);

create table if not exists public.palavras (
  id uuid primary key default gen_random_uuid(),
  termo text not null unique,
  especialidade_id uuid references public.especialidades (id) on delete set null,
  criado_em timestamptz not null default now()
);

create table if not exists public.proposicoes (
  id uuid primary key default gen_random_uuid(),
  casa text not null check (casa in ('CD', 'SF')),
  sigla text not null,
  numero text not null,
  ano text not null,
  ementa text not null,
  autor text,
  data_apresentacao date,
  situacao text,
  url text,
  id_externo text,
  tema_casa text,
  especialidade_id uuid references public.especialidades (id) on delete set null,
  origem_especialidade text check (origem_especialidade in ('app', 'casa', 'manual')),
  prioridade text not null default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  posicionamento text not null default 'analise' check (posicionamento in ('analise', 'favoravel', 'contrario', 'acompanhar')),
  proximo_passo text,
  notas text,
  criado_por uuid default auth.uid() references auth.users (id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (casa, sigla, numero, ano)
);

-- O que a coleta diária trouxe e ainda não foi revisado
create table if not exists public.candidatas (
  id uuid primary key default gen_random_uuid(),
  id_externo text not null unique,
  casa text not null check (casa in ('CD', 'SF')),
  sigla text not null,
  numero text not null,
  ano text not null,
  ementa text not null default '',
  autor text,
  data_apresentacao date,
  situacao text,
  url text,
  tema_casa text,
  status text not null default 'nova' check (status in ('nova', 'descartada', 'monitorada')),
  coletado_em timestamptz not null default now()
);
create index if not exists candidatas_status_idx on public.candidatas (status, coletado_em desc);

do $$
declare t text;
begin
  foreach t in array array['especialidades', 'palavras', 'proposicoes', 'candidatas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Equipe com login usa %1$s" on public.%1$I', t);
    execute format('create policy "Equipe com login usa %1$s" on public.%1$I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;

-- Inteiro teor: link do PDF na Casa e o texto extraído (guardado na primeira leitura)
alter table public.proposicoes add column if not exists url_inteiro_teor text;
alter table public.proposicoes add column if not exists inteiro_teor text;
alter table public.candidatas add column if not exists url_inteiro_teor text;
alter table public.candidatas add column if not exists inteiro_teor text;

-- Aba Geral: uma linha por proposição apresentada (tudo o que a coleta diária trouxe), para contar por tipo e período
create table if not exists public.entradas (
  id_externo text primary key,
  casa text not null check (casa in ('CD', 'SF')),
  sigla text not null,
  data_apresentacao date not null,
  coletado_em timestamptz not null default now()
);
create index if not exists entradas_data_idx on public.entradas (data_apresentacao);
alter table public.entradas enable row level security;
drop policy if exists "Equipe com login lê entradas" on public.entradas;
create policy "Equipe com login lê entradas" on public.entradas for select to authenticated using (true);

create or replace function public.contar_entradas(inicio date, fim date)
returns table (casa text, sigla text, total bigint)
language sql stable security invoker set search_path = public as $$
  select e.casa, e.sigla, count(*) from public.entradas e
  where e.data_apresentacao between inicio and fim
  group by e.casa, e.sigla
$$;
grant execute on function public.contar_entradas(date, date) to authenticated;
