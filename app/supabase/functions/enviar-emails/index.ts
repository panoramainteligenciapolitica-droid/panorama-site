// Envio de e-mails em massa pelo Resend (resend.com), a partir de uma campanha do app (relgov.sql).
// Corpo: { campanha_id, teste?: true }. Com teste, manda só para o e-mail de quem pediu.
// Segredos (Edge Functions > Secrets): RESEND_API_KEY e EMAIL_REMETENTE (ex.: contato@panoramaip.com.br,
// de um domínio verificado no Resend). Opcional: DESCADASTRO_SEGREDO (senão usa a chave de serviço).
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
const PAGINA_DESCADASTRO = 'https://panoramaip.com.br/app/descadastro.html';

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

  const chaveResend = Deno.env.get('RESEND_API_KEY');
  const remetente = Deno.env.get('EMAIL_REMETENTE');
  if (!chaveResend || !remetente) return resposta({ erro: 'O envio de e-mails ainda não foi configurado (faltam RESEND_API_KEY e EMAIL_REMETENTE nos segredos das funções).' }, 503);
  const segredo = Deno.env.get('DESCADASTRO_SEGREDO') || servico;

  const corpoReq = await req.json().catch(() => ({}));
  const { data: camp } = await sb.from('campanhas_email').select('*').eq('id', String(corpoReq.campanha_id ?? '')).maybeSingle();
  if (!camp) return resposta({ erro: 'Campanha não encontrada.' }, 404);
  const { data: pode } = await comoQuemChama.rpc('pode_enviar', { cliente: camp.cliente_id });
  if (!pode) return resposta({ erro: 'Você não tem permissão para enviar e-mails deste cliente.' }, 403);

  const { data: cliente } = await sb.from('clientes').select('nome').eq('id', camp.cliente_id).maybeSingle();
  const de = (camp.remetente_nome ? camp.remetente_nome.replace(/[<>"]/g, '') + ' ' : '') + '<' + remetente + '>';

  async function montar(m: { nome?: string | null; tratamento?: string | null; email: string }) {
    const t = await assinatura(segredo, camp.cliente_id + ':' + m.email.toLowerCase());
    const link = PAGINA_DESCADASTRO + '?c=' + camp.cliente_id + '&e=' + encodeURIComponent(m.email) + '&t=' + t;
    const rodape = 'Você recebeu este e-mail de ' + escapar(camp.remetente_nome || cliente?.nome || 'Panorama') +
      '. <a href="' + link + '">Não quero mais receber estes e-mails</a>.';
    const texto = preencher(camp.corpo, m);
    return {
      from: de, to: [m.email], subject: preencher(camp.assunto, m),
      html: html(texto, rodape), text: texto + '\n\n--\nPara não receber mais: ' + link,
      reply_to: camp.responder_para || undefined,
      headers: { 'List-Unsubscribe': '<' + link + '>' },
    };
  }
  async function mandar(lote: unknown[]) {
    const r = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST', headers: { Authorization: 'Bearer ' + chaveResend, 'Content-Type': 'application/json' }, body: JSON.stringify(lote),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j?.message || ('Resend respondeu ' + r.status));
    return (j?.data || []) as { id: string }[];
  }

  // Teste: só para quem pediu
  if (corpoReq.teste) {
    try {
      await mandar([await montar({ nome: 'Teste', tratamento: '', email: quem.user.email! })]);
      return resposta({ ok: true, teste: quem.user.email });
    } catch (e) { return resposta({ erro: String((e as Error).message) }, 502); }
  }
  if (!camp.lista_id) return resposta({ erro: 'Escolha a lista de destinatários.' }, 400);

  // Destinatários: membros da lista, sem repetidos, sem descadastrados e sem quem já recebeu esta campanha
  const [{ data: membros }, { data: fora }, { data: feitos }] = await Promise.all([
    sb.from('lista_membros').select('nome, email, tratamento').eq('lista_id', camp.lista_id).limit(20000),
    sb.from('descadastros').select('email').eq('cliente_id', camp.cliente_id).limit(50000),
    sb.from('envios_email').select('email').eq('campanha_id', camp.id).eq('status', 'enviado').limit(50000),
  ]);
  const pular = new Set([...(fora || []), ...(feitos || [])].map((x) => x.email.toLowerCase()));
  const vistos = new Set<string>();
  const fila = (membros || []).filter((m) => {
    const e = m.email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) || pular.has(e) || vistos.has(e)) return false;
    vistos.add(e); return true;
  });
  const total = fila.length + (feitos || []).length;
  await sb.from('campanhas_email').update({ status: 'enviando', total }).eq('id', camp.id);

  let enviados = (feitos || []).length, falhas = 0, i = 0;
  for (; i < fila.length; i += LOTE) {
    if (Date.now() - inicio > LIMITE_MS) break;
    const parte = fila.slice(i, i + LOTE);
    try {
      const ids = await mandar(await Promise.all(parte.map(montar)));
      enviados += parte.length;
      await sb.from('envios_email').insert(parte.map((m, k) => ({
        campanha_id: camp.id, cliente_id: camp.cliente_id, email: m.email, nome: m.nome, status: 'enviado', id_provedor: ids[k]?.id ?? null,
      })));
    } catch (e) {
      falhas += parte.length;
      await sb.from('envios_email').insert(parte.map((m) => ({
        campanha_id: camp.id, cliente_id: camp.cliente_id, email: m.email, nome: m.nome, status: 'falha', erro: String((e as Error).message).slice(0, 500),
      })));
    }
  }
  const terminou = i >= fila.length;
  const status = terminou ? (enviados === 0 && falhas > 0 ? 'erro' : 'enviada') : 'parcial';
  await sb.from('campanhas_email').update({ status, enviados, falhas, enviado_em: new Date().toISOString() }).eq('id', camp.id);
  return resposta({ ok: true, status, total, enviados, falhas, restantes: Math.max(0, fila.length - i) });
});
