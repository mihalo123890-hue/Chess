'use strict';
/**
 * Стратегии игры поверх Stockfish.
 *
 * Движок выдаёт несколько лучших вариантов (MultiPV). Стратегия выбирает из них
 * тот, который соответствует выбранному стилю, не жертвуя слишком много оценки:
 *
 *  - alien   (Alien Gambit): дебютная книга Alien Gambit (Nxf7!) + агрессивный король-хант,
 *            допускаются жертвы ради быстрого мата.
 *  - fast    (Fast Win)    : любой ценой закончить быстрее — шахи, взятия, размены при перевесе,
 *            приближение к королю соперника, самый короткий мат.
 *  - defense (Strong Defense): атака только при форсированном мате (доказанном движком),
 *            иначе безопасность: рокировка, нет висящих фигур, минимум шахов сопернику.
 */
const { Chess } = require('chess.js');

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };

/* ---------------------------- Книга Alien Gambit ---------------------------- */
const ALIEN_LINES = [
  // Против Каро-Канн: 6.Nxf7!
  'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Ng5 h6 Nxf7 Kxf7 Nf3 Nbd7 Bc4+ e6 Qe2 Nb6 Bb3 Bd6 O-O Re8 Ne5+ Kg8',
  'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Ng5 h6 Nxf7 Kxf7 Nf3 c5 Bc4+ e6',
  'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Ng5 e6 Bd3',
  'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nd7 Ng5 Ngf6 Bd3 e6 N1f3 h6 Nxe6',
  'e4 c6 d4 d5 Nd2 dxe4 Nxe4 Nf6 Ng5 h6 Nxf7 Kxf7 Nf3 Nbd7 Bc4+',
  // Против Скандинавской: Tennison / "Alien" с Bg6+
  'e4 d5 Nf3 dxe4 Ng5 Nf6 d3 exd3 Bxd3 h6 Nxf7 Kxf7 Bg6+ Kxg6 Qxd8',
];

function posKey(fen) {
  return fen.split(' ').slice(0, 3).join(' ');
}

const BOOK = new Map();
(function buildBook() {
  for (const line of ALIEN_LINES) {
    const c = new Chess();
    for (const san of line.split(' ')) {
      const turn = c.turn();
      const key = posKey(c.fen());
      let mv;
      try { mv = c.move(san); } catch (e) { break; }
      if (turn === 'w' && !BOOK.has(key)) BOOK.set(key, { from: mv.from, to: mv.to, promotion: mv.promotion, san: mv.san });
    }
  }
})();

/* ------------------------------- Вспомогательное ------------------------------- */
function scoreOf(c) {
  if (c.mate != null) return c.mate > 0 ? 100000 - c.mate * 100 : -100000 - c.mate * 100;
  return c.cp;
}

function findKing(chess, color) {
  const b = chess.board();
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = b[r][f];
    if (p && p.type === 'k' && p.color === color) return { r, f };
  }
  return null;
}

function sqRF(sq) {
  return { f: sq.charCodeAt(0) - 97, r: 8 - parseInt(sq[1], 10) };
}

function dist(a, b) {
  return Math.max(Math.abs(a.f - b.f), Math.abs(a.r - b.r));
}

/** Характеристики хода (позиция до хода задаётся fen). */
function features(fen, uci) {
  const chess = new Chess(fen);
  const me = chess.turn();
  const opp = me === 'w' ? 'b' : 'w';
  const from = uci.slice(0, 2), to = uci.slice(2, 4);
  const ek = findKing(chess, opp);
  const mk = findKing(chess, me);
  const dBefore = ek ? dist(sqRF(from), { f: ek.f, r: ek.r }) : 4;
  const mv = chess.move({ from, to, promotion: uci[4] });
  const dAfter = ek ? dist(sqRF(to), { f: ek.f, r: ek.r }) : 4;
  const replies = chess.moves();
  const f = {
    san: mv.san,
    piece: mv.piece,
    check: chess.inCheck(),
    capture: !!mv.captured,
    capVal: mv.captured ? VAL[mv.captured] : 0,
    promo: !!mv.promotion,
    castle: mv.isKingsideCastle() || mv.isQueensideCastle(),
    oppMoves: replies.length,
    oppChecks: replies.filter((s) => s.includes('+') || s.includes('#')).length,
    closer: dBefore - dAfter,
    nearKing: dAfter <= 3,
    hang: 0,
    backRankDev: mv.piece !== 'p' && mv.piece !== 'k' && mv.piece !== 'q' && (from[1] === (me === 'w' ? '1' : '8')),
    kingFileNear: false,
  };
  if (mk && mv.piece === 'p') {
    const pf = from.charCodeAt(0) - 97;
    f.kingFileNear = Math.abs(pf - mk.f) <= 1;
  }
  // висящие фигуры после хода (ход соперника)
  const board = chess.board();
  for (let r = 0; r < 8; r++) for (let fl = 0; fl < 8; fl++) {
    const p = board[r][fl];
    if (!p || p.color !== me || p.type === 'k') continue;
    const sq = String.fromCharCode(97 + fl) + (8 - r);
    const att = chess.attackers(sq, opp);
    if (!att.length) continue;
    const def = chess.attackers(sq, me).length;
    let minAtt = 9999;
    for (const a of att) {
      const pc = chess.get(a);
      if (pc) minAtt = Math.min(minAtt, pc.type === 'k' ? 10000 : VAL[pc.type]);
    }
    let pen = 0;
    if (!def) pen = VAL[p.type];
    else if (minAtt < VAL[p.type]) pen = VAL[p.type] - minAtt;
    f.hang = Math.max(f.hang, pen);
  }
  return f;
}

/* --------------------------------- Выбор хода --------------------------------- */
function pickAggressive(fen, cands, mode) {
  const alien = mode === 'alien';
  const bs = scoreOf(cands[0]);
  let tol = alien ? (bs > 400 ? 60 : bs > -150 ? 140 : 90) : (bs > 300 ? 90 : 60);
  const pool = cands.filter((c) => Math.abs(scoreOf(c)) < 50000 && scoreOf(c) >= bs - tol);
  let best = null, bestTotal = -Infinity, bestReason = '';
  for (const c of pool) {
    const f = features(fen, c.uci);
    let total = scoreOf(c);
    const why = [];
    if (f.check) { total += alien ? 65 : 40; why.push('шах'); }
    if (f.capture) {
      total += 20 + f.capVal * 0.08;
      if (bs > 150) { total += 25; why.push('размен при перевесе'); } else why.push('взятие');
    }
    if (f.promo) { total += 80; why.push('превращение пешки'); }
    total += (alien ? 10 : 6) * f.closer;
    if (f.closer > 0) why.push('ближе к королю соперника');
    if (f.check && f.oppMoves <= 6) { total += 40; why.push('у соперника почти нет ответов'); }
    if (alien) {
      if (f.hang >= 200 && (f.check || f.nearKing)) { total += 90; why.push('жертва ради атаки на короля'); }
      if (f.nearKing && (f.piece === 'q' || f.piece === 'n' || f.piece === 'b')) total += 20;
      if (f.castle) total -= 10;
    } else if (f.castle && bs < 100) total += 8;
    if (total > bestTotal) { bestTotal = total; best = { cand: c, f }; bestReason = why.join(', '); }
  }
  if (!best) best = { cand: cands[0], f: null };
  return {
    cand: best.cand,
    reason: (alien ? 'Агрессивная атака' : 'Быстрая победа') + (bestReason ? ': ' + bestReason : ': лучший ход по оценке'),
  };
}

function pickDefense(fen, cands) {
  const bs = scoreOf(cands[0]);
  const pool = cands.filter((c) => Math.abs(scoreOf(c)) < 50000 && scoreOf(c) >= bs - 45);
  let best = null, bestTotal = -Infinity, bestReason = '';
  for (const c of pool) {
    const f = features(fen, c.uci);
    let total = scoreOf(c) * 0.35;
    const why = [];
    total -= f.hang * 0.9;
    total -= f.oppChecks * 10;
    if (f.hang === 0) why.push('фигуры под защитой');
    if (f.castle) { total += 45; why.push('рокировка'); }
    if (f.backRankDev) { total += 12; why.push('развитие'); }
    if (f.capture && bs > 200) { total += 25; why.push('безопасный размен'); }
    if (f.piece === 'k' && !f.castle) total -= 20;
    if (f.kingFileNear) total -= 10;
    if (f.check) total -= 5;
    if (total > bestTotal) { bestTotal = total; best = c; bestReason = why.join(', '); }
  }
  return {
    cand: best || cands[0],
    reason: 'Надёжная защита' + (bestReason ? ': ' + bestReason : ': лучший безопасный ход'),
  };
}

function evalText(c) {
  if (c.mate != null) return c.mate > 0 ? `Мат в ${c.mate}` : `Мат против вас в ${-c.mate}`;
  const v = c.cp / 100;
  return (v > 0 ? '+' : '') + v.toFixed(2);
}

/**
 * Главная функция: возвращает рекомендацию для стороны, чей ход в позиции fen.
 */
async function decide({ fen, strategy, engine, thinkMs }) {
  const probe = new Chess(fen);
  if (probe.isGameOver()) return { gameOver: true };
  const legal = probe.moves().length;

  if (strategy === 'alien') {
    const hit = BOOK.get(posKey(fen));
    if (hit) {
      const san = (() => { const c = new Chess(fen); return c.move(hit).san; })();
      return {
        from: hit.from, to: hit.to, promotion: hit.promotion, san,
        reason: san.startsWith('Nxf7') ? 'Alien Gambit: жертва коня на f7! Король соперника выходит из укрытия' : 'Дебют Alien Gambit (книга)',
        evalText: 'книга', book: true,
      };
    }
  }

  const res = await engine.analyze(fen, { multipv: Math.min(5, legal), movetime: thinkMs });
  let cands = res.candidates.filter((c) => c.uci);
  if (!cands.length && res.best && res.best !== '(none)') cands = [{ uci: res.best, cp: 0, mate: null, pv: [res.best] }];
  if (!cands.length) return { gameOver: true };

  let choice;
  const mates = cands.filter((c) => c.mate != null && c.mate > 0).sort((a, b) => a.mate - b.mate);
  if (mates.length) {
    choice = { cand: mates[0], reason: `Форсированный мат в ${mates[0].mate}!` };
  } else if (strategy === 'defense') choice = pickDefense(fen, cands);
  else choice = pickAggressive(fen, cands, strategy === 'alien' ? 'alien' : 'fast');

  const c = choice.cand;
  const uci = c.uci;
  const sanChess = new Chess(fen);
  const mv = sanChess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  // красивая линия продолжения
  const line = [mv.san];
  for (const u of (c.pv || []).slice(1, 5)) {
    try { line.push(sanChess.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san); } catch (e) { break; }
  }
  return {
    from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4], san: mv.san,
    reason: choice.reason, evalText: evalText(c), depth: c.depth, line: line.join(' '), mate: c.mate,
  };
}

module.exports = { decide, BOOK, posKey, ALIEN_LINES };
