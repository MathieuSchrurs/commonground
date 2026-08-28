export const DIRECT_FETCH_TIMEOUT_MS = 15_000;
export const PROXIED_FETCH_TIMEOUT_MS = 60_000;
export const API_FETCH_TIMEOUT_MS = 10_000;

// A manual timer, not AbortSignal.timeout(), because vi.useFakeTimers() can
// drive setTimeout but not the timer AbortSignal.timeout() schedules
// internally.
export async function fetchWithTimeout(
  url: string | URL,
  init: RequestInit | undefined,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
