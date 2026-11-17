const $ = (id) => document.getElementById(id);
const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟', k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const PHASE = {
  idle: ['Ожидание', ''], scanning: ['Скан…', 'scan'], calibrating: ['Анализ…', 'scan'],
  running: ['Работает', 'run'], stopped: ['Пауза', ''],
};

let current = null;

function renderBoard(grid, hl) {
  const el = $('board');
  let html = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const ch = grid ? grid[r][c] : '.';
      let cls = 'sq ' + ((r + c) % 2 === 0 ? 'l' : 'd');
      if (hl && hl.from.row === r && hl.from.col === c) cls += ' hl-from';
      if (hl && hl.to.row === r && hl.to.col === c) cls += ' hl-to';
      const piece = ch !== '.' && ch !== '?' ? `<span class="${ch === ch.toUpperCase() ? 'w' : 'b'}">${GLYPH[ch]}</span>` : ch === '?' ? '<span>?</span>' : '';
      html += `<div class="${cls}">${piece}</div>`;
    }
  }
  el.innerHTML = html;
}

function render(s) {
  current = s;
  const [label, cls] = PHASE[s.phase] || ['—', ''];
  const pill = $('pill');
  pill.textContent = label;
  pill.className = 'pill ' + cls;

  $('scanBtn').disabled = s.phase === 'calibrating' || s.phase === 'scanning';
  const tb = $('toggleBtn');
  tb.disabled = !s.calibrated || s.phase === 'scanning' || s.phase === 'calibrating';
  tb.textContent = s.phase === 'running' ? '⏸ Стоп' : '▶ Старт';

  const err = $('error');
  err.hidden = !s.error;
  err.textContent = s.error || '';

  let msg = s.message || 'Выберите поле для начала';
  if (!s.engineReady && !s.error) msg += ' (загрузка движка…)';
  $('message').textContent = msg;
  $('userColor').textContent = s.userColor === 'w' ? 'Белые ♔' : s.userColor === 'b' ? 'Чёрные ♚' : '—';
  $('turn').textContent = s.turn ? (s.turn === 'w' ? 'Белых' : 'Чёрных') + (s.turn === s.userColor ? ' (вы)' : '') : '—';

  const sug = s.suggestion;
  $('suggestion').hidden = !sug;
  $('eval').textContent = sug ? sug.evalText || '—' : s.thinking ? '…' : '—';
  if (sug) {
    $('mFrom').textContent = sug.from;
    $('mTo').textContent = sug.to;
    $('san').textContent = sug.san + (sug.depth ? `  ·  глубина ${sug.depth}` : '');
    $('reason').textContent = sug.reason || '';
    $('pvline').textContent = sug.line || '';
  }

  document.querySelectorAll('.strat').forEach((b) => b.classList.toggle('active', b.dataset.s === s.settings.strategy));
  $('think').value = s.settings.thinkMs;
  $('thinkVal').textContent = (s.settings.thinkMs / 1000).toFixed(1);
  $('overlay').checked = s.settings.overlay;
  $('compat').checked = s.settings.compat;

  renderBoard(s.grid, s.hl);
}

$('scanBtn').onclick = () => window.api.send('scan:start');
$('toggleBtn').onclick = () => window.api.send('monitor:toggle');
$('quitBtn').onclick = () => window.api.send('app:quit');
document.querySelectorAll('.strat').forEach((b) => {
  b.onclick = () => window.api.send('settings:set', { strategy: b.dataset.s });
});
$('think').oninput = (e) => { $('thinkVal').textContent = (e.target.value / 1000).toFixed(1); };
$('think').onchange = (e) => window.api.send('settings:set', { thinkMs: +e.target.value });
$('overlay').onchange = (e) => window.api.send('settings:set', { overlay: e.target.checked });
$('compat').onchange = (e) => window.api.send('settings:set', { compat: e.target.checked });

window.api.on('state', render);
window.api.invoke('ui:get').then(render);
renderBoard(null, null);
