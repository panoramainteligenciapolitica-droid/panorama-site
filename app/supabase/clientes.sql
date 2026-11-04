-- Clientes com bancos independentes e acesso por pessoa.
-- Rode uma vez no SQL Editor, depois de esquema.sql. Pode rodar de novo: o que já existe é mantido.
--
-- Cada cliente (Magistratura, ATRICON...) tem suas próprias especialidades, palavras-chave,
-- proposições monitoradas e novas. Um administrador vê todos os clientes e decide quem acessa cada um;
-- as demais pessoas veem só os clientes liberados para elas. A aba Geral (entradas) continua comum.

-- ---------- pessoas ----------
create table if not exists public.perfis (
  user_id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nome text,
  admin boolean not null default false,
  criado_em timestamptz not null default now()
);

-- Cada usuário novo do Supabase ganha um perfil (sem ser administrador)
create or replace function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (user_id, email) values (new.id, new.email) on conflict (user_id) do nothing;
  return new;
end $$;
drop trigger if exists criar_perfil on auth.users;
create trigger criar_perfil after insert on auth.users for each row execute function public.criar_perfil();

-- Quem já existe vira perfil; enquanto ninguém for administrador, os que já existem viram administradores
insert into public.perfis (user_id, email) select id, email from auth.users on conflict (user_id) do nothing;
update public.perfis set admin = true where not exists (select 1 from public.perfis where admin);

-- ---------- clientes e acessos ----------
create table if not exists public.clientes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz not null default now()
);
insert into public.clientes (nome)
  values ('Magistratura'), ('Ministério Público'), ('ATRICON'), ('ANEC'), ('ABIMP')
  on conflict (nome) do nothing;

create table if not exists public.acessos (
  user_id uuid not null references public.perfis (user_id) on delete cascade,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  primary key (user_id, cliente_id)
);

-- security definer: as regras abaixo consultam perfis e acessos sem esbarrar nas regras dessas tabelas
create or replace function public.sou_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select admin from public.perfis where user_id = auth.uid()), false)
$$;
create or replace function public.pode_ver(cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sou_admin() or exists (select 1 from public.acessos where user_id = auth.uid() and cliente_id = cliente)
$$;
grant execute on function public.sou_admin() to authenticated;
grant execute on function public.pode_ver(uuid) to authenticated;

alter table public.perfis enable row level security;
drop policy if exists "Cada um vê o próprio perfil; admin vê todos" on public.perfis;
create policy "Cada um vê o próprio perfil; admin vê todos" on public.perfis for select to authenticated
  using (user_id = auth.uid() or public.sou_admin());
drop policy if exists "Admin altera perfis" on public.perfis;
create policy "Admin altera perfis" on public.perfis for update to authenticated
  using (public.sou_admin()) with check (public.sou_admin());

alter table public.clientes enable row level security;
drop policy if exists "Vê os clientes liberados" on public.clientes;
create policy "Vê os clientes liberados" on public.clientes for select to authenticated using (public.pode_ver(id));
drop policy if exists "Admin cuida dos clientes" on public.clientes;
create policy "Admin cuida dos clientes" on public.clientes for all to authenticated
  using (public.sou_admin()) with check (public.sou_admin());

alter table public.acessos enable row level security;
drop policy if exists "Vê os próprios acessos; admin vê todos" on public.acessos;
create policy "Vê os próprios acessos; admin vê todos" on public.acessos for select to authenticated
  using (user_id = auth.uid() or public.sou_admin());
drop policy if exists "Admin cuida dos acessos" on public.acessos;
create policy "Admin cuida dos acessos" on public.acessos for all to authenticated
  using (public.sou_admin()) with check (public.sou_admin());

-- ---------- banco de cada cliente ----------
do $$
declare t text;
begin
  foreach t in array array['especialidades', 'palavras', 'proposicoes', 'candidatas'] loop
    execute format('alter table public.%I add column if not exists cliente_id uuid references public.clientes (id) on delete cascade', t);
  end loop;
end $$;

-- Linhas antigas sem cliente: as coletadas são refeitas pela coleta; o resto vai para o primeiro cliente
delete from public.candidatas where cliente_id is null;
update public.especialidades set cliente_id = (select id from public.clientes order by criado_em, nome limit 1) where cliente_id is null;
update public.palavras set cliente_id = (select id from public.clientes order by criado_em, nome limit 1) where cliente_id is null;
update public.proposicoes set cliente_id = (select id from public.clientes order by criado_em, nome limit 1) where cliente_id is null;

alter table public.especialidades alter column cliente_id set not null;
alter table public.palavras alter column cliente_id set not null;
alter table public.proposicoes alter column cliente_id set not null;
alter table public.candidatas alter column cliente_id set not null;

-- O que era único no banco todo passa a ser único dentro de cada cliente
alter table public.especialidades drop constraint if exists especialidades_nome_key;
alter table public.palavras drop constraint if exists palavras_termo_key;
alter table public.proposicoes drop constraint if exists proposicoes_casa_sigla_numero_ano_key;
alter table public.candidatas drop constraint if exists candidatas_id_externo_key;
create unique index if not exists especialidades_cliente_nome on public.especialidades (cliente_id, nome);
create unique index if not exists palavras_cliente_termo on public.palavras (cliente_id, termo);
create unique index if not exists proposicoes_cliente_ident on public.proposicoes (cliente_id, casa, sigla, numero, ano);
create unique index if not exists candidatas_cliente_externo on public.candidatas (cliente_id, id_externo);
create index if not exists candidatas_cliente_status on public.candidatas (cliente_id, status, coletado_em desc);

do $$
declare t text;
begin
  foreach t in array array['especialidades', 'palavras', 'proposicoes', 'candidatas'] loop
    execute format('drop policy if exists "Equipe com login usa %1$s" on public.%1$I', t);
    execute format('drop policy if exists "Cada cliente no seu banco: %1$s" on public.%1$I', t);
    execute format('create policy "Cada cliente no seu banco: %1$s" on public.%1$I for all to authenticated using (public.pode_ver(cliente_id)) with check (public.pode_ver(cliente_id))', t);
  end loop;
end $$;

-- ---------- alertas por cliente ----------
-- A equipe publica pelo Table Editor escolhendo o cliente (coluna cliente_id); cada pessoa vê os dos seus clientes
alter table public.alertas add column if not exists cliente_id uuid references public.clientes (id) on delete cascade;
create index if not exists alertas_cliente_data on public.alertas (cliente_id, publicado_em desc);
drop policy if exists "Clientes com login leem os alertas" on public.alertas;
drop policy if exists "Vê os alertas dos seus clientes" on public.alertas;
create policy "Vê os alertas dos seus clientes" on public.alertas for select to authenticated using (public.pode_ver(cliente_id));
drop policy if exists "Admin cuida dos alertas" on public.alertas;
create policy "Admin cuida dos alertas" on public.alertas for all to authenticated
  using (public.sou_admin()) with check (public.sou_admin());

-- Cada pessoa troca o próprio nome (o papel de administrador só um administrador muda)
create or replace function public.salvar_meu_nome(novo text) returns void
language sql security definer set search_path = public as $$
  update public.perfis set nome = nullif(trim(novo), '') where user_id = auth.uid()
$$;
grant execute on function public.salvar_meu_nome(text) to authenticated;
