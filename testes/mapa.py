# Confere se o CODEMAP.md acompanha o código: todo arquivo do repositório aparece no mapa (direto ou pela pasta),
# todo caminho citado existe, cada `arquivo#nome` aponta para um id (HTML) ou nome que existe no arquivo,
# e todo painel do app, seção do site, tabela e função do Supabase está no mapa.
# Uso: python3 testes/mapa.py      Sai com erro e diz o que falta atualizar.
import os, re, subprocess, sys
R = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
mapa = open(os.path.join(R, 'CODEMAP.md'), encoding='utf-8').read()
falhas = 0
def falha(m):
    global falhas; falhas += 1; print('FALHA', m)
def ler(c): return open(os.path.join(R, c), encoding='utf-8', errors='ignore').read()

arquivos = subprocess.run(['git', 'ls-files'], cwd=R, capture_output=True, text=True, check=True).stdout.split()
EXT = ('.html', '.js', '.ts', '.sql', '.py', '.sh', '.md', '.css', '.json', '.yml', '.svg', '.webmanifest', '.png', '.jpg', '.webp', '.ico')
citados = {c for c in re.findall(r'`([A-Za-z0-9_./-]+?)(?:#[A-Za-z0-9_-]+)?`', mapa)
           if c in arquivos or c.endswith('/') or c.endswith(EXT)}
pastas = [c for c in citados if c.endswith('/')]

# 1. Todo arquivo versionado está no mapa: código pelo caminho completo; imagens e afins podem ir pela pasta
CODIGO = ('.html', '.js', '.ts', '.sql', '.py', '.sh', '.md', '.css', '.json', '.yml')
for f in arquivos:
    if f == 'CODEMAP.md' or f in citados: continue
    if not f.endswith(CODIGO) and any(f.startswith(p) for p in pastas): continue
    falha(f'{f} não está no CODEMAP.md' + (' (cite o caminho completo)' if f.endswith(CODIGO) else ' (cite o arquivo ou a pasta dele)'))

# 2. Caminhos citados existem (nomes soltos como `sw.js` valem se existirem em alguma pasta)
for c in sorted(citados):
    if os.path.exists(os.path.join(R, c)): continue
    if '/' not in c.rstrip('/') and any(os.path.basename(f) == c for f in arquivos): continue
    falha(f'o mapa cita {c}, que não existe')

# 3. Âncoras: arquivo.html#id precisa do id; nos outros, o nome precisa aparecer no arquivo
for c, nome in sorted(set(re.findall(r'`([A-Za-z0-9_./-]+)#([A-Za-z0-9_-]+)`', mapa))):
    if not os.path.exists(os.path.join(R, c)): continue
    t = ler(c)
    ok = (f'id="{nome}"' in t) if c.endswith('.html') else re.search(r'\b' + re.escape(nome) + r'\b', t)
    if not ok: falha(f'o mapa aponta {c}#{nome}, que não existe mais')

# 4. O que é novo no código precisa entrar no mapa
for p in re.findall(r'id="(painel-[a-z]+)"', ler('app/index.html')):
    if f'app/index.html#{p}' not in mapa: falha(f'painel {p} do app não está no mapa')
for s in re.findall(r'<section[^>]*id="([a-z-]+)"', ler('index.html')):
    if f'index.html#{s}' not in mapa: falha(f'seção #{s} do site não está no mapa')
for f in arquivos:
    if f.startswith('app/supabase/') and f.endswith('.sql'):
        for n in re.findall(r'create (?:table(?: if not exists)?|or replace function) public\.([a-z_]+)', ler(f), re.I):
            if not re.search(r'\b' + n + r'\b', mapa): falha(f'{n} ({f}) não está no mapa')
for f in arquivos:
    if f.startswith('app/') and f.endswith('.js') and f.count('/') == 1 and f'`{f}' not in mapa:
        falha(f'módulo {f} não está no mapa')

print('falhas:', falhas); sys.exit(1 if falhas else 0)
