# This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)

## Tech Stack

### Core

| Technology | Version | Description |
|------------|---------|-------------|
| [Bun](https://bun.sh) | - | Fast JavaScript runtime |
| [Next.js](https://nextjs.org) | 16.1.1 | React framework with App Router |
| [React](https://react.dev) | 19.2.3 | UI library |
| [TypeScript](https://www.typescriptlang.org) | 5 | Static type checking for JavaScript |

### UI Components & Styling

| Technology | Version | Description |
|------------|---------|-------------|
| [shadcn/ui](https://ui.shadcn.com) | - | High-quality React components |
| [Radix UI](https://radix-ui.com) | 1.4.3 | Primitive components for building accessible UIs |
| [Tailwind CSS](https://tailwindcss.com) | 4 | Utility-first CSS framework |
| [@hugeicons/react](https://hugeicons.com) | 1.1.4 | Beautiful icons |

### Forms & Validation

| Technology | Version | Description |
|------------|---------|-------------|
| [React Hook Form](https://react-hook-form.com) | 7.70.0 | Form management library |
| [Valibot](https://valibot.dev) | 1.2.0 | Schema validation library |
| [@hookform/resolvers](https://react-hook-form.com/form-builder) | 5.2.2 | Form resolvers for validation |

### Data & API

| Technology | Version | Description |
|------------|---------|-------------|
| Next.js API Routes | - | Built-in HTTP client and API layer |
| [postgres](https://github.com/pramuka/postgres) | 3.4.8 | PostgreSQL database client |
| [@tanstack/react-query](https://tanstack.com/query/latest) | 5.90.16 | Server state management |
| [@cacheable/node-cache](https://www.npmjs.com/package/@cacheable/node-cache) | 1.7.6 | Caching layer |

### Development & Build Tools

| Technology | Version | Description |
|------------|---------|-------------|
| Bun | - | Package manager and runtime |
| [ESLint](https://eslint.org) | 9 | Code linting with Next.js config |
| [Prettier](https://prettier.io) | 3.7.4 | Code formatting |
| [Husky](https://typicode.github.io/husky/) | 9.1.7 | Git hooks with lint-staged |

### Testing

| Technology | Version | Description |
|------------|---------|-------------|
| [Vitest](https://vitest.dev) | 4.0.16 | Unit and component testing |
| [@testing-library/react](https://testing-library.com) | 16.3.1 | React component testing utilities |
| [@testing-library/dom](https://testing-library.com) | 10.4.1 | DOM testing utilities |
| [jsdom](https://github.com/jsdom/jsdom) | 27.4.0 | DOM environment simulation |

### Utilities

| Technology | Version | Description |
|------------|---------|-------------|
| [ULID](https://github.com/ulid/spec) | 3.0.2 | Sortable unique ID generation |
| [tsyringe](https://github.com/microsoft/tsyringe) | 4.10.0 | Dependency injection container |
| [neverthrow](https://github.com/supermacro/neverthrow) | 8.2.0 | Error handling library |
| [clsx](https://github.com/lukeed/clsx) | 2.1.1 | Class name utilities |
| [tailwind-merge](https://github.com/dcastil/tailwind-merge) | 3.4.0 | Tailwind CSS class merging |

## Getting Started

First, run the development server:

```bash
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Folder Structure

```md
my-app/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── (public)/          # Public routes
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx
│   │   │   └── login/
│   │   │       └── page.tsx
│   │   ├── (private)/         # Auth-protected routes
│   │   │   ├── layout.tsx
│   │   │   └── dashboard/
│   │   │       ├── page.tsx
│   │   │       └── settings/
│   │   │           └── page.tsx
│   │   ├── api/               # API routes
│   │   │   ├── v1/
│   │   │   │   ├── auth/
│   │   │   │   ├── users/
│   │   │   │   └── products/
│   │   │   └── health/
│   │   │       └── route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── modules/              # Feature modules
│   │   ├── auth/
│   │   │   ├── components/    # Auth-specific components
│   │   │   ├── services/      # Auth business logic & DB queries
│   │   │   ├── actions/       # Next.js Server Actions
│   │   │   ├── hooks/         # Auth React hooks
│   │   │   ├── types/         # Auth TypeScript types
│   │   │   └── schemas/       # Auth validation schemas
│   │   ├── products/
│   │   │   ├── components/
│   │   │   ├── services/
│   │   │   ├── actions/
│   │   │   ├── hooks/
│   │   │   ├── types/
│   │   │   └── schemas/
│   │   ├── tasks/
│   │   │   └── ... (similar)
│   │   └── users/
│   │       └── ... (similar)
│   ├── shared/                # Shared modules
│   │   ├── components/        # Reusable UI components
│   │   │   ├── ui/           # shadcn components
│   │   │   ├── layout/       # Layout components
│   │   │   └── forms/        # Form components
│   │   ├── lib/              # Core utilities
│   │   │   ├── db/           # Database client
│   │   │   ├── api/          # API client
│   │   │   └── utils/        # Shared utilities
│   │   ├── hooks/            # Shared React hooks
│   │   ├── types/            # Global TypeScript types
│   │   ├── constants/        # Global constants
│   │   └── validation/       # Shared validation schemas
│   └── styles/
│       └── globals.css
├── scripts/
├── tests/
└── ...
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!
