-- Funções de relações governamentais: mapa de parlamentares, contatos, reuniões, tarefas e envio de e-mails.
-- Rode no SQL Editor depois de esquema.sql, clientes.sql e niveis.sql. Pode rodar de novo: o que já existe é mantido.
-- Tudo é por cliente: cada pessoa vê só o que é dos clientes liberados para ela (pode_ver, de niveis.sql).

-- ---------- permissão de envio de e-mail por pessoa ----------
-- Master e coordenador sempre enviam; atendimento só quando o coordenador ou o master liberam.
alter table public.perfis add column if not exists pode_enviar_email boolean not null default false;

create or replace function public.pode_enviar(cliente uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.pode_ver(cliente) and (
    public.meu_papel() in ('master', 'coordenador')
    or coalesce((select pode_enviar_email from public.perfis where user_id = auth.uid()), false))
$$;
grant execute on function public.pode_enviar(uuid) to authenticated;

create or replace function public.definir_envio_email(pessoa uuid, valor boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not (public.sou_master() or (public.meu_papel() = 'coordenador' and public.org_de(pessoa) = public.minha_org())) then
    raise exception 'Sem permissão para mudar esta pessoa';
  end if;
  update public.perfis set pode_enviar_email = valor where user_id = pessoa;
end $$;
grant execute on function public.definir_envio_email(uuid, boolean) to authenticated;

-- ---------- mapa de parlamentares (stakeholders) ----------
create table if not exists public.mapa_parlamentares (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  casa text not null check (casa in ('CD', 'SF')),
  parlamentar_id text not null,
  nome text not null,
  partido text,
  uf text,
  posicao text not null default 'desconhecido' check (posicao in ('apoiador', 'favoravel', 'neutro', 'contrario', 'opositor', 'desconhecido')),
  influencia text not null default 'media' check (influencia in ('alta', 'media', 'baixa')),
  temas text,
  notas text,
  atualizado_em timestamptz not null default now()
);
create unique index if not exists mapa_cliente_parlamentar on public.mapa_parlamentares (cliente_id, casa, parlamentar_id);

-- ---------- contatos ----------
create table if not exists public.contatos (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  nome text not null,
  tipo text not null default 'outro',
  cargo text,
  orgao text,
  email text,
  telefone text,
  casa text,
  parlamentar_id text,
  partido text,
  uf text,
  tags text,
  notas text,
  criado_em timestamptz not null default now()
);
create index if not exists contatos_cliente_nome on public.contatos (cliente_id, nome);

-- ---------- reuniões e interações ----------
create table if not exists public.interacoes (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  quando timestamptz not null default now(),
  tipo text not null default 'reuniao',
  assunto text not null,
  participantes text,
  contato_id uuid references public.contatos (id) on delete set null,
  proposicao_id uuid references public.proposicoes (id) on delete set null,
  local text,
  resumo text,
  encaminhamentos text,
  registrado_por uuid default auth.uid(),
  criado_em timestamptz not null default now()
);
create index if not exists interacoes_cliente_quando on public.interacoes (cliente_id, quando desc);

-- ---------- tarefas e prazos ----------
create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  titulo text not null,
  prazo date,
  responsavel text,
  prioridade text not null default 'media' check (prioridade in ('alta', 'media', 'baixa')),
  status text not null default 'aberta' check (status in ('aberta', 'andamento', 'feita')),
  proposicao_id uuid references public.proposicoes (id) on delete set null,
  notas text,
  criado_em timestamptz not null default now(),
  concluida_em timestamptz
);
create index if not exists tarefas_cliente_prazo on public.tarefas (cliente_id, status, prazo);

-- ---------- listas e envio de e-mails ----------
create table if not exists public.listas_email (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  nome text not null,
  descricao text,
  criado_em timestamptz not null default now()
);
create unique index if not exists listas_cliente_nome on public.listas_email (cliente_id, nome);

create table if not exists public.lista_membros (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.listas_email (id) on delete cascade,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  nome text,
  email text not null,
  tratamento text,
  origem text,
  criado_em timestamptz not null default now()
);
create unique index if not exists lista_membros_email on public.lista_membros (lista_id, lower(email));

create table if not exists public.campanhas_email (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  lista_id uuid references public.listas_email (id) on delete set null,
  assunto text not null,
  corpo text not null,
  remetente_nome text,
  responder_para text,
  status text not null default 'rascunho' check (status in ('rascunho', 'enviando', 'parcial', 'enviada', 'erro')),
  total int not null default 0,
  enviados int not null default 0,
  falhas int not null default 0,
  criado_por uuid default auth.uid(),
  criado_em timestamptz not null default now(),
  enviado_em timestamptz
);
create index if not exists campanhas_cliente_data on public.campanhas_email (cliente_id, criado_em desc);

create table if not exists public.envios_email (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references public.campanhas_email (id) on delete cascade,
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  email text not null,
  nome text,
  status text not null,
  erro text,
  id_provedor text,
  enviado_em timestamptz not null default now()
);
create index if not exists envios_campanha on public.envios_email (campanha_id, status);

-- Quem pediu para não receber mais e-mails daquele cliente (link no rodapé de cada envio)
create table if not exists public.descadastros (
  cliente_id uuid not null references public.clientes (id) on delete cascade,
  email text not null,
  criado_em timestamptz not null default now(),
  primary key (cliente_id, email)
);

-- ---------- regras: cada cliente no seu banco ----------
do $$
declare t text;
begin
  foreach t in array array['mapa_parlamentares', 'contatos', 'interacoes', 'tarefas', 'listas_email', 'lista_membros', 'descadastros'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Cada cliente no seu banco: %1$s" on public.%1$I', t);
    execute format('create policy "Cada cliente no seu banco: %1$s" on public.%1$I for all to authenticated using (public.pode_ver(cliente_id)) with check (public.pode_ver(cliente_id))', t);
  end loop;
end $$;

-- Campanhas: quem vê o cliente lê; quem pode enviar cria e edita rascunhos. O envio em si é feito pela função enviar-emails.
alter table public.campanhas_email enable row level security;
drop policy if exists "Vê as campanhas do cliente" on public.campanhas_email;
create policy "Vê as campanhas do cliente" on public.campanhas_email for select to authenticated using (public.pode_ver(cliente_id));
drop policy if exists "Quem envia cuida dos rascunhos" on public.campanhas_email;
create policy "Quem envia cuida dos rascunhos" on public.campanhas_email for insert to authenticated with check (public.pode_enviar(cliente_id) and status = 'rascunho');
drop policy if exists "Quem envia edita rascunhos" on public.campanhas_email;
create policy "Quem envia edita rascunhos" on public.campanhas_email for update to authenticated
  using (public.pode_enviar(cliente_id) and status = 'rascunho') with check (public.pode_enviar(cliente_id) and status = 'rascunho');
drop policy if exists "Quem envia apaga campanhas" on public.campanhas_email;
create policy "Quem envia apaga campanhas" on public.campanhas_email for delete to authenticated using (public.pode_enviar(cliente_id));

alter table public.envios_email enable row level security;
drop policy if exists "Vê os envios do cliente" on public.envios_email;
create policy "Vê os envios do cliente" on public.envios_email for select to authenticated using (public.pode_ver(cliente_id));

-- Alertas também podem ser publicados pelo app (coordenador e master)
alter table public.alertas add column if not exists autor uuid default auth.uid();
