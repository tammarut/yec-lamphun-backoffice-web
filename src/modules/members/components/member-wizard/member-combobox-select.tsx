"use client"

import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "src/shared/components/ui/combobox"

export type MemberComboboxOption = { value: string; label: string }

/**
 * Searchable single-select for the member wizard (Base UI Combobox): type to
 * filter instead of eyeballing long option lists. Fully controlled on the
 * form's string value — `""` renders the placeholder and clearing (✕) emits
 * `""`, so optional fields keep their empty-string sentinel.
 */
export function MemberComboboxSelect({
	id,
	options,
	value,
	onValueChange,
	placeholder,
	disabled = false,
	invalid = false,
}: {
	id: string
	options: readonly MemberComboboxOption[]
	value: string
	onValueChange: (value: string) => void
	placeholder?: string
	disabled?: boolean
	invalid?: boolean
}) {
	const selected = options.find((option) => option.value === value) ?? null
	return (
		<Combobox
			items={options}
			itemToStringLabel={(option) => option.label}
			value={selected}
			disabled={disabled}
			onValueChange={(option) => {
				onValueChange(option?.value ?? "")
			}}
		>
			<ComboboxInput id={id} className="w-full" placeholder={placeholder ?? "-- กรุณาเลือก --"} showClear disabled={disabled} aria-invalid={invalid ? true : undefined} />
			<ComboboxContent>
				<ComboboxList>
					{(option) => (
						<ComboboxItem key={option.value} value={option}>
							{option.label}
						</ComboboxItem>
					)}
				</ComboboxList>
				<ComboboxEmpty>ไม่พบรายการที่ค้นหา</ComboboxEmpty>
			</ComboboxContent>
		</Combobox>
	)
}
