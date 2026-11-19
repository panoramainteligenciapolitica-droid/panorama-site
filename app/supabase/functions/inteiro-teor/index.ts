// Devolve o texto do inteiro teor de uma proposição: acha o PDF na Casa, baixa e extrai o texto.
// Recebe { casa, id_externo, url }. Na Câmara, sem url, pega o link em /proposicoes/{id} (campo urlInteiroTeor).
// Só para quem tem login no app; só baixa das Casas, até 20 MB, conferindo cada redirecionamento.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

const LIMITE_BYTES = 20 * 1024 * 1024;

// Só baixa das Casas, para a função não virar um proxy aberto. O Senado serve os PDFs em legis.senado.gov.br.
const permitido = (u: string) => {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' || x.protocol === 'http:' ? /(^|\.)(camara|senado)\.(leg|gov)\.br$/.test(x.hostname) : false;
  } catch { return false; }
};

// Segue até 5 redirecionamentos, cada um conferido: um redirecionamento aberto numa Casa não leva a outro lugar
async function baixar(inicio: string) {
  let alvo = inicio;
  for (let i = 0; i < 6; i++) {
    if (!permitido(alvo)) return null;
    const r = await fetch(alvo, { redirect: 'manual', signal: AbortSignal.timeout(25_000) });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
      alvo = new URL(r.headers.get('location')!, alvo).href;
      continue;
    }
    return { r, alvo };
  }
  return null;
}

// Lê o corpo até o limite; acima dele desiste (um PDF gigante esgotaria a memória da função)
async function lerAte(r: Response, limite: number) {
  if (Number(r.headers.get('content-length') ?? 0) > limite) return null;
  const leitor = r.body?.getReader();
  if (!leitor) return null;
  const partes: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > limite) { await leitor.cancel(); return null; }
    partes.push(value);
  }
  const tudo = new Uint8Array(total);
  let pos = 0;
  for (const p of partes) { tudo.set(p, pos); pos += p.length; }
  return tudo;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  const comoQuemChama = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  });
  const { data: quem } = await comoQuemChama.auth.getUser();
  if (!quem?.user) return resposta({ erro: 'Entre de novo no app.' }, 401);

  const { casa, id_externo, url } = await req.json().catch(() => ({}));
  let alvo: string | undefined = typeof url === 'string' && url ? url : undefined;

  if (!alvo && casa === 'CD' && typeof id_externo === 'string' && /^CD:\d+$/.test(id_externo)) {
    const r = await fetch(`https://dadosabertos.camara.leg.br/api/v2/proposicoes/${id_externo.slice(3)}`, { headers: { Accept: 'application/json' } });
    if (r.ok) alvo = (await r.json()).dados?.urlInteiroTeor ?? undefined;
  }
  if (!alvo) return resposta({ texto: '', url: '' });
  if (!permitido(alvo)) return resposta({ erro: 'Link fora da Câmara e do Senado' }, 400);

  try {
    const baixado = await baixar(alvo);
    if (!baixado) return resposta({ erro: 'Link fora da Câmara e do Senado' }, 400);
    const { r: pdf, alvo: final } = baixado;
    if (!pdf.ok) return resposta({ texto: '', url: alvo });
    if (!(pdf.headers.get('content-type') ?? '').includes('pdf')) return resposta({ texto: '', url: final });
    const bytes = await lerAte(pdf, LIMITE_BYTES);
    if (!bytes) return resposta({ texto: '', url: final, aviso: 'PDF grande demais para extrair o texto. Abra o PDF oficial.' });
    const doc = await getDocumentProxy(bytes);
    const { text } = await extractText(doc, { mergePages: true });
    const texto = String(text).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return resposta({ texto, url: final });
  } catch {
    return resposta({ texto: '', url: alvo });
  }
});
