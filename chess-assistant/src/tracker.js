'use strict';
/**
 * Отслеживает партию по распознанным расстановкам.
 * Из изменений на доске восстанавливает сделанные ходы, поэтому знает,
 * чей сейчас ход, а также права на рокировку и взятие на проходе.
 */
const { Chess } = require('chess.js');

const START_PLACEMENT = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';

function placementOf(chess) {
  return chess.fen().split(' ')[0];
}

function inferCastling(placement) {
  const rows = placement.split('/');
  const expand = (row) => row.replace(/\d/g, (d) => '.'.repeat(+d));
  const r8 = expand(rows[0]), r1 = expand(rows[7]);
  let s = '';
  if (r1[4] === 'K' && r1[7] === 'R') s += 'K';
  if (r1[4] === 'K' && r1[0] === 'R') s += 'Q';
  if (r8[4] === 'k' && r8[7] === 'r') s += 'k';
  if (r8[4] === 'k' && r8[0] === 'r') s += 'q';
  return s || '-';
}

class Tracker {
  constructor() {
    this.reset();
  }

  reset() {
    this.chess = new Chess();
    this.lastMove = null;
    this.synced = true;
  }

  fen() {
    return this.chess.fen();
  }

  turn() {
    return this.chess.turn();
  }

  gameOver() {
    if (this.chess.isCheckmate()) return { over: true, text: this.chess.turn() === 'w' ? 'Мат: победили чёрные' : 'Мат: победили белые' };
    if (this.chess.isStalemate()) return { over: true, text: 'Пат — ничья' };
    if (this.chess.isDraw()) return { over: true, text: 'Ничья' };
    return { over: false };
  }

  /**
   * @param {string} placement  расстановка фигур (первое поле FEN)
   * @param {'w'|'b'} userColor цвет пользователя (для случая потери синхронизации)
   */
  update(placement, userColor) {
    if (placement === placementOf(this.chess)) return { changed: false };
    if (placement === START_PLACEMENT) {
      this.reset();
      return { changed: true, kind: 'newgame' };
    }
    const c = this.chess;

    // один полуход
    for (const m of c.moves({ verbose: true })) {
      c.move({ from: m.from, to: m.to, promotion: m.promotion });
      if (placementOf(c) === placement) {
        this.lastMove = m.san;
        this.synced = true;
        return { changed: true, kind: 'move', san: m.san };
      }
      c.undo();
    }
    // два полухода (пропущена промежуточная позиция)
    for (const m1 of c.moves({ verbose: true })) {
      c.move({ from: m1.from, to: m1.to, promotion: m1.promotion });
      for (const m2 of c.moves({ verbose: true })) {
        c.move({ from: m2.from, to: m2.to, promotion: m2.promotion });
        if (placementOf(c) === placement) {
          this.lastMove = m2.san;
          this.synced = true;
          return { changed: true, kind: 'move2', san: m2.san };
        }
        c.undo();
      }
      c.undo();
    }

    // потеряли синхронизацию — строим позицию с нуля, считая что ход пользователя
    const castling = inferCastling(placement);
    try {
      const fen = `${placement} ${userColor} ${castling} - 0 1`;
      const test = new Chess(fen);
      const other = new Chess(`${placement} ${userColor === 'w' ? 'b' : 'w'} ${castling} - 0 1`);
      if (other.inCheck()) return { changed: false, invalid: true }; // нелегальная позиция
      this.chess = test;
      this.synced = false;
      this.lastMove = null;
      return { changed: true, kind: 'resync' };
    } catch (e) {
      return { changed: false, invalid: true };
    }
  }
}

module.exports = { Tracker, START_PLACEMENT };
