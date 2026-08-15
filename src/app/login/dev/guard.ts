// The dev-only login (/login/dev) must never run in production. Two
// independent gates: NODE_ENV must be 'development' (Vercel sets 'production'
// for prod and preview builds), AND the explicit opt-in flag ENABLE_DEV_LOGIN
// must be 'true'. Production never sets the flag, so even a misconfigured
// NODE_ENV cannot open the picker.
export function isDevLoginEnabled(): boolean {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.ENABLE_DEV_LOGIN === 'true'
  );
}

// Only redirect to a same-origin path after dev sign-in. `//host` and
// `/\host` are both ways to smuggle a different origin past a naive
// `startsWith('/')` check — WHATWG URL parsing treats a leading backslash the
// same as a leading slash, so `new URL('/\\evil.com', origin)` resolves to
// `http://evil.com/`. Requiring the character right after the leading slash
// to be neither `/` nor `\` rules out both.
export function safeRedirectPath(next: string): string {
  return /^\/[^/\\]/.test(next) ? next : '/';
}
