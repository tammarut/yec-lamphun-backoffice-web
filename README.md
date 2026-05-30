# This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app)

## Getting Started

Follow these steps to run the project locally for the first time:

1. **Install Dependencies:**

   ```bash
   bun install
   ```

2. **Environment Variables:** `.env.local` file

3. **Run the Development Server:**

   ```bash
   bun run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `src/app/page.tsx`. The page auto-updates as you edit the file.

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
