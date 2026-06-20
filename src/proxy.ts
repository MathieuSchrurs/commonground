import { type NextRequest } from 'next/server';
import { updateSession } from '@/utils/supabase/proxy';

// Next.js 16 entrypoint (replaces middleware.ts). Runs on the Node.js runtime
// by default — do not add a `runtime` config, it throws in Next 16.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Everything except static assets and images — the session must refresh on
    // real navigations and API calls.
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
