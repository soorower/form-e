import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { Button } from '#/components/ui/button'
import { BrandMark } from '#/components/BrandMark'
import { Wordmark } from '#/components/Wordmark'
import { FileSpreadsheet, Plane, Ship, TabletSmartphone, TramFront, Workflow } from 'lucide-react'
import { TransportScene } from '#/components/landing/TransportScene'
import {
  AnalyzeIllustration,
  FieldIllustration,
  TeamIllustration,
} from '#/components/landing/Illustrations'

export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'Form-E · Transportation survey builder' }] }),
  component: HomePage,
})

function CarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 36C12 34 14 32 16 32H48C50 32 52 34 52 36V46H12V36Z" fill="currentColor" opacity="0.2" />
      <path d="M18 32L22 22C23 20 25 18 27 18H37C39 18 41 20 42 22L46 32" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="12" y="32" width="40" height="14" rx="3" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="20" cy="46" r="5" fill="currentColor" />
      <circle cx="44" cy="46" r="5" fill="currentColor" />
      <circle cx="20" cy="46" r="2" fill="white" />
      <circle cx="44" cy="46" r="2" fill="white" />
      <path d="M46 36H48" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M16 36H18" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
    </svg>
  )
}

function BusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="14" y="12" width="36" height="34" rx="4" fill="currentColor" opacity="0.15" />
      <rect x="14" y="12" width="36" height="34" rx="4" stroke="currentColor" strokeWidth="2.5" />
      <rect x="18" y="18" width="12" height="10" rx="2" fill="currentColor" opacity="0.25" />
      <rect x="34" y="18" width="12" height="10" rx="2" fill="currentColor" opacity="0.25" />
      <path d="M14 34H50" stroke="currentColor" strokeWidth="2" />
      <circle cx="22" cy="46" r="4" fill="currentColor" />
      <circle cx="42" cy="46" r="4" fill="currentColor" />
      <rect x="26" y="38" width="12" height="4" rx="1" fill="currentColor" opacity="0.3" />
    </svg>
  )
}

function TrainIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M16 12C16 10 18 8 20 8H44C46 8 48 10 48 12V44H16V12Z" fill="currentColor" opacity="0.15" />
      <path d="M16 44L12 52H52L48 44" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="16" y="8" width="32" height="36" rx="4" stroke="currentColor" strokeWidth="2.5" />
      <rect x="20" y="14" width="24" height="14" rx="2" fill="currentColor" opacity="0.25" />
      <circle cx="24" cy="36" r="3" fill="currentColor" />
      <circle cx="40" cy="36" r="3" fill="currentColor" />
      <path d="M28 36H36" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
    </svg>
  )
}

function BikeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="44" r="9" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="46" cy="44" r="9" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="18" cy="44" r="3" fill="currentColor" opacity="0.4" />
      <circle cx="46" cy="44" r="3" fill="currentColor" opacity="0.4" />
      <path d="M18 44L28 24L44 24L46 44" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M28 24L32 14H40" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function RoadLines() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-[0.04]">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="absolute h-px bg-current"
          style={{
            top: `${15 + i * 14}%`,
            left: '-10%',
            right: '-10%',
            transform: `rotate(${-2 + i * 0.8}deg)`,
          }}
        />
      ))}
    </div>
  )
}

const floatingItems = [
  { Icon: CarIcon, size: 'size-16', top: '8%', left: '5%', delay: '0s', duration: '20s', color: 'text-rose-500' },
  { Icon: BusIcon, size: 'size-20', top: '15%', right: '8%', delay: '3s', duration: '25s', color: 'text-amber-500' },
  { Icon: TrainIcon, size: 'size-14', top: '60%', left: '8%', delay: '5s', duration: '22s', color: 'text-blue-500' },
  { Icon: BikeIcon, size: 'size-12', top: '70%', right: '12%', delay: '2s', duration: '18s', color: 'text-emerald-500' },
  { Icon: Plane, size: 'size-14', top: '25%', left: '80%', delay: '7s', duration: '28s', color: 'text-sky-500' },
  { Icon: Ship, size: 'size-12', top: '45%', left: '15%', delay: '4s', duration: '23s', color: 'text-indigo-500' },
  { Icon: BusIcon, size: 'size-12', top: '80%', left: '70%', delay: '6s', duration: '19s', color: 'text-orange-500' },
  { Icon: BikeIcon, size: 'size-14', top: '35%', right: '5%', delay: '1s', duration: '21s', color: 'text-green-500' },
  { Icon: TramFront, size: 'size-10', top: '5%', left: '45%', delay: '8s', duration: '24s', color: 'text-purple-500' },
  { Icon: CarIcon, size: 'size-12', top: '85%', left: '35%', delay: '9s', duration: '26s', color: 'text-red-500' },
]

function HomePage() {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState<string | null>(null)

  return (
    <main className="relative flex flex-col items-center overflow-hidden px-4">
      {/* Dynamic background background lines */}
      <div className="pointer-events-none absolute inset-0 opacity-10">
        <div className="absolute left-1/4 top-0 h-full w-px bg-gradient-to-b from-transparent via-foreground to-transparent" />
        <div className="absolute left-2/4 top-0 h-full w-px bg-gradient-to-b from-transparent via-foreground to-transparent" />
        <div className="absolute left-3/4 top-0 h-full w-px bg-gradient-to-b from-transparent via-foreground to-transparent" />
        <div className="absolute top-1/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-foreground to-transparent" />
        <div className="absolute top-2/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-foreground to-transparent" />
        <div className="absolute top-3/4 left-0 w-full h-px bg-gradient-to-r from-transparent via-foreground to-transparent" />
      </div>

      {/* Animated background gradient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[32rem] w-[32rem] animate-pulse rounded-full bg-indigo-500/10 blur-[100px]" style={{ animationDuration: '8s' }} />
        <div className="absolute -bottom-40 -right-32 h-[40rem] w-[40rem] animate-pulse rounded-full bg-violet-500/10 blur-[120px]" style={{ animationDuration: '10s', animationDelay: '2s' }} />
        <div className="absolute left-1/2 top-1/2 h-[30rem] w-[30rem] -translate-x-1/2 -translate-y-1/2 animate-pulse rounded-full bg-blue-500/5 blur-[80px]" style={{ animationDuration: '12s', animationDelay: '4s' }} />
      </div>

      <RoadLines />

      {/* Center content */}
      <div className="relative flex min-h-[calc(100vh-4rem)] w-full flex-col">
        {/* Floating (kept to the hero, above the street) transportation icons */}
        {floatingItems.map(({ Icon, size, delay, duration, color, ...pos }, i) => (
          <div
            key={i}
            className={`pointer-events-none absolute hidden sm:block ${color} opacity-20 dark:opacity-40 transition-opacity duration-1000`}
            style={{
              ...pos,
              animation: `float-${i % 3} ${duration} ${delay} ease-in-out infinite`,
            }}
          >
            <Icon className={size} />
          </div>
        ))}

      <div className="flex flex-1 items-center justify-center py-12">
      <div className="rise-in relative z-10 flex flex-col items-center gap-12 text-center max-w-4xl">
        {/* Logo / Brand mark */}
        <div className="group relative">
          <div className="absolute -inset-12 animate-pulse rounded-full bg-gradient-to-tr from-indigo-500/20 via-violet-500/20 to-blue-500/20 blur-3xl" />
          <BrandMark
            size={96}
            className="relative shadow-2xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-3"
          />
        </div>

        <div className="space-y-6">
          <h1 className="text-7xl sm:text-8xl lg:text-9xl">
            <Wordmark feature className="drop-shadow-sm" />
          </h1>
          <p className="mx-auto max-w-2xl text-xl font-medium text-muted-foreground/90 sm:text-2xl leading-relaxed">
            The next generation of <span className="text-foreground">transportation mode choice</span> modelling. 
            Build, deploy, and analyze surveys with unprecedented speed.
          </p>
        </div>

        {/* Stats / trust signals */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 w-full max-w-2xl">
          {[
            { label: 'Optimized For', value: 'Tablets & iPads', Icon: TabletSmartphone, tint: 'bg-indigo-500/10 text-indigo-500' },
            { label: 'Data Ready', value: 'Excel / CSV / JSON', Icon: FileSpreadsheet, tint: 'bg-emerald-500/10 text-emerald-500' },
            { label: 'Survey Flow', value: 'Dynamic & Smart', Icon: Workflow, tint: 'bg-amber-500/10 text-amber-500' },
          ].map(({ label, value, Icon, tint }) => (
            <div key={label} className="flex flex-col items-center gap-2 p-6 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md shadow-lg transition-transform hover:-translate-y-1">
              <span className={`flex size-10 items-center justify-center rounded-xl ${tint}`}>
                <Icon className="size-5" />
              </span>
              <div className="flex flex-col">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-indigo-500/70">{label}</span>
                <span className="text-sm font-bold text-foreground/90">{value}</span>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Buttons */}
        <div className="flex flex-col gap-6 sm:flex-row items-center justify-center">
          <Button
            size="lg"
            className="group relative h-16 cursor-pointer overflow-hidden rounded-2xl bg-indigo-600 px-12 text-lg font-bold text-white shadow-2xl shadow-indigo-500/20 transition-all hover:scale-105 active:scale-95"
            onMouseEnter={() => setHovered('create')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => navigate({ to: '/create' })}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-indigo-400 to-violet-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
            <span className="relative z-10 flex items-center gap-3">
              Get Started
              <svg
                className={`size-6 transition-transform duration-300 ${hovered === 'create' ? 'translate-x-1' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </span>
          </Button>

          <Button
            variant="ghost"
            size="lg"
            className="h-16 rounded-2xl px-12 text-lg font-semibold transition-all hover:bg-white/10 hover:backdrop-blur-xl border border-transparent hover:border-white/20"
            onMouseEnter={() => setHovered('learn')}
            onMouseLeave={() => setHovered(null)}
            onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })}
          >
            <span className="flex items-center gap-2">
              Learn More
              <svg
                className={`size-5 transition-transform duration-300 ${hovered === 'learn' ? 'translate-y-1' : ''}`}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </span>
          </Button>
        </div>
      </div>
      </div>
      {/* Full-bleed street along the bottom of the hero. */}
      <TransportScene className="-mx-4 w-[calc(100%+2rem)]" />
      </div>

      <IllustrationShowcase />
    </main>
  )
}

const showcase = [
  { Art: TeamIllustration, title: 'Design together', bar: 'bg-blue-600', value: 72 },
  { Art: FieldIllustration, title: 'Collect in the field', bar: 'bg-rose-500', value: 54 },
  { Art: AnalyzeIllustration, title: 'Export & analyze', bar: 'bg-violet-500', value: 90 },
]

/** Animated illustrations below the hero; each card rises in when scrolled to. */
function IllustrationShowcase() {
  const ref = useRef<HTMLElement>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (!('IntersectionObserver' in window)) {
      setShown(true)
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true)
          observer.disconnect()
        }
      },
      { threshold: 0.15 },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={ref} id="how-it-works" className="relative z-10 w-full max-w-6xl scroll-mt-24 py-20">
      <div className="mb-10 text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-500">How it works</p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl">From questionnaire to dataset</h2>
      </div>
      <div className="grid gap-6 md:grid-cols-3">
        {showcase.map(({ Art, title, bar, value }, i) => (
          <div
            key={title}
            className={`rounded-3xl border bg-card/80 p-6 shadow-xl backdrop-blur-md transition-all duration-700 ease-out hover:-translate-y-1 ${
              shown ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'
            }`}
            style={{ transitionDelay: shown ? `${i * 150}ms` : '0ms' }}
          >
            <Art className="aspect-[26/22] w-full" />
            <h3 className="mt-4 text-center text-lg font-bold">{title}</h3>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className={`ill-fill h-full rounded-full ${bar}`}
                style={{ width: `${value}%`, animationDelay: `${i * 0.4}s` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
