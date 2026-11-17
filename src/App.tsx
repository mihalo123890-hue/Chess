import { useMemo, useState } from 'react'
import { Chess } from 'chess.js'

const LINE =
  'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Ng5 h6 Nxf7 Kxf7 Nf3 Nbd7 Bc4+ e6 Qe2 Nb6 Bb3 Bd6 O-O Re8 Ne5+'.split(' ')

const GLYPH: Record<string, string> = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
}

function DemoBoard() {
  const [step, setStep] = useState(9)

  const { board, from, to, whiteNext, san } = useMemo(() => {
    const c = new Chess()
    for (let i = 0; i < step; i++) c.move(LINE[i])
    const next = LINE[step]
    let f: string | null = null
    let t: string | null = null
    let s: string | null = null
    if (next) {
      const probe = new Chess(c.fen())
      const mv = probe.move(next)
      f = mv.from
      t = mv.to
      s = mv.san
    }
    return { board: c.board(), from: f, to: t, whiteNext: c.turn() === 'w', san: s }
  }, [step])

  const files = 'abcdefgh'
  return (
    <div className="w-full max-w-[420px]">
      <div className="grid grid-cols-8 overflow-hidden rounded-xl border-4 border-zinc-800 shadow-2xl shadow-emerald-500/10">
        {board.flatMap((row, r) =>
          row.map((p, f) => {
            const sq = files[f] + (8 - r)
            const light = (r + f) % 2 === 0
            const isFrom = sq === from
            const isTo = sq === to
            const color = whiteNext ? 'rgba(0,255,106,' : 'rgba(255,183,77,'
            return (
              <div
                key={sq}
                className="relative flex aspect-square items-center justify-center text-[clamp(20px,6vw,34px)] leading-none"
                style={{ background: light ? '#e6d9b8' : '#a98a62' }}
              >
                {(isFrom || isTo) && (
                  <div
                    className="absolute inset-0"
                    style={{
                      background: color + (isTo ? '.6)' : '.35)'),
                      outline: `2px solid ${whiteNext ? '#00ff6a' : '#ffb74d'}`,
                      outlineOffset: -2,
                    }}
                  />
                )}
                {p && (
                  <span
                    className="relative z-10"
                    style={
                      p.color === 'w'
                        ? { color: '#fff', textShadow: '0 0 2px #000,0 0 2px #000,0 0 1px #000' }
                        : { color: '#161616' }
                    }
                  >
                    {GLYPH[p.type]}
                  </span>
                )}
              </div>
            )
          }),
        )}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          className="rounded-lg bg-zinc-800 px-4 py-2 text-sm font-semibold hover:bg-zinc-700"
        >
          ← Назад
        </button>
        <div className="text-center text-sm">
          {san ? (
            <>
              <div className={whiteNext ? 'font-bold text-emerald-400' : 'font-bold text-amber-400'}>
                {whiteNext ? 'Подсказка вам' : 'Ответ соперника'}: {san}
              </div>
              <div className="text-zinc-500">
                {from} → {to}
              </div>
            </>
          ) : (
            <div className="text-zinc-400">Конец демо-линии</div>
          )}
        </div>
        <button
          onClick={() => setStep((s) => Math.min(LINE.length, s + 1))}
          className="rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-emerald-950 hover:bg-emerald-400"
        >
          Вперёд →
        </button>
      </div>
    </div>
  )
}

const STRATEGIES = [
  {
    icon: '👽',
    name: 'Alien Gambit',
    text: 'Быстрый мат. Дебют 1.e4 c6 2.d4 d5 3.Nc3 dxe4 4.Nxe4 Nf6 5.Ng5 h6 6.Nxf7! (и версия против 1…d5 с Bg6+). Дальше — шахи, жертвы ради атаки на короля и самый короткий мат.',
  },
  {
    icon: '⚡',
    name: 'Fast Win',
    text: 'Закончить партию любой ценой как можно быстрее: из лучших вариантов Stockfish выбирается самый агрессивный — шахи, взятия, размены при перевесе, давление на короля.',
  },
  {
    icon: '🛡',
    name: 'Strong Defense',
    text: 'Атака начинается только при доказанном (форсированном) мате. Всё остальное время — рокировка, развитие, нет висящих фигур, минимум шахов сопернику.',
  },
]

const STEPS = [
  ['Расставьте начальную позицию', 'Откройте шахматы на сайте или в программе, начните новую партию.'],
  ['Нажмите «Выбрать поле»', 'Окно свернётся и включится режим скана.'],
  ['Shift + X → ведите мышь → Shift + X', 'Первая точка на углу доски, рамка растёт как при Shift+Win+S, второй Shift+X подтверждает.'],
  ['Программа учится', 'Находит 64 клетки, запоминает вид каждой фигуры и определяет ваш цвет — по тому, чьи фигуры стоят снизу.'],
  ['Играйте по зелёным клеткам', 'Когда ваш ход, поверх доски подсвечиваются клетка «откуда» и «куда» + стрелка.'],
]

const FILES = [
  ['build.bat', 'Двойной клик — установка зависимостей и сборка EXE'],
  ['run-dev.bat', 'Запуск без сборки (для проверки)'],
  ['main.js', 'Окна, Shift+X, захват экрана, цикл анализа'],
  ['src/vision.js', 'Поиск клеток, обучение фигурам, распознавание'],
  ['src/tracker.js', 'Восстановление ходов, чей ход, рокировки'],
  ['src/strategy.js', 'Alien Gambit / Fast Win / Strong Defense'],
  ['src/engine.js + engine/', 'Stockfish 19 (WASM) по протоколу UCI'],
  ['ui/', 'GUI, окно выбора области, зелёный оверлей'],
]

function CopyBlock({ text }: { text: string }) {
  const [ok, setOk] = useState(false)
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 font-mono text-sm text-emerald-300">
      <span className="overflow-x-auto whitespace-nowrap">{text}</span>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(text)
          setOk(true)
          setTimeout(() => setOk(false), 1500)
        }}
        className="shrink-0 rounded-md bg-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:bg-zinc-700"
      >
        {ok ? 'Скопировано' : 'Копировать'}
      </button>
    </div>
  )
}

export default function App() {
  return (
    <div className="min-h-screen bg-[#0b0d11] text-zinc-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[520px] bg-[radial-gradient(ellipse_at_top,rgba(0,230,118,0.14),transparent_60%)]" />

      <header className="relative mx-auto flex max-w-6xl items-center gap-3 px-6 py-6">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 text-2xl text-emerald-950">
          ♞
        </div>
        <span className="text-lg font-bold">Chess Assistant</span>
        <span className="ml-auto rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-400">
          Windows · Electron · Stockfish 19
        </span>
      </header>

      <main className="relative mx-auto max-w-6xl px-6">
        {/* HERO */}
        <section className="grid items-center gap-12 pb-20 pt-8 lg:grid-cols-2">
          <div>
            <p className="mb-4 inline-block rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-400">
              Программа для ПК готова к сборке
            </p>
            <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">
              Сканирует доску и подсвечивает <span className="text-emerald-400">лучший ход</span> зелёным
            </h1>
            <p className="mt-5 max-w-xl text-lg text-zinc-400">
              Выбираете поле через <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-sm">Shift</kbd>+
              <kbd className="rounded bg-zinc-800 px-1.5 py-0.5 text-sm">X</kbd>, программа учится видеть клетки и
              фигуры, понимает за кого вы играете и рисует оверлей поверх доски: откуда и куда ходить.
            </p>
            <div className="mt-8 space-y-3">
              <div className="flex items-start gap-3 text-sm text-zinc-300">
                <span className="mt-0.5 text-emerald-400">✔</span>
                <span>
                  Папка проекта: <code className="rounded bg-zinc-800 px-1.5 py-0.5">chess-assistant/</code> — внутри{' '}
                  <code className="rounded bg-zinc-800 px-1.5 py-0.5">build.bat</code>
                </span>
              </div>
              <div className="flex items-start gap-3 text-sm text-zinc-300">
                <span className="mt-0.5 text-emerald-400">✔</span>
                <span>Один двойной клик по build.bat — и получается ChessAssistant.exe</span>
              </div>
              <div className="flex items-start gap-3 text-sm text-zinc-300">
                <span className="mt-0.5 text-emerald-400">✔</span>
                <span>Три стратегии: Alien Gambit, Fast Win, Strong Defense</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center">
            <DemoBoard />
            <p className="mt-4 max-w-[420px] text-center text-xs text-zinc-500">
              Демо оверлея: линия Alien Gambit. Зелёным — подсказка вам, оранжевым — ожидаемый ответ соперника.
            </p>
          </div>
        </section>

        {/* STRATEGIES */}
        <section className="pb-20">
          <h2 className="text-2xl font-bold">Стратегии игры</h2>
          <p className="mt-2 text-zinc-400">Переключаются в GUI в любой момент — подсказка пересчитывается сразу.</p>
          <div className="mt-8 grid gap-5 md:grid-cols-3">
            {STRATEGIES.map((s) => (
              <div key={s.name} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6">
                <div className="text-3xl">{s.icon}</div>
                <h3 className="mt-3 text-lg font-bold">{s.name}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.text}</p>
              </div>
            ))}
          </div>
        </section>

        {/* HOW */}
        <section className="pb-20">
          <h2 className="text-2xl font-bold">Как это работает</h2>
          <ol className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-sm font-bold text-emerald-950">
                  {i + 1}
                </div>
                <h3 className="mt-3 font-semibold">{t}</h3>
                <p className="mt-1 text-sm text-zinc-400">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* BUILD */}
        <section className="grid gap-10 pb-20 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-bold">Сборка EXE</h2>
            <ol className="mt-5 space-y-4 text-zinc-300">
              <li>
                <b>1.</b> Установите <span className="text-emerald-400">Node.js LTS</span> (nodejs.org).
              </li>
              <li>
                <b>2.</b> Откройте папку <code className="rounded bg-zinc-800 px-1.5 py-0.5">chess-assistant</code> и
                запустите <code className="rounded bg-zinc-800 px-1.5 py-0.5">build.bat</code>.
              </li>
              <li>
                <b>3.</b> Готово: <code className="rounded bg-zinc-800 px-1.5 py-0.5">dist\ChessAssistant-win32-x64\ChessAssistant.exe</code>
              </li>
            </ol>
            <div className="mt-6 space-y-3">
              <p className="text-sm text-zinc-500">Или из командной строки:</p>
              <CopyBlock text="cd chess-assistant && npm install && npm run pack" />
              <CopyBlock text="npm start" />
            </div>
            <p className="mt-4 text-xs text-zinc-500">
              Для сборки нужен интернет (скачивается Electron). Собирается на Windows 10/11 x64.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-bold">Что внутри</h2>
            <div className="mt-5 divide-y divide-zinc-800 overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
              {FILES.map(([f, d]) => (
                <div key={f} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <code className="w-52 shrink-0 text-sm text-emerald-300">{f}</code>
                  <span className="text-sm text-zinc-400">{d}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* NOTES */}
        <section className="pb-24">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-sm leading-relaxed text-amber-100/80">
            <b className="text-amber-300">Важно.</b> Скан делайте на начальной позиции с видимой полной доской — так программа
            запоминает вид фигур. Сменили тему доски или размер окна — повторите скан. Подсказки движка допустимы для
            тренировки, анализа и игры против ботов; в рейтинговых партиях против людей на chess.com / lichess они
            запрещены правилами и ведут к блокировке аккаунта.
          </div>
        </section>
      </main>

      <footer className="border-t border-zinc-900 py-8 text-center text-xs text-zinc-600">
        Chess Assistant · Stockfish (GPL-3.0) · Electron
      </footer>
    </div>
  )
}
