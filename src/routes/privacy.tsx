import { createFileRoute } from '@tanstack/react-router'
import { CONTACT_EMAIL, LegalPage } from '#/components/LegalPage'

export const Route = createFileRoute('/privacy')({
  head: () => ({ meta: [{ title: 'Privacy policy · Form-E' }] }),
  component: Privacy,
})

function Privacy() {
  return (
    <LegalPage title="Privacy policy" updated="26 September 2026">
      <section>
        <p>
          Form-E is a survey tool for transportation research. Researchers build questionnaires,
          field teams collect answers on tablets, and the researchers download the answers for
          analysis. This page says what Form-E keeps and why.
        </p>
      </section>

      <section>
        <h2>Accounts</h2>
        <p>
          Survey builders, surveyors and administrators sign in with Google or with an email
          address and password. Form-E keeps the account&apos;s name, email address and, for Google
          accounts, the profile picture Google provides. It uses them only to sign the person in,
          to show who collected which responses, and to let the administrator approve accounts.
          Passwords are stored only as secure hashes. Form-E asks Google for nothing beyond the
          basic profile (name, email, picture).
        </p>
      </section>

      <section>
        <h2>Survey responses</h2>
        <p>
          The answers respondents give are stored so the research team running that survey can
          analyse them. A survey may also ask for the respondent&apos;s name, email, phone number
          or address when the research needs it; these are optional unless the survey marks them
          as required. Each response also records the survey number, the enumerator who collected
          it, and when it was collected.
        </p>
        <ul>
          <li>Only the survey&apos;s own team and the administrator can see its responses.</li>
          <li>Responses are never sold, and are not used for advertising.</li>
          <li>
            A tablet that is offline keeps a response on the device only until it can be sent.
          </li>
        </ul>
      </section>

      <section>
        <h2>Where the data is kept</h2>
        <p>
          Data is stored with Convex (the database) and the site is served by Vercel. Sign-in codes
          are sent by email. These services process the data only to run Form-E.
        </p>
      </section>

      <section>
        <h2>Keeping and deleting data</h2>
        <p>
          Responses are kept for as long as the research team keeps its survey. Deleting a survey
          deletes its responses. To see, correct or delete your account or answers you gave, write
          to <a className="text-primary underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </section>
    </LegalPage>
  )
}
