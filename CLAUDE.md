# Form-E

## Project Overview

A form-building and surveying web application focused on **transportation mode choice modelling** questionnaire surveys.

## Core Concept

- Survey creators design custom questionnaire forms through the website (each questionnaire has a unique set of values/questions — forms are NOT identical)
- The website takes input from creators on how they want their form to look and generates the form
- Generated forms are optimized for display on **tablets / iPads** for field data collection
- Respondents answer questions on the tablet
- Responses are stored in a **database**
- Survey creators can **download** collected responses as **Excel, CSV, or JSON**

## Tech Stack

- **Framework:** TanStack Start (file-based routing)
- **Data Fetching:** TanStack Query (SSR-integrated)
- **UI:** shadcn/ui + Tailwind CSS v4
- **Language:** TypeScript
- **Backend/Database:** Convex (project `form-e`, dev deployment `avid-starling-222`)
- **Export:** Excel (.xlsx), CSV, JSON

## UI Rules

- **Always use shadcn/ui components and Tailwind CSS** for all UI work. Do not use other component libraries or custom styling approaches.

## Key Features

1. **Form Builder** — UI for creators to define questions, answer types, and form layout
2. **Dynamic Form Renderer** — Renders any created form for respondents on tablet/iPad
3. **Response Collection** — Stores all survey responses in a database
4. **Data Export** — Download responses in Excel, CSV, or JSON format
5. **Survey Management** — Dashboard to manage surveys, view response counts, and access exports

## Commands

- `npm run dev` — Start dev server on port 3000
- `npm run build` — Production build
- `npm run preview` — Preview production build
- `npm run test` — Run tests with Vitest

## Text and Formatting

- `LocalizedText` is `{ en, bn, style? }`. `style` (`TextStyle`: bold / italic / underline / align) applies to both languages. `FORM_TEXT_DEFAULTS` in `src/lib/questionnaire/text-style.ts` defines each text's default look; the builder toolbar (`TextStyleToolbar`) and the renderer both resolve against it, so only deviations from the default are stored.
- The questionnaire header shows logo, title, `institution` (department / university line), then description.

## Survey Numbers and Enumerators

- Each response carries `serial` (assigned server-side, globally unique per survey), `surveyNumber` (`surveyCodePrefix` + zero-padded serial, e.g. `ACBUS-007`), and `enumerator` (team member name).
- `Questionnaire.enumerators` lists the team; when non-empty the tablet must pick a name before submitting, and the choice is remembered per device (`forme:enumerator`). Empty list = free-text name.
- The Responses tab shows counts per enumerator; exports put `Survey no.` and `Enumerator` right after `Response ID`.

## Convex Data Layer

- Live. `npx convex dev` (a watcher: it stays running and re-pushes on save; `--once` pushes and exits). `.env.local` holds `CONVEX_DEPLOYMENT`, `CONVEX_URL`, and `VITE_CONVEX_URL` — the browser only sees the `VITE_`-prefixed one.
- Functions: `convex/questionnaires.ts` (list/get/save/remove, cascading delete), `convex/responses.ts` (listBySurvey/listAll/nextSerial/submit/importMany), `convex/messages.ts` (list/send). Shared validators live in `convex/validators.ts` so the schema and mutation args cannot drift.
- Cross-references use the **app-level `id` string**, not a Convex `_id`, so survey URLs stay stable and offline-created rows upload unchanged. `by_app_id` indexes back this.
- **Always strip `_id`/`_creationTime` from query results** with `stripSystemFields` / `stripSystemFieldsAll` (`src/lib/convex/rows.ts`) before using a row as app data or passing it back into a mutation — the validators reject extra fields.
- Every hook takes `'skip'` until `useConvexReady()` is true, so nothing subscribes during SSR.
- **Convex object field names must be non-control ASCII.** A choice experiment keys `levelLabels` by raw level text (which contains newlines for discrete levels) and each card's `levels` by column name (which may be Bangla), so neither can be a `v.record`. Both travel as arrays of `{key, value}` pairs; `src/lib/convex/questionnaire-codec.ts` converts on the way in and out, and **every** save must go through `encodeQuestionnaire` and every read through `decodeQuestionnaire`.
- Serials are assigned **server-side** in `responses.submit`, so survey numbers are unique across all tablets. The number shown before submitting is a prediction; the confirmation screen shows what the server actually assigned.
- Panels that edit server data (survey builder via `useQuestionnaire`, `TeamEditor`) keep a **local draft with a debounced save**; writing each keystroke straight through lets a slow reply overwrite what is being typed.
- `src/lib/questionnaire/storage.ts` and `src/lib/team/chat.ts` are now legacy: the device-local enumerator preference plus a migration source for `LocalDataImport`.

## Authentication (Convex Auth)

- `@convex-dev/auth` with two providers in `convex/auth.ts`: **Google** OAuth and **Password** (email + password, min 8 chars, `name` captured on sign-up). `convex/http.ts` mounts the `/api/auth/*` routes on the `.convex.site` URL; `convex/auth.config.ts` trusts the deployment's own JWTs; `authTables` is spread into `convex/schema.ts`.
- Deployment env vars: `JWT_PRIVATE_KEY`, `JWKS` (generated once, already set), `SITE_URL` (where OAuth lands afterwards — `http://localhost:3000` in dev, must be the real origin in prod), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (from the Google Cloud project **Form-E**, id `form-e-508418`; redirect URI is `https://<deployment>.convex.site/api/auth/callback/google`).
- Client: `ConvexAuthProvider` replaces `ConvexProvider` in `__root.tsx`. `/login` and `/signup` (`AuthPage` → `AuthForm`) take an optional `?redirect=/path` (same-origin only, see `safeRedirect`). `useViewer()` (`src/hooks/useViewer.ts`) gives `{ loading, isAuthenticated, viewer }` and stays `loading` through SSR so header markup hydrates cleanly; `AuthNav` in the header shows sign in / sign up or the user + sign out.
- `authErrorMessage` maps Convex Auth's raw errors (`InvalidSecret`, `InvalidAccountId`, `already exists`) to one-line messages; custom validation errors travel as `ConvexError` data. Plain server errors are redacted to "Server Error" in production, so only the ConvexError path is reliable there.
- The Google flow: `signIn('google', { redirectTo })` → provider → Convex callback → back to `SITE_URL + redirectTo?code=…`; `ConvexAuthProvider` exchanges the code on mount. Nothing is gated behind login yet; the tablet fill route stays public.

## Dashboard, Teams, and Chat

- `/dashboard` (`src/routes/dashboard.tsx`) lists teams ranked by responses, and for the selected team shows progress vs `responseTarget`, a member leaderboard (`src/lib/team/stats.ts`), and a chat room (`src/lib/team/chat.ts`, `TeamChat`).
- A team **is** a questionnaire: `teamName` + `enumerators` + `responseTarget` live on the questionnaire (one survey, one team). "New team" creates a questionnaire with that team name.
- Chat is live on Convex (`convex/messages.ts`): a message sent on one tablet appears on every other device subscribed to that survey, with no polling.

## Choice Experiments (stated preference)

- A `choice_experiment` question is a block of scenario tables built from **design cards** the creator makes outside the app (R / Excel) and pastes or uploads as CSV/TSV. See `src/lib/questionnaire/cards.ts`.
- Card table convention: first row is the header (a single-cell sheet title above it is skipped); a `Set` / `Card ID` / `Card No.` / `কার্ড নং` column numbers the cards. Cells may hold several lines (quoted, as Excel copies them).
- **Two layouts**, detected from the header (`parseCardTable` → `layout`):
  - `alternatives`: columns `<Attribute>_<Alternative>` (`Time_A`, `Cost_A`, `Time_B`, …). Detection requires the same suffix set after every attribute — plain names like `Distance_From_Residence` also contain underscores, so "last underscore" alone is not enough. Respondents pick a column; the choice row sits inside the table.
  - `profile`: plain columns (`Distance_From_Residence`, `Parking_facility`, …); each card is ONE option held under alternative key `A`, `card.levels` keyed by the plain column name (`columnKey(question, attr, alt)` drops the suffix). Shown beside `referenceColumns` (fixed text spanning all rows, e.g. "your current shopping destination" / "পূর্বের ন্যায়"); the prompt is answered below the table with `choiceOptions` (default Yes / No). Export `Choice` = the option's English label. This is the shopping-mall (`501_to_800_form`) design.
- `attributeHeader` is the first column's heading (was hard-coded "Trip attributes"). `drawMode: 'balanced'` draws the least-shown cards first using `responses.cardExposure` (the fill page waits for it; the editor preview passes `{}`), replacing the pre-allocated "Card Frequency" sheet.
- Each respondent gets `scenariosPerRespondent` cards drawn at random without repeats. The set number, a snapshot of the levels, and the chosen alternative are stored per scenario.
- `levelLabels` maps a raw level string to per-language display text (e.g. "5 Hours" → "৫ ঘন্টা"); missing entries fall back to the raw text. Nothing is machine-translated: wording is typed in the editor or filled by `applyTranslationTable` ("Paste translated table"), which matches a translated copy of the card table to the imported cards by set number and column (by name, else by position) and takes each differing cell as that level's wording; a translated header fills empty attribute labels.
- Question numbering counts one number per scenario, so a 3-scenario block after question 3 uses 4, 5, 6 and the next question is 7. Numbers render in Bangla digits when the form is in Bangla.
- Exports (`src/lib/questionnaire/export.ts`) are long format: one row per scenario shown, with the respondent's other answers repeated on each row, then `Block, Question, Scenario, Set, <levels…>, Choice`. The Excel export (`export-xlsx.ts`, exceljs loaded on demand) adds "Design cards" and "Questions" sheets.
