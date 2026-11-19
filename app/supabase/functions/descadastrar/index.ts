// Descadastro de e-mails. Duas portas, as duas sem login ("Verify JWT" desligado ao publicar):
// - a página app/descadastro.html chama com { c, e, t } no corpo, depois que a pessoa confirma;
// - o botão "Cancelar inscrição" do Gmail/Yahoo faz POST com ?c=&e=&t= no endereço (List-Unsubscribe-Post, um clique).
// A assinatura t (HMAC do cliente + e-mail) impede descadastrar outras pessoas.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

async function assinatura(segredo: string, texto: string) {
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(texto)));
  return Array.from(sig.slice(0, 16)).map((b) => b.toString(16).padStart(2, '0')).join('');
}
// Compara sem revelar pelo tempo de resposta onde está a primeira diferença
function iguais(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return resposta({ erro: 'Use o botão da página de descadastro.' }, 405);
  const q = new URL(req.url).searchParams;
  const corpo = q.get('t') ? {} : await req.json().catch(() => ({}));
  const c = String(q.get('c') ?? corpo.c ?? '');
  const e = String(q.get('e') ?? corpo.e ?? '').trim().toLowerCase();
  const t = String(q.get('t') ?? corpo.t ?? '');
  if (!c || !e || !t) return resposta({ erro: 'Link incompleto.' }, 400);
  if (!/^[0-9a-f-]{36}$/i.test(c) || e.length > 320 || !/^[0-9a-f]{32}$/.test(t)) return resposta({ erro: 'Link inválido.' }, 403);
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  // DESCADASTRO_SEGREDO é o recomendado; sem ele vale a chave de serviço, para os links já enviados continuarem valendo
  const esperado = await assinatura(Deno.env.get('DESCADASTRO_SEGREDO') || servico, c + ':' + e);
  if (!iguais(esperado, t)) return resposta({ erro: 'Link inválido.' }, 403);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, servico);
  const { error } = await sb.from('descadastros').upsert({ cliente_id: c, email: e }, { onConflict: 'cliente_id,email' });
  if (error) return resposta({ erro: 'Não foi possível registrar agora. Tente de novo.' }, 500);
  return resposta({ ok: true });
});
