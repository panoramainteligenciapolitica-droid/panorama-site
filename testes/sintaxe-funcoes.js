// Confere a sintaxe TypeScript das funções do Supabase (só sintaxe: os tipos do Deno não estão disponíveis aqui).
// Uso: node testes/sintaxe-funcoes.js app/supabase/functions/*/index.ts   (precisa do pacote typescript instalado)
const ts = require(process.env.TYPESCRIPT || 'typescript'); const fs = require('fs'); let falhas = 0;
for (const f of process.argv.slice(2)) {
  const r = ts.transpileModule(fs.readFileSync(f, 'utf8'), { reportDiagnostics: true, compilerOptions: { target: 'es2022', module: 'esnext' } });
  for (const d of r.diagnostics || []) { falhas++; console.log('FALHA', f, ts.flattenDiagnosticMessageText(d.messageText, ' ')); }
}
console.log('funções com erro de sintaxe:', falhas); process.exit(falhas ? 1 : 0);
