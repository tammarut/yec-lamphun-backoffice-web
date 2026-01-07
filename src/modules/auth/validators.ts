import { minLength, object, pipe, string } from "valibot"

export const LoginRequestSchema = object({
	username: pipe(string(), minLength(1, "Username is required")),
	password: pipe(string(), minLength(1, "Password is required")),
})
