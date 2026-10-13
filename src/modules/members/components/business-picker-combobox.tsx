"use client"

import { useState } from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Building01Icon, Search01Icon } from "@hugeicons/core-free-icons"

import { useBusinessSearch } from "src/modules/members/hooks/use-business-search"
import type { BusinessPickerItem } from "src/modules/members/schemas/member-wizard-schema"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "src/shared/components/ui/combobox"
import { useDebouncedValue } from "src/shared/hooks/use-debounced-value"

const SEARCH_DEBOUNCE_MS = 300

type BusinessPickerComboboxProps = {
	/** Fired with the picked business; the parent swaps this combobox out for the read-only card. */
	onSelect: (business: BusinessPickerItem) => void
	disabled?: boolean
}

/**
 * ผูกกิจการที่มีอยู่แล้ว autocomplete (#70): server-side prefix search over
 * business name + juristic registration no (the #68 search endpoint). The API
 * is the filter, so the shared Base UI combobox runs with `filter={null}` —
 * its default client label-filter would hide juristic-prefix matches whose
 * display name doesn't contain the query.
 */
export function BusinessPickerCombobox({ onSelect, disabled = false }: BusinessPickerComboboxProps) {
	const [searchTerm, setSearchTerm] = useState("")
	const debouncedSearch = useDebouncedValue(searchTerm, SEARCH_DEBOUNCE_MS)
	const query = useBusinessSearch(debouncedSearch)

	// searchTerm (not debouncedSearch) so clearing the input hides stale rows
	// instantly — a disabled query keeps its last data for the staleTime window.
	const results = searchTerm === "" ? [] : (query.data ?? [])

	return (
		<Combobox<BusinessPickerItem>
			items={results}
			filter={null}
			itemToStringLabel={(business) => business.name}
			onInputValueChange={(inputValue) => setSearchTerm(inputValue)}
			onValueChange={(business) => {
				if (business !== null) {
					onSelect(business)
				}
			}}
		>
			<ComboboxInput
				className="w-full"
				showTrigger={false}
				disabled={disabled}
				placeholder="ค้นหาชื่อกิจการ / เลขทะเบียนนิติบุคคล..."
				aria-label="ค้นหากิจการที่มีอยู่แล้ว"
				data-slot="wizard-business-search"
			/>
			<ComboboxContent>
				<ComboboxList>
					{results.map((business) => (
						<ComboboxItem key={business.id} value={business} data-slot="business-picker-option" data-business-id={business.id}>
							<span className="bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-md" aria-hidden="true">
								<HugeiconsIcon icon={Building01Icon} className="size-4" />
							</span>
							<span className="min-w-0 flex-1">
								<span className="block truncate font-medium">{business.name}</span>
								<span className="text-muted-foreground block truncate text-xs">
									ทะเบียน {business.juristic_registration_no} · {business.category_name} · สมาชิก {business.member_count} คน
								</span>
							</span>
						</ComboboxItem>
					))}
					<ComboboxEmpty>
						{searchTerm.trim() === "" ? (
							<span className="flex items-center justify-center gap-1">
								<HugeiconsIcon icon={Search01Icon} className="size-3.5" />
								พิมพ์เพื่อค้นหากิจการที่มีอยู่...
							</span>
						) : query.isPending ? (
							"กำลังค้นหา..."
						) : (
							"ไม่พบกิจการ — กลับไปเลือก 'สร้างกิจการใหม่' เพื่อกรอกข้อมูลเอง (ค้นหาด้วยข้อความขึ้นต้นเท่านั้น)"
						)}
					</ComboboxEmpty>
				</ComboboxList>
			</ComboboxContent>
		</Combobox>
	)
}
