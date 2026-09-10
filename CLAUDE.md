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
- **Backend/Database:** Convex (reliable-dalmatian-211)
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
