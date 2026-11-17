'use strict';
/**
 * Сборка Windows-приложения (EXE) через @electron/packager.
 * Результат: dist/ChessAssistant-win32-x64/ChessAssistant.exe
 */
const path = require('path');
const packager = require('@electron/packager');

const root = path.resolve(__dirname, '..');

(async () => {
  console.log('Сборка ChessAssistant.exe ...');
  const out = await packager({
    dir: root,
    name: 'ChessAssistant',
    executableName: 'ChessAssistant',
    platform: 'win32',
    arch: 'x64',
    out: path.join(root, 'dist'),
    overwrite: true,
    prune: true,
    asar: false, // движок Stockfish запускается как отдельный процесс из файлов
    ignore: [
      /^\/dist($|\/)/,
      /^\/test($|\/)/,
      /^\/tools($|\/)/,
      /^\/README\.md$/,
      /\.bat$/i,
      /^\/\.git/,
    ],
  });
  console.log('\nГотово! Папка с программой:');
  out.forEach((p) => console.log('  ' + p));
  console.log('\nЗапускайте: ChessAssistant.exe');
})().catch((e) => {
  console.error('\nОШИБКА СБОРКИ:', e && e.message ? e.message : e);
  process.exit(1);
});
