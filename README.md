# This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)

## Tech Stack

### Core
- **Runtime**: [Bun](https://bun.sh) - Fast JavaScript runtime
- **Framework**: [Next.js](https://nextjs.org) v16.1.1 - React framework with App Router
- **UI Library**: [React](https://react.dev) v19.2.3

### Language & Type Safety
- **Language**: [TypeScript](https://www.typescriptlang.org) v5 - Static type checking for JavaScript

### UI Components & Styling
- **Component Library**: [shadcn/ui](https://ui.shadcn.com) - High-quality React components
- **Headless Components**: [Radix UI](https://radix-ui.com) - Primitive components for building accessible UIs
- **CSS Framework**: [Tailwind CSS](https://tailwindcss.com) v4 - Utility-first CSS framework
- **Icon Library**: [@hugeicons/react](https://hugeicons.com) - Beautiful icons

### Forms & Validation
- **Form Management**: [React Hook Form](https://react-hook-form.com) v7.70.0
- **Validation**: [Valibot](https://valibot.dev) v1.2.0 - Schema validation library
- **Form Resolvers**: [@hookform/resolvers](https://react-hook-form.com/form-builder)

### Data & API
- **HTTP Client**: Built-in Next.js API routes
- **Database**: PostgreSQL with [postgres](https://github.com/pramuka/postgres) v3.4.8
- **State Management**: [@tanstack/react-query](https://tanstack.com/query/latest) v5.90.16 - Server state management
- **Caching**: [@cacheable/node-cache](https://www.npmjs.com/package/@cacheable/node-cache) v1.7.6

### Development & Build Tools
- **Package Manager**: Bun
- **Linting**: [ESLint](https://eslint.org) v9 with Next.js config
- **Code Formatting**: [Prettier](https://prettier.io) v3.7.4
- **Git Hooks**: [Husky](https://typicode.github.io/husky/) v9.1.7 with lint-staged
- **TypeScript Config**: Path aliases and strict type checking enabled

### Testing
- **Test Framework**: [Vitest](https://vitest.dev) v4.0.16 - Unit and component testing
- **Testing Library**: 
  - [@testing-library/react](https://testing-library.com) v16.3.1
  - [@testing-library/dom](https://testing-library.com) v10.4.1
- **DOM Environment**: [jsdom](https://github.com/jsdom/jsdom) v27.4.0

### Utilities
- **ID Generation**: [ULID](https://github.com/ulid/spec) v3.0.2
- **Dependency Injection**: [tsyringe](https://github.com/microsoft/tsyringe) v4.10.0
- **Error Handling**: [neverthrow](https://github.com/supermacro/neverthrow) v8.2.0
- **Class Name Utilities**: [clsx](https://github.com/lukeed/clsx) v2.1.1, [tailwind-merge](https://github.com/dcastil/tailwind-merge) v3.4.0

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
