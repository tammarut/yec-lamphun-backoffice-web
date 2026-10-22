"use client"

import type { ExecutiveCommitteeNode } from "src/modules/members/use-case/get-executive-committee/get-executive-committee.types"
import { PersonCard, VacantPositionCard, type PersonCardVariant } from "src/modules/organization/components/person-card"
import { cn } from "src/shared/lib/utils/utils"

/**
 * Filled (non-vacant) nodes across the whole tree — the committee header
 * badge counts these; placeholders never count as people.
 */
export function countFilledNodes(node: ExecutiveCommitteeNode): number {
	const self = node.id === null ? 0 : 1
	return node.children.reduce((total, child) => total + countFilledNodes(child), self)
}

function nodeKey(node: ExecutiveCommitteeNode, index: number): string {
	return node.id === null ? `vacant-${node.position}-${index}` : `member-${node.id}`
}

/** Vertical connector stub between tree levels (mockup's inline connector divs). */
function Connector({ className }: { className?: string }) {
	return <div aria-hidden className={cn("bg-border w-0.5", className ?? "h-6")} />
}

/** Card or vacancy placeholder for one tree node, whichever the node is. */
function NodeCard({ node, variant = "column" }: { node: ExecutiveCommitteeNode; variant?: PersonCardVariant }) {
	if (node.id === null) {
		return <VacantPositionCard title={node.position} variant={variant} caption={variant === "president" ? undefined : "ตำแหน่งว่าง"} />
	}
	return <PersonCard node={node} variant={variant} />
}

/** Recursive descendant stack: compact cards, each with its own children chained below. */
function DescendantStack({ nodes }: { nodes: readonly ExecutiveCommitteeNode[] }) {
	return (
		<div data-slot="org-tree-descendants" className="flex flex-col items-center gap-3">
			{nodes.map((node, index) => (
				<div key={nodeKey(node, index)} className="flex flex-col items-center">
					<NodeCard node={node} variant="mini" />
					{node.children.length > 0 && (
						<>
							<Connector />
							<DescendantStack nodes={node.children} />
						</>
					)}
				</div>
			))}
		</div>
	)
}

type Column = {
	position: string
	nodes: ExecutiveCommitteeNode[]
}

/**
 * One column per distinct direct-child position — the label comes verbatim
 * from the data (`positions.name_th`); same-position siblings (e.g. several
 * advisors) share one column, first-seen order preserved.
 */
function groupByPosition(children: readonly ExecutiveCommitteeNode[]): Column[] {
	const columns: Column[] = []
	const byPosition = new Map<string, Column>()
	for (const child of children) {
		const existing = byPosition.get(child.position)
		if (existing !== undefined) {
			existing.nodes.push(child)
			continue
		}
		const column: Column = { position: child.position, nodes: [child] }
		byPosition.set(child.position, column)
		columns.push(column)
	}
	return columns
}

/**
 * The generic recursive Executive Committee tree (card 02): the President
 * holder emphasized on top, one column per direct child position, deeper
 * descendants stacked below, dashed placeholders for Vacant Positions. The
 * shape comes entirely from the API response — nothing position-specific is
 * hardcoded. The wrapper scrolls horizontally; the inner canvas sizes to
 * content (`w-max`) so ~10 level-2 columns stay readable.
 */
export function OrgTree({ root }: { root: ExecutiveCommitteeNode }) {
	const columns = groupByPosition(root.children)
	return (
		<div data-slot="org-tree" className="overflow-x-auto pb-4">
			<div className="mx-auto flex w-max min-w-full flex-col items-center px-4">
				<NodeCard node={root} variant="president" />
				{columns.length > 0 && (
					<>
						<Connector className="mt-3 h-8" />
						<div data-slot="org-tree-columns" className="flex items-start justify-center gap-10 pt-1">
							{columns.map((column) => (
								<div key={column.position} data-slot="org-tree-column" className="flex flex-col items-center">
									<Connector />
									<div
										data-slot="org-tree-column-label"
										className="bg-muted text-muted-foreground border-border/60 my-3 rounded-full border px-3 py-1 text-sm font-bold shadow-sm"
									>
										{column.position}
									</div>
									<div className="flex flex-wrap items-start justify-center gap-4">
										{column.nodes.map((node, index) => (
											<div key={nodeKey(node, index)} className="flex flex-col items-center">
												<NodeCard node={node} />
												{node.children.length > 0 && (
													<>
														<Connector />
														<DescendantStack nodes={node.children} />
													</>
												)}
											</div>
										))}
									</div>
								</div>
							))}
						</div>
					</>
				)}
			</div>
		</div>
	)
}
