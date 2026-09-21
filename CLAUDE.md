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

## Builder

- Questions and option lists (single / multiple choice, dropdown, table rows) are reorderable by drag: `SortableList` / `SortableItem` / `DragHandle` in `src/components/builder/SortableList.tsx` wrap `@dnd-kit` (pointer sensor with a 4px activation distance so clicks inside cards never start a drag; keyboard sensor on the grip). The chevron buttons stay as a second way to move things.
- `InsertQuestion` renders between every pair of question cards (and above the first): a small "Insert question" button that expands into the type grid (`QuestionTypeButtons`, shared with the palette) and inserts at that index via `insertAt` from `src/lib/list.ts`. Each option row has a "+" that inserts a blank option right after it.

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
- Deployment env vars: `JWT_PRIVATE_KEY`, `JWKS` (generated once, already set), `SITE_URL` (the default origin OAuth lands on — `http://localhost:3000` in dev, must be the real origin in prod), `EXTRA_SITE_URLS` (comma-separated further origins a sign-in may return to, e.g. the Vercel site), `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` (from the Google Cloud project **Form-E**, id `form-e-508418`; redirect URI is `https://<deployment>.convex.site/api/auth/callback/google`).
- Client: `ConvexAuthProvider` replaces `ConvexProvider` in `__root.tsx`. `/login` and `/signup` (`AuthPage` → `AuthForm`) take an optional `?redirect=/path` (same-origin only, see `safeRedirect`; default `/surveys`). `useViewer()` (`src/hooks/useViewer.ts`) gives `{ loading, isAuthenticated, viewer, isAdmin, approved }` and stays `loading` through SSR so header markup hydrates cleanly; `AuthNav` in the header shows sign in / sign up or the user + sign out.
- `authErrorMessage` maps Convex Auth's raw errors (`InvalidSecret`, `InvalidAccountId`, `already exists`) to one-line messages; custom validation errors travel as `ConvexError` data. Plain server errors are redacted to "Server Error" in production, so only the ConvexError path is reliable there.
- The Google flow: `signIn('google', { redirectTo })` → provider → Convex callback → back to `redirectTo?code=…`; `ConvexAuthProvider` exchanges the code on mount. `AuthForm` sends an **absolute** `redirectTo` (`window.location.origin + path`) because the verifier sits in the starting origin's storage, so one Convex deployment serves localhost and the hosted site alike. The `redirect` callback in `convex/auth.ts` (`resolveRedirect`, `convex/authRedirect.ts`, tested from `src/lib/auth/redirect.test.ts`) accepts it only when its origin is exactly `SITE_URL`'s or one in `EXTRA_SITE_URLS`; a relative one still goes to `SITE_URL`. A new domain needs only `npx convex env set EXTRA_SITE_URLS …`, no code change.

## Deployment (Vercel)

- Project `form-e` under `sorowers-projects`, live at `https://forme-survey.vercel.app` (the address to share; `https://form-e-theta.vercel.app` is the generated one and still works). Both origins are in Convex's `EXTRA_SITE_URLS`; a further domain needs `vercel domains add <domain> form-e` and a place in that list. No git remote: deploy the working directory with `vercel --prod --yes`. Nitro picks the `vercel` preset on Vercel's builders by itself (no `vercel.json`).
- `.env.local` is never uploaded, so `VITE_CONVEX_URL` is set on the Vercel project (Production). It points at the same Convex deployment as local dev; there is no separate Convex prod deployment yet.
- The root route's title (`Form-E`) is the fallback for routes without their own `head`.

## Roles, Groups, and the Admin Panel

- **Who may do what** lives in `convex/access.ts`. An **admin** is a user whose `users.role` is `'admin'` or whose email is in the deployment's `ADMIN_EMAILS` env var (comma-separated; the bootstrap so the first admin can get in). Every other sign-up has a `users.status` (`pending` when unset / `approved` / `rejected`, `accountStatus`) that the admin sets on `/admin` (`admin.setUserStatus`, which also sets the role and, for builders, may add the account to a group); an email the admin added to a group before it signed up counts as approved.
- **Two member roles** (`users.role`, `roleOf`; the old `member` value and a missing one read as builder): a **builder** builds questionnaires, previews and fills them, downloads responses, runs several surveys, and chats; a **surveyor** only fills the surveys assigned to them (`assignments` table, by email; `teams.assign` / `teams.unassign`, by admins or a builder with access to the survey), follows the team's progress and leaderboard, and chats. Surveyors carry `users.surveyorCode` (e.g. `S01`; `admin.setSurveyorCode`, auto-assigned at approval). `isApproved(access)` = admin or approved (any role) and opens the app; `canBuild(access)` = admin or approved builder and opens the editor, `/create`, exports, `responses.listAll` / `listBySurvey` (answers). `canView(access, q)` = can edit it, or an assigned surveyor: opens `responses.progress` (who collected what, no answers), `messages`, `teams.members`.
- A **group** (`groups` table, app-level `id`, `approved` = active flag, new groups start active) holds builders by email (`groupMembers`) to share surveys; it plays no part for surveyors.
- `questionnaires.ownerId` (the creator's users id) and `questionnaires.groupId` say who can see a survey: `canAccess` = admin, or the owner, or a member of the survey's active group; `visibleQuestionnaires` = own (`by_owner`) ∪ groups' (`by_group`). `questionnaires.save` sets both on insert (owner = caller, group = the caller's group if any) and keeps the existing values on update; only `admin.assignSurvey` changes the group and only `admin.assignOwner` the owner (the Surveys tab has a picker for each; older surveys have neither until the admin sets one). The editor loads through `questionnaires.getEditable` (null unless `canAccess`), so a builder on another survey's URL sees "not found or no access" rather than an editor whose saves fail; `useQuestionnaire` also exposes `saveError`. Rows with neither (made before this existed) are visible to admins only until assigned; the Surveys page shows an amber "No group yet" badge to admins.
- Server gating: `questionnaires.list`, `responses.listAll`, `responses.listBySurvey`, `messages.list` return only what the caller may see (empty for outsiders, never an error); `save`/`remove`/`send`/`importMany` throw a `ConvexError`. Tablet-facing functions stay public: `questionnaires.get`, `responses.nextSerial`, `responses.submit`, `responses.cardExposure`.
- Client gating: `RequireAuth` (`src/components/auth/RequireAuth.tsx`) wraps `/surveys`, `/dashboard`, `/surveys/$surveyId/chat`; with `builder` the editor `/surveys/$surveyId` and `/create`; with `admin` the `/admin/` page. It shows a placeholder until auth is known in the browser, sends signed-out visitors to the area's sign-in page with `?redirect=…`, and shows the waiting / rejected / builders-only cards (with sign-out buttons) otherwise. `/surveys/$surveyId/fill` stays public: a shared tablet picks a name, while a signed-in account is recorded under its own name (`meta.locked`; the server stamps `surveyorId` / `surveyorCode` in `responses.submit` and forces a surveyor's name) and a surveyor gets the renderer's `mode="steps"` (one question at a time, Back / Next, required check per step). `useViewer()` exposes `role`, `displayName`, `code`, `approved`, `canBuild`, `isSurveyor`, `isAdmin`, `groups`; the app header shows Surveys ("My surveys" for surveyors) / Dashboard when signed in and Admin to admins.
- **Surveyor pages**: `/surveys` renders `SurveyorHome` (assigned surveys with my / today / team counts, Start survey, Team, Chat). `/dashboard` (`?team=<id>` preselects) shows progress and the leaderboard (`teamStats(q, progressRows, now, assignedSurveyors)`; codes show next to names) with the survey's surveyor accounts (`SurveyorAssignment`, editable by builders) and no New team / Edit team for surveyors. `/surveys/$surveyId/chat` is the team chat page (`TeamChat` with a fixed `author`); the dashboard no longer embeds the chat.
- **Two separate sign-in areas** (`src/lib/auth/areas.ts`): the app (`/login`, `/signup`, home `/surveys`) and the admin area (`/admin/login`, `/admin/signup`, home `/admin`). The admin area also carries **its own copies of the survey pages** (`/admin/surveys`, `/admin/surveys/$surveyId`, `…/fill`, `…/chat`, `/admin/create`, `/admin/dashboard`) so the admin builds and follows surveys on the admin session without signing in to the app. Page components live in `src/components/pages/` (`SurveysPage`, `SurveyEditorPage`, `FillPage`, `ChatPage`, `DashboardPage`, `CreatePage`); route files in both areas are thin wrappers. Links inside pages come from `useSurveyPaths()` (`src/components/auth/area.tsx`, reading `SURVEY_PATHS[area]`; `AreaProvider area="admin"` sits in the admin layout), never hard-coded, and `RequireAuth` reads the area to pick the sign-in page and to require an admin for anything under `/admin`. `src/routes/admin.tsx` is a layout route that nests a second `ConvexAuthProvider` with its own `ConvexReactClient` (`src/lib/convex/admin-client.ts`) and `storageNamespace: 'forme-admin'`, so the admin session and the app session live in different localStorage keys and different connections: signing in to one never signs the other out, even in the same browser. `shouldHandleCode` on both providers decides which one exchanges an OAuth `?code=` by the URL (`isAdminPath`). The root route's `component` skips the app Header/Footer under `/admin`; the admin layout renders its own header with `AuthNav area="admin"`. `AuthForm` / `AuthPage` / `AuthNav` / `RequireAuth` take the area and use its paths and copy.
- `/admin/` (`src/routes/admin/index.tsx`, `convex/admin.ts`): a "Waiting for your approval" list above the tabs (pick Builder / Surveyor, a code for surveyors or a group for builders, Approve / Reject; the People tab badge counts them), Groups tab (create, rename, Active/Paused switch, note, members by email, delete), People tab (status badge, Approve / Reject / Revoke, role select + code field, make admin, add to group), Surveys tab (owner, group select, surveyor chips with add / remove). `admin.overview` returns null for non-admins. One email can have two `users` rows (Google and password sign-in); surveyor lookups by email (`teams.members`, `teams.assign`, the overview) prefer the surveyor-role row.

## Dashboard, Teams, and Chat

- `/dashboard` (`src/routes/dashboard.tsx`) lists teams ranked by responses, and for the selected team shows progress vs `responseTarget` and a member leaderboard (`src/lib/team/stats.ts`, fed by `responses.progress`). The chat room (`TeamChat`) is on `/surveys/$surveyId/chat`.
- A team **is** a questionnaire: `teamName` + `enumerators` + `responseTarget` live on the questionnaire (one survey, one team). "New team" creates a questionnaire with that team name.
- Chat is live on Convex (`convex/messages.ts`): a message sent on one tablet appears on every other device subscribed to that survey, with no polling.

## Choice Experiments (stated preference)

- A `choice_experiment` question is a block of scenario tables built from **design cards** the creator makes outside the app (R / Excel) and pastes or uploads as CSV/TSV. See `src/lib/questionnaire/cards.ts`.
- Card table convention: a `Set` / `Card ID` / `Card No.` / `কার্ড নং` column numbers the cards (a single-cell sheet title above the header is skipped). Cells may hold several lines (quoted, as Excel copies them); `parseDelimited` trims cells and collapses runs of blanks, so `"Every  2.0 hrs"` and `"Every 2.0 hrs"` are one level.
- **Two layouts**, detected from the header (`parseCardTable` → `layout`):
  - `alternatives`, from either header shape:
    - **One row** of `<Attribute>_<Alternative>` names. Single letters/digits that end a column count as alternatives when ≥2 different ones occur (`Time_A`, `Cost_B`, `Time_1`); the token may also sit mid-name (`Cost_A_var` → attribute `Cost_var`, alternative `A`), and `card.levels` always uses the canonical `<attribute>_<alternative>` key (`Cost_var_A`; `canonicalColumn` maps a raw header to it). Failing that, words that end every column and each recur are alternatives (`Time_Bus, Cost_Car`; blanks work like underscores, so `Travel Cost   Bus` is attribute `Travel_Cost`). Plain names like `Distance_From_Residence` contain underscores too, so "last underscore" alone is never used.
    - **Two rows**, as Excel design sheets are laid out (`Final CARD English`, `62 Cards`): attribute headings on the upper row (merged into the first cell of the group, or centred in its middle cell) over alternative names that repeat in the same order (`Bus | Train | Air`) on the lower row; the Card ID label may sit on either row. The lower row is recognised because it cycles and its Set cell is not a card number. Each run of the cycle is one attribute, keyed by the heading with blanks → `_` (`Travel_Cost`, level key `Travel_Cost_Bus`); the heading text becomes the label (`bn` when written in Bangla script), the alternative cell the column heading.
    - Respondents pick a column when the block's only prompt is answered with the table columns; that choice row sits inside the table.
  - `profile`: plain columns (`Distance_From_Residence`, `Parking_facility`, …); each card is ONE option held under alternative key `A`, `card.levels` keyed by the plain column name (`columnKey(question, attr, alt)` drops the suffix). Shown beside `referenceColumns` (fixed text spanning all rows, e.g. "your current shopping destination" / "পূর্বের ন্যায়"); prompts are answered below the table with their own options (default Yes / No). This is the shopping-mall (`501_to_800_form`) design.
- **Bilingual sheets.** If the pasted sheet holds a second copy of the table in the other script after a blank column or a second Set column (the `62 Cards` sheet keeps its Bangla copy to the right), `parseCardTable` reads the first block as the cards and the second as their translation (`ParsedDesign.translation`), filling `levelLabels` and the Bangla headings in one import. A separate translated sheet (`Final CARD Bangla`) goes through "Paste translated table" instead.
- **Prompts.** `prompts: ChoicePrompt[]` are the questions asked under every scenario table, in order: `answer: 'alternative'` offers the table's columns and records the column key; `answer: 'options'` offers the prompt's own `options` (plus "Other" with a text field when `allowOther`) and records the option key. The Sylhet–Dhaka form asks the same mode choice under three departure-time conditions (three `alternative` prompts); the access/egress form asks the main mode, then the access mode, then the egress mode (`options` prompts). The profile layout always uses `options`. Older rows had a single `prompt` + `choiceOptions`; `questionnaire-codec.ts` turns them into one prompt on read and never writes them back.
- **Attribute groups.** `ChoiceAttribute.group` (optional `LocalizedText`) is a section heading; `attributeSections` puts consecutive attributes with the same heading under one heading row, and attributes render in `attributes` order, which the editor can rearrange (the access/egress form groups "home to Sylhet station" / "Dhaka station to destination" / "Sylhet to Dhaka" rows).
- `attributeHeader` is the first column's heading (was hard-coded "Trip attributes"). `drawMode: 'balanced'` draws the least-shown cards first using `responses.cardExposure` (the fill page waits for it; the editor preview passes `{}`), replacing the pre-allocated "Card Frequency" sheet.
- Each respondent gets `scenariosPerRespondent` cards drawn at random without repeats. Per scenario the answer stores the set number, a snapshot of the levels, `choices` (prompt key → chosen key), `other` (prompt key → typed text), and `choice`, which mirrors the first prompt's answer because responses recorded before blocks could ask several questions have only that field (`scenarioChoice` in `answers.ts` reads either).
- `levelLabels` maps a raw level string to per-language display text (e.g. "5 Hours" → "৫ ঘন্টা"); missing entries fall back to the raw text. Nothing is machine-translated: wording is typed in the editor or filled by `applyTranslationTable` ("Paste translated table"), which matches a translated copy of the card table to the imported cards by set number and column (by name, else by position; a two-row translated header pairs attribute-major) and takes each differing cell as that level's wording; a translated header fills empty attribute labels and, from a two-row header, empty alternative headings.
- Question numbering counts one number per prompt per scenario (`blockQuestionCount`), so a 3-scenario, 1-prompt block after question 3 uses 4, 5, 6 and the next question is 7; with 3 prompts it uses 4–12. Numbers render in Bangla digits when the form is in Bangla.
- The Responses tab (`ResponsesPanel`) lists the latest submissions (newest first, one line per response) above the export preview, which also runs newest response first with "show more"; downloads stay in survey-number order. A choice-experiment survey yields several rows per response, so an oldest-first preview capped at 25 rows hid new submissions entirely.
- Exports (`src/lib/questionnaire/export.ts`) are long format: one row per scenario shown, with the respondent's other answers repeated on each row, then `Block, Question, Scenario, Set, <levels…>, Choice, Choice 2, …` (`Question` is the number of the scenario's first prompt; `choiceColumn(i)` names the columns, with `Choice (other)` beside any prompt that allows "Other"). An `alternative` prompt exports the column key, an `options` prompt the option's English label. The Excel export (`export-xlsx.ts`, exceljs loaded on demand) adds "Design cards" and "Questions" sheets; the Questions sheet lists each prompt with its export column.
