# Panorama RelGov para Windows

Programa instalável (Electron) que abre o app de `panoramaip.com.br/app` numa janela própria, com menu nativo por seções
(Legislativo, Parlamentares, Relacionamento, Comunicação, Relatórios), atalhos de teclado (Ctrl+1 a Ctrl+7), impressão,
corretor ortográfico em português e atalhos na área de trabalho e no menu Iniciar.

- As novidades do app chegam sozinhas: o programa carrega a versão publicada do site.
- Sem internet na primeira abertura, usa a cópia do app que vai dentro do instalador.
- Links para fora do app abrem no navegador padrão.

## Gerar o instalador

Pelo GitHub (recomendado): Actions > **Programa para Windows** > Run workflow. O instalador sai como Release
(`Panorama-RelGov-Instalador-<versão>.exe`). Ao mudar a versão em `package.json`, rode de novo.

Na própria máquina (Windows, com Node 22):

```
cd desktop
npm install
npm run dist
```

O instalador fica em `desktop/dist`. Para testar sem instalar: `npm start`.

O instalador ainda não tem assinatura digital, então o Windows SmartScreen mostra um aviso na primeira vez
("Mais informações" > "Executar assim mesmo"). Para tirar o aviso, é preciso um certificado de assinatura de código.
