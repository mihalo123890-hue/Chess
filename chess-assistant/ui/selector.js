const $ = (id) => document.getElementById(id);
const banner = $('banner'), rect = $('rect'), dot = $('dot'), size = $('size'), hx = $('hx'), hy = $('hy');

function setBanner(phase, msg) {
  if (phase === 'wait') {
    banner.innerHTML =
      'Наведите курсор на <b>угол доски</b> и нажмите <b>Shift + X</b>' +
      '<small>Затем двигайте мышь до противоположного угла и нажмите <b>Shift + X</b> ещё раз. Esc — отмена.</small>' +
      '<small>Доска должна стоять в <b>начальной позиции</b> — так программа запомнит вид фигур.</small>';
  } else {
    banner.innerHTML =
      'Растяните рамку на <b>всю доску</b> и нажмите <b>Shift + X</b> для подтверждения' +
      '<small>Esc — отмена</small>';
  }
  if (msg) banner.innerHTML += '<div class="warn">' + msg + '</div>';
}

let lastPhase = '', lastMsg = '';
window.api.on('selector:update', (d) => {
  if (d.phase !== lastPhase || d.msg !== lastMsg) { setBanner(d.phase, d.msg); lastPhase = d.phase; lastMsg = d.msg; }
  if (d.phase === 'wait') {
    rect.style.display = 'none'; size.style.display = 'none'; dot.style.display = 'none';
    hx.style.display = hy.style.display = 'block';
    hx.style.top = d.y2 + 'px';
    hy.style.left = d.x2 + 'px';
  } else {
    hx.style.display = hy.style.display = 'none';
    dot.style.display = 'block';
    dot.style.left = d.x1 + 'px';
    dot.style.top = d.y1 + 'px';
    const x = Math.min(d.x1, d.x2), y = Math.min(d.y1, d.y2);
    const w = Math.abs(d.x2 - d.x1), h = Math.abs(d.y2 - d.y1);
    rect.style.display = 'block';
    rect.style.left = x + 'px'; rect.style.top = y + 'px';
    rect.style.width = w + 'px'; rect.style.height = h + 'px';
    size.style.display = 'block';
    size.textContent = Math.round(w) + ' × ' + Math.round(h);
    size.style.left = x + 'px';
    size.style.top = Math.max(0, y - 24) + 'px';
  }
});
