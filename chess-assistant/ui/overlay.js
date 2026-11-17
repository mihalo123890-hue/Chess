const from = document.getElementById('from');
const to = document.getElementById('to');
const arrow = document.getElementById('arrow');
const line = document.getElementById('line');

function place(el, c) {
  el.style.display = 'block';
  el.style.left = c.col * 12.5 + '%';
  el.style.top = c.row * 12.5 + '%';
}

window.api.on('overlay:update', (d) => {
  place(from, d.from);
  place(to, d.to);
  // стрелка: от центра клетки "откуда" к краю клетки "куда"
  const x1 = d.from.col + 0.5, y1 = d.from.row + 0.5;
  const x2 = d.to.col + 0.5, y2 = d.to.row + 0.5;
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const k = (len - 0.32) / len;
  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x1 + (x2 - x1) * k);
  line.setAttribute('y2', y1 + (y2 - y1) * k);
  arrow.style.display = 'block';
});
