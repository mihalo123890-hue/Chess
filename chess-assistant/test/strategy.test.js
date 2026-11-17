'use strict';
/** Проверка движка и стратегий. Запуск: node test/strategy.test.js */
const path = require('path');
const { Engine } = require('../src/engine');
const { decide, BOOK, ALIEN_LINES } = require('../src/strategy');
const { Chess } = require('chess.js');

(async () => {
  // каждая строка книги должна быть легальной целиком
  for (const line of ALIEN_LINES) {
    const c = new Chess();
    for (const m of line.split(' ')) c.move(m);
  }
  console.log('книга: позиций белых =', BOOK.size);

  const engine = new Engine(path.join(__dirname, '..', 'engine', 'stockfish-19-lite-single.js'));
  await engine.start();
  const start = new Chess().fen();
  const posG = 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4'; // Qxf7#
  for (const s of ['alien', 'fast', 'defense']) {
    const a = await decide({ fen: start, strategy: s, engine, thinkMs: 400 });
    const b = await decide({ fen: posG, strategy: s, engine, thinkMs: 400 });
    console.log(s.padEnd(8), 'старт:', a.san, '|', a.reason, '||', 'мат:', b.san, b.reason);
  }
  const mid = 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 5';
  for (const s of ['alien', 'fast', 'defense']) {
    const a = await decide({ fen: mid, strategy: s, engine, thinkMs: 500 });
    console.log(s.padEnd(8), 'миттельшпиль:', a.san, a.evalText, '|', a.reason, '|', a.line);
  }
  // Alien Gambit по книге
  const c = new Chess();
  for (const m of 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Ng5 h6'.split(' ')) c.move(m);
  const al = await decide({ fen: c.fen(), strategy: 'alien', engine, thinkMs: 300 });
  console.log('Alien после 5...h6:', al.san, al.reason);
  engine.stop();
  setTimeout(() => process.exit(0), 200);
})().catch((e) => { console.error(e); process.exit(1); });
