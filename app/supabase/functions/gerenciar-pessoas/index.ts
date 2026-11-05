// Cadastro de pessoas pelo app, para master e coordenadores (niveis.sql).
// Master: cadastra qualquer nível em qualquer organização e muda nível e organização de qualquer pessoa.
// Coordenador: cadastra atendimentos da própria organização, define a senha deles e os remove.
// Ações: { acao: 'criar', email, nome, senha, papel, organizacao_id, clientes: [ids] }, { acao: 'senha', user_id, senha },
// { acao: 'remover', user_id } e { acao: 'nivel', user_id, papel, organizacao_id }.
// A senha é criada por quem cadastra e passada à pessoa, que pode trocá-la depois; o cadastro não depende de e-mail.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const PAPEIS = ['master', 'coordenador', 'atendimento'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // Quem chama: a sessão do app
  const comoQuemChama = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: quem } = await comoQuemChama.auth.getUser();
  const eu = quem?.user?.id;
  if (!eu) return resposta({ erro: 'Entre de novo no app.' }, 401);
  const { data: meu } = await sb.from('perfis').select('papel, organizacao_id').eq('user_id', eu).maybeSingle();
  const master = meu?.papel === 'master';
  const coord = meu?.papel === 'coordenador' && !!meu?.organizacao_id;
  if (!master && !coord) return resposta({ erro: 'Só master e coordenadores cadastram pessoas.' }, 403);

  const corpo = await req.json().catch(() => ({}));

  // Coordenador só mexe em atendimentos da própria organização
  async function podeMexer(alvo: string) {
    if (alvo === eu) return false;
    if (master) return true;
    const { data } = await sb.from('perfis').select('papel, organizacao_id').eq('user_id', alvo).maybeSingle();
    return data?.papel === 'atendimento' && data?.organizacao_id === meu!.organizacao_id;
  }

  if (corpo.acao === 'criar') {
    const email = String(corpo.email ?? '').trim().toLowerCase();
    const senha = String(corpo.senha ?? '');
    const papel = master ? String(corpo.papel ?? 'atendimento') : 'atendimento';
    const org = papel === 'master' ? null : master ? (corpo.organizacao_id ? String(corpo.organizacao_id) : null) : meu!.organizacao_id;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resposta({ erro: 'E-mail inválido.' }, 400);
    if (senha.length < 8) return resposta({ erro: 'A senha precisa de pelo menos 8 caracteres.' }, 400);
    if (!PAPEIS.includes(papel)) return resposta({ erro: 'Nível inválido.' }, 400);
    if (papel !== 'master' && !org) return resposta({ erro: 'Escolha a organização.' }, 400);
    const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (error) return resposta({ erro: /already|registered|exists/i.test(error.message) ? 'Este e-mail já tem cadastro.' : error.message }, 400);
    const id = data.user.id;
    // O perfil nasce pelo gatilho em auth.users; aqui completa nome, nível e organização
    await sb.from('perfis').upsert({ user_id: id, email, nome: String(corpo.nome ?? '').trim() || null, papel, organizacao_id: org });
    let clientes: string[] = Array.isArray(corpo.clientes) ? corpo.clientes.filter((c: unknown) => typeof c === 'string') : [];
    if (papel === 'atendimento' && clientes.length) {
      // Só clientes da organização da pessoa
      const { data: daOrg } = await sb.from('clientes').select('id').eq('organizacao_id', org).in('id', clientes);
      clientes = (daOrg ?? []).map((c: any) => c.id);
      if (clientes.length) await sb.from('acessos').insert(clientes.map((cliente_id) => ({ user_id: id, cliente_id })));
    }
    return resposta({ user_id: id });
  }

  if (corpo.acao === 'senha') {
    const senha = String(corpo.senha ?? '');
    if (senha.length < 8) return resposta({ erro: 'A senha precisa de pelo menos 8 caracteres.' }, 400);
    if (!(await podeMexer(String(corpo.user_id)))) return resposta({ erro: 'Você não pode mudar a senha desta pessoa.' }, 403);
    const { error } = await sb.auth.admin.updateUserById(String(corpo.user_id), { password: senha });
    return error ? resposta({ erro: error.message }, 400) : resposta({ ok: true });
  }

  if (corpo.acao === 'remover') {
    if (corpo.user_id === eu) return resposta({ erro: 'Você não pode remover a si mesmo.' }, 400);
    if (!(await podeMexer(String(corpo.user_id)))) return resposta({ erro: 'Você não pode remover esta pessoa.' }, 403);
    const { error } = await sb.auth.admin.deleteUser(String(corpo.user_id));
    return error ? resposta({ erro: error.message }, 400) : resposta({ ok: true });
  }

  if (corpo.acao === 'nivel') {
    if (!master) return resposta({ erro: 'Só o master muda o nível das pessoas.' }, 403);
    if (corpo.user_id === eu) return resposta({ erro: 'Você não pode mudar o próprio nível.' }, 400);
    const papel = String(corpo.papel ?? '');
    if (!PAPEIS.includes(papel)) return resposta({ erro: 'Nível inválido.' }, 400);
    const org = papel === 'master' ? null : (corpo.organizacao_id ? String(corpo.organizacao_id) : null);
    const { error } = await sb.from('perfis').update({ papel, organizacao_id: org }).eq('user_id', String(corpo.user_id));
    if (error) return resposta({ erro: error.message }, 400);
    // Ao mudar de organização ou deixar de ser atendimento, os clientes liberados de outra organização saem
    const { data: acessos } = await sb.from('acessos').select('cliente_id, clientes(organizacao_id)').eq('user_id', String(corpo.user_id));
    const sair = (acessos ?? []).filter((a: any) => papel !== 'atendimento' || a.clientes?.organizacao_id !== org).map((a: any) => a.cliente_id);
    if (sair.length) await sb.from('acessos').delete().eq('user_id', String(corpo.user_id)).in('cliente_id', sair);
    return resposta({ ok: true });
  }

  return resposta({ erro: 'Ação desconhecida.' }, 400);
});
