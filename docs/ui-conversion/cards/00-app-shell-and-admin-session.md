[UI-00] App shell, routing & admin session — foundation

> **Status: implemented 2026-09-03 → 2026-09-05 — PR #39** (`feature/ui-00-app-shell`, Fixes #38).
> This card was updated after implementation to match what actually shipped (user reviews drove
> several changes from the original plan: persistent header, literal logout action, RHF+valibot
> login form → ADR 0021, AppShell-owned dialogs). Acceptance criteria walked in the PR description.

## Goal

Every page card lands inside a working app: sidebar navigation for the four routes, root providers (TanStack Query + toasts), and cookie-backed admin mode with a login/logout modal — so cards 01–04 only build page content.

## Route & files

- `src/app/layout.tsx` — Thai metadata (`ระบบบริหารจัดการองค์กร - YEC Lamphun`), keep Noto Sans, mount `QueryClientProvider` + sonner `<Toaster />`.
- `src/app/page.tsx` — replace the component-example demo with `redirect("/dashboard")`.
- Delete `src/shared/components/component-example.tsx` and `src/shared/components/example.tsx` (the demo gallery). Keep everything in `ui/`.
- New `src/shared/components/layout/app-shell.tsx` (`"use client"`) — shadcn `Sidebar` + content area, mounted in the root layout. Siblings in `src/shared/components/layout/`: `providers.tsx` (QueryClient + sonner + TooltipProvider), `admin-menu-button.tsx` (footer entry, reports intent only), `admin-login-dialog.tsx`, `admin-logout-confirm-dialog.tsx`. **The admin dialogs are owned by the AppShell, not the sidebar** — on mobile the sidebar is a drawer whose close unmounts its children, which would destroy dialog state.
- New routes (stub pages with just a heading): `src/app/dashboard/page.tsx`, `src/app/org/page.tsx`, `src/app/members/page.tsx`, `src/app/renewal/page.tsx`.
- New `src/app/api/v1/auth/session/route.ts` + `route.test.ts` — **the one new endpoint** (see API contract).
- New `src/shared/lib/api/` (or similar) — small typed `fetchJson` helper returning `Result`-style errors with `{ error_message }` parsing.

## API contract

- `POST /api/v1/auth/login` — public; body `{ username, password }` (optional `rememberMe` — not surfaced in UI); success 204 and `Set-Cookie: session_id` (httpOnly); 401 `{ error_message }` on bad creds. Source: `src/app/api/v1/auth/login/route.ts`.
- `POST /api/v1/auth/logout` — clears cookie, 204. Source: `src/app/api/v1/auth/logout/route.ts`.
- **New** `GET /api/v1/auth/session` — 204 when the `session_id` cookie is valid, 401 otherwise. Implement like a light `withAuth` (`src/app/api/middleware/with-auth.ts` shows the `AuthService.validateSession` call; resolve via `container.resolve` per AGENTS.md route rules, `force-dynamic`). Test follows the container-mock pattern in `src/app/api/v1/system-settings/route.test.ts`.

## UI structure (from mockup)

Mockup: `App` + `Sidebar` + admin-login/logout modals (top of `ui-mockup/YEC-Lamphun.html`, before the `Dashboard` component ~line 168).

- Fixed left sidebar, collapsible (expanded ↔ icons-only via the header toggle), mobile: off-canvas drawer with overlay via the shadcn sidebar's built-in behavior. In icon mode labels are explicitly `display:none` (don't rely on the registry's overflow-clipping — custom padding breaks it; see commit 2c7a5cc).
- **Persistent header bar above the main content on ALL breakpoints** carrying the `SidebarTrigger` (brand shows in the header only on mobile, where the sidebar is a drawer). No edge rail toggle.
- Brand row: building icon in a `sidebar-primary` box + "YEC Lamphun" (size-10 box, text-lg wordmark). Menu items at mockup scale on registry tokens: `size="lg"` h-12, px-3, text-base labels, size-5 icons.
- Menu (flat, in order): หน้าหลัก (`/dashboard`), โครงสร้างองค์กร (`/org`), รายชื่อสมาชิก (`/members`), ต่ออายุสมาชิก (`/renewal`). Active item highlighted (`sidebar-accent` tokens).
- Bottom section separated by a border. **Logged out:** gear button labelled ผู้ดูแลระบบ (muted) → login. **Logged in:** `Logout01Icon` + ออกจากระบบ (destructive tint) → logout confirm. Literal function labels only — no mode names like "Admin Mode".
- Gear click when logged out → login `Dialog` built on **react-hook-form + valibot** (ADR 0021) with the `Field`/`FieldError` primitives: heading ผู้ดูแลระบบ, description กรุณาเข้าสู่ระบบเพื่อจัดการข้อมูล, fields ชื่อผู้ใช้ / รหัสผ่าน (Thai per-field validation messages on empty submit, password visibility toggle, autofocus first field, Enter submits), full-width เข้าสู่ระบบ button with spinner + duplicate-submission lock.
- **All submission errors render inline in the dialog**: 401 → alert ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง (exact mockup copy); any other failure → generic Thai inline message. No sonner toasts from this dialog. Logout errors (from the confirm dialog) still toast, top-right.
- Gear click when logged in → logout confirm `AlertDialog`: ยืนยันการออกจากระบบ, buttons ยกเลิก / ออกจากระบบ.

## shadcn components to add

`bunx shadcn@latest add sidebar dialog tooltip skeleton alert` + `bun add sonner` (aliases in `components.json` are pre-fixed — see README §4; `sheet` arrives with `sidebar`; toasts sit top-right).

## Task breakdown

### 1. Structure & layout

- Fix `components.json` aliases (README §4.1) and verify an `add` lands correctly.
- AppShell with sidebar (menu + admin gear), `<main>` scroll container; root layout wraps children in it.
- Stub pages for the four routes; `/` redirects to `/dashboard`.

### 2. API/data integration

- `fetchJson` helper: throws/returns typed errors parsed from `{ error_message }`.
- `useSession()` query hook (`GET /api/v1/auth/session`, `staleTime` short) exposed via a small React context — this is the single `isAdmin` source for all cards.
- Login mutation → on 204 invalidate the session query (admin UI unlocks). Logout mutation → same.

### 3. States

- Session query: `pending` while checking (admin gear disabled), settled → label/state per above. `isAdmin` derives from `data === true && error === null` and the mutations `setQueryData` before invalidating — TanStack v5 retains last-successful data on failed refetches (bug fixed in 1fddcc0).
- Login dialog: per-field Thai validation on empty submit (no request sent), submitting (spinner, everything disabled), 401 → inline Thai alert, other failures → generic inline Thai message; logout errors → sonner toast (top-right).

### 4. Responsive

- ≥768px: persistent sidebar with collapse-to-rail (toggle in the persistent header bar); <768px: drawer + hamburger header (brand + hamburger only).

### 5. Validation & tests

- `session/route.test.ts`: Happy (valid cookie → 204) / Unhappy (missing/invalid → 401), mocking the container.
- Component tests: login dialog (204 close, password toggle, empty-submit field errors with no request, 401 alert, generic non-401 alert) + full gear cycle regression (login → logout → revert → login offered again, logout-failure toast). Plus `fetchJson` unit tests.

## Out of scope

- `rememberMe` checkbox; any (private) route group or middleware redirects; page content beyond stubs; i18n switching.

## Acceptance criteria

- [x] Clicking all four menu items navigates; active item highlighted; rail collapse + mobile drawer work.
- [x] `/` redirects to `/dashboard`; demo gallery removed; no dead imports.
- [x] Login with env admin creds unlocks admin gear state; hard refresh keeps admin mode (session endpoint).
- [x] Logout confirm clears admin mode; bad login shows the Thai error alert.
- [x] `GET /api/v1/auth/session` tested; `bun run lint` + `bun test` green.
- [x] Root layout has Thai title, `QueryClientProvider`, `<Toaster />`.

## AI implementation prompt

```text
Implement Trello card [UI-00] App shell, routing & admin session in this repo.

Read first, in order:
1. AGENTS.md — architecture law (route rules, DI, testing).
2. CONTEXT.md — domain glossary.
3. The card: docs/ui-conversion/cards/00-app-shell-and-admin-session.md.
4. Mockup: ui-mockup/YEC-Lamphun.html — App/Sidebar components and the admin
   login + logout modals (top of file, before Dashboard ~line 168). Structural
   reference only; style with the repo's Tailwind v4 semantic tokens.
5. API contract: src/app/api/v1/auth/login/route.ts, .../logout/route.ts, and
   src/app/api/middleware/with-auth.ts (for the session endpoint you'll add).
6. Test pattern: src/app/api/v1/system-settings/route.test.ts.

Scope: shared app shell + admin session — no page content beyond stubs.
In scope: components.json alias fix, sidebar nav, 4 stub routes, "/" redirect,
demo-page removal, login/logout modals, new GET /api/v1/auth/session (+tests),
fetchJson helper, useSession context, QueryClientProvider + sonner Toaster.
Out of scope: rememberMe, route groups/middleware guards, page contents.

Constraints:
- shadcn primitives first: bunx shadcn@latest add sidebar dialog tooltip skeleton
  (then bun add sonner).
- Errors are { error_message: string }; never swallow failures.
- Semantic OKLCH tokens only; cn(); data-slot on wrappers; tabs indentation;
  src/ imports; React 19 props.
- Thai copy exactly as in the mockup section.

Definition of done: the card's acceptance criteria, plus `bun run lint` and
`bun test` passing. Walk the acceptance criteria one by one at the end.
```

## References

- Mockup: `App`, `Sidebar`, admin login/logout modals — `ui-mockup/YEC-Lamphun.html` lines ~1–170.
- `src/app/api/v1/auth/*` routes; `src/modules/auth/auth.service.ts`; `src/modules/shared/session-store/`.
- README §4 (environment prep), §8 gap ledger items 1 and 6.
