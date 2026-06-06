import { toast } from "sonner";

// Typed API error carrying the HTTP status so callers can react (e.g. 401).
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

// fetch + JSON wrapper with consistent error handling. Throws ApiError with a
// human-readable message derived from the response's `{ error }` body.
export async function requestJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new ApiError("Network error — check your connection and try again.", 0);
  }

  const text = await response.text();
  let body: unknown = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new ApiError("Your session has expired. Please sign in again.", 401);
    }
    const message =
      body && typeof body === "object" && "error" in body && typeof body.error === "string"
        ? body.error
        : `Request failed (${response.status}).`;
    throw new ApiError(message, response.status);
  }

  return body as T;
}

// Central place to surface an error to the user. Shows a toast and, on auth
// failures, sends them to the login page.
export function notifyError(error: unknown, fallback = "Something went wrong."): string {
  const message =
    error instanceof ApiError || error instanceof Error
      ? error.message || fallback
      : fallback;

  toast.error(message);

  if (error instanceof ApiError && error.status === 401 && typeof window !== "undefined") {
    setTimeout(() => {
      window.location.href = "/login";
    }, 1200);
  }

  return message;
}
