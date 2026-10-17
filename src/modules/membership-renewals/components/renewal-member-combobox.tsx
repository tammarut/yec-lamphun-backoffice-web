"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Search01Icon } from "@hugeicons/core-free-icons"

import { fullNameTh, positionLabel } from "src/modules/membership-renewals/components/renewal-labels"
import { useRenewalMemberSearch } from "src/modules/membership-renewals/hooks/use-renewal-member-search"
import type { MemberListItemResponse } from "src/modules/members/use-case/get-list-members/get-list-members.types"
import { Avatar, AvatarFallback, AvatarImage } from "src/shared/components/ui/avatar"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "src/shared/components/ui/combobox"
import { useDebouncedValue } from "src/shared/hooks/use-debounced-value"

const SEARCH_DEBOUNCE_MS = 300

type RenewalMemberComboboxProps = {
	/** Fired with the picked member; the parent swaps this combobox out for the selected-member card. */
	onSelect: (member: MemberListItemResponse) => void
	disabled?: boolean
	/** Client-side candidate exclusion (① main + already-picked ② members) — the server has no exclude param. */
	excludeIds?: readonly number[]
	ariaLabel?: string
	placeholder?: string
	inputDataSlot?: string
	optionDataSlot?: string
}

const DEFAULT_ARIA_LABEL = "ค้นหาสมาชิกที่ต่ออายุ"
const DEFAULT_PLACEHOLDER = "ค้นหาชื่อ / เบอร์โทร / ตำแหน่ง..."

/**
 * ① สมาชิกที่ต่ออายุ autocomplete (mockup v3): server-side prefix search over
 * first name / phone / position. The API is the filter, so the shared Base UI
 * combobox runs with `filter={null}` — its default client label-filter would
 * hide phone-prefix matches whose display name doesn't contain the query.
 * Also reused by ② สมาชิกเพิ่มเติม (#87) with excludeIds + re-labeled slots.
 */
export function RenewalMemberCombobox({
	onSelect,
	disabled = false,
	excludeIds,
	ariaLabel = DEFAULT_ARIA_LABEL,
	placeholder = DEFAULT_PLACEHOLDER,
	inputDataSlot = "renewal-member-search",
	optionDataSlot = "renewal-member-option",
}: RenewalMemberComboboxProps) {
	const [searchTerm, setSearchTerm] = useState("")
	const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS)
	const query = useRenewalMemberSearch(debouncedSearch)

	// searchTerm (not debouncedSearch) so clearing the input hides stale rows
	// instantly — a disabled query keeps its last data for the staleTime window
	// (the step-3 business picker's M2 rule, mirrored here).
	const excluded = excludeIds === undefined ? undefined : new Set(excludeIds)
	const candidates = searchTerm === "" ? [] : (query.data?.data ?? []).filter((member) => excluded?.has(member.id) !== true)

	return (
		<Combobox<MemberListItemResponse>
			items={candidates}
			filter={null}
			itemToStringLabel={(member) => fullNameTh(member)}
			onInputValueChange={(inputValue) => setSearchTerm(inputValue)}
			onValueChange={(member) => {
				if (member !== null) {
					onSelect(member)
				}
			}}
		>
			<ComboboxInput className="w-full" showTrigger={false} disabled={disabled} placeholder={placeholder} aria-label={ariaLabel} data-slot={inputDataSlot} />
			<ComboboxContent>
				<ComboboxList>
					{candidates.map((member) => (
						<ComboboxItem key={member.id} value={member} data-slot={optionDataSlot} data-member-id={member.id}>
							<Avatar className="size-8 shrink-0">
								{member.profile_avatar !== null && <AvatarImage src={member.profile_avatar} alt={fullNameTh(member)} />}
								<AvatarFallback>{member.first_name_th.charAt(0)}</AvatarFallback>
							</Avatar>
							<span className="min-w-0">
								<span className="block truncate font-medium">{fullNameTh(member)}</span>
								<span className="text-muted-foreground block truncate text-xs">
									{member.business.name} · {positionLabel(member.position)}
								</span>
							</span>
						</ComboboxItem>
					))}
					<ComboboxEmpty>
						{searchTerm.trim() === "" ? (
							<span className="flex items-center justify-center gap-1">
								<HugeiconsIcon icon={Search01Icon} className="size-3.5" />
								พิมพ์เพื่อค้นหาสมาชิก...
							</span>
						) : query.isPending ? (
							"กำลังค้นหา..."
						) : (
							"ไม่พบสมาชิก (ค้นหาด้วยข้อความขึ้นต้นเท่านั้น)"
						)}
					</ComboboxEmpty>
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	)
}
