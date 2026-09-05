---
status: accepted
---

# React Hook Form + Valibot for all backoffice forms

Every interactive form in the backoffice UI (starting with the admin login dialog, and everything cards UI-01–04 will add — filters, the member wizard, renewal review forms) is built with **react Hook Form** for state and **Valibot schemas** for validation, wired through `@hookform/resolvers/valibot`. The schema is the single source of truth for both the TypeScript type (`v.InferInput`) and the runtime rules; field errors render through the repo's `Field`/`FieldError` primitives, keyed off RHF's `errors` and `aria-invalid`.

## Why

- **The stack was already locked, the pattern wasn't.** The UI-conversion plan committed to "shadcn/ui + TanStack Query + react-hook-form + valibot", but the login dialog (the first real form) shipped with manual `FormData` reads and a silent early-return parse. Rather than let each card improvise, the login dialog revision (2026-09-05) set the canonical pattern on the smallest possible form.
- **The alternative was considered and rejected**: native `required` + hand-rolled checks. It is genuinely enough for two fields, but it doesn't transfer — no touched-based feedback, no focus-jumps-to-first-error, no schema-typed values. The member wizard (card 03) has ~30 fields across sections; discovering the form pattern there would be expensive.
- **Valibot (not zod)** matches the API layer's validation library, so client schemas read the same as the server's and one mental model covers both sides of a payload.
- TanStack Query owns *server* state; RHF owns *form* state. The seam is deliberate: `mutateAsync(values)` inside RHF's submit handler, errors from the mutation mapped to inline UI (`ApiError.status === 401` → specific copy, otherwise generic), per ADR-0021's companion rule that failures surface inline where the user's attention is.

## Consequences

- `react-hook-form` and `@hookform/resolvers` (already in `package.json`) become load-bearing dependencies of the UI; new forms should copy `admin-login-dialog.tsx` as the reference implementation.
- Forms use `noValidate` — client-side validation feedback comes solely from Valibot messages rendered via `FieldError`, never the browser's native bubbles.
- Inline API-failure feedback (dialog-local Alert) is preferred over sonner toasts for modal forms; toasts remain for background/non-modal failures (e.g. logout errors from the sidebar).
