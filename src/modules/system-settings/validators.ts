import { boolean, object } from "valibot"

export const PatchSystemSettingsSchema = object({
	open_membership_renewal: boolean(),
})
