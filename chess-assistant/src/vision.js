'use strict';
/**
 * Компьютерное зрение для шахматной доски.
 *
 * Изображение: { w, h, data } — data = Uint8Array RGBA (4 байта на пиксель).
 *
 * Идея:
 *  1. refineBoard()  — подрезает лишние поля вокруг выделенной области (по цветам клеток).
 *  2. Для каждой клетки определяется цвет фона (медиана по рамке клетки),
 *     после чего "маска фигуры" = пиксели, заметно отличающиеся от фона.
 *  3. calibrate()    — по СТАРТОВОЙ расстановке запоминает, как выглядит каждая фигура
 *     (эталоны по маске формы + яркость), и определяет, кто снизу (белые/чёрные).
 *  4. readBoard()    — сравнивает каждую клетку с эталонами (ближайший сосед).
 */

const G = 24; // размер сетки выборки внутри клетки
const DIFF_T = 46; // порог отличия пикселя от фона (евклид. по RGB)
const EMPTY_COVER = 0.04; // доля маски, ниже которой клетка точно пустая
const DOT_COVER = 0.18; // маленькое компактное пятно в центре (точка возможного хода) — тоже пустая клетка
const DOT_RADIUS = 0.24;
const UNKNOWN_DIST = 0.8; // если расстояние до ближайшего эталона больше — "не знаю"

function idx(img, x, y) {
  x = x < 0 ? 0 : x >= img.w ? img.w - 1 : x | 0;
  y = y < 0 ? 0 : y >= img.h ? img.h - 1 : y | 0;
  return (y * img.w + x) * 4;
}

function median(arr) {
  const t = Uint8Array.from(arr);
  t.sort();
  return t[t.length >> 1];
}

/* ------------------------------------------------------------------ */
/* Подрезка рамки                                                      */
/* ------------------------------------------------------------------ */
function refineBoard(img) {
  const full = { x: 0, y: 0, w: img.w, h: img.h };
  const { w, h, data } = img;
  const buckets = new Map();
  let total = 0;
  for (let y = 0; y < h; y += 2) {
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      let e = buckets.get(key);
      if (!e) { e = [0, 0, 0, 0]; buckets.set(key, e); }
      e[0]++; e[1] += r; e[2] += g; e[3] += b;
      total++;
    }
  }
  const list = [...buckets.values()].sort((a, b) => b[0] - a[0]);
  if (list.length < 2) return full;
  const mean = (e) => [e[1] / e[0], e[2] / e[0], e[3] / e[0]];
  const A = mean(list[0]);
  let Bi = null;
  for (let k = 1; k < Math.min(list.length, 12); k++) {
    const m = mean(list[k]);
    if (Math.hypot(m[0] - A[0], m[1] - A[1], m[2] - A[2]) > 30) { Bi = list[k]; break; }
  }
  if (!Bi) return full;
  const B = mean(Bi);
  if ((list[0][0] + Bi[0]) / total < 0.3) return full; // текстурная доска — не рискуем

  const rowFrac = new Float32Array(h);
  const colFrac = new Float32Array(w);
  const colCnt = new Float32Array(w);
  for (let y = 0; y < h; y++) {
    let ok = 0, n = 0;
    for (let x = 0; x < w; x += 2) {
      const i = (y * w + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      const good =
        Math.hypot(r - A[0], g - A[1], b - A[2]) < 28 ||
        Math.hypot(r - B[0], g - B[1], b - B[2]) < 28;
      n++;
      if (good) { ok++; colFrac[x]++; }
      colCnt[x]++;
    }
    rowFrac[y] = ok / n;
  }
  for (let x = 0; x < w; x += 2) colFrac[x] = colFrac[x] / colCnt[x];

  const maxY = Math.floor(h * 0.15), maxX = Math.floor(w * 0.15);
  let top = 0, bottom = h - 1, left = 0, right = w - 1;
  while (top < maxY && rowFrac[top] < 0.3) top++;
  while (h - 1 - bottom < maxY && rowFrac[bottom] < 0.3) bottom--;
  while (left < maxX && colFrac[left - (left % 2)] < 0.3) left++;
  while (w - 1 - right < maxX && colFrac[right - (right % 2)] < 0.3) right--;
  const res = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  if (res.w < w * 0.6 || res.h < h * 0.6) return full;
  return res;
}

/* ------------------------------------------------------------------ */
/* Признаки клетки                                                     */
/* ------------------------------------------------------------------ */
function cellBackground(img, rect, row, col) {
  const cw = rect.w / 8, ch = rect.h / 8;
  const x0 = rect.x + col * cw, y0 = rect.y + row * ch;
  const R = [], Gc = [], B = [];
  const push = (x, y) => {
    const i = idx(img, x, y);
    R.push(img.data[i]); Gc.push(img.data[i + 1]); B.push(img.data[i + 2]);
  };
  const N = 24;
  for (const ins of [0.07, 0.11]) {
    const a = ins, b = 1 - ins;
    for (let i = 0; i <= N; i++) {
      const t = a + ((b - a) * i) / N;
      push(x0 + t * cw, y0 + a * ch);
      push(x0 + t * cw, y0 + b * ch);
      push(x0 + a * cw, y0 + t * ch);
      push(x0 + b * cw, y0 + t * ch);
    }
  }
  return [median(R), median(Gc), median(B)];
}

function sampleCell(img, rect, row, col) {
  const cw = rect.w / 8, ch = rect.h / 8;
  const x0 = rect.x + col * cw, y0 = rect.y + row * ch;
  const bg = cellBackground(img, rect, row, col);
  const raw = new Uint8Array(G * G);
  const lum = new Float32Array(G * G);
  const q = 0.25 * (0.9 / G);
  for (let gy = 0; gy < G; gy++) {
    const v = 0.05 + (0.9 * (gy + 0.5)) / G;
    for (let gx = 0; gx < G; gx++) {
      const u = 0.05 + (0.9 * (gx + 0.5)) / G;
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < 4; k++) {
        const dx = k & 1 ? q : -q, dy = k & 2 ? q : -q;
        const i = idx(img, x0 + (u + dx) * cw, y0 + (v + dy) * ch);
        r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2];
      }
      r /= 4; g /= 4; b /= 4;
      const p = gy * G + gx;
      lum[p] = 0.299 * r + 0.587 * g + 0.114 * b;
      if (Math.hypot(r - bg[0], g - bg[1], b - bg[2]) > DIFF_T) raw[p] = 1;
    }
  }
  // Заливка внутренностей: силуэт фигуры не должен зависеть от цвета клетки
  // (белая фигура на светлой клетке иначе даёт только контур).
  const outside = new Uint8Array(G * G);
  const stack = [];
  const seed = (x, y) => {
    const p = y * G + x;
    if (!raw[p] && !outside[p]) { outside[p] = 1; stack.push(p); }
  };
  for (let i = 0; i < G; i++) { seed(i, 0); seed(i, G - 1); seed(0, i); seed(G - 1, i); }
  while (stack.length) {
    const p = stack.pop();
    const x = p % G, y = (p / G) | 0;
    if (x > 0) seed(x - 1, y);
    if (x < G - 1) seed(x + 1, y);
    if (y > 0) seed(x, y - 1);
    if (y < G - 1) seed(x, y + 1);
  }
  let mask = new Uint8Array(G * G);
  let cnt = 0;
  for (let p = 0; p < G * G; p++) { mask[p] = outside[p] ? 0 : 1; cnt += mask[p]; }
  if (cnt / (G * G) > 0.75) { // защита от кольца-подсветки по краю клетки
    mask = raw; cnt = 0;
    for (let p = 0; p < G * G; p++) cnt += raw[p];
  }
  let lsum = 0, maxR = 0;
  for (let p = 0; p < G * G; p++) {
    if (!mask[p]) continue;
    lsum += lum[p];
    const rr = Math.hypot(((p % G) + 0.5) / G - 0.5, (((p / G) | 0) + 0.5) / G - 0.5);
    if (rr > maxR) maxR = rr;
  }
  return { mask, cover: cnt / (G * G), L: cnt ? lsum / cnt : 0, bg, maxR };
}

function featDist(a, b) {
  let inter = 0, uni = 0;
  const n = G * G;
  for (let i = 0; i < n; i++) {
    const x = a.mask[i], y = b.mask[i];
    if (x | y) { uni++; if (x & y) inter++; }
  }
  const shape = uni ? 1 - inter / uni : 1;
  return shape + Math.abs(a.L - b.L) / 255;
}

function isEmpty(feat) {
  return feat.cover < EMPTY_COVER || (feat.cover < DOT_COVER && feat.maxR < DOT_RADIUS);
}

function classify(feat, templates) {
  if (isEmpty(feat)) return { ch: '.', d: 0 };
  if (feat.cover > 0.92) return { ch: '?', d: 9 };
  let best = null, bd = 9;
  for (const t of templates) {
    const d = featDist(feat, t);
    if (d < bd) { bd = d; best = t; }
  }
  return { ch: best && bd < UNKNOWN_DIST ? best.label : '?', d: bd };
}

/* ------------------------------------------------------------------ */
/* Калибровка по стартовой позиции                                     */
/* ------------------------------------------------------------------ */
function startLayout(whiteBottom) {
  if (whiteBottom) {
    return ['rnbqkbnr', 'pppppppp', '', '', '', '', 'PPPPPPPP', 'RNBQKBNR'];
  }
  return ['RNBKQBNR', 'PPPPPPPP', '', '', '', '', 'pppppppp', 'rnbkqbnr'];
}

function calibrate(img) {
  const trim = refineBoard(img);
  const cells = [];
  for (let r = 0; r < 8; r++) {
    cells.push([]);
    for (let c = 0; c < 8; c++) cells[r].push(sampleCell(img, trim, r, c));
  }
  let bad = 0, missing = 0;
  for (let r = 2; r <= 5; r++) for (let c = 0; c < 8; c++) if (!isEmpty(cells[r][c])) bad++;
  for (const r of [0, 1, 6, 7]) for (let c = 0; c < 8; c++) if (isEmpty(cells[r][c])) missing++;
  if (bad > 2 || missing > 2) {
    return {
      ok: false,
      error:
        'Не удалось распознать стартовую расстановку. Расставьте фигуры в начальную позицию (новая партия), ' +
        'выделите ВСЮ доску от края до края и повторите скан.',
    };
  }
  const meanL = (rows) => {
    let s = 0, n = 0;
    for (const r of rows) for (let c = 0; c < 8; c++) { s += cells[r][c].L; n++; }
    return s / n;
  };
  const topL = meanL([0, 1]), botL = meanL([6, 7]);
  if (Math.abs(topL - botL) < 15) {
    return { ok: false, error: 'Не удалось отличить белые фигуры от чёрных (слишком похожая яркость).' };
  }
  const whiteBottom = botL > topL;
  const layout = startLayout(whiteBottom);
  const templates = [];
  for (const r of [0, 1, 6, 7]) {
    for (let c = 0; c < 8; c++) {
      templates.push({ label: layout[r][c], mask: Array.from(cells[r][c].mask), L: cells[r][c].L });
    }
  }
  return { ok: true, trim, templates, whiteBottom, whiteL: Math.max(topL, botL), blackL: Math.min(topL, botL) };
}

/* ------------------------------------------------------------------ */
/* Чтение позиции                                                      */
/* ------------------------------------------------------------------ */
function prepareTemplates(templates) {
  return templates.map((t) => ({ label: t.label, mask: Uint8Array.from(t.mask), L: t.L }));
}

function readBoard(img, rect, templates) {
  const tpl = templates[0] && templates[0].mask instanceof Uint8Array ? templates : prepareTemplates(templates);
  const grid = [];
  let unknown = 0, pieces = 0, wk = 0, bk = 0;
  for (let r = 0; r < 8; r++) {
    let line = '';
    for (let c = 0; c < 8; c++) {
      const res = classify(sampleCell(img, rect, r, c), tpl);
      line += res.ch;
      if (res.ch === '?') unknown++;
      else if (res.ch !== '.') pieces++;
      if (res.ch === 'K') wk++;
      if (res.ch === 'k') bk++;
    }
    grid.push(line);
  }
  const visible = unknown <= 3 && wk === 1 && bk === 1 && pieces <= 32 && pieces >= 2;
  return { grid, unknown, pieces, visible, key: grid.join('/') };
}

/* ------------------------------------------------------------------ */
/* Сетка → FEN-расстановка                                             */
/* ------------------------------------------------------------------ */
function whiteAtBottom(grid, fallback) {
  let rk = -1, rbk = -1;
  grid.forEach((line, r) => {
    if (line.includes('K')) rk = r;
    if (line.includes('k')) rbk = r;
  });
  if (rk < 0 || rbk < 0 || rk === rbk) return fallback;
  return rk > rbk;
}

function gridToPlacement(grid, whiteBottom) {
  const rows = whiteBottom
    ? grid.slice()
    : grid.slice().reverse().map((l) => l.split('').reverse().join(''));
  return rows
    .map((line) => {
      let out = '', empty = 0;
      for (const ch of line) {
        if (ch === '.') empty++;
        else { if (empty) { out += empty; empty = 0; } out += ch; }
      }
      if (empty) out += empty;
      return out;
    })
    .join('/');
}

/** Квадрат (например "e4") → { row, col } в экранной ориентации доски. */
function squareToCell(sq, whiteBottom) {
  const f = sq.charCodeAt(0) - 97, r = parseInt(sq[1], 10);
  return whiteBottom ? { col: f, row: 8 - r } : { col: 7 - f, row: r - 1 };
}

module.exports = {
  refineBoard, calibrate, readBoard, prepareTemplates,
  whiteAtBottom, gridToPlacement, squareToCell, sampleCell, startLayout,
};
