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
