# Form-E

A form builder and tablet survey app for **transportation mode-choice** research: creators design bilingual (English / Bangla) questionnaires — including stated-preference choice experiments built from design cards — enumerators fill them in on tablets in the field, and the responses come back as Excel, CSV or JSON.

Live: <https://forme-survey.vercel.app>

## Stack

- [TanStack Start](https://tanstack.com/start) (React 19, file-based routes, SSR through Nitro) with shadcn/ui and Tailwind CSS v4
- [Convex](https://convex.dev) for the database and server functions, [Convex Auth](https://labs.convex.dev/auth) for sign-in (Google, or email + password)
- Vitest for tests, Vercel for hosting

## Running it locally

```bash
npm install
npx convex dev        # first run: creates a Convex project and writes .env.local
npm run dev           # http://localhost:3000
```

`npx convex dev` keeps running and pushes `convex/` whenever it changes; `npx convex dev --once` pushes and exits. `.env.local` holds `CONVEX_DEPLOYMENT`, `CONVEX_URL` and `VITE_CONVEX_URL` (the one the browser sees).

### Deployment variables

Set these on the Convex deployment (`npx convex env set NAME value`, or the dashboard):

| Variable | What it is |
| --- | --- |
| `JWT_PRIVATE_KEY`, `JWKS` | Convex Auth's signing keys. `npx @convex-dev/auth` generates them. |
| `SITE_URL` | Where a Google sign-in lands afterwards, e.g. `http://localhost:3000`. |
| `EXTRA_SITE_URLS` | Comma-separated further origins that may finish a sign-in, e.g. the hosted site. |
| `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` | A Google OAuth client whose redirect URI is `https://<deployment>.convex.site/api/auth/callback/google`. |
| `ADMIN_EMAILS` | Comma-separated addresses that count as admins once they sign in **with Google** (the bootstrap; further admins are promoted from the panel). |

Email + password sign-in needs nothing more, but it sends no verification mail: such an account waits until an admin approves it on `/admin`.

## Roles

- **Admin** (`/admin`, a separate sign-in from the app): approves accounts, makes groups, hands surveys to builders and groups, assigns surveyors, and can build surveys too.
- **Builder**: creates and edits surveys, previews them, downloads responses, follows the team dashboard and chat.
- **Surveyor**: fills the surveys assigned to them, one question at a time, and sees the team's progress and chat.

The respondent-facing form (`/surveys/<id>/fill`) needs no sign-in, so a shared tablet works; a signed-in surveyor is recorded under their own name.

## Commands

```bash
npm run dev       # dev server on port 3000
npm run test      # Vitest
npm run build     # production build
vercel --prod     # deploy the working directory (VITE_CONVEX_URL is set on the Vercel project)
```

`CLAUDE.md` describes the code in detail: the card-table conventions for choice experiments, how cards are balanced across tablets, the outbox that keeps a response on the tablet until the server has it, the export layout, and the access rules.
