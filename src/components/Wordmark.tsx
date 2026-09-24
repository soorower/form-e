import { cn } from '#/lib/utils'

/*
 * The "form-e" wordmark: lowercase, in the rounded brand face (Nunito), with
 * the "e" drawn as a road — asphalt grey against the purple letters, amber
 * (purple's complement, and the colour of road markings) for the dashed
 * centre line and the arrowhead on the tail pointing onward.
 *
 * The e is a circle of radius 32 about (50, 52) in its own 100-unit box: the
 * crossbar runs left to right, then the bowl goes up and round anticlockwise
 * and stops 55° below the right, where the arrowhead takes over.
 */
const ROAD = 'M18 52 H82 A32 32 0 1 0 68.35 78.21'
const ARROW = 'M79.8 70.2 L76.6 89.5 L60.1 67 Z'

function RoadE({ lane, large }: { lane: boolean; large: boolean }) {
  return (
    <svg
      viewBox="9 12 82 82"
      aria-hidden
      className={cn('inline-block shrink-0 overflow-visible', large ? 'h-[1em] w-[1em]' : 'h-[0.6em] w-[0.6em]')}
      style={large ? { marginBottom: '-0.07em', marginLeft: '0.04em' } : { marginBottom: '-0.035em', marginLeft: '0.02em' }}
    >
      <path d={ROAD} fill="none" className="stroke-slate-700 dark:stroke-slate-500" strokeWidth={17} strokeLinejoin="round" />
      <path d={ARROW} className="fill-amber-400 stroke-amber-400" strokeWidth={2} strokeLinejoin="round" />
      {lane && (
        <path
          d={ROAD}
          fill="none"
          className="road-dash stroke-amber-300"
          strokeWidth={2.6}
          strokeDasharray="6 4"
          strokeLinecap="round"
        />
      )}
    </svg>
  )
}

/**
 * `feature` is the home page title: the e stands as tall as the "f" and its
 * centre line moves. Elsewhere (header, footer) the e is letter-sized and has
 * no centre line, which would be a smudge at that size.
 */
export function Wordmark({ className, feature = false }: { className?: string; feature?: boolean }) {
  return (
    <span
      role="img"
      aria-label="Form-E"
      className={cn(
        'inline-flex items-baseline whitespace-nowrap font-brand font-extrabold lowercase leading-none tracking-tight text-indigo-500 dark:text-indigo-400',
        className,
      )}
    >
      <span aria-hidden>form-</span>
      <RoadE lane={feature} large={feature} />
    </span>
  )
}
