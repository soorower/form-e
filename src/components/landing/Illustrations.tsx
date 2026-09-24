import type { CSSProperties, ReactNode } from 'react'

/*
 * Flat people-and-props illustrations for the home page, animated with the
 * `ill-*` loops in styles.css (bobbing bubbles, swaying people and leaves,
 * a turning clock hand, bars and grid cells that pulse, a line that draws).
 */

const C = {
  purple: '#8b5cf6',
  blue: '#1d4ed8',
  sky: '#3b82f6',
  pink: '#f43f5e',
  amber: '#f59e0b',
  orange: '#f97316',
  // Themed in styles.css: near-black hair, shoes and navy vanish on a dark
  // card, so dark mode lifts them.
  navy: 'var(--ill-navy)',
  hair: 'var(--ill-hair)',
  surface: 'var(--ill-surface)',
  skin: '#fbc7b0',
  lav: '#c7d2fe',
  lav2: '#a5b4fc',
  white: '#ffffff',
}

const delay = (s: number): CSSProperties => ({ animationDelay: `${s}s` })

type HairStyle = 'short' | 'bun' | 'curly' | 'long'
type Pose = 'rest' | 'hold' | 'point'

/** A standing figure, feet at (0, 0), about 170 units tall. */
function Person({
  shirt,
  pants,
  hair = C.hair,
  hairStyle = 'short',
  glasses = false,
  pose = 'rest',
  children,
}: {
  shirt: string
  pants: string
  hair?: string
  hairStyle?: HairStyle
  glasses?: boolean
  pose?: Pose
  children?: ReactNode
}) {
  const arm = { stroke: shirt, strokeWidth: 9, strokeLinecap: 'round' as const, fill: 'none' }
  return (
    <g>
      {hairStyle === 'long' && (
        <path d="M-13 -148 Q-19 -118 -25 -98 Q-8 -100 0 -118 Q8 -100 22 -102 Q15 -120 13 -148 Z" fill={hair} />
      )}
      <path d="M-15 -70 L-13 -2 L-3 -2 L-1 -70 Z" fill={pants} />
      <path d="M1 -70 L3 -2 L13 -2 L15 -70 Z" fill={pants} />
      <ellipse cx={-9} cy={0} rx={8} ry={3} fill={C.hair} />
      <ellipse cx={9} cy={0} rx={8} ry={3} fill={C.hair} />

      {pose === 'hold' ? (
        <>
          <path d="M-19 -118 Q-27 -100 -12 -96" {...arm} />
          <path d="M19 -118 Q27 -100 12 -96" {...arm} />
        </>
      ) : (
        <>
          <path d="M-20 -118 Q-30 -95 -24 -74" {...arm} />
          <circle cx={-24} cy={-71} r={4.5} fill={C.skin} />
          {pose === 'point' ? (
            <>
              <path d="M20 -118 Q34 -128 40 -148" {...arm} />
              <circle cx={41} cy={-152} r={4.5} fill={C.skin} />
            </>
          ) : (
            <>
              <path d="M20 -118 Q30 -95 24 -74" {...arm} />
              <circle cx={24} cy={-71} r={4.5} fill={C.skin} />
            </>
          )}
        </>
      )}

      <path d="M-17 -66 L-21 -112 Q-21 -127 -7 -128 L7 -128 Q21 -127 21 -112 L17 -66 Z" fill={shirt} />
      <rect x={-4} y={-135} width={8} height={9} fill={C.skin} />
      <ellipse cx={0} cy={-145} rx={11} ry={12.5} fill={C.skin} />

      {hairStyle === 'curly' ? (
        <g fill={hair}>
          <circle cx={-8} cy={-154} r={5.5} />
          <circle cx={0} cy={-158} r={6.5} />
          <circle cx={8} cy={-154} r={5.5} />
          <circle cx={0} cy={-166} r={5.5} />
        </g>
      ) : (
        <path d="M-12 -146 Q-13 -160 0 -159 Q13 -160 12 -146 Q7 -152 -1 -152 Q-8 -152 -12 -146 Z" fill={hair} />
      )}
      {hairStyle === 'bun' && <circle cx={0} cy={-163} r={6.5} fill={hair} />}
      {glasses && (
        <g stroke={C.hair} strokeWidth={1.2} fill="none">
          <circle cx={-5} cy={-144} r={3.5} />
          <circle cx={5} cy={-144} r={3.5} />
          <path d="M-1.5 -144 H1.5" />
        </g>
      )}
      {children}
    </g>
  )
}

/** Place a figure and let it sway from the feet. */
function Figure({
  x,
  y,
  scale,
  mirror = false,
  sway = 0,
  children,
}: {
  x: number
  y: number
  scale: number
  mirror?: boolean
  sway?: number
  children: ReactNode
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${mirror ? -scale : scale} ${scale})`}>
      <g className="ill-sway" style={delay(sway)}>
        {children}
      </g>
    </g>
  )
}

/** A tablet held in front of the chest, its rows filling in one by one. */
function HeldTablet() {
  return (
    <g>
      <rect x={-17} y={-108} width={34} height={22} rx={3} fill={C.lav} stroke={C.lav2} strokeWidth={1.5} />
      {[-102, -97, -92].map((y, i) => (
        <rect key={y} className="ill-write" style={delay(i * 0.5)} x={-11} y={y} width={i === 2 ? 14 : 22} height={2.4} rx={1.2} fill={C.sky} />
      ))}
    </g>
  )
}

function Bubble({ x, y, d = 0, children }: { x: number; y: number; d?: number; children: ReactNode }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g className="ill-bob" style={delay(d)}>
        <path d="M-6 15 L-2 25 L6 15 Z" fill={C.lav} />
        <circle r={18} fill={C.lav} />
        {children}
      </g>
    </g>
  )
}

function BarsIcon() {
  return (
    <g fill={C.white}>
      {[
        { x: -9, h: 10, d: 0 },
        { x: -2, h: 16, d: 0.3 },
        { x: 5, h: 12, d: 0.6 },
      ].map((b) => (
        <rect key={b.x} className="ill-bar" style={delay(b.d)} x={b.x} y={8 - b.h} width={4.5} height={b.h} rx={1} />
      ))}
    </g>
  )
}

function MailIcon() {
  return (
    <g>
      <rect x={-10} y={-7} width={20} height={14} rx={2} fill={C.white} />
      <path d="M-10 -6 L0 2 L10 -6" stroke={C.lav2} strokeWidth={1.8} fill="none" strokeLinejoin="round" />
    </g>
  )
}

function BulbIcon() {
  return (
    <g>
      <circle className="ill-blink" cy={-3} r={11} fill={C.white} opacity={0.5} />
      <circle cy={-3} r={6.5} fill={C.white} />
      <rect x={-3.5} y={4} width={7} height={5} rx={1} fill={C.white} />
    </g>
  )
}

function Plant({ x, y, scale = 1, d = 0 }: { x: number; y: number; scale?: number; d?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      <g className="ill-leaf" style={delay(d)}>
        <path d="M0 -30 Q-20 -46 -15 -70 Q2 -56 0 -30 Z" fill={C.lav} />
        <path d="M0 -30 Q14 -54 8 -80 Q-6 -60 0 -30 Z" fill={C.lav2} />
        <path d="M0 -30 Q20 -38 28 -58 Q8 -54 0 -30 Z" fill={C.lav} />
      </g>
      <path d="M-12 -30 H12 L9 0 H-9 Z" fill={C.lav2} />
    </g>
  )
}

function Ground({ cx, rx }: { cx: number; rx: number }) {
  return <ellipse cx={cx} cy={212} rx={rx} ry={5} fill={C.lav} opacity={0.45} />
}

/** Three colleagues with ideas in the air: building the questionnaire. */
export function TeamIllustration({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 260 220" fill="none" role="img" aria-label="A team planning a survey together">
      <Ground cx={130} rx={118} />
      <Bubble x={46} y={38} d={0}>
        <BarsIcon />
      </Bubble>
      <Bubble x={130} y={26} d={0.8}>
        <MailIcon />
      </Bubble>
      <Bubble x={214} y={38} d={1.6}>
        <BulbIcon />
      </Bubble>
      <Figure x={72} y={212} scale={0.82} sway={0}>
        <Person shirt={C.purple} pants={C.blue} hairStyle="bun" glasses />
      </Figure>
      <Figure x={188} y={212} scale={0.82} sway={1.4}>
        <Person shirt={C.amber} pants={C.navy} hairStyle="curly" hair={C.navy} />
      </Figure>
      <Figure x={130} y={212} scale={0.82} sway={0.7}>
        <Person shirt={C.blue} pants={C.pink} hairStyle="bun" pose="hold">
          <HeldTablet />
        </Person>
      </Figure>
      <Plant x={238} y={212} scale={0.75} d={0.4} />
    </svg>
  )
}

/** Two enumerators with a tablet, a clock ticking on the wall. */
export function FieldIllustration({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 260 220" fill="none" role="img" aria-label="Enumerators collecting answers on a tablet">
      <Ground cx={130} rx={110} />
      <Bubble x={62} y={40} d={0.3}>
        <BulbIcon />
      </Bubble>

      {/* Clock: the minute hand goes round. */}
      <g transform="translate(206 52)">
        <circle r={20} fill={C.surface} stroke={C.lav2} strokeWidth={3} />
        <path d="M0 0 L7 4" stroke={C.lav2} strokeWidth={2.5} strokeLinecap="round" />
        <g className="ill-spin">
          <circle r={14} fill="transparent" />
          <path d="M0 0 V-13" stroke={C.sky} strokeWidth={2} strokeLinecap="round" />
        </g>
        <circle r={2.2} fill={C.lav2} />
      </g>

      {/* Shelf with a frame and a vase. */}
      <g>
        <rect x={188} y={124} width={62} height={3} rx={1.5} fill={C.lav2} />
        <rect x={196} y={100} width={18} height={24} rx={2} fill={C.lav} />
        <rect x={200} y={104} width={10} height={16} rx={1} fill={C.surface} />
        <path d="M232 124 L234 108 H240 L242 124 Z" fill={C.lav2} />
        <g className="ill-leaf" style={delay(1)}>
          <path d="M237 108 Q232 96 236 86 M237 108 Q244 98 243 90" stroke={C.lav2} strokeWidth={1.6} fill="none" />
        </g>
      </g>

      <Figure x={100} y={212} scale={0.9} sway={0.2}>
        <Person shirt={C.purple} pants={C.blue} hairStyle="long" glasses pose="hold">
          <HeldTablet />
        </Person>
      </Figure>
      <Figure x={152} y={212} scale={0.9} sway={1.1}>
        <Person shirt={C.orange} pants={C.navy} hairStyle="curly" hair={C.blue} glasses />
      </Figure>
      <Plant x={222} y={212} scale={0.85} d={0} />
    </svg>
  )
}

/** Two analysts at a board of results, a laptop between them. */
export function AnalyzeIllustration({ className }: { className?: string }) {
  const cells = Array.from({ length: 18 }, (_, i) => ({ col: i % 6, row: Math.floor(i / 6), i }))
  const lit: Record<number, { color: string; d: number }> = {
    2: { color: C.sky, d: 0 },
    7: { color: C.pink, d: 0.6 },
    10: { color: C.sky, d: 1.2 },
    15: { color: C.amber, d: 1.8 },
    4: { color: C.purple, d: 2.4 },
  }
  return (
    <svg className={className} viewBox="0 0 260 220" fill="none" role="img" aria-label="Analysts reading survey results">
      <Ground cx={130} rx={118} />

      {/* Results board: cells light up, a trend line draws across. */}
      <rect x={62} y={12} width={136} height={84} rx={8} fill={C.surface} stroke={C.lav2} strokeWidth={2} />
      {cells.map(({ col, row, i }) => (
        <rect key={i} x={70 + col * 20.5} y={21 + row * 23} width={17} height={19} rx={3} fill={C.lav} opacity={0.4} />
      ))}
      {Object.entries(lit).map(([k, { color, d }]) => {
        const i = Number(k)
        return (
          <rect key={k} className="ill-blink" style={delay(d)} x={70 + (i % 6) * 20.5} y={21 + Math.floor(i / 6) * 23} width={17} height={19} rx={3} fill={color} />
        )
      })}
      <polyline className="ill-draw" points="72,82 94,66 114,72 136,46 156,54 178,28 190,32" stroke={C.blue} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />

      {/* Table with a laptop. */}
      <rect x={112} y={140} width={36} height={22} rx={2} fill={C.lav2} />
      <rect x={116} y={144} width={28} height={14} rx={1} fill={C.surface} />
      <rect className="ill-write" x={119} y={147} width={16} height={2.4} rx={1.2} fill={C.pink} />
      <rect className="ill-write" style={delay(0.6)} x={119} y={152} width={22} height={2.4} rx={1.2} fill={C.sky} />
      <path d="M104 162 H156 L152 166 H108 Z" fill={C.lav} />
      <rect x={96} y={166} width={68} height={4} rx={2} fill={C.lav2} />
      <path d="M130 170 V208 M118 210 H142" stroke={C.lav2} strokeWidth={4} strokeLinecap="round" />

      <Figure x={56} y={212} scale={0.8} sway={0.3}>
        <Person shirt={C.pink} pants={C.navy} hairStyle="long" pose="point" />
      </Figure>
      <Figure x={204} y={212} scale={0.8} mirror sway={1.2}>
        <Person shirt={C.sky} pants={C.blue} hairStyle="short" glasses pose="point" />
      </Figure>
      <Plant x={16} y={212} scale={0.6} d={0.9} />
    </svg>
  )
}
