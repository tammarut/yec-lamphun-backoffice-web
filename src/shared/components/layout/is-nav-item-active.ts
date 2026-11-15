/**
 * Sidebar active state for a nav item: exact match, or any nested path below
 * it. The trailing slash keeps "/members" from also matching a longer
 * sibling that merely shares the prefix (e.g. "/membership"). Extracted so
 * the rule is unit-testable without rendering the shell (#147 follow-up —
 * detail pages like /members/5 must keep รายชื่อสมาชิก highlighted).
 */
export function isNavItemActive(pathname: string, url: string): boolean {
	return pathname === url || pathname.startsWith(`${url}/`)
}
