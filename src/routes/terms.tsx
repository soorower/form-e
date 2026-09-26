import { createFileRoute } from '@tanstack/react-router'
import { CONTACT_EMAIL, LegalPage } from '#/components/LegalPage'

export const Route = createFileRoute('/terms')({
  head: () => ({ meta: [{ title: 'Terms of service · Form-E' }] }),
  component: Terms,
})

function Terms() {
  return (
    <LegalPage title="Terms of service" updated="26 September 2026">
      <section>
        <h2>Using Form-E</h2>
        <p>
          Form-E is provided for building and running research surveys. Accounts are approved by
          the Form-E administrator, who may pause or remove an account that misuses the service.
        </p>
      </section>
      <section>
        <h2>Your surveys and data</h2>
        <p>
          The research team that runs a survey owns its questions and the responses it collects, and
          is responsible for having respondents&apos; consent and for handling their answers
          lawfully. Do not collect more personal information than the research needs.
        </p>
      </section>
      <section>
        <h2>No warranty</h2>
        <p>
          Form-E is offered as it is. Download your responses regularly; the service may change or
          be unavailable at times.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Questions: <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalPage>
  )
}
