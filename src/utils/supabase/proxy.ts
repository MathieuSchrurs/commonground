import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Page routes that require a signed-in account. Everything else (auth flow,
// API routes, the cron endpoint) passes through — the session is still
// refreshed on every request; only these paths redirect when logged out.
function isProtectedPage(pathname: string): boolean {
  return (
    pathname === '/' ||
    pathname.startsWith('/session') ||
    pathname.startsWith('/join') ||
    pathname.startsWith('/admin')
  );
}

// Refresh the auth session on every request (writing rotated cookies back) and
// redirect logged-out visitors away from protected pages. Returning
// supabaseResponse unmodified is load-bearing: rebuild it and the browser/server
// sessions desync and users get randomly logged out.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value),
          );
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims() — it can cause
  // hard-to-debug random logouts.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims;

  if (!user && isProtectedPage(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    const next = request.nextUrl.pathname + request.nextUrl.search;
    url.pathname = '/login';
    url.search = '';
    if (next && next !== '/') url.searchParams.set('next', next);
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
