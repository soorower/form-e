import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({
  component: About,
})

const workflow = [
  {
    step: '01',
    title: 'Build',
    body: 'Design a questionnaire from scratch. Every survey has its own questions, answer types, and layout, so no two forms need to look alike.',
  },
  {
    step: '02',
    title: 'Collect',
    body: 'Generated forms are laid out for tablets and iPads, so field teams can hand a device to a respondent and capture answers on the spot.',
  },
  {
    step: '03',
    title: 'Export',
    body: 'Responses are stored as they arrive. Download the full dataset as Excel, CSV, or JSON whenever you are ready to model.',
  },
]

function About() {
  return (
    <main className="page-wrap px-4 py-16">
      <section className="mx-auto max-w-3xl space-y-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
          About
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Surveys built for mode choice research.
        </h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          Form-E is a form builder for transportation mode choice modelling.
          Researchers design their own questionnaires on the web, run them on
          tablets in the field, and pull the collected responses straight into
          their analysis tools.
        </p>
      </section>

      <section className="mx-auto mt-16 grid max-w-3xl gap-6 sm:grid-cols-3">
        {workflow.map(({ step, title, body }) => (
          <article
            key={step}
            className="space-y-3 rounded-2xl border border-border bg-card p-6 text-card-foreground shadow-sm"
          >
            <span className="text-xs font-bold tracking-[0.2em] text-primary">
              {step}
            </span>
            <h2 className="text-xl font-bold tracking-tight">{title}</h2>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {body}
            </p>
          </article>
        ))}
      </section>

      <section className="mx-auto mt-16 flex max-w-3xl flex-wrap gap-3">
        <Link
          to="/create"
          className="inline-flex h-11 items-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground no-underline transition-opacity hover:opacity-90"
        >
          Start a survey
        </Link>
        <Link
          to="/"
          className="inline-flex h-11 items-center rounded-xl border border-border px-5 text-sm font-semibold text-foreground no-underline transition-colors hover:bg-muted"
        >
          Back to home
        </Link>
      </section>
    </main>
  )
}
