import { RenewalPageView } from "src/modules/membership-renewals/components/renewal-page-view"
import { envConfig } from "src/shared/config/env"

// The Turnstile site key is read per request and injected as a prop (SEC-6,
// #130) — force-dynamic so `next build` never bakes it into prerendered HTML.
export const dynamic = "force-dynamic"

export default function MembershipRenewalPage() {
	return <RenewalPageView turnstileSiteKey={envConfig.CLOUDFLARE_TURNSTILE_SITE_KEY} />
}
