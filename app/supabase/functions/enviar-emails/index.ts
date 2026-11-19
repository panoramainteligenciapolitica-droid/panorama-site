// Envio de e-mails em massa a partir de uma campanha do app (relgov.sql), por um destes caminhos:
//  - a conta Gmail ou Outlook que a própria pessoa conectou em Configurações > Minha conta (função conta-email);
//  - o Resend (resend.com), com o domínio do app.
// Corpo: { campanha_id, teste?: true, via?: 'conta' | 'resend' }. Sem via: usa a conta conectada, se houver.
// Com teste, manda só para o e-mail de quem pediu.
// Segredos (Edge Functions > Secrets): para o Resend, RESEND_API_KEY e EMAIL_REMETENTE (ex.: contato@panoramaip.com.br,
// de um domínio verificado). Para as contas próprias, os mesmos GOOGLE_* e MICROSOFT_* da função conta-email.
// Opcional: DESCADASTRO_SEGREDO (senão usa a chave de serviço).
// Cada e-mail é personalizado ({{nome}}, {{tratamento}}, {{email}}) e leva o link de descadastro.
// Quem já recebeu não recebe de novo: se o tempo acabar no meio, chamar de novo continua de onde parou.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const LOTE = 100; // máximo do envio em lote do Resend
const LIMITE_MS = 110_000;
// Gmail: cerca de 2 envios por segundo por conta. Outlook (Microsoft Graph): no máximo 30 por minuto por caixa.
const PAUSA_MS = { google: 400, microsoft: 2_100 } as const;
const NOME_PROVEDOR = { google: 'Gmail', microsoft: 'Outlook' } as const;
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Conta = { user_id: string; provedor: 'google' | 'microsoft'; email: string; nome: string | null; refresh_token: string; access_token: string | null; expira_em: string | null };
type Mensagem = { para: string; assunto: string; html: string; texto: string; link: string; um_clique: string; de_nome: string; responder: string | null };
class ErroCota extends Error {}
class ErroConta extends Error {}

// ---------- MIME para o Gmail ----------
function b64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
const utf8 = (t: string) => new TextEncoder().encode(t);
const cabecalhoUtf8 = (t: string) => /^[\x20-\x7e]*$/.test(t) ? t : '=?UTF-8?B?' + b64(utf8(t)) + '?=';
const quebrar = (t: string) => t.replace(/.{1,76}/g, '$&\r\n');
function mime(m: Mensagem, de: string) {
  const fronteira = 'pnr' + crypto.randomUUID().replace(/-/g, '');
  const cabecalhos = [
    'From: ' + (m.de_nome ? cabecalhoUtf8(m.de_nome.replace(/[<>"]/g, '')) + ' ' : '') + '<' + de + '>',
    'To: <' + m.para + '>',
    'Subject: ' + cabecalhoUtf8(m.assunto),
    m.responder ? 'Reply-To: <' + m.responder + '>' : null,
    'List-Unsubscribe: <' + m.um_clique + '>, <' + m.link + '>',
    'List-Unsubscribe-Post: List-Unsubscribe=One-Click',
    'MIME-Version: 1.0',
    'Content-Type: multipart/alternative; boundary="' + fronteira + '"',
  ].filter(Boolean);
  const corpo = [
    '--' + fronteira, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', quebrar(b64(utf8(m.texto))),
    '--' + fronteira, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', quebrar(b64(utf8(m.html))),
    '--' + fronteira + '--', '',
  ];
  return b64(utf8(cabecalhos.join('\r\n') + '\r\n\r\n' + corpo.join('\r\n'))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ---------- conta conectada: token sempre válido ----------
// deno-lint-ignore no-explicit-any
async function tokenValido(sb: any, c: Conta) {
  if (c.access_token && c.expira_em && new Date(c.expira_em).getTime() > Date.now() + 90_000) return c.access_token;
  const google = c.provedor === 'google';
  const corpo = new URLSearchParams({
    client_id: Deno.env.get(google ? 'GOOGLE_CLIENT_ID' : 'MICROSOFT_CLIENT_ID') || '',
    client_secret: Deno.env.get(google ? 'GOOGLE_CLIENT_SECRET' : 'MICROSOFT_CLIENT_SECRET') || '',
    refresh_token: c.refresh_token, grant_type: 'refresh_token',
  });
  if (!google) corpo.set('scope', 'offline_access User.Read Mail.Send');
  const r = await fetch(google ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: corpo });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    if (j.error === 'invalid_grant') {
      // Senha trocada, acesso removido ou prazo vencido: a pessoa precisa conectar de novo
      await sb.from('contas_email').delete().eq('user_id', c.user_id);
      throw new ErroConta('A conexão com ' + c.email + ' expirou ou foi removida. Conecte a conta de novo em Configurações > Minha conta.');
    }
    throw new ErroConta('Não foi possível renovar o acesso a ' + c.email + ' (' + (j.error_description || j.error || r.status) + ').');
  }
  c.access_token = j.access_token;
  c.expira_em = new Date(Date.now() + (Number(j.expires_in) || 3600) * 1000).toISOString();
  if (j.refresh_token) c.refresh_token = j.refresh_token; // a Microsoft troca o refresh token a cada renovação
  await sb.from('contas_email').update({ access_token: c.access_token, expira_em: c.expira_em, refresh_token: c.refresh_token }).eq('user_id', c.user_id);
  return c.access_token;
}

// deno-lint-ignore no-explicit-any
async function enviarPelaConta(sb: any, c: Conta, m: Mensagem): Promise<string | null> {
  const token = await tokenValido(sb, c);
  let r: Response;
  if (c.provedor === 'google') {
    r = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ raw: mime(m, c.email) }),
    });
  } else {
    r = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject: m.assunto, body: { contentType: 'HTML', content: m.html },
          toRecipients: [{ emailAddress: { address: m.para } }],
          replyTo: m.responder ? [{ emailAddress: { address: m.responder } }] : [],
        },
        saveToSentItems: true,
      }),
    });
  }
  if (r.ok) {
    const j = await r.json().catch(() => ({}));
    return j?.id ?? null;
  }
  const j = await r.json().catch(() => ({}));
  const msg = String(j?.error?.message || j?.error_description || ('Resposta ' + r.status));
  if (r.status === 401) { c.expira_em = null; throw new ErroConta('O acesso à conta ' + c.email + ' foi recusado. Conecte de novo em Configurações > Minha conta.'); }
  if (r.status === 429 || /quota|limit exceeded|rate ?limit|throttl|MailboxConcurrency|ErrorExceededMessageLimit/i.test(msg)) {
    throw new ErroCota('A conta ' + c.email + ' chegou ao limite de envios do ' + NOME_PROVEDOR[c.provedor] + ' por agora. Continue mais tarde.');
  }
  if (r.status === 403 && c.provedor === 'microsoft' && /MailboxNotEnabledForRESTAPI|license/i.test(msg)) {
    throw new ErroConta('Esta conta Microsoft não tem caixa de e-mail ativa para envio.');
  }
  throw new Error(msg.slice(0, 300));
}
const PAGINA_DESCADASTRO = 'https://panoramaip.com.br/app/descadastro.html';
const RESERVA_MS = 10 * 60_000; // envio "Enviando" parado há mais que isso (função que caiu) pode ser retomado

// O Supabase devolve no máximo 1000 linhas por consulta (Max rows): lê em páginas até acabar.
// Sem isso, listas grandes eram cortadas e descadastrados acima do milésimo voltavam a receber.
async function todas<T>(consulta: (de: number, ate: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const PAGINA = 1000, linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await consulta(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    linhas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return linhas;
  }
}

async function assinatura(segredo: string, texto: string) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(texto)));
  return Array.from(sig.slice(0, 16)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
const escapar = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function preencher(modelo: string, m: { nome?: string | null; tratamento?: string | null; email: string }) {
  const primeiro = (m.nome || '').trim().split(/\s+/)[0] || '';
  return modelo
    .replace(/\{\{\s*nome\s*\}\}/gi, m.nome || '')
    .replace(/\{\{\s*primeiro_nome\s*\}\}/gi, primeiro)
    .replace(/\{\{\s*tratamento\s*\}\}/gi, m.tratamento || '')
    .replace(/\{\{\s*email\s*\}\}/gi, m.email)
    .replace(/[ \t]{2,}/g, ' ');
}
// Texto simples vira HTML: parágrafos, quebras e links clicáveis
function html(texto: string, rodape: string) {
  const corpo = texto.split(/\n{2,}/).map((p) =>
    '<p style="margin:0 0 14px">' + escapar(p).replace(/\n/g, '<br>').replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>') + '</p>').join('');
  return '<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1b2e53;max-width:640px">' + corpo +
    '<hr style="border:0;border-top:1px solid #dfe3ea;margin:24px 0 12px"><p style="font-size:12px;color:#5a667d">' + rodape + '</p></div>';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const inicio = Date.now();
  const url = Deno.env.get('SUPABASE_URL')!;
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const sb = createClient(url, servico);
  const comoQuemChama = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: quem } = await comoQuemChama.auth.getUser();
  if (!quem?.user) return resposta({ erro: 'Entre de novo no app.' }, 401);
  const segredo = Deno.env.get('DESCADASTRO_SEGREDO') || servico;

  const corpoReq = await req.json().catch(() => ({}));
  const idCampanha = String(corpoReq.campanha_id ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(idCampanha)) return resposta({ erro: 'Campanha não encontrada.' }, 404);
  const { data: camp } = await sb.from('campanhas_email').select('*').eq('id', idCampanha).maybeSingle();
  if (!camp) return resposta({ erro: 'Campanha não encontrada.' }, 404);
  const { data: pode } = await comoQuemChama.rpc('pode_enviar', { cliente: camp.cliente_id });
  if (!pode) return resposta({ erro: 'Você não tem permissão para enviar e-mails deste cliente.' }, 403);

  // Por onde sai: a conta conectada de quem envia (padrão, se houver) ou o Resend
  const { data: conta } = await sb.from('contas_email').select('*').eq('user_id', quem.user.id).maybeSingle() as { data: Conta | null };
  const via = corpoReq.via === 'resend' ? 'resend' : corpoReq.via === 'conta' ? 'conta' : (conta ? 'conta' : 'resend');
  if (via === 'conta' && !conta) return resposta({ erro: 'Conecte sua conta Gmail ou Outlook em Configurações > Minha conta, ou escolha enviar pelo servidor do app.' }, 400);
  const chaveResend = Deno.env.get('RESEND_API_KEY');
  const remetente = Deno.env.get('EMAIL_REMETENTE');
  if (via === 'resend' && (!chaveResend || !remetente)) {
    return resposta({ erro: 'O envio pelo servidor do app ainda não foi configurado (faltam RESEND_API_KEY e EMAIL_REMETENTE). Conecte sua conta Gmail ou Outlook em Configurações > Minha conta para enviar por ela.' }, 503);
  }
  const enviadoPor = via === 'conta' ? conta!.email + ' (' + NOME_PROVEDOR[conta!.provedor] + ')' : 'Servidor do app (' + remetente + ')';

  const { data: cliente } = await sb.from('clientes').select('nome').eq('id', camp.cliente_id).maybeSingle();
  // Descadastro em um clique (exigido por Gmail e Yahoo para envio em massa): o provedor faz um POST direto na função
  const funcaoDescadastro = url + '/functions/v1/descadastrar';

  async function montar(m: { nome?: string | null; tratamento?: string | null; email: string }): Promise<Mensagem> {
    const t = await assinatura(segredo, camp.cliente_id + ':' + m.email.toLowerCase());
    const link = PAGINA_DESCADASTRO + '?c=' + camp.cliente_id + '&e=' + encodeURIComponent(m.email) + '&t=' + t;
    const rodape = 'Você recebeu este e-mail de ' + escapar(camp.remetente_nome || cliente?.nome || 'Panorama') +
      '. <a href="' + link + '">Não quero mais receber estes e-mails</a>.';
    const texto = preencher(camp.corpo, m);
    return {
      para: m.email, assunto: preencher(camp.assunto, m), html: html(texto, rodape),
      texto: texto + '\n\n--\nPara não receber mais: ' + link, link,
      um_clique: funcaoDescadastro + '?c=' + camp.cliente_id + '&e=' + encodeURIComponent(m.email) + '&t=' + t,
      de_nome: camp.remetente_nome || conta?.nome || '', responder: camp.responder_para || null,
    };
  }
  async function mandarResend(lote: Mensagem[]) {
    const de = (camp.remetente_nome ? camp.remetente_nome.replace(/[<>"]/g, '') + ' ' : '') + '<' + remetente + '>';
    const r = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST', headers: { Authorization: 'Bearer ' + chaveResend, 'Content-Type': 'application/json' },
      body: JSON.stringify(lote.map((m) => ({
        from: de, to: [m.para], subject: m.assunto, html: m.html, text: m.texto,
        reply_to: m.responder || undefined,
        headers: { 'List-Unsubscribe': '<' + m.um_clique + '>, <' + m.link + '>', 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
      }))),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || ('Resend respondeu ' + r.status));
    return (j?.data || []) as { id: string }[];
  }

  // Teste: só para quem pediu
  if (corpoReq.teste) {
    try {
      const m = await montar({ nome: 'Teste', tratamento: '', email: quem.user.email! });
      if (via === 'conta') { await enviarPelaConta(sb, conta!, m); await sb.from('contas_email').update({ usado_em: new Date().toISOString() }).eq('user_id', conta!.user_id); }
      else await mandarResend([m]);
      return resposta({ ok: true, teste: quem.user.email, enviado_por: enviadoPor });
    } catch (e) { return resposta({ erro: String((e as Error).message) }, 502); }
  }
  if (!camp.lista_id) return resposta({ erro: 'Escolha a lista de destinatários.' }, 400);
  // A lista tem de ser do mesmo cliente da campanha
  const { data: lista } = await sb.from('listas_email').select('cliente_id').eq('id', camp.lista_id).maybeSingle();
  if (!lista || lista.cliente_id !== camp.cliente_id) return resposta({ erro: 'Esta lista não é deste cliente.' }, 403);

  // Reserva a campanha: só uma chamada por vez envia (dois cliques ou duas abas não mandam em dobro).
  // A troca de status só acontece se a campanha ainda estiver como foi lida agora; quem chegar depois não acha nada para trocar.
  const retomavel = camp.status === 'enviando' && (!camp.envio_iniciado_em || Date.parse(camp.envio_iniciado_em) < Date.now() - RESERVA_MS);
  let reservada: unknown = null;
  if (['rascunho', 'parcial', 'erro'].includes(camp.status) || retomavel) {
    let troca = sb.from('campanhas_email').update({ status: 'enviando', envio_iniciado_em: new Date().toISOString() })
      .eq('id', camp.id).eq('status', camp.status);
    troca = camp.envio_iniciado_em ? troca.eq('envio_iniciado_em', camp.envio_iniciado_em) : troca.is('envio_iniciado_em', null);
    reservada = (await troca.select('id').maybeSingle()).data;
  }
  if (!reservada) {
    return resposta({ erro: camp.status === 'enviada' ? 'Este e-mail já foi enviado. Use "Duplicar" para mandar de novo.' : 'Este e-mail já está sendo enviado. Espere terminar.' }, 409);
  }

  // Destinatários: membros da lista, sem repetidos, sem descadastrados e sem quem já recebeu esta campanha
  type Membro = { nome: string | null; email: string; tratamento: string | null };
  let membros: Membro[], fora: { email: string }[], feitos: { email: string }[];
  try {
    [membros, fora, feitos] = await Promise.all([
      todas<Membro>((de, ate) => sb.from('lista_membros').select('nome, email, tratamento').eq('lista_id', camp.lista_id).order('id').range(de, ate)),
      todas<{ email: string }>((de, ate) => sb.from('descadastros').select('email').eq('cliente_id', camp.cliente_id).order('email').range(de, ate)),
      todas<{ email: string }>((de, ate) => sb.from('envios_email').select('email').eq('campanha_id', camp.id).eq('status', 'enviado').order('id').range(de, ate)),
    ]);
  } catch (e) {
    // Sem a lista completa de descadastrados não envia nada (quem pediu para sair não pode receber)
    await sb.from('campanhas_email').update({ status: camp.status === 'rascunho' ? 'rascunho' : 'parcial', envio_iniciado_em: null }).eq('id', camp.id);
    return resposta({ erro: 'Não foi possível ler os destinatários agora. Nada foi enviado. Tente de novo.' }, 502);
  }
  const pular = new Set([...fora, ...feitos].map((x) => x.email.toLowerCase()));
  const vistos = new Set<string>();
  const fila = membros.filter((m) => {
    const e = m.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || pular.has(e) || vistos.has(e)) return false;
    vistos.add(e); return true;
  });
  const total = fila.length + feitos.length;
  await sb.from('campanhas_email').update({ total, enviado_por: enviadoPor }).eq('id', camp.id);

  let enviados = feitos.length, falhas = 0, i = 0, aviso = '';
  const registrar = (parte: typeof fila, status: 'enviado' | 'falha', ids: (string | null)[] = [], erro = '') =>
    sb.from('envios_email').insert(parte.map((m, k) => ({
      campanha_id: camp.id, cliente_id: camp.cliente_id, email: m.email, nome: m.nome, status,
      id_provedor: ids[k] ?? null, erro: erro ? erro.slice(0, 500) : null,
    })));

  if (via === 'resend') {
    for (; i < fila.length; i += LOTE) {
      if (Date.now() - inicio > LIMITE_MS) break;
      const parte = fila.slice(i, i + LOTE);
      try {
        const ids = await mandarResend(await Promise.all(parte.map(montar)));
        enviados += parte.length;
        await registrar(parte, 'enviado', ids.map((x) => x?.id ?? null));
      } catch (e) {
        falhas += parte.length;
        await registrar(parte, 'falha', [], String((e as Error).message));
      }
    }
  } else {
    // Pela conta da pessoa: um e-mail por vez, no ritmo que o Gmail/Outlook aceitam
    const pausa = PAUSA_MS[conta!.provedor];
    for (; i < fila.length; i++) {
      if (Date.now() - inicio > LIMITE_MS) break;
      const m = fila[i];
      const comeco = Date.now();
      try {
        const id = await enviarPelaConta(sb, conta!, await montar(m));
        enviados++;
        await registrar([m], 'enviado', [id]);
      } catch (e) {
        if (e instanceof ErroCota || e instanceof ErroConta) { aviso = e.message; break; }
        falhas++;
        await registrar([m], 'falha', [], String((e as Error).message));
      }
      const resta = pausa - (Date.now() - comeco);
      if (resta > 0) await espera(resta);
    }
    await sb.from('contas_email').update({ usado_em: new Date().toISOString() }).eq('user_id', conta!.user_id);
  }

  const terminou = i >= fila.length;
  const status = terminou ? (enviados === 0 && falhas > 0 ? 'erro' : 'enviada') : 'parcial';
  await sb.from('campanhas_email').update({ status, enviados, falhas, enviado_em: new Date().toISOString(), envio_iniciado_em: null }).eq('id', camp.id);
  return resposta({ ok: true, status, total, enviados, falhas, restantes: Math.max(0, fila.length - i), aviso: aviso || undefined, enviado_por: enviadoPor });
});
