import { createFileRoute, Link } from '@tanstack/react-router'

export const Route = createFileRoute('/create')({
  component: CreatePage,
})

function CreatePage() {
  return (
    <main className="page-wrap px-4 py-16">
      <section className="mx-auto max-w-2xl space-y-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-primary">
          Survey builder
        </p>
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Create a new survey
        </h1>
        <p className="text-lg leading-relaxed text-muted-foreground">
          This is where you will define questions, answer types, and the layout
          of a questionnaire before publishing it for tablet data collection.
          The builder is not implemented yet.
        </p>
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
