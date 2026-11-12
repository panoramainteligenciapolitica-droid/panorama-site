// Avisa o app web de que está rodando no programa do Windows (para ajustar a tela e o menu).
'use strict';
const { contextBridge } = require('electron');
contextBridge.exposeInMainWorld('PanoramaDesktop', { windows: process.platform === 'win32', plataforma: process.platform });
