# YEC Lamphun Backoffice

Admin backoffice web app for YEC Lamphun — member directory, membership renewals, organization, and system administration — built with Next.js App Router, TypeScript, and Tailwind CSS v4.

Engineering standards (architecture, DI, error handling, UI rules, testing strategy) live in [AGENTS.md](AGENTS.md); architecture decisions are recorded in [docs/adr/](docs/adr/).

## Tech Stack

### Core

| Technology                                   | Version | Description                         |
|----------------------------------------------|---------|-------------------------------------|
| [Bun](https://bun.sh)                        | -       | Fast JavaScript runtime             |
| [Next.js](https://nextjs.org)                | 16.1.1  | React framework with App Router     |
| [React](https://react.dev)                   | 19.2.3  | UI library                          |
| [TypeScript](https://www.typescriptlang.org) | 5       | Static type checking for JavaScript |

### UI Components & Styling

| Technology                                | Version | Description                                      |
|-------------------------------------------|---------|--------------------------------------------------|
| [shadcn/ui](https://ui.shadcn.com)        | -       | High-quality React components                    |
| [Radix UI](https://radix-ui.com)          | 1.4.3   | Primitive components for building accessible UIs |
| [Tailwind CSS](https://tailwindcss.com)   | 4       | Utility-first CSS framework                      |
| [@hugeicons/react](https://hugeicons.com) | 1.1.4   | Beautiful icons                                  |

### Forms & Validation

| Technology                                                      | Version | Description                   |
|-----------------------------------------------------------------|---------|-------------------------------|
| [React Hook Form](https://react-hook-form.com)                  | 7.70.0  | Form management library       |
| [Valibot](https://valibot.dev)                                  | 1.2.0   | Schema validation library     |
| [@hookform/resolvers](https://react-hook-form.com/form-builder) | 5.2.2   | Form resolvers for validation |

### Data & API

| Technology                                                                   | Version | Description                        |
|------------------------------------------------------------------------------|---------|------------------------------------|
| Next.js API Routes                                                           | -       | Built-in HTTP client and API layer |
| [postgres](https://github.com/pramuka/postgres)                              | 3.4.8   | PostgreSQL database client         |
| [@tanstack/react-query](https://tanstack.com/query/latest)                   | 5.90.16 | Server state management            |
| [@cacheable/node-cache](https://www.npmjs.com/package/@cacheable/node-cache) | 1.7.6   | Caching layer                      |

### Development & Build Tools

| Technology                                 | Version | Description                      |
|--------------------------------------------|---------|----------------------------------|
| Bun                                        | -       | Package manager and runtime      |
| [ESLint](https://eslint.org)               | 9       | Code linting with Next.js config |
| [Prettier](https://prettier.io)            | 3.7.4   | Code formatting                  |
| [Husky](https://typicode.github.io/husky/) | 9.1.7   | Git hooks with lint-staged       |

### Testing

| Technology                                            | Version | Description                       |
|-------------------------------------------------------|---------|-----------------------------------|
| [Vitest](https://vitest.dev)                          | 4.0.16  | Unit and component testing        |
| [@testing-library/react](https://testing-library.com) | 16.3.1  | React component testing utilities |
| [@testing-library/dom](https://testing-library.com)   | 10.4.1  | DOM testing utilities             |
| [jsdom](https://github.com/jsdom/jsdom)               | 27.4.0  | DOM environment simulation        |

### Utilities

| Technology                                                  | Version | Description                    |
|-------------------------------------------------------------|---------|--------------------------------|
| [ULID](https://github.com/ulid/spec)                        | 3.0.2   | Sortable unique ID generation  |
| [tsyringe](https://github.com/microsoft/tsyringe)           | 4.10.0  | Dependency injection container |
| [neverthrow](https://github.com/supermacro/neverthrow)      | 8.2.0   | Error handling library         |
| [clsx](https://github.com/lukeed/clsx)                      | 2.1.1   | Class name utilities           |
| [tailwind-merge](https://github.com/dcastil/tailwind-merge) | 3.4.0   | Tailwind CSS class merging     |

## Getting Started

Follow these steps to run the project locally for the first time:

1. **Install Dependencies:**

   ```bash
   bun install
   ```

2. **Environment Variables:** `.env.local` file

3. **Compile Type-Safe Database Queries (`sqlc`):**

   If you modify or create raw SQL schemas (`schema.sql`) or queries (`queries.sql`) under `src/modules/[module-name]/repository/sql/`, regenerate the type-safe TypeScript database functions:

   * **Install `sqlc` CLI** (if not already installed):

       ```bash
       # macOS (Homebrew)
       brew install sqlc
       ```

   * **Compile SQL code**:

       ```bash
       sqlc generate
       ```

       The compiled, fully-typed functions are generated under the respective module's repository folder, e.g., `src/modules/system-settings/repository/sql/sqlc-generated/queries_sql.ts`.

4. **Run the Development Server:**

   ```bash
   bun run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Engineering Standards

[AGENTS.md](AGENTS.md) is the binding guideline for every change in this repo — module boundaries, tsyringe DI, neverthrow error handling, Valibot validation, Tailwind v4 semantic tokens, and the Vitest house style. Notable architecture decisions:

| ADR | Decision |
| --- | --- |
| [ADR-0022](docs/adr/0022-modules-own-their-frontend.md) | Feature modules own their frontend (`components/`, `hooks/`, `schemas/` live in the module, not `shared/`) |
| [ADR-0032](docs/adr/0032-feature-subfolders-inside-module-components.md) | Inside a module's `components/`, files group by feature subfolder once the folder mixes features; the root keeps module-wide vocabulary only |

## Folder Structure

```md
src/
├── app/                        # Next.js App Router (routing layer only)
│   ├── (public)/              # Public routes (login, members)
│   ├── (private)/             # Auth-protected routes (dashboard, organization, system settings)
│   └── api/                   # API route handlers (force-dynamic, DI resolve)
├── modules/                    # Feature modules (domain, use-cases, frontend)
│   ├── members/               # Reference implementation of the component layout (ADR-0032)
│   │   ├── components/        #   grouped by feature once the folder mixes features:
│   │   │   ├── member-directory/   # the list page (view / table / card grid + tests)
│   │   │   ├── member-detail/      # the detail page (parts / sections / view shell + test)
│   │   │   ├── member-wizard/      # the create/edit wizard (dialog / steps + tests)
│   │   │   ├── member-labels.ts    # module-wide vocabulary stays at the folder root
│   │   │   └── ...                 # (status-badge, delete-member-dialog, fixtures)
│   │   ├── hooks/             #   client data-fetching hooks
│   │   ├── schemas/           #   client-side Valibot schemas (wizard steps, route params)
│   │   └── members-types.ts   #   module-wide types shared with hooks/ and schemas/
│   ├── membership-renewals/   # Renewal review workflow (same module shape)
│   ├── business-categories/
│   ├── system-settings/
│   ├── auth/
│   └── shared/                # Cross-cutting infra (id-generator, session-store, storage)
└── shared/                     # Globally reusable resources
    ├── components/            # shadcn/ui primitives, layout, forms
    ├── core/                  # Shared errors and models
    ├── config/                # Strict env loading (t3-env)
    └── lib/                   # dates/ (format-thai-date), api/ (session), db/, ulid-generator/, utils/
```
