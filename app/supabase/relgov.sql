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
  foreach t in array array['mapa_parlamentares', 'contatos', 'interacoes', 'tarefas', 'listas_email', 'lista_membros'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "Cada cliente no seu banco: %1$s" on public.%1$I', t);
    execute format('create policy "Cada cliente no seu banco: %1$s" on public.%1$I for all to authenticated using (public.pode_ver(cliente_id)) with check (public.pode_ver(cliente_id))', t);
  end loop;
end $$;

-- Descadastros: quem vê o cliente consulta e registra; ninguém apaga pelo app (quem pediu para sair não volta a receber
-- por engano ou por má-fé). Para desfazer um pedido legítimo, o master apaga pelo Table Editor.
alter table public.descadastros enable row level security;
drop policy if exists "Cada cliente no seu banco: descadastros" on public.descadastros;
drop policy if exists "Vê os descadastros do cliente" on public.descadastros;
create policy "Vê os descadastros do cliente" on public.descadastros for select to authenticated using (public.pode_ver(cliente_id));
drop policy if exists "Registra descadastros do cliente" on public.descadastros;
create policy "Registra descadastros do cliente" on public.descadastros for insert to authenticated with check (public.pode_ver(cliente_id));

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
-- Só rascunhos e envios que falharam por inteiro: o que foi enviado fica como registro
create policy "Quem envia apaga campanhas" on public.campanhas_email for delete to authenticated
  using (public.pode_enviar(cliente_id) and status in ('rascunho', 'erro'));

alter table public.envios_email enable row level security;
drop policy if exists "Vê os envios do cliente" on public.envios_email;
create policy "Vê os envios do cliente" on public.envios_email for select to authenticated using (public.pode_ver(cliente_id));

-- Alertas também podem ser publicados pelo app (coordenador e master)
alter table public.alertas add column if not exists autor uuid default auth.uid();

-- ---------- segurança (revisão de 2026-11) ----------
-- Pode rodar de novo. Rode este arquivo inteiro depois de cada atualização do app.

-- 1) Regras abertas da primeira instalação (esquema.sql) não podem conviver com as regras por cliente:
--    se esquema.sql foi rodado de novo antes da correção, elas liberavam todos os clientes para qualquer login.
drop policy if exists "Clientes com login leem os alertas" on public.alertas;
do $$
declare t text;
begin
  foreach t in array array['especialidades', 'palavras', 'proposicoes', 'candidatas'] loop
    execute format('drop policy if exists "Equipe com login usa %1$s" on public.%1$I', t);
  end loop;
end $$;

-- 2) O que aponta para outro registro tem de ser do mesmo cliente (lista de outro cliente, contato de outro cliente...)
create or replace function public.conferir_mesmo_cliente() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  dono uuid;
begin
  -- (um "if" dentro do outro: o plpgsql não para no primeiro "and", e new.contato_id não existe em outras tabelas)
  if tg_table_name in ('lista_membros', 'campanhas_email') then
    if new.lista_id is not null then
      select cliente_id into dono from public.listas_email where id = new.lista_id;
      if dono is distinct from new.cliente_id then raise exception 'A lista não é deste cliente' using errcode = '42501'; end if;
    end if;
  end if;
  if tg_table_name = 'interacoes' then
    if new.contato_id is not null then
      select cliente_id into dono from public.contatos where id = new.contato_id;
      if dono is distinct from new.cliente_id then raise exception 'O contato não é deste cliente' using errcode = '42501'; end if;
    end if;
  end if;
  if tg_table_name in ('interacoes', 'tarefas') then
    if new.proposicao_id is not null then
      select cliente_id into dono from public.proposicoes where id = new.proposicao_id;
      if dono is distinct from new.cliente_id then raise exception 'A proposição não é deste cliente' using errcode = '42501'; end if;
    end if;
  end if;
  return new;
end $$;
do $$
declare t text;
begin
  foreach t in array array['lista_membros', 'campanhas_email', 'interacoes', 'tarefas'] loop
    execute format('drop trigger if exists conferir_mesmo_cliente on public.%I', t);
    execute format('create trigger conferir_mesmo_cliente before insert or update on public.%I for each row execute function public.conferir_mesmo_cliente()', t);
  end loop;
end $$;

-- 3) Links abertos pelo app: só http e https (um link "javascript:" rodaria código no app de quem clica).
--    "not valid": vale para o que for gravado daqui em diante, sem travar se já houver um link antigo diferente.
alter table public.alertas drop constraint if exists alertas_link_http;
alter table public.alertas add constraint alertas_link_http check (link is null or link ~* '^https?://') not valid;
alter table public.notas drop constraint if exists notas_link_http;
alter table public.notas add constraint notas_link_http check (link is null or link ~* '^https?://') not valid;

-- 4) Trava de envio: a função enviar-emails reserva a campanha antes de mandar, para dois envios ao mesmo tempo
--    não mandarem em dobro. Uma reserva parada há mais de 10 minutos (função que caiu) pode ser retomada.
alter table public.campanhas_email add column if not exists envio_iniciado_em timestamptz;

-- 5) Registro de cada coleta (agendada ou pelo botão "Buscar agora"): serve de trava contra chamadas repetidas
--    e de histórico. Só a função lê e grava (sem regras para quem usa o app).
create table if not exists public.coletas (
  id bigint generated always as identity primary key,
  iniciada_em timestamptz not null default now(),
  origem text not null,
  pessoa uuid
);
create index if not exists coletas_data on public.coletas (iniciada_em desc);
alter table public.coletas enable row level security;

-- 6) Funções do banco: o Postgres e o Supabase deixam qualquer um, inclusive quem não tem login, chamar as funções novas.
--    Quem não tem login não precisa de nenhuma: o acesso dele sai. Quem tem login continua com as que o app e as regras usam.
do $$
declare f record;
begin
  for f in select p.oid::regprocedure as assinatura from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.prokind = 'f' loop
    execute format('revoke execute on function %s from public, anon', f.assinatura);
  end loop;
end $$;
grant execute on function public.meu_papel(), public.minha_org(), public.sou_master(), public.sou_admin(), public.gere_org(uuid),
  public.gere_cliente(uuid), public.pode_ver(uuid), public.org_de(uuid), public.pode_enviar(uuid), public.definir_envio_email(uuid, boolean),
  public.salvar_meu_nome(text), public.contar_entradas(date, date) to authenticated;
grant execute on all functions in schema public to service_role;
