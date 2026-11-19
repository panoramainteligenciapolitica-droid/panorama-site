// Avisos da equipe: notificação no celular e no computador (Web Push) e resumo diário por e-mail.
// Ações (corpo JSON):
//  - { acao: "chave-publica" }  o app pede a chave para inscrever o aparelho (cria o par VAPID na primeira vez)
//  - { acao: "testar" }         manda uma notificação de teste para os aparelhos de quem pediu
//  - { acao: "notificar" }      a cada 15 minutos (melhorias.sql): manda os avisos novos para os aparelhos de quem vê o cliente
//  - { acao: "resumo" }         todo dia às 8h: avisa tarefas que vencem, prepara o relatório mensal (dia 1) e manda o
//                               resumo do dia por e-mail pelo Resend (segredos RESEND_API_KEY e EMAIL_REMETENTE)
// As chaves VAPID ficam na tabela config_servidor, que só o servidor lê. Nada a configurar à mão.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const resposta = (corpo: unknown, status = 200) =>
  new Response(JSON.stringify(corpo), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
const APP = 'https://panoramaip.com.br/app/';

// ---------- Web Push sem biblioteca (RFC 8291 aes128gcm + VAPID RFC 8292), só com WebCrypto ----------
const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = (t: string) => Uint8Array.from(atob(t.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((t.length + 3) % 4)), (c) => c.charCodeAt(0));
const juntar = (...partes: Uint8Array[]) => { const r = new Uint8Array(partes.reduce((n, p) => n + p.length, 0)); let i = 0; for (const p of partes) { r.set(p, i); i += p.length; } return r; };
const txt = (t: string) => new TextEncoder().encode(t);
async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const k = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, k, bytes * 8));
}
type Vapid = { publica: string; privada: JsonWebKey; assunto: string };
async function gerarVapid(assunto: string): Promise<Vapid> {
  const par = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
  const publica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  return { publica: b64u(publica), privada: await crypto.subtle.exportKey('jwk', par.privateKey), assunto };
}
async function cabecalhoVapid(endpoint: string, v: Vapid) {
  const chave = await crypto.subtle.importKey('jwk', v.privada, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const corpo = b64u(txt(JSON.stringify({ typ: 'JWT', alg: 'ES256' }))) + '.' +
    b64u(txt(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: v.assunto })));
  const assinatura = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, chave, txt(corpo)));
  return `vapid t=${corpo}.${b64u(assinatura)}, k=${v.publica}`;
}
async function cifrar(p256dh: string, auth: string, mensagem: Uint8Array) {
  const uaPublica = deB64u(p256dh), segredo = deB64u(auth);
  const par = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']) as CryptoKeyPair;
  const asPublica = new Uint8Array(await crypto.subtle.exportKey('raw', par.publicKey));
  const chaveUa = await crypto.subtle.importKey('raw', uaPublica, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: chaveUa }, par.privateKey, 256));
  const ikm = await hkdf(segredo, ecdh, juntar(txt('WebPush: info\0'), uaPublica, asPublica), 32);
  const sal = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(sal, ikm, txt('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, txt('Content-Encoding: nonce\0'), 12);
  const chave = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, chave, juntar(mensagem, new Uint8Array([2]))));
  const rs = new Uint8Array([0, 0, 16, 0]);
  return juntar(sal, rs, new Uint8Array([asPublica.length]), asPublica, cifrado);
}
// Devolve o status HTTP do serviço de push (201 = entregue; 404/410 = inscrição vencida, pode apagar)
async function enviarPush(insc: { endpoint: string; p256dh: string; auth: string }, dados: unknown, v: Vapid) {
  const corpo = await cifrar(insc.p256dh, insc.auth, txt(JSON.stringify(dados)));
  const r = await fetch(insc.endpoint, {
    method: 'POST', body: corpo,
    headers: { Authorization: await cabecalhoVapid(insc.endpoint, v), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal' },
  });
  return r.status;
}


const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

async function vapid(): Promise<Vapid> {
  const { data } = await sb.from('config_servidor').select('valor').eq('chave', 'vapid').maybeSingle();
  if (data?.valor) return JSON.parse(data.valor);
  const novo = await gerarVapid(APP);
  const { error } = await sb.from('config_servidor').insert({ chave: 'vapid', valor: JSON.stringify(novo) });
  if (error) { // outra chamada criou ao mesmo tempo: usa a dela
    const { data: d2 } = await sb.from('config_servidor').select('valor').eq('chave', 'vapid').single();
    return JSON.parse(d2!.valor);
  }
  return novo;
}

// Quem vê cada cliente: master, coordenadores da organização e atendimentos liberados
type Pessoa = { user_id: string; email: string | null; nome: string | null; papel: string; organizacao_id: string | null; aviso_email: boolean; aviso_push: boolean; resumo_enviado_em: string | null };
async function equipe() {
  const [p, a, c] = await Promise.all([
    sb.from('perfis').select('user_id, email, nome, papel, organizacao_id, aviso_email, aviso_push, resumo_enviado_em'),
    sb.from('acessos').select('user_id, cliente_id'),
    sb.from('clientes').select('id, nome, organizacao_id, relatorio_lista_id'),
  ]);
  if (p.error) throw p.error;
  const pessoas = (p.data ?? []) as Pessoa[], acessos = a.data ?? [], clientes = c.data ?? [];
  const veem = (clienteId: string) => {
    const cli = clientes.find((x: any) => x.id === clienteId);
    return pessoas.filter((x) => x.papel === 'master' || (x.papel === 'coordenador' && cli && x.organizacao_id === cli.organizacao_id) ||
      acessos.some((y: any) => y.user_id === x.user_id && y.cliente_id === clienteId));
  };
  const clientesDe = (x: Pessoa) => clientes.filter((c: any) => veem(c.id).some((y) => y.user_id === x.user_id));
  return { pessoas, clientes, veem, clientesDe };
}

async function pushPara(userIds: string[], dados: Record<string, unknown>, v: Vapid) {
  if (!userIds.length) return { enviados: 0, falhas: 0 };
  const { data: inscs } = await sb.from('push_inscricoes').select('endpoint, p256dh, auth, user_id').in('user_id', userIds);
  let enviados = 0, falhas = 0;
  await Promise.all((inscs ?? []).map(async (i: any) => {
    try {
      const st = await enviarPush(i, dados, v);
      if (st === 404 || st === 410) await sb.from('push_inscricoes').delete().eq('endpoint', i.endpoint);
      if (st >= 200 && st < 300) enviados++; else falhas++;
    } catch { falhas++; }
  }));
  return { enviados, falhas };
}

async function notificar() {
  const v = await vapid();
  const desde = new Date(Date.now() - 864e5).toISOString();
  const { data: avisos, error } = await sb.from('avisos').select('id, cliente_id, user_id, titulo, texto, link, tipo')
    .eq('push_enviado', false).gte('criado_em', desde).order('criado_em').limit(200);
  if (error) throw error;
  if (!avisos?.length) return { avisos: 0 };
  const { pessoas, clientes, veem } = await equipe();
  let enviados = 0;
  for (const a of avisos) {
    const alvo = (a.user_id ? pessoas.filter((p) => p.user_id === a.user_id) : a.cliente_id ? veem(a.cliente_id) : pessoas).filter((p) => p.aviso_push !== false);
    const cli = clientes.find((c: any) => c.id === a.cliente_id);
    const r = await pushPara(alvo.map((p) => p.user_id), {
      titulo: a.titulo, texto: (cli ? cli.nome + ': ' : '') + String(a.texto ?? '').split('\n')[0].slice(0, 180),
      link: a.link ? APP + a.link : APP + '?secao=avisos', cliente_id: a.cliente_id, tag: a.id,
    }, v);
    enviados += r.enviados;
  }
  await sb.from('avisos').update({ push_enviado: true }).in('id', avisos.map((a: any) => a.id));
  return { avisos: avisos.length, enviados };
}

const dataBr = (iso: string) => { const [a, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${a}`; };
const hojeSp = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10);
const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Tarefas que vencem hoje ou amanhã, para o responsável (uma vez por dia)
async function avisarTarefas() {
  const hoje = hojeSp(), amanha = new Date(Date.parse(hoje) + 864e5).toISOString().slice(0, 10);
  const { data: tarefas } = await sb.from('tarefas').select('id, cliente_id, titulo, prazo, responsavel_id, proposicao_id')
    .neq('status', 'feita').not('responsavel_id', 'is', null).lte('prazo', amanha).gte('prazo', hoje);
  let n = 0;
  for (const t of tarefas ?? []) {
    const { error } = await sb.from('avisos').insert({
      cliente_id: t.cliente_id, user_id: t.responsavel_id, tipo: 'tarefa', link: '?secao=tarefas',
      titulo: `Prazo ${t.prazo === hoje ? 'hoje' : 'amanhã'}: ${t.titulo}`, texto: `Tarefa sua com prazo em ${dataBr(t.prazo)}.`,
    });
    if (!error) n++;
  }
  return n;
}

// Dia 1: rascunho do relatório do mês anterior para a lista escolhida do cliente (alguém revisa e envia em Envio de e-mails)
async function relatorioMensal(clientes: any[]) {
  const hoje = hojeSp();
  if (!hoje.endsWith('-01')) return 0;
  const ini = new Date(Date.parse(hoje) - 864e5); ini.setUTCDate(1);
  const de = ini.toISOString().slice(0, 10), ate = new Date(Date.parse(hoje) - 864e5).toISOString().slice(0, 10);
  const mes = ini.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  let n = 0;
  for (const c of clientes.filter((x: any) => x.relatorio_lista_id)) {
    const [props, inter, tarefas, alertas] = await Promise.all([
      sb.from('proposicoes').select('sigla, numero, ano, casa, ementa, situacao, prioridade, ultima_tramitacao_em').eq('cliente_id', c.id),
      sb.from('interacoes').select('quando, assunto, tipo').eq('cliente_id', c.id).gte('quando', de).lte('quando', ate + 'T23:59:59'),
      sb.from('tarefas').select('titulo, concluida_em').eq('cliente_id', c.id).gte('concluida_em', de).lte('concluida_em', ate + 'T23:59:59'),
      sb.from('alertas').select('titulo, publicado_em').eq('cliente_id', c.id).gte('publicado_em', de).lte('publicado_em', ate + 'T23:59:59'),
    ]);
    const p = props.data ?? [];
    const andaram = p.filter((x: any) => x.ultima_tramitacao_em && x.ultima_tramitacao_em.slice(0, 10) >= de);
    const linhas = [
      `Olá, {{primeiro_nome}}.`, '', `Segue o resumo do acompanhamento de ${c.nome} em ${mes}.`, '',
      `Proposições monitoradas: ${p.length}. Tiveram movimentação no mês: ${andaram.length}.`,
      ...andaram.slice(0, 20).map((x: any) => `- ${x.sigla} ${x.numero}/${x.ano} (${x.casa === 'CD' ? 'Câmara' : 'Senado'}): ${x.situacao ?? ''}`), '',
      `Reuniões e interações: ${(inter.data ?? []).length}.`,
      ...(inter.data ?? []).slice(0, 15).map((x: any) => `- ${dataBr(x.quando)}: ${x.assunto}`), '',
      `Entregas concluídas: ${(tarefas.data ?? []).length}.`,
      ...(tarefas.data ?? []).slice(0, 15).map((x: any) => `- ${x.titulo}`), '',
      `Alertas publicados: ${(alertas.data ?? []).length}.`,
      ...(alertas.data ?? []).slice(0, 15).map((x: any) => `- ${dataBr(x.publicado_em)}: ${x.titulo}`), '',
      'Ficamos à disposição.', '[assinatura]',
    ];
    const { data: camp, error } = await sb.from('campanhas_email').insert({
      cliente_id: c.id, lista_id: c.relatorio_lista_id, status: 'rascunho', remetente_nome: c.nome,
      assunto: `Relatório de relações governamentais · ${c.nome} · ${mes}`, corpo: linhas.join('\n'),
    }).select('id').single();
    if (error) continue;
    await sb.from('avisos').insert({ cliente_id: c.id, tipo: 'relatorio', link: '?secao=emails',
      titulo: `Relatório de ${mes} pronto para revisar`, texto: `O rascunho do relatório mensal de ${c.nome} está em Envio de e-mails. Revise e envie.` });
    if (camp) n++;
  }
  return n;
}

async function resumo() {
  const tarefas = await avisarTarefas();
  const { pessoas, clientes, clientesDe } = await equipe();
  const relatorios = await relatorioMensal(clientes);
  const chave = Deno.env.get('RESEND_API_KEY'), remetente = Deno.env.get('EMAIL_REMETENTE');
  if (!chave || !remetente) return { tarefas, relatorios, emails: 0, aviso: 'Resend não configurado: resumo por e-mail não enviado' };
  const hoje = hojeSp(), desde = new Date(Date.now() - 864e5).toISOString();
  let emails = 0;
  for (const p of pessoas.filter((x) => x.aviso_email !== false && x.email && x.resumo_enviado_em !== hoje)) {
    const meus = clientesDe(p).map((c: any) => c.id);
    if (!meus.length) continue;
    const [av, ta] = await Promise.all([
      sb.from('avisos').select('cliente_id, titulo, texto, link, user_id').in('cliente_id', meus).gte('criado_em', desde).order('criado_em', { ascending: false }).limit(200),
      sb.from('tarefas').select('cliente_id, titulo, prazo').neq('status', 'feita').eq('responsavel_id', p.user_id).lte('prazo', new Date(Date.parse(hoje) + 7 * 864e5).toISOString().slice(0, 10)).order('prazo'),
    ]);
    const avisos = (av.data ?? []).filter((a: any) => !a.user_id || a.user_id === p.user_id);
    const minhas = ta.data ?? [];
    if (!avisos.length && !minhas.length) continue;
    const nomeCli = (id: string) => clientes.find((c: any) => c.id === id)?.nome ?? '';
    const porCliente = new Map<string, any[]>();
    avisos.forEach((a: any) => porCliente.set(a.cliente_id, [...(porCliente.get(a.cliente_id) ?? []), a]));
    let html = `<p>Bom dia${p.nome ? ', ' + esc(p.nome.split(' ')[0]) : ''}. O que mudou nas últimas 24 horas:</p>`;
    let texto = 'O que mudou nas últimas 24 horas:\n';
    porCliente.forEach((lista, cid) => {
      html += `<h3 style="margin:18px 0 6px">${esc(nomeCli(cid))}</h3><ul>` + lista.map((a) =>
        `<li><a href="${APP}${esc(a.link ?? '')}">${esc(a.titulo)}</a>${a.texto ? '<br><small>' + esc(String(a.texto).split('\n').slice(0, 3).join(' · ')) + '</small>' : ''}</li>`).join('') + '</ul>';
      texto += `\n${nomeCli(cid)}\n` + lista.map((a) => `- ${a.titulo}`).join('\n') + '\n';
    });
    if (minhas.length) {
      html += '<h3 style="margin:18px 0 6px">Suas tarefas nos próximos 7 dias</h3><ul>' + minhas.map((t: any) =>
        `<li>${esc(t.titulo)} · ${t.prazo < hoje ? '<b style="color:#b42318">atrasada</b>, ' : ''}prazo ${dataBr(t.prazo)} · ${esc(nomeCli(t.cliente_id))}</li>`).join('') + '</ul>';
      texto += '\nSuas tarefas nos próximos 7 dias\n' + minhas.map((t: any) => `- ${t.titulo} (prazo ${dataBr(t.prazo)})`).join('\n') + '\n';
    }
    html += `<p style="color:#667085;font-size:13px">Abra o app: <a href="${APP}?secao=avisos">${APP}</a>. Para deixar de receber este resumo, desligue em Configurações &gt; Minha conta &gt; Avisos.</p>`;
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: `Panorama RelGov <${remetente}>`, to: [p.email], subject: `Resumo do dia · ${dataBr(hoje)}`, html, text: texto }),
    });
    if (r.ok) { emails++; await sb.from('perfis').update({ resumo_enviado_em: hoje }).eq('user_id', p.user_id); }
  }
  return { tarefas, relatorios, emails };
}

// Chamada do agendamento: cabeçalho x-coleta-segredo igual ao segredo do Vault (o mesmo da coleta, veja agendamento.sql)
// ou a COLETA_SEGREDO dos segredos das funções. A chave pública (anon) sozinha não basta.
function iguais(a: string, b: string) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return dif === 0;
}
// deno-lint-ignore no-explicit-any
async function doAgendamento(req: Request, sb: any) {
  const enviado = req.headers.get('x-coleta-segredo') ?? '';
  if (!enviado) return false;
  let segredo = Deno.env.get('COLETA_SEGREDO') ?? '';
  if (!segredo) segredo = String((await sb.rpc('segredo_coleta')).data ?? '');
  return segredo.length >= 16 && iguais(enviado, segredo);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const corpo = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  try {
    if (corpo.acao === 'chave-publica') return resposta({ chave: (await vapid()).publica });
    if (corpo.acao === 'testar') {
      const usuario = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });
      const { data: { user } } = await usuario.auth.getUser();
      if (!user) return resposta({ erro: 'Entre no app para testar' }, 401);
      const r = await pushPara([user.id], { titulo: 'Notificações ligadas', texto: 'Este aparelho vai receber os avisos do Panorama RelGov.', link: APP + '?secao=avisos', tag: 'teste' }, await vapid());
      return resposta(r);
    }
    if ((corpo.acao === 'notificar' || corpo.acao === 'resumo') && !(await doAgendamento(req, sb))) {
      return resposta({ erro: 'Esta ação só roda pelo agendamento.' }, 403);
    }
    if (corpo.acao === 'notificar') return resposta(await notificar());
    if (corpo.acao === 'resumo') return resposta(await resumo());
    return resposta({ erro: 'Ação desconhecida' }, 400);
  } catch (e) {
    return resposta({ erro: String((e as Error)?.message ?? e) }, 500);
  }
});
