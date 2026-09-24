import type { CSSProperties, ReactNode } from 'react'
import { cn } from '#/lib/utils'

/*
 * The street along the bottom of the home page hero: a skyline, a train on
 * an elevated track, a plane overhead, and traffic both ways on the road.
 * Movement comes from the `drive-*` / `ill-*` classes in styles.css; colours
 * that change with the theme are the `--scene-*` variables there.
 */

const TIRE = '#1f2937'
const HUB = '#9ca3af'
const GLASS = '#e0f2fe'

/** A wheel whose spokes turn. */
function Wheel({ cx, cy, r }: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={TIRE} />
      <circle cx={cx} cy={cy} r={r * 0.5} fill={HUB} />
      <g className="ill-spin" style={{ animationDuration: '0.9s' }}>
        <circle cx={cx} cy={cy} r={r * 0.5} fill="transparent" />
        <path d={`M${cx - r * 0.45} ${cy} H${cx + r * 0.45} M${cx} ${cy - r * 0.45} V${cy + r * 0.45}`} stroke={TIRE} strokeWidth={1.4} />
      </g>
    </g>
  )
}

function Bus() {
  return (
    <svg width={150} height={62} viewBox="0 0 150 62" aria-hidden>
      <rect x={2} y={4} width={146} height={46} rx={8} fill="#f59e0b" />
      <rect x={2} y={4} width={146} height={7} rx={3.5} fill="#d97706" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={12 + i * 24} y={15} width={20} height={14} rx={2} fill={GLASS} />
      ))}
      <rect x={110} y={15} width={14} height={31} rx={2} fill="#fcd34d" stroke="#d97706" strokeWidth={1} />
      <rect x={132} y={13} width={13} height={20} rx={3} fill="#bae6fd" />
      <rect x={2} y={34} width={106} height={4} fill="#fff" opacity={0.7} />
      <circle cx={145} cy={42} r={2.2} fill="#fef9c3" />
      <rect x={3} y={38} width={3} height={6} rx={1} fill="#ef4444" />
      <Wheel cx={32} cy={50} r={9} />
      <Wheel cx={120} cy={50} r={9} />
    </svg>
  )
}

function Car() {
  return (
    <svg width={96} height={44} viewBox="0 0 96 44" aria-hidden>
      <path d="M4 30 Q4 22 12 21 L26 20 L36 9 Q39 6 44 6 H64 Q69 6 72 10 L80 20 Q92 21 93 28 V34 H4 Z" fill="#f43f5e" />
      <path d="M39 10 H53 V20 H30 Z" fill={GLASS} />
      <path d="M56 10 H66 Q68 10 70 13 L75 20 H56 Z" fill={GLASS} />
      <rect x={87} y={24} width={5} height={3} rx={1} fill="#fef9c3" />
      <rect x={4} y={24} width={3} height={4} rx={1} fill="#fda4af" />
      <Wheel cx={22} cy={34} r={8} />
      <Wheel cx={74} cy={34} r={8} />
    </svg>
  )
}

/** A CNG auto-rickshaw, the green three-wheeler of Bangladeshi streets. */
function AutoRickshaw() {
  return (
    <svg width={78} height={56} viewBox="0 0 78 56" aria-hidden>
      <path d="M10 10 Q10 3 18 3 H50 Q61 3 66 13 L71 24 H10 Z" fill="#15803d" />
      <rect x={15} y={9} width={18} height={14} rx={2} fill="#dcfce7" />
      <path d="M37 9 H52 Q58 9 61 16 L64 23 H37 Z" fill="#dcfce7" />
      <path d="M6 24 H72 Q77 26 77 35 V44 H6 Z" fill="#22c55e" />
      <rect x={6} y={30} width={60} height={3} fill="#fef08a" opacity={0.8} />
      <circle cx={74} cy={30} r={2} fill="#fef9c3" />
      <Wheel cx={20} cy={45} r={7.5} />
      <Wheel cx={64} cy={45} r={7.5} />
    </svg>
  )
}

function Cyclist() {
  return (
    <svg width={64} height={64} viewBox="0 0 64 64" aria-hidden>
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx={14} cy={50} r={11} stroke={TIRE} strokeWidth={2.5} />
        <circle cx={50} cy={50} r={11} stroke={TIRE} strokeWidth={2.5} />
        <path d="M14 50 L27 35 H44 L50 50 M27 35 L32 50 L44 35 M24 31 H31 M44 35 L46 27 H52" stroke="#1d4ed8" strokeWidth={2.5} />
        <path d="M29 31 L39 15" stroke="#8b5cf6" strokeWidth={7} />
        <path d="M37 18 L50 27" stroke="#8b5cf6" strokeWidth={3.5} />
        <path d="M29 31 L35 42 L32 50" stroke="#312e81" strokeWidth={4.5} />
      </g>
      <circle cx={42} cy={9} r={5} fill="#fbc7b0" />
      <path d="M36.5 8 Q37 2 43 2.5 Q48 3 47.5 8 Z" fill="#f43f5e" />
      <g className="ill-spin" style={{ animationDuration: '0.9s' }}>
        <circle cx={14} cy={50} r={9} fill="transparent" />
        <path d="M5 50 H23 M14 41 V59" stroke={HUB} strokeWidth={1} />
      </g>
      <g className="ill-spin" style={{ animationDuration: '0.9s' }}>
        <circle cx={50} cy={50} r={9} fill="transparent" />
        <path d="M41 50 H59 M50 41 V59" stroke={HUB} strokeWidth={1} />
      </g>
    </svg>
  )
}

/** Three coaches, drawn facing left (it runs right to left). */
function Train() {
  return (
    <svg width={400} height={46} viewBox="0 0 400 46" aria-hidden>
      {[0, 1, 2].map((i) => {
        const x = i * 134
        return (
          <g key={i}>
            {i === 0 ? (
              <path d={`M18 4 H128 V38 H4 Q0 38 0 30 V22 Q0 4 18 4 Z`} fill="#2563eb" />
            ) : (
              <rect x={x} y={4} width={128} height={34} rx={5} fill="#2563eb" />
            )}
            {i === 0 && <path d="M4 22 Q5 11 17 10 H24 V22 Z" fill="#bae6fd" />}
            {[0, 1, 2, 3, 4].map((j) => (
              <rect key={j} x={x + (i === 0 ? 32 : 12) + j * 20} y={10} width={14} height={11} rx={2} fill="#dbeafe" />
            ))}
            <rect x={x + (i === 0 ? 4 : 0)} y={27} width={i === 0 ? 124 : 128} height={3} fill="#fff" opacity={0.8} />
            {[20, 36, 92, 108].map((w) => (
              <circle key={w} cx={x + w} cy={41} r={4} fill={TIRE} />
            ))}
            {i < 2 && <rect x={x + 128} y={24} width={6} height={4} fill="#1e3a8a" />}
          </g>
        )
      })}
    </svg>
  )
}

function Plane() {
  return (
    <div className="relative">
      <div className="absolute right-[92%] top-[46%] h-0.5 w-40 bg-gradient-to-l from-indigo-300/70 to-transparent dark:from-indigo-400/40" />
      <svg width={110} height={40} viewBox="0 0 110 40" aria-hidden>
        <path d="M10 14 L4 2 H14 L28 14 Z" fill="#6366f1" />
        <path d="M4 20 Q4 14 14 14 H86 Q104 14 108 22 Q104 26 90 26 H14 Q4 26 4 20 Z" fill="#eef2ff" stroke="#a5b4fc" strokeWidth={1.2} />
        {[30, 38, 46, 54, 62, 70, 78].map((x) => (
          <circle key={x} cx={x} cy={19} r={1.6} fill="#6366f1" />
        ))}
        <path d="M94 17 Q101 17 104 21 H94 Z" fill="#6366f1" />
        <path d="M44 23 L60 37 H70 L63 23 Z" fill="#818cf8" />
      </svg>
    </div>
  )
}

/**
 * One vehicle crossing the scene on a loop. `dir` is the way it travels; the
 * negative delay starts it part-way across so the road is busy on load.
 */
function Lane({
  dir,
  duration,
  delay,
  bottom,
  lead = 260,
  children,
}: {
  dir: 'ltr' | 'rtl'
  duration: number
  delay: number
  bottom: number
  lead?: number
  children: ReactNode
}) {
  const style = {
    bottom,
    animationDuration: `${duration}s`,
    animationDelay: `${-delay}s`,
    '--lead': `${lead}px`,
  } as CSSProperties
  return (
    <div className={`absolute inset-x-0 ${dir === 'ltr' ? 'drive-ltr' : 'drive-rtl'}`} style={style}>
      <div className={`absolute bottom-0 ${dir === 'ltr' ? 'right-full' : 'left-full'}`}>
        <div className={dir === 'rtl' ? '-scale-x-100' : undefined}>{children}</div>
      </div>
    </div>
  )
}

/* A deterministic skyline, so the server and browser draw the same one. */
function skyline(seed: number, count: number, minH: number, maxH: number) {
  let s = seed
  const rand = () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
  const out: { x: number; w: number; h: number }[] = []
  let x = 0
  for (let i = 0; i < count && x < 1200; i++) {
    const w = 34 + Math.round(rand() * 46)
    const h = minH + Math.round(rand() * (maxH - minH))
    out.push({ x, w, h })
    x += w + 4 + Math.round(rand() * 8)
  }
  return out
}

const FAR = skyline(7, 40, 40, 100)
const NEAR = skyline(19, 40, 30, 80)

function Skyline() {
  return (
    <svg className="absolute inset-x-0 bottom-[60px] h-[130px] w-full" viewBox="0 0 1200 130" preserveAspectRatio="xMidYMax slice" aria-hidden>
      {FAR.map((b) => (
        <rect key={`f${b.x}`} x={b.x} y={130 - b.h - 10} width={b.w} height={b.h + 10} rx={2} fill="var(--scene-city-far)" />
      ))}
      {NEAR.map((b, i) => (
        <g key={`n${b.x}`}>
          <rect x={b.x + 12} y={130 - b.h} width={b.w} height={b.h} rx={2} fill="var(--scene-city)" />
          {Array.from({ length: Math.floor((b.h - 12) / 14) }, (_, r) =>
            [0, 1].map((c) => (
              <rect
                key={`${r}-${c}`}
                className={(r + c + i) % 5 === 0 ? 'ill-blink' : undefined}
                style={{ animationDelay: `${((r * 3 + c + i) % 7) * 0.6}s` }}
                x={b.x + 12 + 8 + c * (b.w / 2 - 4)}
                y={130 - b.h + 8 + r * 14}
                width={Math.max(6, b.w / 2 - 16)}
                height={6}
                rx={1}
                fill="var(--scene-window)"
              />
            )),
          )}
        </g>
      ))}
      {[80, 260, 470, 690, 880, 1080].map((x) => (
        <g key={x}>
          <rect x={x - 1.5} y={112} width={3} height={18} fill="var(--scene-trunk)" />
          <circle cx={x} cy={106} r={11} fill="var(--scene-tree)" />
        </g>
      ))}
    </svg>
  )
}

export function TransportScene({ className = '' }: { className?: string }) {
  return (
    <div className={cn('pointer-events-none relative h-[220px] w-full select-none overflow-hidden', className)} aria-hidden>
      {/* Sky */}
      <Lane dir="ltr" duration={28} delay={9} bottom={170} lead={320}>
        <div className="ill-bob">
          <Plane />
        </div>
      </Lane>

      <Skyline />

      {/* Elevated track */}
      <div className="absolute inset-x-0 bottom-[66px] h-[3px] bg-[var(--scene-rail)]" />
      <div
        className="absolute inset-x-0 bottom-[56px] h-[10px] opacity-70"
        style={{ backgroundImage: 'repeating-linear-gradient(90deg, var(--scene-rail) 0 6px, transparent 6px 140px)' }}
      />
      <Lane dir="rtl" duration={16} delay={4} bottom={69} lead={420}>
        {/* Drawn facing left already; undo the lane's mirror. */}
        <div className="-scale-x-100">
          <Train />
        </div>
      </Lane>

      {/* Road */}
      <div className="absolute inset-x-0 bottom-0 h-[56px] bg-[var(--scene-road)]" />
      <div className="absolute inset-x-0 bottom-[56px] h-[3px] bg-[var(--scene-kerb)]" />
      <div
        className="absolute inset-x-0 bottom-[27px] h-[3px]"
        style={{ backgroundImage: 'repeating-linear-gradient(90deg, var(--scene-dash) 0 28px, transparent 28px 60px)' }}
      />

      {/* Each lane keeps one speed, vehicles evenly spaced, so nobody drives through anybody. */}
      {/* Far lane, right to left */}
      <Lane dir="rtl" duration={16} delay={0} bottom={30}>
        <Car />
      </Lane>
      <Lane dir="rtl" duration={16} delay={8} bottom={30}>
        <AutoRickshaw />
      </Lane>

      {/* Near lane, left to right */}
      <Lane dir="ltr" duration={21} delay={3} bottom={2}>
        <Bus />
      </Lane>
      <Lane dir="ltr" duration={21} delay={10} bottom={2}>
        <AutoRickshaw />
      </Lane>
      <Lane dir="ltr" duration={21} delay={17} bottom={2}>
        <Cyclist />
      </Lane>
    </div>
  )
}
