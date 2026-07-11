# Workspace Instructions (AGENTS.md)

This document outlines the architecture, engineering standards, patterns, and strict guidelines for the **YEC Lamphun Backoffice** project. All AI coding agents (ZCode, Cursor, Claude Code, Codex, Gemini/Antigravity, etc.) MUST adhere to these guidelines without exception when proposing changes, generating code, or analyzing this codebase.

---

## 1. Workspace Directory Structure

Maintain strict boundary separation. **Never cross-import across different modules directly.**

```md
src/
├── app/                    # Next.js App Router (Routing Layer Only)
│   ├── (public)/          # Public-facing routes (e.g. login)
│   ├── (private)/         # Authentication-protected dashboard routes
│   └── api/               # API endpoint route handlers (use force-dynamic & DI resolve)
├── modules/              # Feature modules (Domain & Business Logic)
│   ├── auth/              # Auth-specific services, components, actions, types
│   ├── business-categories/ # Business categories module
│   ├── members/           # Member file upload module (validation + R2 orchestration)
│   ├── shared/            # Cross-cutting infra shared by all modules
│   │   ├── id-generator/  # IIdGenerator interface (generic ULID contract)
│   │   ├── session-store/ # In-memory session store
│   │   └── storage/       # IStorageClient + R2 (S3-compatible) adapter
│   ├── system-settings/   # Admin system settings module
│   ├── container.ts       # Global tsyringe DI container registrations
│   └── di-tokens.ts       # DI token definitions (REGISTER_KEY symbols)
├── shared/                # Globally reusable shared components & resources
│   ├── components/        # Reusable components (ui/shadcn, layout, forms)
│   ├── core/              # Shared errors (AppError, DatabaseError) and models
│   ├── config/            # Strict env loading (t3-env)
│   └── lib/               # Shared libraries (db/database-client, ulid-generator, utils/cn)
```

---

## 2. Architectural Rules & Best Practices ("Law of the Land")

### A. Dependency Injection (tsyringe)

* All services and repositories must be class-based and decorated with `@injectable()` (or `@singleton()`).
* Inject dependencies in constructors using `@inject(REGISTER_KEY.TOKEN)`.
* Every new service, repository, or constant dependency **MUST** be defined in `src/modules/di-tokens.ts` and registered inside `src/modules/container.ts`.
* **DI tokens MUST always be `Symbol(...)`**, never plain strings. String tokens share a global namespace and collide silently; `Symbol()` is collision-proof and matches every existing token. Example: `MEMBER_FILE_SERVICE: Symbol("MEMBER_FILE_SERVICE")`.
* **Generic shared interfaces (e.g. `IIdGenerator`, `IStorageClient`) MUST live in `src/modules/shared/`**, never buried inside a feature module. A feature module may *consume* a shared interface, but must not *own* one that has no domain-specific semantics. (Exception: domain-specific interfaces like `IHealthRepository` stay with their module.)
* **Infra adapters that need config (e.g. `R2StorageClient`, `AuthService`) MUST take `EnvConfig` via `@inject(REGISTER_KEY.ENV_CONFIG)` in the constructor**, never `import { envConfig }` directly. This matches the established `AuthService` pattern, keeps the adapter testable with synthetic config, and avoids module-load-order coupling.
* **Example Service:**

    ```typescript
    import { injectable, inject } from "tsyringe"
    import { REGISTER_KEY } from "src/modules/di-tokens"
    import type { IHealthRepository } from "./repository/health.repository.interface"

    @injectable()
    export class HealthService {
        constructor(
            @inject(REGISTER_KEY.HEALTH_REPOSITORY)
            private healthRepository: IHealthRepository
        ) {}
    }
    ```

### B. Functional Error Handling (neverthrow)

* **NO silent failures and NO unhandled exceptions in business flows.**
* All asynchronous data fetches, business logic computations, and database queries must return a type-safe `Result<T, E>` using `neverthrow`'s `ok()` or `err()`.
* Extend `AppError` (from `src/shared/core/errors/app-error`) for domain-specific errors (e.g. `DatabaseError`, `InvalidCredentialsError`).
* **`async` functions MUST return `Promise<Result<T, E>>`** (using `ok()` / `err()`), **NOT `Promise<ResultAsync<T, E>>`**. The latter double-wraps — `ResultAsync` is itself an async wrapper, so `Promise<ResultAsync>` requires two awaits and forces callers into `as unknown` casts. `ResultAsync` is still the correct type for *non-`async`* functions or for wrapping a `Promise` internally via `ResultAsync.fromPromise(...)`.
* **Example Pattern:**

    ```typescript
    import { ok, err, Result } from "neverthrow"
    import { DatabaseError } from "src/shared/core/errors/app-error"

    async getDatabaseTime(): Promise<Result<Date, DatabaseError>> {
        try {
            const result = await this.dbClient.getRwConnection()`SELECT NOW() as now`
            const date = result[0]?.["now"] as Date
            return ok(date)
        } catch (error) {
            return err(new DatabaseError("Failed to get database time", error))
        }
    }
    ```

### C. Input Validation (Valibot v1)

* Validate all boundaries (API endpoints, forms, payloads) using **Valibot v1** modular schema patterns.
* Always use the modern `pipe()` operator rather than nesting validation arrays inside type builders.
* **Example Validation Schema:**

    ```typescript
    import { object, string, pipe, minLength } from "valibot"

    export const LoginRequestSchema = object({
        username: pipe(string(), minLength(1, "Username is required")),
        password: pipe(string(), minLength(1, "Password is required")),
    })
    ```

### D. API Routes & Next.js Endpoints

* Always define API routes as dynamic (`export const dynamic = "force-dynamic"`).
* Manually resolve the registered services from the DI container using `container.resolve()`.
* Do not throw HTTP exceptions; inspect the functional `Result` and map failures to corresponding `NextResponse` JSON errors and appropriate status codes.
* **The canonical error-response body shape is `{ error_message: string }`** (typed as `ResponseBodyError` in `src/app/api/shared/types.ts`). Do NOT invent other shapes like `{ status, message }` or `{ error: { message } }`. Validation errors → `400`, auth failures → `401`, unexpected/internal errors → `500` with `{ error_message: "Internal Server Error" }`.
* **Protected routes MUST wrap the handler in `withAuth(...)`** (`src/app/api/middleware/with-auth.ts`), which validates the `session_id` cookie and returns `{ error_message: "Unauthorized" }` / `401` on failure. Do not re-implement session checks inside the handler.
* **Multipart/form-data:** parse with `await request.formData()` (wrapped in `ResultAsync.fromPromise(...)` so parse failures map to `400 { error_message: "Invalid request body" }`). File fields are validated manually (size + extension), not with a Valibot schema — Valibot has no native multipart/File schema.
* **Example Route:**

    ```typescript
    import "reflect-metadata"
    import { NextResponse } from "next/server"
    import { container } from "src/modules/container"
    import { REGISTER_KEY } from "src/modules/di-tokens"
    import { HealthService } from "src/modules/health/health.service"
    import { ResponseBodyError } from "src/app/api/shared/types"

    export const dynamic = "force-dynamic"

    export async function GET() {
        const healthService = container.resolve<HealthService>(REGISTER_KEY.HEALTH_SERVICE)
        const result = await healthService.checkHealth()

        if (result.isErr()) {
            return NextResponse.json(
                { error_message: "Internal Server Error" } satisfies ResponseBodyError,
                { status: 500 }
            )
        }
        return NextResponse.json(result.value)
    }
    ```

---

## 3. UI Engineering & Styling (React 19 & Tailwind CSS v4)

* **React 19 Standards:** Use standard DOM types with string attributes in `React.ComponentProps<"div">` instead of legacy types like `HTMLAttributes`.
* **Data Slots:** Add unique `data-slot` identifiers (e.g. `data-slot="button-root"`) to the main wrappers and key sub-components to ensure testability and clear component organization.
* **Class Merging:** Always wrap multiple or conditional Tailwind classes using the custom `cn()` utility (`clsx` + `tailwind-merge`) from `src/shared/lib/utils/utils`.
* **Tailwind CSS v4 & OKLCH:** Fully utilize the inline custom theme config and OKLCH color variables configured in `src/app/globals.css`. Never use hardcoded hexadecimal colors; rely on semantic tokens like `--color-primary`, `--color-background`, `--color-muted-foreground`, and `--color-destructive`.
* **UI Library First:** Leverage primitives from **Radix UI** and **Base UI** first before implementing custom behaviors to guarantee full accessibility (WCAG).

---

## 4. Import Rules & TypeScript Formatting

* **Path Aliases:** ALWAYS use absolute-like path aliases starting with `src/` (e.g. `src/shared/lib/...` or `src/modules/...`). **Do not use relative paths** (`../../`) when importing from outside the immediate folder.
* **Tabs for Indentation:** Use real Tab characters for indentation (not spaces), matching the workspace Prettier config.
* **Strict Compiler Compliance:** No unused variables, no implicit returns, and strict property accesses on index types (`noPropertyAccessFromIndexSignature` and `noUncheckedIndexedAccess` are active).

---

## 5. Testing Strategy (Vitest)

* Write comprehensive test specs in a `.test.ts` file situated right next to the code under test.
* Use `vitest-mock-extended` for clear, type-safe mocking of dependencies (e.g. repositories, session store, database client).
* Structure test suites inside `describe()` blocks, splitting test cases under dedicated `Happy cases` and `Unhappy cases` sub-blocks to ensure structural clarity.
* **Service tests construct the service directly with mocked dependencies** (e.g. `new MemberFileService(mockIdGen, mockStorage)`) — do NOT resolve through the real DI container.
* **Route tests mock the `src/modules/container` module** with `vi.mock("src/modules/container", ...)` BEFORE importing the route, then configure `container.resolve` to return service mocks based on the token. See `system-settings/route.test.ts` for the canonical pattern.
* **Tests touching the Web API `File`/`Blob.arrayBuffer()` MUST declare `// @vitest-environment node` as the first line of the test file.** The default `jsdom` environment (set in `vitest.config.mts`) does not implement `arrayBuffer()`, and `instanceof File` can mismatch across jsdom/undici boundaries. The node environment has native, correct `File`/`Blob`/`FormData`.
* **`vitest.config.mts` sets `SKIP_ENV_VALIDATION=true`** so importing modules that transitively load `envConfig` does not fail on missing server secrets in the test process. Do not remove this even when `.env.local` is fully populated — vitest does not load `.env.local`, and the flag is a safety net for future tests.
* **Example Test Structure:**

    ```typescript
    import { beforeEach, describe, expect, test } from "vitest"
    import { mock, type MockProxy } from "vitest-mock-extended"
    import { AuthService } from "./auth.service"
    import type { ISessionStore } from "./interfaces"

    describe("AuthService", () => {
        let authService: AuthService
        let mockSessionStore: MockProxy<ISessionStore>

        beforeEach(() => {
            mockSessionStore = mock<ISessionStore>()
            authService = new AuthService(mockSessionStore)
        })

        describe("login", () => {
            describe("Happy cases", () => {
                test("should authenticate successfully", () => {
                    mockSessionStore.createSession.mockReturnValue("session-id-123")
                    const result = authService.login("admin", "correct-password")
                    expect(result.isOk()).toBe(true)
                })
            })

            describe("Unhappy cases", () => {
                test("should return error on wrong password", () => {
                    const result = authService.login("admin", "wrong-password")
                    expect(result.isErr()).toBe(true)
                })
            })
        })
    })
    ```
