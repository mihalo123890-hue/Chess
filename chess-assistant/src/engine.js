'use strict';
/**
 * Обёртка над Stockfish (WASM, lite single-thread) через UCI.
 * Движок запускается как отдельный процесс (Electron в режиме Node).
 */
const { spawn } = require('child_process');

class Engine {
  constructor(enginePath) {
    this.path = enginePath;
    this.proc = null;
    this.buf = '';
    this.waiters = [];
    this.current = null;
    this.chain = Promise.resolve();
    this.ready = false;
  }

  start() {
    return new Promise((resolve, reject) => {
      const env = Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' });
      this.proc = spawn(process.execPath, [this.path], {
        env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
      this.proc.on('error', reject);
      this.proc.on('exit', () => { this.ready = false; });
      this.proc.stdout.on('data', (d) => this._onData(d));
      this.proc.stderr.on('data', () => {});
      this._wait((l) => l.startsWith('uciok'), 20000)
        .then(() => {
          this.send('setoption name Hash value 32');
          this.send('isready');
          return this._wait((l) => l.startsWith('readyok'), 20000);
        })
        .then(() => { this.ready = true; resolve(); })
        .catch(reject);
      this.send('uci');
    });
  }

  send(cmd) {
    if (this.proc && this.proc.stdin.writable) this.proc.stdin.write(cmd + '\n');
  }

  _onData(d) {
    this.buf += d.toString();
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (line) this._onLine(line);
    }
  }

  _onLine(line) {
    for (const w of this.waiters.slice()) {
      if (w.test(line)) {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        clearTimeout(w.timer);
        w.resolve(line);
      }
    }
    if (!this.current) return;
    if (line.startsWith('info') && line.includes(' pv ') && !/(upperbound|lowerbound)/.test(line)) {
      const mpv = +(line.match(/ multipv (\d+)/) || [0, 1])[1];
      const depth = +(line.match(/ depth (\d+)/) || [0, 0])[1];
      const sc = line.match(/ score (cp|mate) (-?\d+)/);
      if (!sc) return;
      const pv = line.split(' pv ')[1].trim().split(' ');
      this.current.results[mpv] = {
        depth,
        cp: sc[1] === 'cp' ? +sc[2] : null,
        mate: sc[1] === 'mate' ? +sc[2] : null,
        pv,
        uci: pv[0],
      };
    } else if (line.startsWith('bestmove')) {
      const cur = this.current;
      this.current = null;
      const best = line.split(' ')[1];
      const list = Object.keys(cur.results)
        .map(Number)
        .sort((a, b) => a - b)
        .map((k) => cur.results[k]);
      cur.resolve({ best, candidates: list });
    }
  }

  _wait(test, timeout) {
    return new Promise((resolve, reject) => {
      const w = { test, resolve };
      w.timer = setTimeout(() => {
        this.waiters.splice(this.waiters.indexOf(w), 1);
        reject(new Error('Таймаут ответа движка'));
      }, timeout);
      this.waiters.push(w);
    });
  }

  /** Остановить текущий расчёт (если идёт). */
  cancel() {
    if (this.current) this.send('stop');
  }

  /** Анализ позиции. Запросы выполняются по очереди. */
  analyze(fen, { multipv = 5, movetime = 1200 } = {}) {
    const run = () =>
      new Promise((resolve) => {
        this.current = { results: {}, resolve };
        this.send('setoption name MultiPV value ' + multipv);
        this.send('position fen ' + fen);
        this.send('go movetime ' + movetime);
      });
    const p = this.chain.then(run, run);
    this.chain = p.catch(() => {});
    return p;
  }

  stop() {
    try {
      this.send('quit');
      if (this.proc) this.proc.kill();
    } catch (e) { /* ignore */ }
  }
}

module.exports = { Engine };
