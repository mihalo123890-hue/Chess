'use strict';
/**
 * Chess Assistant — главный процесс Electron.
 *
 *  - окно GUI (ui/index.html)
 *  - режим скана: Shift+X ставит первую точку, движение мыши рисует прямоугольник, Shift+X ещё раз — подтвердить
 *  - калибровка по стартовой позиции (src/vision.js)
 *  - цикл: снимок области → распознавание → отслеживание партии → Stockfish → оверлей
 */
const { app, BrowserWindow, ipcMain, globalShortcut, screen, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');

const vision = require('./src/vision');
const { Tracker } = require('./src/tracker');
const { Engine } = require('./src/engine');
const { decide } = require('./src/strategy');

/* ------------------------------ Конфигурация ------------------------------ */
const defaults = { strategy: 'fast', thinkMs: 1500, overlay: true, compat: false, calibration: null };
let config = Object.assign({}, defaults);
const configPath = () => path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    config = Object.assign({}, defaults, JSON.parse(fs.readFileSync(configPath(), 'utf8')));
  } catch (e) { /* первый запуск */ }
}
function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true });
    fs.writeFileSync(configPath(), JSON.stringify(config));
  } catch (e) { /* ignore */ }
}

/* --------------------------------- Состояние -------------------------------- */
const S = {
  phase: 'idle', // idle | scanning | calibrating | running | stopped
  message: '',
  error: '',
  userColor: null,
  turn: null,
  visible: false,
  thinking: false,
  suggestion: null,
  grid: null,
  hl: null,
  engineReady: false,
  lastMove: null,
};

function publicState() {
  return Object.assign({}, S, {
    calibrated: !!config.calibration,
    settings: { strategy: config.strategy, thinkMs: config.thinkMs, overlay: config.overlay, compat: config.compat },
  });
}

let mainWin = null;
function sendState() {
  if (mainWin && !mainWin.isDestroyed()) mainWin.webContents.send('state', publicState());
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------------------------------- Движок --------------------------------- */
const engine = new Engine(path.join(__dirname, 'engine', 'stockfish-19-lite-single.js'));
function startEngine() {
  engine.start().then(
    () => { S.engineReady = true; sendState(); },
    (e) => { S.error = 'Не удалось запустить движок: ' + e.message; sendState(); }
  );
}

/* ------------------------------ Главное окно ------------------------------- */
function createMainWindow() {
  mainWin = new BrowserWindow({
    width: 470,
    height: 820,
    minWidth: 420,
    minHeight: 620,
    backgroundColor: '#0f1115',
    title: 'Chess Assistant',
    autoHideMenuBar: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  mainWin.loadFile(path.join(__dirname, 'ui', 'index.html'));
  mainWin.on('closed', () => { mainWin = null; app.quit(); });
}

/* --------------------------------- Скан-режим -------------------------------- */
let scan = null;
let selectorWin = null;

function transparentWindow(bounds) {
  const w = new BrowserWindow({
    x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height),
    frame: false, transparent: true, resizable: false, movable: false, focusable: false, skipTaskbar: true,
    alwaysOnTop: true, hasShadow: false, show: false, enableLargerThanScreen: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  w.setAlwaysOnTop(true, 'screen-saver');
  w.setIgnoreMouseEvents(true);
  w.setContentProtection(true);
  w.setBounds({ x: Math.round(bounds.x), y: Math.round(bounds.y), width: Math.round(bounds.width), height: Math.round(bounds.height) });
  return w;
}

function startScan() {
  if (scan) return;
  stopMonitor();
  S.phase = 'scanning';
  S.error = '';
  S.message = 'Режим скана: наведите курсор на угол доски и нажмите Shift+X';
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  scan = { display, p1: null, timer: null, lastKey: 0 };
  selectorWin = transparentWindow(display.bounds);
  selectorWin.loadFile(path.join(__dirname, 'ui', 'selector.html'));
  selectorWin.once('ready-to-show', () => selectorWin && selectorWin.showInactive());
  if (mainWin) mainWin.minimize();
  globalShortcut.register('Shift+X', onShiftX);
  globalShortcut.register('Escape', cancelScan);
  scan.timer = setInterval(pushSelector, 16);
  sendState();
}

function pushSelector() {
  if (!scan || !selectorWin || selectorWin.isDestroyed()) return;
  const b = scan.display.bounds;
  const c = screen.getCursorScreenPoint();
  selectorWin.webContents.send('selector:update', {
    phase: scan.p1 ? 'drag' : 'wait',
    x1: scan.p1 ? scan.p1.x - b.x : c.x - b.x,
    y1: scan.p1 ? scan.p1.y - b.y : c.y - b.y,
    x2: c.x - b.x,
    y2: c.y - b.y,
    msg: scan.msg || '',
  });
}

function onShiftX() {
  if (!scan) return;
  const now = Date.now();
  if (now - scan.lastKey < 300) return;
  scan.lastKey = now;
  const pt = screen.getCursorScreenPoint();
  if (!scan.p1) {
    const d = screen.getDisplayNearestPoint(pt);
    if (d.id !== scan.display.id) {
      scan.display = d;
      selectorWin.setBounds(d.bounds);
    }
    scan.p1 = pt;
    scan.msg = '';
    return;
  }
  const rect = {
    x: Math.min(scan.p1.x, pt.x),
    y: Math.min(scan.p1.y, pt.y),
    w: Math.abs(pt.x - scan.p1.x),
    h: Math.abs(pt.y - scan.p1.y),
  };
  if (rect.w < 120 || rect.h < 120) {
    scan.p1 = null;
    scan.msg = 'Область слишком маленькая — начните заново (Shift+X)';
    return;
  }
  const display = scan.display;
  endScan();
  calibrateRegion(display, rect);
}

function endScan() {
  if (!scan) return;
  clearInterval(scan.timer);
  globalShortcut.unregister('Shift+X');
  globalShortcut.unregister('Escape');
  if (selectorWin && !selectorWin.isDestroyed()) selectorWin.destroy();
  selectorWin = null;
  scan = null;
  if (mainWin) { mainWin.restore(); mainWin.show(); }
}

function cancelScan() {
  if (!scan) return;
  endScan();
  S.phase = config.calibration ? 'stopped' : 'idle';
  S.message = 'Скан отменён';
  sendState();
}

/* ----------------------------- Захват экрана ------------------------------- */
async function captureRect(display, rect) {
  const scale = display.scaleFactor || 1;
  const size = { width: Math.round(display.size.width * scale), height: Math.round(display.size.height * scale) };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
  let src = sources.find((s) => String(s.display_id) === String(display.id));
  if (!src) {
    const idx = screen.getAllDisplays().findIndex((d) => d.id === display.id);
    src = sources[idx] || sources[0];
  }
  if (!src) throw new Error('Нет источника экрана');
  const img = src.thumbnail;
  const sz = img.getSize();
  const sx = sz.width / display.bounds.width;
  const sy = sz.height / display.bounds.height;
  let x = Math.round((rect.x - display.bounds.x) * sx);
  let y = Math.round((rect.y - display.bounds.y) * sy);
  let w = Math.round(rect.w * sx);
  let h = Math.round(rect.h * sy);
  x = Math.max(0, Math.min(sz.width - 2, x));
  y = Math.max(0, Math.min(sz.height - 2, y));
  w = Math.max(2, Math.min(sz.width - x, w));
  h = Math.max(2, Math.min(sz.height - y, h));
  const crop = img.crop({ x, y, width: w, height: h });
  const bmp = crop.toBitmap(); // BGRA
  const cs = crop.getSize();
  const data = new Uint8Array(bmp.length);
  for (let i = 0; i < bmp.length; i += 4) {
    data[i] = bmp[i + 2]; data[i + 1] = bmp[i + 1]; data[i + 2] = bmp[i]; data[i + 3] = 255;
  }
  return { w: cs.width, h: cs.height, data, sx, sy };
}

/* ------------------------------- Калибровка -------------------------------- */
async function calibrateRegion(display, rect) {
  S.phase = 'calibrating';
  S.message = 'Анализирую доску и запоминаю вид фигур…';
  sendState();
  try {
    await sleep(300); // дать скрыться окну выбора
    const frame = await captureRect(display, rect);
    const cal = vision.calibrate(frame);
    if (!cal.ok) {
      S.phase = config.calibration ? 'stopped' : 'idle';
      S.error = cal.error;
      S.message = '';
      sendState();
      return;
    }
    const refined = {
      x: rect.x + cal.trim.x / frame.sx,
      y: rect.y + cal.trim.y / frame.sy,
      w: cal.trim.w / frame.sx,
      h: cal.trim.h / frame.sy,
    };
    config.calibration = { displayId: display.id, rect: refined, templates: cal.templates, whiteBottom: cal.whiteBottom };
    saveConfig();
    S.error = '';
    S.userColor = cal.whiteBottom ? 'w' : 'b';
    startMonitor();
  } catch (e) {
    S.phase = 'idle';
    S.error = 'Ошибка скана: ' + e.message;
    sendState();
  }
}

/* --------------------------------- Оверлей --------------------------------- */
let overlayWin = null;
let overlayReady = false;

function createOverlay(rect) {
  destroyOverlay();
  overlayWin = transparentWindow({ x: rect.x, y: rect.y, width: rect.w, height: rect.h });
  overlayWin.setContentProtection(!config.compat);
  overlayReady = false;
  overlayWin.webContents.once('did-finish-load', () => { overlayReady = true; refreshOverlay(); });
  overlayWin.loadFile(path.join(__dirname, 'ui', 'overlay.html'));
}

function destroyOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.destroy();
  overlayWin = null;
  overlayReady = false;
}

function hideOverlay() {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide();
}

let lastWB = true;
function refreshOverlay() {
  const sug = S.suggestion;
  const show = config.overlay && S.visible && sug && !sug.gameOver && S.turn === S.userColor && !S.thinking && sug.from;
  if (show) {
    const a = vision.squareToCell(sug.from, lastWB);
    const b = vision.squareToCell(sug.to, lastWB);
    S.hl = { from: a, to: b };
    if (overlayWin && !overlayWin.isDestroyed() && overlayReady) {
      overlayWin.webContents.send('overlay:update', { from: a, to: b });
      overlayWin.showInactive();
    }
  } else {
    S.hl = null;
    hideOverlay();
  }
}

/* ------------------------- Цикл распознавания партии ------------------------ */
let monitoring = false;
let loopTimer = null;
let tracker = new Tracker();
let tplCache = null;
let pending = { key: '', n: 0 };
let acceptedKey = null;
let misses = 0;
let analysisToken = 0;

function startMonitor() {
  const cal = config.calibration;
  if (!cal) return;
  stopMonitor();
  tracker = new Tracker();
  tplCache = vision.prepareTemplates(cal.templates);
  pending = { key: '', n: 0 };
  acceptedKey = null;
  misses = 0;
  lastWB = cal.whiteBottom;
  S.phase = 'running';
  S.visible = true;
  S.suggestion = null;
  S.thinking = false;
  S.turn = null;
  S.error = '';
  S.message = 'Слежу за доской…';
  createOverlay(cal.rect);
  monitoring = true;
  sendState();
  tick();
}

function stopMonitor() {
  monitoring = false;
  clearTimeout(loopTimer);
  analysisToken++;
  engine.cancel();
  destroyOverlay();
  if (S.phase === 'running') {
    S.phase = 'stopped';
    S.message = 'Остановлено';
    S.suggestion = null;
    S.hl = null;
    S.thinking = false;
    sendState();
  }
}

async function tick() {
  if (!monitoring) return;
  const t0 = Date.now();
  try {
    const cal = config.calibration;
    const display = screen.getAllDisplays().find((d) => d.id === cal.displayId) || screen.getPrimaryDisplay();
    const compatHide = config.compat && overlayWin && !overlayWin.isDestroyed() && overlayWin.isVisible();
    if (compatHide) { overlayWin.hide(); await sleep(70); }
    const frame = await captureRect(display, cal.rect);
    if (compatHide && overlayWin && !overlayWin.isDestroyed()) overlayWin.showInactive();
    const read = vision.readBoard(frame, { x: 0, y: 0, w: frame.w, h: frame.h }, tplCache);
    if (monitoring) processRead(read);
  } catch (e) {
    S.error = 'Ошибка захвата: ' + e.message;
    sendState();
  }
  if (monitoring) loopTimer = setTimeout(tick, Math.max(100, 400 - (Date.now() - t0)));
}

function processRead(read) {
  if (!read.visible) {
    misses++;
    if (misses >= 3 && S.visible) {
      S.visible = false;
      S.message = 'Доска не видна — жду…';
      refreshOverlay();
      sendState();
    }
    return;
  }
  misses = 0;
  if (!S.visible) {
    S.visible = true;
    S.message = S.turn === S.userColor ? 'Ваш ход' : 'Слежу за доской…';
    refreshOverlay();
    sendState();
  }
  if (read.key !== pending.key) { pending = { key: read.key, n: 1 }; return; }
  pending.n++;
  if (pending.n < 2 || read.key === acceptedKey) return;
  acceptedKey = read.key;

  S.grid = read.grid;
  const wb = vision.whiteAtBottom(read.grid, lastWB);
  lastWB = wb;
  const userColor = wb ? 'w' : 'b';
  S.userColor = userColor;
  const placement = vision.gridToPlacement(read.grid, wb);
  const upd = tracker.update(placement, userColor);
  if (upd.invalid) {
    S.message = 'Позиция выглядит нелегальной — проверяю дальше…';
    sendState();
    return;
  }
  S.turn = tracker.turn();
  S.lastMove = tracker.lastMove;
  const over = tracker.gameOver();
  if (over.over) {
    analysisToken++;
    engine.cancel();
    S.suggestion = null;
    S.thinking = false;
    S.message = over.text;
    refreshOverlay();
    sendState();
    return;
  }
  if (S.turn === userColor) requestAnalysis();
  else {
    analysisToken++;
    engine.cancel();
    S.suggestion = null;
    S.thinking = false;
    S.message = 'Ход соперника — жду…';
    refreshOverlay();
    sendState();
  }
}

async function requestAnalysis() {
  const token = ++analysisToken;
  engine.cancel();
  S.thinking = true;
  S.suggestion = null;
  S.message = 'Ваш ход — ищу лучший вариант…';
  refreshOverlay();
  sendState();
  try {
    if (!S.engineReady) await engine.start().then(() => { S.engineReady = true; }).catch(() => {});
    const res = await decide({ fen: tracker.fen(), strategy: config.strategy, engine, thinkMs: config.thinkMs });
    if (token !== analysisToken) return;
    S.thinking = false;
    if (res.gameOver) {
      S.suggestion = null;
      S.message = 'Игра окончена';
    } else {
      S.suggestion = res;
      S.message = 'Ваш ход';
    }
  } catch (e) {
    if (token !== analysisToken) return;
    S.thinking = false;
    S.error = 'Ошибка анализа: ' + e.message;
  }
  refreshOverlay();
  sendState();
}

/* ----------------------------------- IPC ----------------------------------- */
ipcMain.handle('ui:get', () => publicState());
ipcMain.on('scan:start', startScan);
ipcMain.on('scan:cancel', cancelScan);
ipcMain.on('monitor:toggle', () => {
  if (monitoring) stopMonitor();
  else if (config.calibration) startMonitor();
});
ipcMain.on('app:quit', () => app.quit());
ipcMain.on('settings:set', (_e, patch) => {
  const prevStrategy = config.strategy;
  const prevThink = config.thinkMs;
  for (const k of ['strategy', 'thinkMs', 'overlay', 'compat']) if (patch && k in patch) config[k] = patch[k];
  saveConfig();
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setContentProtection(!config.compat);
  if (monitoring && (prevStrategy !== config.strategy || prevThink !== config.thinkMs) && S.turn && S.turn === S.userColor && !tracker.gameOver().over) {
    requestAnalysis();
  } else {
    refreshOverlay();
    sendState();
  }
});

/* ------------------------------- Жизненный цикл ------------------------------ */
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.whenReady().then(() => {
    loadConfig();
    if (config.calibration) { S.phase = 'stopped'; S.userColor = config.calibration.whiteBottom ? 'w' : 'b'; S.message = 'Область сохранена. Нажмите «Старт» или выберите поле заново.'; }
    createMainWindow();
    startEngine();
  });
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    engine.stop();
  });
}
