import { Suspense } from "react"

import { MembersView } from "src/modules/members/components/members-view"

export default function MembersPage() {
	// MembersView reads `?q=` / `?view=` from the URL (back-nav restore, #147
	// follow-up) — useSearchParams suspends static prerendering without a
	// boundary here.
	return (
		<Suspense>
			<MembersView />
		</Suspense>
	)
}
