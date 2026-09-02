import { err, ok, type Result } from "neverthrow"
import { REGISTER_KEY } from "src/modules/di-tokens"
import { DatabaseError } from "src/shared/core/errors/app-error"
import { inject, singleton } from "tsyringe"
import type { PositionReadModel } from "../../domain/member-read-models"
import type { IMemberRepository } from "../../interfaces"
import { MemberFileUrlService } from "../../member-file-url.service"
import type { ExecutiveCommitteeMemberRow, ExecutiveCommitteeNode, GetExecutiveCommitteeResponse } from "./get-executive-committee.types"

/** The position whose live holder roots the org-chart tree. */
const ROOT_POSITION_CODE = "PRESIDENT"

/**
 * Use case (query): the Executive Committee org-chart tree, served by
 * GET /api/v1/members/executive-committee — ADR-0020.
 *
 * A read-only orchestrator over two collaborators:
 *   1. {@link IMemberRepository.getAllPositions} — the full position
 *      hierarchy (Thai names + parent links).
 *   2. {@link IMemberRepository.getExecutiveCommittee} — the flat member
 *      rows, already ordered `(display_order, id)`.
 *   3. {@link MemberFileUrlService.resolveProfileAvatarUrl} — resolves each
 *      member's stored `profile_avatar` key to a public URL (ADR-0007).
 *
 * The tree is DERIVED from `positions.parent_position_code` — members has no
 * `parent_id` column (supervisor is derived at read time), so the assembly
 * attaches each occupied position's holders under the first live holder of
 * their parent position. When a rung has no live holder, a **Vacant Position
 * placeholder** node (`id: null`, member fields null, Thai title present) is
 * materialized for it — one shared placeholder per missing position, chains
 * included — so live members render at their true depth instead of vanishing
 * (ADR-0020). The placeholder rule deliberately does NOT apply to the root:
 * no live PRESIDENT holder means the whole response is null.
 *
 * No domain errors to surface — the only failure mode is infra
 * (`DatabaseError`), which propagates unchanged for the route to map to 500.
 *
 * Returns AGENTS.md §2B
 * `Promise<Result<GetExecutiveCommitteeResponse, DatabaseError>>`.
 */
@singleton()
export class GetExecutiveCommitteeService {
	constructor(
		@inject(REGISTER_KEY.MEMBERS_REPOSITORY) private readonly repository: IMemberRepository,
		@inject(REGISTER_KEY.MEMBER_FILE_URL_SERVICE) private readonly urlService: MemberFileUrlService
	) {}

	async execute(): Promise<Result<GetExecutiveCommitteeResponse, DatabaseError>> {
		const positionsResult = await this.repository.getAllPositions()
		if (positionsResult.isErr()) {
			return err(positionsResult.error)
		}

		const membersResult = await this.repository.getExecutiveCommittee()
		if (membersResult.isErr()) {
			return err(membersResult.error)
		}

		return ok(this.assembleTree(positionsResult.value, membersResult.value))
	}

	/**
	 * Build the President-rooted tree from the flat reads. Pure: no I/O beyond
	 * the already-fetched inputs; every mutation happens on freshly created
	 * nodes (the read models are readonly and stay untouched).
	 */
	private assembleTree(positions: readonly PositionReadModel[], memberRows: readonly ExecutiveCommitteeMemberRow[]): GetExecutiveCommitteeResponse {
		const positionByCode = new Map(positions.map((position) => [position.code, position]))

		// Member nodes grouped by position code, preserving the query's
		// (display_order, id) order so siblings land in org-chart order.
		const nodesByPosition = new Map<string, ExecutiveCommitteeNode[]>()
		for (const row of memberRows) {
			const node = this.toMemberNode(row, positionByCode)
			const group = nodesByPosition.get(row.positionCode)
			if (group === undefined) {
				nodesByPosition.set(row.positionCode, [node])
			} else {
				group.push(node)
			}
		}

		// Root: the live PRESIDENT holder. At most one non-deleted holder can
		// exist (partial unique index); if that holder is RESIGNED or absent,
		// the SQL status filter drops them and the response is null — the
		// placeholder rule deliberately does not apply to the root.
		const root = nodesByPosition.get(ROOT_POSITION_CODE)?.[0]
		if (root === undefined) {
			return null
		}

		// Codes of positions with live holders, in the members query's
		// (display_order, id) order — captured BEFORE any placeholder
		// materializes. resolveAttachment caches placeholders into
		// nodesByPosition, so iterating that map (or the positions table)
		// instead of this list would mistake an unheld position for an
		// occupied one and re-attach its placeholder under its own
		// descendants — a circular node graph (see the cycle guard below too).
		const occupiedCodes: string[] = []
		for (const row of memberRows) {
			if (occupiedCodes[occupiedCodes.length - 1] !== row.positionCode) {
				occupiedCodes.push(row.positionCode)
			}
		}

		// Attach every non-root occupied position's nodes under their parent
		// position. Iteration order keeps the children arrays deterministic;
		// placeholders created along the way land between their display-order
		// neighbors under the seed's parent-before-child convention.
		for (const code of occupiedCodes) {
			if (code === ROOT_POSITION_CODE) {
				continue
			}
			const nodes = nodesByPosition.get(code)
			if (nodes === undefined) {
				continue
			}
			let attachment = this.resolveAttachment(code, positionByCode, nodesByPosition, root)
			// Held-cycle corruption (POS_A and POS_B parenting each other,
			// both held): attaching X under something inside X's own subtree
			// would weave a circular graph JSON cannot render. Fall back to
			// the root — visible, serializable, deterministic.
			if (nodes.some((node) => this.containsNode(node, attachment))) {
				attachment = root
			}
			for (const node of nodes) {
				attachment.children.push(node)
			}
		}

		return root
	}

	/** Does `haystack`'s subtree contain `needle` (or is it `needle` itself)? */
	private containsNode(haystack: ExecutiveCommitteeNode, needle: ExecutiveCommitteeNode): boolean {
		if (haystack === needle) {
			return true
		}
		return haystack.children.some((child) => this.containsNode(child, needle))
	}

	/**
	 * Find the node that `positionCode`'s holders attach under: the first live
	 * holder of the parent position, or — when that rung is unheld — a shared
	 * Vacant Position placeholder for it, placed by continuing the walk upward
	 * (a missing chain materializes a chain of placeholders; ADR-0020).
	 *
	 * `visited` carries every code already on the walked chain, starting with
	 * the child itself, so a parent_position_code cycle (unreachable via the
	 * seed; the positions table is admin-managed with no cycle constraint)
	 * falls back to the root instead of weaving a circular node graph.
	 */
	private resolveAttachment(
		positionCode: string,
		positionByCode: ReadonlyMap<string, PositionReadModel>,
		nodesByPosition: Map<string, ExecutiveCommitteeNode[]>,
		root: ExecutiveCommitteeNode
	): ExecutiveCommitteeNode {
		const walk = (code: string, visited: ReadonlySet<string>): ExecutiveCommitteeNode => {
			const parentCode = positionByCode.get(code)?.parentPositionCode
			if (parentCode === null || parentCode === undefined) {
				// Unknown position (impossible via the FK) or a non-President
				// top-of-tree position: attach to the root rather than vanish.
				return root
			}
			if (visited.has(parentCode)) {
				return root
			}
			const parentNode = nodesByPosition.get(parentCode)?.[0]
			if (parentNode !== undefined) {
				// First live holder (query order = display_order, id) — the
				// deterministic single attachment point even when the parent
				// position is MULTIPLE and held by several members.
				return parentNode
			}
			// Unheld rung: materialize ONE placeholder and cache it as that
			// position's node so sibling and deeper walks share it.
			const placeholder = this.toPlaceholderNode(parentCode, positionByCode)
			nodesByPosition.set(parentCode, [placeholder])
			const attachment = walk(parentCode, new Set([...visited, parentCode]))
			attachment.children.push(placeholder)
			return placeholder
		}
		return walk(positionCode, new Set([positionCode]))
	}

	/** Map one repo row to its member wire node (avatar URL resolved inline). */
	private toMemberNode(row: ExecutiveCommitteeMemberRow, positionByCode: ReadonlyMap<string, PositionReadModel>): ExecutiveCommitteeNode {
		return {
			id: row.id,
			profile_avatar: this.urlService.resolveProfileAvatarUrl(row.profileAvatar),
			title_name_th: row.titleNameTh,
			first_name_th: row.firstNameTh,
			last_name_th: row.lastNameTh,
			nickname: row.nickname,
			position: this.positionName(row.positionCode, positionByCode),
			business_name: row.businessName,
			children: [],
		}
	}

	/** A Vacant Position node: Thai title only, recognizable by `id: null`. */
	private toPlaceholderNode(positionCode: string, positionByCode: ReadonlyMap<string, PositionReadModel>): ExecutiveCommitteeNode {
		return {
			id: null,
			profile_avatar: null,
			title_name_th: null,
			first_name_th: null,
			last_name_th: null,
			nickname: null,
			position: this.positionName(positionCode, positionByCode),
			business_name: null,
			children: [],
		}
	}

	/** Thai display name; the code is a defensive fallback the FK makes unreachable. */
	private positionName(code: string, positionByCode: ReadonlyMap<string, PositionReadModel>): string {
		return positionByCode.get(code)?.nameTh ?? code
	}
}
