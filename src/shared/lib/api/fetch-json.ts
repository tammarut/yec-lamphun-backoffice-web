import { err, ok, type Result } from "neverthrow"

import { AppError } from "src/shared/core/errors/app-error"

export class ApiError extends AppError {
	constructor(
		message: string,
		public readonly status: number,
		cause?: unknown
	) {
		super(message, "API_ERROR", cause)
	}
}

type ResponseBodyErrorJson = {
	error_message?: unknown
}

async function parseErrorMessage(response: Response): Promise<string> {
	try {
		const body: unknown = await response.json()
		if (typeof body === "object" && body !== null && "error_message" in body) {
			const errorMessage = (body as ResponseBodyErrorJson).error_message
			if (typeof errorMessage === "string" && errorMessage.length > 0) {
				return errorMessage
			}
		}
	} catch {
		// Non-JSON error body — fall through to the status-based fallback.
	}
	return `Request failed with status ${response.status}`
}

/**
 * Typed fetch wrapper for the backoffice JSON API.
 *
 * Resolves with `ok(undefined)` for empty (204) success bodies, and maps every
 * failure — network error, non-2xx status, malformed body — to an `ApiError`
 * carrying the `{ error_message }` text when the API provides one.
 */
export async function fetchJson<T>(input: string, init?: RequestInit): Promise<Result<T, ApiError>> {
	let response: Response
	try {
		response = await fetch(input, init)
	} catch (error) {
		return err(new ApiError("Network request failed", 0, error))
	}

	if (!response.ok) {
		const message = await parseErrorMessage(response)
		return err(new ApiError(message, response.status))
	}

	if (response.status === 204) {
		return ok(undefined as T)
	}

	const text = await response.text()
	if (text.length === 0) {
		return ok(undefined as T)
	}

	try {
		return ok(JSON.parse(text) as T)
	} catch (error) {
		return err(new ApiError("Invalid JSON in response body", response.status, error))
	}
}
