"use client"

import type { ExecutiveCommitteeNode } from "src/modules/members/use-case/get-executive-committee/get-executive-committee.types"
import { Avatar, AvatarFallback, AvatarImage } from "src/shared/components/ui/avatar"
import { cn } from "src/shared/lib/utils/utils"

type NameFields = {
	readonly title_name_th: string | null
	readonly first_name_th: string | null
	readonly last_name_th: string | null
}

/** Full Thai display name — title glued to the first name, space before surname (mockup format). */
export function fullNameTh(person: NameFields): string {
	return `${person.title_name_th ?? ""}${person.first_name_th ?? ""} ${person.last_name_th ?? ""}`.trim()
}

export type PersonCardVariant = "president" | "column" | "mini"

/**
 * Card silhouettes from the mockup: the emphasized President (`scale-110` +
 * ring, w-64), a department/role column card (top accent, w-48), and a
 * compact horizontal card for stacked descendants (w-60).
 */
const VARIANT_CLASSES: Record<PersonCardVariant, string> = {
	president: "w-64 scale-110 flex-col p-3 text-center border-t-4 border-t-primary shadow-xl ring-4 ring-primary/10",
	column: "w-48 flex-col p-3 text-center border-t-4 border-t-primary/40 shadow-md",
	mini: "w-60 flex-row items-center gap-3 p-2 pr-4 pl-3 text-left shadow-sm",
}

/**
 * A committee person card — the generic tree node visual (avatar, Thai name
 * with nickname, position, business). The variant picks the silhouette; the
 * content is identical everywhere.
 */
export function PersonCard({ node, variant = "column", className }: { node: ExecutiveCommitteeNode; variant?: PersonCardVariant; className?: string }) {
	const isMini = variant === "mini"
	const name = fullNameTh(node)
	return (
		<div
			data-slot="person-card"
			data-variant={variant}
			className={cn("bg-card text-card-foreground relative z-10 flex rounded-xl border transition-shadow hover:shadow-lg", VARIANT_CLASSES[variant], className)}
		>
			<Avatar className={cn("shrink-0", isMini ? "size-10" : "mx-auto mb-2 size-14")}>
				{node.profile_avatar !== null && <AvatarImage src={node.profile_avatar} alt={name} />}
				<AvatarFallback className={isMini ? "text-sm" : "text-lg"}>{node.first_name_th?.charAt(0) ?? "?"}</AvatarFallback>
			</Avatar>
			<div className="min-w-0 flex-1">
				<div className={cn("truncate font-bold", isMini ? "text-xs" : "text-sm")}>
					{name} {node.nickname !== null && node.nickname !== "" && <span className="text-muted-foreground font-normal">({node.nickname})</span>}
				</div>
				<p className={cn("text-primary truncate font-medium", isMini ? "text-[10px]" : "text-xs")}>{node.position}</p>
				{node.business_name !== null && (
					<p className={cn("text-muted-foreground truncate text-[10px]", isMini ? "" : "border-border/60 mt-1 border-t pt-1")}>{node.business_name}</p>
				)}
			</div>
		</div>
	)
}

/**
 * A Vacant Position placeholder (ADR-0020) — dashed muted card carrying only
 * the position title, the same visual language as the ยังไม่มีประธาน box.
 */
export function VacantPositionCard({ title, className }: { title: string; className?: string }) {
	return (
		<div
			data-slot="vacant-position-card"
			className={cn("bg-muted/40 text-muted-foreground border-border/60 w-48 rounded-xl border border-dashed p-4 text-center text-sm", className)}
		>
			{title}
		</div>
	)
}
