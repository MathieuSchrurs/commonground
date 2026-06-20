import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Server-side Supabase client, bound to the request's cookies. Used by Server
// Components, Route Handlers, and Server Actions. cookies() is async in Next 16,
// so this factory is async — callers do `await createClient()`.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // setAll called from a Server Component, which cannot write cookies.
            // Safe to ignore: the proxy (src/proxy.ts) refreshes and persists them.
          }
        },
      },
    },
  );
}
