-- Níveis de acesso e organizações. Rode uma vez no SQL Editor, depois de clientes.sql. Pode rodar de novo.
--
-- Master: dono do app, vê e configura todas as organizações.
-- Organização (Serafim, Panorama...): tem seus clientes, coordenadores e atendimentos.
-- Coordenador: vê todos os clientes da sua organização, cadastra atendimentos e libera clientes para eles.
-- Atendimento: vê só os clientes liberados para ele.

create table if not exists public.organizacoes (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  criado_em timestamptz not null default now()
);
insert into public.organizacoes (nome) values ('Serafim'), ('Panorama') on conflict (nome) do nothing;

alter table public.perfis add column if not exists papel text not null default 'atendimento';
alter table public.perfis drop constraint if exists perfis_papel_check;
alter table public.perfis add constraint perfis_papel_check check (papel in ('master', 'coordenador', 'atendimento'));
alter table public.perfis add column if not exists organizacao_id uuid references public.organizacoes (id) on delete set null;

-- Quem era administrador vira master; a coluna antiga sai
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'perfis' and column_name = 'admin') then
    update public.perfis set papel = 'master' where admin;
  end if;
end $$;

alter table public.clientes add column if not exists organizacao_id uuid references public.organizacoes (id) on delete cascade;
update public.clientes set organizacao_id = (select id from public.organizacoes where nome = 'Serafim') where organizacao_id is null;
alter table public.clientes alter column organizacao_id set not null;
-- O mesmo nome de cliente pode existir em organizações diferentes
alter table public.clientes drop constraint if exists clientes_nome_key;
create unique index if not exists clientes_org_nome on public.clientes (organizacao_id, nome);

-- ---------- quem pode o quê (security definer: consultam perfis sem esbarrar nas regras) ----------
create or replace function public.meu_papel() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select papel from public.perfis where user_id = auth.uid()), '')
$$;
create or replace function public.minha_org() returns uuid
language sql stable security definer set search_path = public as $$
  select organizacao_id from public.perfis where user_id = auth.uid()
$$;
create or replace function public.sou_master() returns boolean
language sql stable security definer set search_path = public as $$
  select public.meu_papel() = 'master'
$$;
-- Mantido para quem já usa: master ou coordenador
create or replace function public.sou_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select public.meu_papel() in ('master', 'coordenador')
$$;
create or replace function public.gere_org(org uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sou_master() or (public.meu_papel() = 'coordenador' and org = public.minha_org())
$$;
create or replace function public.gere_cliente(cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.sou_master() or exists (
    select 1 from public.clientes c where c.id = cliente and public.meu_papel() = 'coordenador' and c.organizacao_id = public.minha_org())
$$;
create or replace function public.pode_ver(cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.gere_cliente(cliente) or exists (select 1 from public.acessos where user_id = auth.uid() and cliente_id = cliente)
$$;
create or replace function public.org_de(pessoa uuid) returns uuid
language sql stable security definer set search_path = public as $$
  select organizacao_id from public.perfis where user_id = pessoa
$$;
grant execute on function public.meu_papel(), public.minha_org(), public.sou_master(), public.sou_admin(),
  public.gere_org(uuid), public.gere_cliente(uuid), public.pode_ver(uuid), public.org_de(uuid) to authenticated;

-- ---------- regras ----------
alter table public.organizacoes enable row level security;
drop policy if exists "Vê a própria organização; master vê todas" on public.organizacoes;
create policy "Vê a própria organização; master vê todas" on public.organizacoes for select to authenticated
  using (id = public.minha_org() or public.sou_master());
drop policy if exists "Master cuida das organizações" on public.organizacoes;
create policy "Master cuida das organizações" on public.organizacoes for all to authenticated
  using (public.sou_master()) with check (public.sou_master());

drop policy if exists "Cada um vê o próprio perfil; admin vê todos" on public.perfis;
drop policy if exists "Admin altera perfis" on public.perfis;
drop policy if exists "Vê o próprio perfil e os da organização" on public.perfis;
create policy "Vê o próprio perfil e os da organização" on public.perfis for select to authenticated
  using (user_id = auth.uid() or public.sou_master() or (public.meu_papel() = 'coordenador' and organizacao_id = public.minha_org()));
-- Nível e organização mudam pela função gerenciar-pessoas; direto na tabela, só o master
drop policy if exists "Master altera perfis" on public.perfis;
create policy "Master altera perfis" on public.perfis for update to authenticated
  using (public.sou_master()) with check (public.sou_master());

drop policy if exists "Vê os clientes liberados" on public.clientes;
create policy "Vê os clientes liberados" on public.clientes for select to authenticated using (public.pode_ver(id));
drop policy if exists "Admin cuida dos clientes" on public.clientes;
drop policy if exists "Coordenador cuida dos clientes da organização" on public.clientes;
create policy "Coordenador cuida dos clientes da organização" on public.clientes for all to authenticated
  using (public.gere_org(organizacao_id)) with check (public.gere_org(organizacao_id));

drop policy if exists "Vê os próprios acessos; admin vê todos" on public.acessos;
drop policy if exists "Vê os próprios acessos e os que gere" on public.acessos;
create policy "Vê os próprios acessos e os que gere" on public.acessos for select to authenticated
  using (user_id = auth.uid() or public.gere_cliente(cliente_id));
drop policy if exists "Admin cuida dos acessos" on public.acessos;
drop policy if exists "Coordenador libera clientes da organização" on public.acessos;
create policy "Coordenador libera clientes da organização" on public.acessos for all to authenticated
  using (public.gere_cliente(cliente_id))
  with check (public.gere_cliente(cliente_id) and (public.sou_master() or public.org_de(user_id) = public.minha_org()));

drop policy if exists "Admin cuida dos alertas" on public.alertas;
drop policy if exists "Coordenador cuida dos alertas" on public.alertas;
create policy "Coordenador cuida dos alertas" on public.alertas for all to authenticated
  using (public.gere_cliente(cliente_id)) with check (public.gere_cliente(cliente_id));

alter table public.perfis drop column if exists admin;
