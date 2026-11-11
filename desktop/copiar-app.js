// Copia a pasta ../app para app-local, a cópia que vai dentro do instalador e abre sem internet.
'use strict';
const fs = require('fs');
const path = require('path');
const origem = path.join(__dirname, '..', 'app');
const destino = path.join(__dirname, 'app-local');
fs.rmSync(destino, { recursive: true, force: true });
fs.cpSync(origem, destino, { recursive: true, filter: (p) => !p.includes(path.join('app', 'supabase')) });
console.log('App copiado para', destino);
