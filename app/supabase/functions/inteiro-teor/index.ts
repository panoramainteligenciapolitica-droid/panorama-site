// Devolve o texto do inteiro teor de uma proposição: acha o PDF na Casa, baixa e extrai o texto.
// Recebe { casa, id_externo, url }. Na Câmara, sem url, pega o link em /proposicoes/{id} (campo urlInteiroTeor).
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Só baixa das Casas, para a função não virar um proxy aberto. O Senado serve os PDFs em legis.senado.gov.br.
const permitido = (u: string) => {
  try { const h = new URL(u).hostname; return /(^|\.)(camara|senado)\.(leg|gov)\.br$/.test(h); } catch { return false; }
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const { casa, id_externo, url } = await req.json().catch(() => ({}));
  let alvo: string | undefined = url || undefined;

  if (!alvo && casa === 'CD' && typeof id_externo === 'string' && id_externo.startsWith('CD:')) {
    const r = await fetch(`https://dadosabertos.camara.leg.br/api/v2/proposicoes/${encodeURIComponent(id_externo.slice(3))}`, { headers: { Accept: 'application/json' } });
    if (r.ok) alvo = (await r.json()).dados?.urlInteiroTeor ?? undefined;
  }
  if (!alvo) return resposta({ texto: '', url: '' });
  if (!permitido(alvo)) return resposta({ erro: 'Link fora da Câmara e do Senado' }, 400);

  const pdf = await fetch(alvo);
  if (!pdf.ok) return resposta({ texto: '', url: alvo });
  if (!(pdf.headers.get('content-type') ?? '').includes('pdf')) return resposta({ texto: '', url: alvo });
  try {
    const doc = await getDocumentProxy(new Uint8Array(await pdf.arrayBuffer()));
    const { text } = await extractText(doc, { mergePages: true });
    const texto = String(text).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    return resposta({ texto, url: alvo });
  } catch {
    return resposta({ texto: '', url: alvo });
  }
});
