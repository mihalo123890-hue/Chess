'use strict';
/**
 * Самопроверка модулей зрения / отслеживания партии на синтетических "скриншотах".
 * Запуск:  npm test
 */
const { Chess } = require('chess.js');
const vision = require('../src/vision');
const { Tracker } = require('../src/tracker');

const rect = (u, v, x0, y0, x1, y1) => u >= x0 && u <= x1 && v >= y0 && v <= y1;
const circ = (u, v, cx, cy, r) => (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
const SHAPES = {
  p: (u, v) => circ(u, v, 0.5, 0.45, 0.17) || rect(u, v, 0.36, 0.62, 0.64, 0.8),
  n: (u, v) => rect(u, v, 0.3, 0.2, 0.5, 0.8) || rect(u, v, 0.3, 0.2, 0.75, 0.4) || rect(u, v, 0.5, 0.65, 0.7, 0.8),
  b: (u, v) => (((u - 0.5) / 0.12) ** 2 + ((v - 0.45) / 0.25) ** 2 <= 1) || rect(u, v, 0.3, 0.75, 0.7, 0.82),
  r: (u, v) => rect(u, v, 0.3, 0.25, 0.7, 0.8) && !rect(u, v, 0.45, 0.25, 0.55, 0.35),
  q: (u, v) => circ(u, v, 0.5, 0.5, 0.27) || Math.abs(u - 0.5) + Math.abs(v - 0.2) < 0.15,
  k: (u, v) => rect(u, v, 0.45, 0.12, 0.55, 0.85) || rect(u, v, 0.3, 0.3, 0.7, 0.4) || rect(u, v, 0.3, 0.6, 0.7, 0.8),
};

function render(chess, whiteBottom, opts = {}) {
  const cell = opts.cell || 72, margin = 24;
  const W = cell * 8 + margin * 2;
  const img = { w: W, h: W, data: new Uint8Array(W * W * 4) };
  const set = (x, y, c) => { const i = (y * W + x) * 4; img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = 255; };
  const light = [238, 238, 210], dark = [118, 150, 86];
  const board = chess.board();
  const history = chess.history({ verbose: true });
  const last = history[history.length - 1];
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) {
    const bx = x - margin, by = y - margin;
    if (bx < 0 || by < 0 || bx >= cell * 8 || by >= cell * 8) { set(x, y, [49, 46, 43]); continue; }
    const col = Math.floor(bx / cell), row = Math.floor(by / cell);
    const u = (bx % cell) / cell, v = (by % cell) / cell;
    // координаты клетки → шахматные
    const file = whiteBottom ? col : 7 - col;
    const rank = whiteBottom ? 8 - row : row + 1;
    const sq = String.fromCharCode(97 + file) + rank;
    let bg = (row + col) % 2 === 0 ? light : dark;
    if (last && (last.from === sq || last.to === sq)) bg = [205, 210, 106]; // подсветка последнего хода
    let px = bg;
    if (opts.dots && (file + rank) % 5 === 0) if (circ(u, v, 0.5, 0.5, 0.14)) px = [bg[0] * 0.85, bg[1] * 0.85, bg[2] * 0.85];
    const p = board[8 - rank][file];
    if (p) {
      const fn = SHAPES[p.type];
      const inside = (a, b) => fn(a, b);
      if (inside(u, v)) px = p.color === 'w' ? [250, 250, 250] : [60, 60, 60];
      else {
        const d = 0.03;
        if (inside(u + d, v) || inside(u - d, v) || inside(u, v + d) || inside(u, v - d)) px = [20, 20, 20];
      }
    }
    set(x, y, px);
  }
  return img;
}

function assert(c, msg) { if (!c) { console.error('FAIL:', msg); process.exitCode = 1; throw new Error(msg); } }

for (const whiteBottom of [true, false]) {
  const start = new Chess();
  const cal = vision.calibrate(render(start, whiteBottom));
  assert(cal.ok, 'calibrate ok ' + cal.error);
  assert(cal.whiteBottom === whiteBottom, 'orientation detected');
  assert(Math.abs(cal.trim.x - 24) <= 3 && Math.abs(cal.trim.w - 576) <= 6, 'trim ok ' + JSON.stringify(cal.trim));

  // играем случайную партию и читаем каждую позицию
  const game = new Chess();
  const tracker = new Tracker();
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let checked = 0;
  for (let ply = 0; ply < 70 && !game.isGameOver(); ply++) {
    const moves = game.moves();
    game.move(moves[Math.floor(rnd() * moves.length)]);
    const img = render(game, whiteBottom, { dots: true });
    const read = vision.readBoard(img, cal.trim, cal.templates);
    assert(read.visible, `visible at ply ${ply}: unknown=${read.unknown}`);
    const wb = vision.whiteAtBottom(read.grid, true);
    assert(wb === whiteBottom, 'orientation from kings');
    const placement = vision.gridToPlacement(read.grid, wb);
    assert(placement === game.fen().split(' ')[0], `placement mismatch at ply ${ply}\n${placement}\n${game.fen()}`);
    const upd = tracker.update(placement, 'w');
    assert(upd.kind === 'move' || upd.kind === 'resync' || upd.kind === 'newgame', 'tracker update ' + JSON.stringify(upd));
    if (ply < 20) assert(upd.kind === 'move', 'tracker should follow moves, got ' + upd.kind + ' at ply ' + ply);
    checked++;
  }
  console.log(`whiteBottom=${whiteBottom}: ${checked} позиций распознано верно`);
}

// пустая / посторонняя картинка не должна считаться доской
const blank = { w: 400, h: 400, data: new Uint8Array(400 * 400 * 4).fill(120) };
const cal2 = vision.calibrate(blank);
assert(!cal2.ok, 'blank image rejected');

console.log('OK');
