// Cadastro de pessoas pelo app, só para administradores (perfis.admin).
// Recebe { acao: 'criar', email, nome, senha, admin, clientes: [ids] }, { acao: 'senha', user_id, senha }
// ou { acao: 'remover', user_id }. A senha é criada pelo administrador e passada à pessoa, que pode trocá-la depois
// pelo "Esqueci minha senha"; assim o cadastro não depende do envio de e-mail.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  // Quem chama: a sessão do app, para conferir se é administrador
  const comoQuemChama = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: souAdmin, error: erroAdmin } = await comoQuemChama.rpc('sou_admin');
  if (erroAdmin || souAdmin !== true) return resposta({ erro: 'Só administradores cadastram pessoas.' }, 403);

  const sb = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const corpo = await req.json().catch(() => ({}));

  if (corpo.acao === 'criar') {
    const email = String(corpo.email ?? '').trim().toLowerCase();
    const senha = String(corpo.senha ?? '');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return resposta({ erro: 'E-mail inválido.' }, 400);
    if (senha.length < 8) return resposta({ erro: 'A senha precisa de pelo menos 8 caracteres.' }, 400);
    const { data, error } = await sb.auth.admin.createUser({ email, password: senha, email_confirm: true });
    if (error) return resposta({ erro: /already|registered|exists/i.test(error.message) ? 'Este e-mail já tem cadastro.' : error.message }, 400);
    const id = data.user.id;
    // O perfil nasce pelo gatilho em auth.users; aqui só completa nome e papel
    await sb.from('perfis').upsert({ user_id: id, email, nome: String(corpo.nome ?? '').trim() || null, admin: corpo.admin === true });
    const clientes: string[] = Array.isArray(corpo.clientes) ? corpo.clientes.filter((c: unknown) => typeof c === 'string') : [];
    if (clientes.length) await sb.from('acessos').insert(clientes.map((cliente_id) => ({ user_id: id, cliente_id })));
    return resposta({ user_id: id });
  }

  if (corpo.acao === 'senha') {
    const senha = String(corpo.senha ?? '');
    if (senha.length < 8) return resposta({ erro: 'A senha precisa de pelo menos 8 caracteres.' }, 400);
    const { error } = await sb.auth.admin.updateUserById(String(corpo.user_id), { password: senha });
    return error ? resposta({ erro: error.message }, 400) : resposta({ ok: true });
  }

  if (corpo.acao === 'remover') {
    const { data: quem } = await comoQuemChama.auth.getUser();
    if (quem?.user?.id === corpo.user_id) return resposta({ erro: 'Você não pode remover a si mesmo.' }, 400);
    const { error } = await sb.auth.admin.deleteUser(String(corpo.user_id));
    return error ? resposta({ erro: error.message }, 400) : resposta({ ok: true });
  }

  return resposta({ erro: 'Ação desconhecida.' }, 400);
});
