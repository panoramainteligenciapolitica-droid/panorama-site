# Verificações estáticas do app: sintaxe dos scripts, ids usados pelo JS que não existem no HTML,
# arquivos da lista offline (sw.js) e do instalador do Windows, e a CSP cobrindo o Supabase do config.js.
# Uso: python3 testes/estaticos.py      Sai com erro se algo falhar.
import json, os, re, subprocess, sys
R = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'); A = os.path.join(R, 'app'); falhas = 0
def falha(m):
    global falhas; falhas += 1; print('FALHA', m)
scripts = sorted(f for f in os.listdir(A) if f.endswith('.js')) + ['../desktop/main.js', '../desktop/preload.js']
for f in scripts:
    r = subprocess.run(['node', '--check', os.path.join(A, f)], capture_output=True, text=True)
    if r.returncode: falha(f'{f} não compila: {r.stderr.strip().splitlines()[-1]}')
html = open(os.path.join(A, 'index.html')).read()
ids = set(re.findall(r'id="([^"]+)"', html))
for f in scripts:
    for i in sorted(set(re.findall(r"\$\('([a-z0-9-]+)'\)", open(os.path.join(A, f)).read()))):
        if i not in ids and not i.startswith('dfc-'):  # dfc-* são os campos criados pelo formulário em janela
            falha(f'{f} usa #{i}, que não existe em app/index.html')
for u in re.findall(r"^\s+'([^']+)',?$", open(os.path.join(A, 'sw.js')).read(), re.M):
    if u != './' and not os.path.exists(os.path.join(A, u)): falha(f'sw.js guarda {u}, que não existe')
for s in re.findall(r'<script src="([^"]+)"', html):
    if not os.path.exists(os.path.join(A, s)): falha(f'app/index.html carrega {s}, que não existe')
pk = json.load(open(os.path.join(R, 'desktop', 'package.json')))
for f in pk['build']['files']:
    if '*' not in f and not os.path.exists(os.path.join(R, 'desktop', f)): falha(f'instalador lista {f}, que não existe')
url = re.search(r"supabaseUrl:\s*'([^']*)'", open(os.path.join(A, 'config.js')).read()).group(1)
csp = re.search(r'Content-Security-Policy" content="([^"]+)"', html)
if not csp: falha('app/index.html sem Content-Security-Policy')
elif url and url not in csp.group(1): falha(f'a CSP de app/index.html não libera {url} (config.js)')
if re.search(r'<script>(?!\s*</script>)', html): falha('app/index.html tem script embutido, que a CSP bloqueia')
for f in scripts:
    t = open(os.path.join(A, f)).read()
    if re.search(r'\.innerHTML\s*=|insertAdjacentHTML|document\.write\(', t): falha(f'{f} insere HTML direto (risco de XSS)')
    if re.search(r'service_role|SERVICE_ROLE', t): falha(f'{f} cita a chave de serviço, que nunca pode ir para o navegador')
print('falhas:', falhas); sys.exit(1 if falhas else 0)
