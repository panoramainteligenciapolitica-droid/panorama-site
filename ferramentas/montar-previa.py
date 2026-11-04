# Monta uma página única do app (CSS e JS embutidos, demonstração ligada) para a prévia no Claude
# Uso: python3 ferramentas/montar-previa.py . saida.html
import re, sys
raiz, saida = sys.argv[1], sys.argv[2]
html = open(raiz + '/app/index.html').read()
css = open(raiz + '/app/app.css').read()
js = ''.join(open(raiz + '/app/' + f).read() + '\n' for f in ['similaridade.js', 'casas.js', 'geral.js', 'proposicoes.js', 'app.js'])
corpo = re.search(r'<body>(.*?)<script src="vendor', html, re.S).group(1)
css = css.replace('.barra { position: sticky; top: 0;', '.barra { position: sticky; top: env(safe-area-inset-top, 0px);')
css = css.replace('padding: calc(env(safe-area-inset-top, 0px) + .7rem)', 'padding: .7rem')
css += '\nbody::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 10; background: var(--navy); }\n'
preludio = ("// Prévia: sem login real e sem menu Compartilhar do sistema (o compartilhar vira copiar link)\n"
            "try { Object.defineProperty(navigator, 'share', { value: undefined, configurable: true }); } catch (e) {}\n"
            "window.PANORAMA_CONFIG = { supabaseUrl: '', supabaseAnonKey: '', demo: true };\n")
pagina = ('<title>App Panorama</title>\n<meta name="claude:viewport-fit-sides" content="cover">\n'
          '<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>\n'
          '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600&display=swap">\n'
          '<style>\n' + css + '</style>\n' + corpo + '<script>\n' + preludio + js.replace("if ('serviceWorker' in navigator)", "if (false)") + '</script>\n')
open(saida, 'w').write(pagina)
