// Descadastro de e-mails: a página app/descadastro.html chama esta função com { c, e, t } do link do rodapé.
// Publique com "Verify JWT" desligado: quem clica no link não tem login. A assinatura t impede descadastrar outros.
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const corpo = await req.json().catch(() => ({}));
  const c = String(corpo.c ?? ''), e = String(corpo.e ?? '').trim().toLowerCase(), t = String(corpo.t ?? '');
  if (!c || !e || !t) return resposta({ erro: 'Link incompleto.' }, 400);
  const servico = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const esperado = await assinatura(Deno.env.get('DESCADASTRO_SEGREDO') || servico, c + ':' + e);
  if (esperado !== t) return resposta({ erro: 'Link inválido.' }, 403);
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, servico);
  const { error } = await sb.from('descadastros').upsert({ cliente_id: c, email: e }, { onConflict: 'cliente_id,email' });
  if (error) return resposta({ erro: 'Não foi possível registrar agora. Tente de novo.' }, 500);
  return resposta({ ok: true });
});
