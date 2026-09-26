import type { ReactNode } from 'react'

/** The shared frame of the privacy policy and the terms: a title, a date, sections. */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: ReactNode
}) {
  return (
    <main className="page-wrap px-4 py-16">
      <article className="mx-auto max-w-3xl space-y-8">
        <header className="space-y-2">
          <h1 className="text-4xl font-extrabold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">Last updated {updated}</p>
        </header>
        <div className="space-y-8 leading-relaxed text-muted-foreground [&_h2]:mb-2 [&_h2]:text-xl [&_h2]:font-bold [&_h2]:text-foreground [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
          {children}
        </div>
      </article>
    </main>
  )
}

export const CONTACT_EMAIL = 'sorowerhossan01@gmail.com'
