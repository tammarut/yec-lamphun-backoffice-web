"use client"

import { type ReactNode, useState } from "react"

/** Optional API strings arrive as null — or "" on direct API writes (the wizard normalizes to null). Both read as empty. */
function isEmptyText(value: string | null): value is null | "" {
	return value === null || value === ""
}

/** The value cell for an optional field: an empty value renders the stable em dash. */
export function nullableText(value: string | null): ReactNode {
	if (isEmptyText(value)) {
		return <span className="text-muted-foreground">—</span>
	}
	return value
}

/**
 * Every URL the API hands back is a free string (website is user-typed; file
 * fields accept any string on a direct write), so only an explicit http(s)
 * scheme may become an anchor: scheme-less text would resolve as a relative
 * path on this origin, and `javascript:` would run on click.
 */
const HTTP_URL_PATTERN = /^https?:\/\//i

/** Optional website cell: empty → em dash; http(s) → new-tab link; any other text renders inert. */
export function nullableWebsiteLink(value: string | null): ReactNode {
	if (isEmptyText(value)) {
		return nullableText(null)
	}
	if (!HTTP_URL_PATTERN.test(value)) {
		return value
	}
	return (
		<a href={value} target="_blank" rel="noopener noreferrer" className="text-primary [overflow-wrap:anywhere] underline-offset-4 hover:underline">
			{value}
		</a>
	)
}

/** One labelled field row: label column on desktop, stacked on mobile. */
export function DetailField({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div data-slot="member-detail-field" className="flex min-w-0 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
			<span className="text-muted-foreground w-44 shrink-0 text-sm">{label}</span>
			<span className="min-w-0 text-sm [overflow-wrap:anywhere]">{children}</span>
		</div>
	)
}

/** New-tab link for a document/file URL (presigned or public); a non-http(s) value renders as inert text instead. */
function DetailFileLink({ href }: { href: string }) {
	if (!HTTP_URL_PATTERN.test(href)) {
		return href
	}
	return (
		<a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-4 hover:underline">
			เปิดดู
		</a>
	)
}

/**
 * Inline image preview: renders the image itself, and the whole preview is a
 * new-tab link to the full-size file. An expired presign or a non-image value
 * falls back to the plain เปิดดู link; a non-http(s) value renders inert, the
 * same rule as every other URL on this page.
 */
function DetailImagePreview({ url, label }: { url: string; label: string }) {
	const [isBroken, setIsBroken] = useState(false)
	if (isBroken || !HTTP_URL_PATTERN.test(url)) {
		return (
			<span className="text-sm">
				<DetailFileLink href={url} />
			</span>
		)
	}
	return (
		<a
			href={url}
			target="_blank"
			rel="noopener noreferrer"
			aria-label={`เปิด${label}ขนาดเต็ม`}
			title="เปิดดูขนาดเต็ม"
			className="focus-visible:ring-ring/50 hover:ring-ring/30 w-fit rounded-lg transition-shadow outline-none hover:ring-[3px] focus-visible:ring-[3px]"
		>
			{/* eslint-disable-next-line @next/next/no-img-element -- remote presigned/public R2 URL; next/image adds nothing */}
			<img src={url} alt={label} loading="lazy" onError={() => setIsBroken(true)} className="bg-muted h-40 w-64 max-w-full rounded-lg border object-contain" />
		</a>
	)
}

/** Image field row: the label sits above the inline preview (empty → em dash). */
export function DetailImageField({ label, value }: { label: string; value: string | null }) {
	return (
		<div data-slot="member-detail-field" className="flex min-w-0 flex-col gap-1.5">
			<span className="text-muted-foreground text-sm">{label}</span>
			{isEmptyText(value) ? <span className="text-sm">{nullableText(null)}</span> : <DetailImagePreview url={value} label={label} />}
		</div>
	)
}
