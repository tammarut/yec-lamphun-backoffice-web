import { AppShell } from "src/shared/components/layout/app-shell"

/**
 * Public-facing routes (AGENTS.md §1): every page stays publicly viewable by
 * the locked UI decision — admin auth is an in-app modal, and API routes
 * enforce real authorization via withAuth. The app shell (sidebar + admin
 * session dialogs) belongs to this group. A `(private)` group appears only
 * when a cookie-gated page actually exists.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
	return <AppShell>{children}</AppShell>
}
