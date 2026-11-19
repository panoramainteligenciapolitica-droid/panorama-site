// Conecta a conta de e-mail da própria pessoa (Gmail ou Outlook/Microsoft 365) ao app, por OAuth.
// Depois de conectada, a função enviar-emails manda os e-mails do app por essa conta.
//
// Publique com "Verify JWT" DESLIGADO: o Google e a Microsoft voltam para cá sem o login do app.
// Quem chama por POST é conferido aqui dentro pelo token do app.
//
// POST { acao: 'iniciar', provedor: 'google' | 'microsoft', voltar }  -> { url } (endereço da tela de permissão)
// POST { acao: 'desconectar' }                                        -> apaga a conta (e revoga no Google)
// GET  ?code=...&state=...  (retorno do Google/Microsoft)              -> guarda os tokens e volta para o app
//
// Segredos (Edge Functions > Secrets):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET         (Google Cloud > APIs e serviços > Credenciais)
//   MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET   (Azure > Registros de aplicativo)
// Endereço de retorno para cadastrar nos dois: https://<projeto>.supabase.co/functions/v1/conta-email
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const APP_PADRAO = 'https://panoramaip.com.br/app/?config=1';
// Só volta para o próprio app (evita usar esta função para redirecionar para outros sites)
const voltarValido = (v: unknown) => {
  const s = String(v || '');
  return /^https:\/\/(www\.)?panoramaip\.com\.br\/app\//.test(s) || /^http:\/\/localhost(:\d+)?\//.test(s) ? s : APP_PADRAO;
};

const PROVEDORES = {
  google: {
    autorizar: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    escopo: 'openid email profile https://www.googleapis.com/auth/gmail.send',
    id: () => Deno.env.get('GOOGLE_CLIENT_ID'),
    segredo: () => Deno.env.get('GOOGLE_CLIENT_SECRET'),
    nome: 'Gmail',
  },
  microsoft: {
    autorizar: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    token: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    escopo: 'openid email profile offline_access User.Read Mail.Send',
    id: () => Deno.env.get('MICROSOFT_CLIENT_ID'),
    segredo: () => Deno.env.get('MICROSOFT_CLIENT_SECRET'),
    nome: 'Outlook',
  },
} as const;
type Provedor = keyof typeof PROVEDORES;

const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
async function hmac(segredo: string, texto: string) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(texto))));
}
// state = dados assinados (quem, provedor, para onde voltar, validade de 15 minutos)
async function criarEstado(segredo: string, dados: Record<string, unknown>) {
  const corpo = b64url(new TextEncoder().encode(JSON.stringify({ ...dados, x: Date.now() + 15 * 60_000, n: crypto.randomUUID() })));
  return corpo + '.' + await hmac(segredo, corpo);
}
async function lerEstado(segredo: string, estado: string) {
  const [corpo, sig] = estado.split('.');
  if (!corpo || !sig || sig !== await hmac(segredo, corpo)) return null;
  const dados = JSON.parse(new TextDecoder().decode(deB64url(corpo)));
  return dados.x > Date.now() ? dados as { u: string; p: Provedor; v: string } : null;
}

function voltarPara(destino: string, ok: boolean, msg: string) {
  const u = new URL(destino);
  u.searchParams.set('conta_email', ok ? 'ok' : 'erro');
  u.searchParams.set('msg', msg);
  return new Response(null, { status: 302, headers: { Location: u.toString() } });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const url = Deno.env.get('SUPABASE_URL')!;
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(url, servico);
  const segredoEstado = Deno.env.get('OAUTH_ESTADO_SEGREDO') || servico;
  const retorno = Deno.env.get('CONTA_EMAIL_RETORNO') || url.replace(/\/$/, '') + '/functions/v1/conta-email';

  // ---------- retorno do Google / Microsoft ----------
  if (req.method === 'GET') {
    const q = new URL(req.url).searchParams;
    const estado = await lerEstado(segredoEstado, q.get('state') || '').catch(() => null);
    if (!estado) return voltarPara(APP_PADRAO, false, 'O pedido expirou. Tente conectar de novo.');
    const destino = voltarValido(estado.v);
    if (q.get('error')) {
      const negou = /access_denied|consent/i.test(q.get('error') || '');
      return voltarPara(destino, false, negou ? 'Você não autorizou o acesso. Nada foi conectado.' : 'O provedor recusou: ' + (q.get('error_description') || q.get('error')));
    }
    const prov = PROVEDORES[estado.p];
    const corpo = new URLSearchParams({
      code: q.get('code') || '', client_id: prov.id() || '', client_secret: prov.segredo() || '',
      redirect_uri: retorno, grant_type: 'authorization_code',
    });
    if (estado.p === 'microsoft') corpo.set('scope', prov.escopo);
    const r = await fetch(prov.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: corpo });
    const tok = await r.json().catch(() => ({}));
    if (!r.ok || !tok.access_token) return voltarPara(destino, false, 'Não foi possível concluir a conexão (' + (tok.error_description || tok.error || r.status) + ').');
    if (!tok.refresh_token) return voltarPara(destino, false, 'O provedor não liberou o acesso contínuo. Remova o app das permissões da sua conta e conecte de novo.');

    let email = '', nome = '';
    if (estado.p === 'google') {
      const info = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + tok.access_token } }).then((x) => x.json()).catch(() => ({}));
      email = info.email || ''; nome = info.name || '';
      if (!String(tok.scope || '').includes('gmail.send')) return voltarPara(destino, false, 'Marque a permissão "Enviar e-mail em seu nome" na tela do Google e conecte de novo.');
    } else {
      const eu = await fetch('https://graph.microsoft.com/v1.0/me?$select=mail,userPrincipalName,displayName', { headers: { Authorization: 'Bearer ' + tok.access_token } }).then((x) => x.json()).catch(() => ({}));
      email = eu.mail || eu.userPrincipalName || ''; nome = eu.displayName || '';
    }
    if (!email) return voltarPara(destino, false, 'Não foi possível ler o endereço da conta.');

    const { error } = await sb.from('contas_email').upsert({
      user_id: estado.u, provedor: estado.p, email: email.toLowerCase(), nome: nome || null,
      refresh_token: tok.refresh_token, access_token: tok.access_token,
      expira_em: new Date(Date.now() + (Number(tok.expires_in) || 3600) * 1000).toISOString(),
      conectado_em: new Date().toISOString(), usado_em: null,
    }, { onConflict: 'user_id' });
    if (error) return voltarPara(destino, false, 'Conectou, mas não foi possível guardar (' + error.message + '). Rode contas-email.sql no Supabase.');
    return voltarPara(destino, true, email + ' conectado (' + prov.nome + ').');
  }

  // ---------- pedidos do app ----------
  const comoQuemChama = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: quem } = await comoQuemChama.auth.getUser();
  if (!quem?.user) return resposta({ erro: 'Entre de novo no app.' }, 401);
  const pedido = await req.json().catch(() => ({}));

  if (pedido.acao === 'iniciar') {
    const p = pedido.provedor as Provedor;
    const prov = PROVEDORES[p];
    if (!prov) return resposta({ erro: 'Escolha Gmail ou Outlook.' }, 400);
    if (!prov.id() || !prov.segredo()) {
      return resposta({ erro: 'A conexão com ' + prov.nome + ' ainda não foi configurada no servidor (faltam os segredos ' +
        (p === 'google' ? 'GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET' : 'MICROSOFT_CLIENT_ID e MICROSOFT_CLIENT_SECRET') + ').' }, 503);
    }
    const estado = await criarEstado(segredoEstado, { u: quem.user.id, p, v: voltarValido(pedido.voltar) });
    const q = new URLSearchParams({ client_id: prov.id()!, redirect_uri: retorno, response_type: 'code', scope: prov.escopo, state: estado });
    if (p === 'google') { q.set('access_type', 'offline'); q.set('prompt', 'consent'); q.set('include_granted_scopes', 'true'); }
    else { q.set('prompt', 'select_account'); q.set('response_mode', 'query'); }
    if (pedido.dica) q.set('login_hint', String(pedido.dica));
    return resposta({ url: prov.autorizar + '?' + q.toString() });
  }

  if (pedido.acao === 'desconectar') {
    const { data: conta } = await sb.from('contas_email').select('provedor, refresh_token').eq('user_id', quem.user.id).maybeSingle();
    if (conta?.provedor === 'google') {
      await fetch('https://oauth2.googleapis.com/revoke?token=' + encodeURIComponent(conta.refresh_token), { method: 'POST' }).catch(() => null);
    }
    await sb.from('contas_email').delete().eq('user_id', quem.user.id);
    return resposta({ ok: true });
  }

  return resposta({ erro: 'Pedido desconhecido.' }, 400);
});
