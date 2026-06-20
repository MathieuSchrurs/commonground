# Supabase Auth + Next.js 16 (App Router) — SSR integration spike

Research note for issue #2. The implementer of issue #3 (Google sign-in tracer bullet)
should be able to follow this without re-researching. All code below is taken verbatim
(or near-verbatim) from the **current** official sources, checked June 2026:

- Supabase: `@supabase/ssr` "Creating a client" + Next.js v16 auth example
  (`supabase/supabase` repo, `examples/auth/nextjs/*`).
- Next.js 16: `proxy.ts` file-convention docs.

> Scope: research only. Nothing here has been installed or wired into product code yet.

---

## 0. Version reality check (READ FIRST — there are gotchas)

Our current `package.json`:

- `next` `^16.2.4`, `react`/`react-dom` `19.2.3`
- `@supabase/supabase-js` `^2.95.3`
- `@supabase/ssr` — **not yet a dependency** (must be added in issue #3)

Pinned facts to plan around:

1. **`@supabase/ssr` latest is `0.12.0`** and its peer dependency is
   **`@supabase/supabase-js@^2.108.0`**. We are on `^2.95.3`. So adding
   `@supabase/ssr` will require bumping `@supabase/supabase-js` (the `^2.95.3`
   range will not satisfy the peer). Expect to run something like
   `npm i @supabase/ssr @supabase/supabase-js@latest` together.

2. **Next.js 16 renamed `middleware.ts` → `proxy.ts`.** The exported function is now
   `proxy` (not `middleware`), and `proxy.ts` **defaults to the Node.js runtime**.
   `middleware.ts` still works but is **deprecated**. This matters: `@supabase/ssr`
   needs Node APIs, and pre-15.2 Edge-runtime middleware used to be a friction point —
   that friction is gone now that proxy is Node by default. Codemod exists:
   `npx @next/codemod@canary middleware-to-proxy .`
   The Supabase v16 example already ships `proxy.ts` (see §2).

3. **`cookies()` from `next/headers` is async in our version** — you must
   `await cookies()` before using it. The server client factory is therefore `async`.

4. **New Supabase API key naming.** The current examples use
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (the new "publishable key", `sb_publishable_…`)
   rather than the legacy `NEXT_PUBLIC_SUPABASE_ANON_KEY`. The anon key still works, but
   new projects/docs use the publishable key. Decide which we standardize on; our existing
   `src/lib/supabase.ts` uses `NEXT_PUBLIC_SUPABASE_ANON_KEY`, so either keep that name or
   migrate. Below I keep the docs' `PUBLISHABLE_KEY` naming — swap to `ANON_KEY` if we
   don't want to touch env vars yet.

5. **Existing client (`src/lib/supabase.ts`) is auth-unaware.** It uses a singleton
   `createClient` from `@supabase/supabase-js` with no cookie handling. It's fine for the
   scraper / service usage but is **not** the right client for anything that needs the
   logged-in user's session. The three SSR clients below are additive; don't route auth
   through the old singleton.

---

## 1. The three clients

Convention: put these under `src/utils/supabase/` (docs use `utils/supabase/` or
`lib/supabase/`; pick one and be consistent — we already have `src/lib/supabase.ts`, so
`src/utils/supabase/` keeps the new SSR clients clearly separate).

### (c) Browser / Client Components — `src/utils/supabase/client.ts`

```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  )
}
```

Call this inside `'use client'` components. No cookie adapter needed — the browser
client reads/writes cookies via the document automatically.

### (a) Server Components / server code — `src/utils/supabase/server.ts`

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet, _headers) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}
```

Key points:
- `await cookies()` (async in Next 16).
- The factory is `async` → callers do `const supabase = await createClient()`.
- **Only `getAll` / `setAll`** are implemented. Never use the old `get`/`set`/`remove`
  adapter — `@supabase/ssr` requires the array form and will misbehave otherwise.
- The `try/catch` around `setAll` is load-bearing: Server Components **cannot** write
  cookies, so the throw is swallowed. The proxy (§2) is what actually persists the
  refreshed cookies, so this is safe.
- `setAll` now receives a second `_headers` arg (cache headers). In the SC client it's
  ignored; in the proxy client it must be applied (see §2).

### (b) Route Handlers (and Server Actions)

**Use the exact same `src/utils/supabase/server.ts` `createClient()`.** Route Handlers
*can* write cookies, so the `setAll` `try/catch` simply won't throw there. No separate
"route handler client" is needed in the current `@supabase/ssr` model — the old
`createRouteHandlerClient` from `@supabase/auth-helpers-nextjs` is deprecated; ignore any
tutorial that uses it.

```ts
// e.g. src/app/api/whoami/route.ts
import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return NextResponse.json({ user: data?.claims ?? null })
}
```

> Note for our existing `src/app/api/sessions/**` route handlers: they currently use the
> auth-unaware singleton. If/when those routes need to enforce "this user owns this
> session", switch them to `await createClient()` from the server util so RLS sees the
> user's JWT.

---

## 2. `proxy.ts` — refresh the session + gate protected routes

Two files. The Supabase v16 example splits the logic into a `updateSession` helper.

### `src/utils/supabase/proxy.ts` (the session-refresh helper)

```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  // With Fluid compute, don't put this client in a global environment
  // variable. Always create a new one on each request.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
          Object.entries(headers).forEach(([key, value]) =>
            supabaseResponse.headers.set(key, value)
          )
        },
      },
    }
  )

  // Do not run code between createServerClient and supabase.auth.getClaims().
  // A simple mistake could make it very hard to debug issues with users being
  // randomly logged out.

  // IMPORTANT: If you remove getClaims() and you use server-side rendering with
  // the Supabase client, your users may be randomly logged out.
  const { data } = await supabase.auth.getClaims()
  const user = data?.claims

  if (
    !user &&
    !request.nextUrl.pathname.startsWith('/login') &&
    !request.nextUrl.pathname.startsWith('/auth')
  ) {
    // no user → redirect to the login page
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // IMPORTANT: return supabaseResponse as-is. If you build a new response,
  // copy the cookies over (myNewResponse.cookies.setAll(supabaseResponse.cookies.getAll()))
  // or the browser and server sessions go out of sync and the user is logged out.
  return supabaseResponse
}
```

### `src/proxy.ts` (the Next.js 16 entrypoint — replaces `middleware.ts`)

```ts
import { type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/proxy'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico
     * - common image extensions
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
```

### Gating *our* routes (`/session/*` and the future hub `/`)

The skeleton above redirects **everything** that isn't `/login` or `/auth/*` to `/login`
when there's no user. That is exactly the behavior we want for `/` (hub) and `/session/*`,
but it also locks down every other page. Two ways to scope it:

- **Simplest / recommended for the tracer bullet:** keep the broad redirect. Allow-list
  the public paths by extending the guard, e.g.:
  ```ts
  const PUBLIC_PREFIXES = ['/login', '/auth']
  const isPublic = PUBLIC_PREFIXES.some((p) => request.nextUrl.pathname.startsWith(p))
  if (!user && !isPublic) { /* redirect to /login */ }
  ```
- **Or** narrow the `matcher` (or add an in-handler check) so the redirect only fires for
  `/` and `/session/:path*`. The matcher must be a static constant (Next can't analyze
  dynamic values).

Gotchas for the matcher / gating:
- Without a matcher, proxy runs on **every** request including assets — always exclude
  `_next/static`, `_next/image`, images.
- The proxy `config.runtime` option is **not allowed** in Next 16 — proxy is Node.js
  runtime, and setting `runtime` throws. Don't add it.
- Server Actions are POSTs to the route they live on; if a matcher excludes that path,
  the proxy won't cover the action. **Always re-check auth inside server actions / route
  handlers** (e.g. `getClaims()` + RLS), don't rely on the proxy alone.
- `_next/data` routes are still proxied even if excluded in the matcher (intentional, to
  avoid leaving data routes unprotected).

### `getClaims()` vs `getUser()`
The current example uses **`supabase.auth.getClaims()`** (validates the JWT locally /
verifies claims) rather than `getUser()` (network round-trip to the Auth server). Either
protects routes; `getClaims()` is the newer, faster recommendation. **Do not** trust
`getSession()` for authorization on the server — it reads cookies without verifying them.

---

## 3. Session persistence — why a user stays logged in for days

Defaults (Supabase Auth), no extra config required for "logged in for days across devices":

- **Access token (JWT): 1 hour** by default (3600s). Configurable in dashboard
  (Project Settings → JWT/Auth), but 1h is recommended; don't go below ~5 min.
- **Refresh token: never expires by default**, single-use (rotates on each refresh).
- **Refresh-token reuse interval: 10 seconds** by default — a just-used refresh token
  still works for 10s to tolerate races/retries. Don't change it.
- **Sessions are unlimited by default**: last indefinitely, unlimited concurrent sessions
  across unlimited devices, until the user signs out / changes password.
- **Time-box** and **Inactivity timeout** session limits exist but are **Pro+ dashboard
  features and are OFF (unlimited) by default**. There's also "Single session per user".

How the refresh actually happens in our stack:
- The **browser client** auto-refreshes the access token in the background while a tab is
  open.
- The **proxy `updateSession` on every request** is what refreshes the token for
  server-rendered navigation and writes the rotated cookies back. This is why the
  proxy + the `getClaims()` call are mandatory and why you must return `supabaseResponse`
  unmodified (or copy its cookies). Skip this and users get "randomly logged out."

**Net:** with the default Supabase config + the proxy wired up, a user stays logged in for
days/across devices with **no extra configuration**. We only need to *change* defaults if
we want to *restrict* sessions (time-box / inactivity / single-session), which we don't for
the co-buying hub.

---

## 4. OAuth callback route for Google (PKCE)

`@supabase/ssr` uses the **PKCE flow by default**. Google sign-in needs:

1. A `signInWithOAuth` call with a `redirectTo` pointing at our callback route.
2. A callback Route Handler that exchanges the `code` for a session
   (`exchangeCodeForSession`).

### Kick off sign-in (client component)

```ts
'use client'
import { createClient } from '@/utils/supabase/client'

export async function signInWithGoogle() {
  const supabase = createClient()
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${location.origin}/auth/callback`,
    },
  })
}
```

The `redirectTo` URL must be on the Supabase **redirect allow list** (dashboard → Auth →
URL Configuration). Add `http://localhost:3000/auth/callback` for local dev and the prod
URL.

> Google note: Google doesn't return a refresh token by default. We don't need Google's
> own tokens for the tracer bullet — we only care about the Supabase session — so the
> basic call above is enough. (If we later need `provider_refresh_token`, pass
> `queryParams: { access_type: 'offline', prompt: 'consent' }`.)

### `src/app/auth/callback/route.ts` (verbatim from current docs)

```ts
import { NextResponse } from 'next/server'
// The client you created from the Server-Side Auth instructions
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  // if "next" is in param, use it as the redirect URL
  let next = searchParams.get('next') ?? '/'
  if (!next.startsWith('/')) {
    // if "next" is not a relative URL, use the default
    next = '/'
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const forwardedHost = request.headers.get('x-forwarded-host') // original origin before load balancer
      const isLocalEnv = process.env.NODE_ENV === 'development'
      if (isLocalEnv) {
        // no load balancer in dev, so no need to watch for X-Forwarded-Host
        return NextResponse.redirect(`${origin}${next}`)
      } else if (forwardedHost) {
        return NextResponse.redirect(`https://${forwardedHost}${next}`)
      } else {
        return NextResponse.redirect(`${origin}${next}`)
      }
    }
  }

  // return the user to an error page with instructions
  return NextResponse.redirect(`${origin}/auth/auth-code-error`)
}
```

Notes:
- Uses the **server** `createClient` (same one from §1a). `exchangeCodeForSession` writes
  the session cookies; because this is a Route Handler, the `setAll` `try/catch` won't
  throw.
- `next` is sanitized to relative URLs (open-redirect guard) — keep that check.
- The `x-forwarded-host` dance matters on Vercel/behind a load balancer so we redirect to
  the real host, not the internal origin. Keep it.
- The `code` is valid for 5 minutes and single-use.
- Build a small `/auth/auth-code-error` page so the failure branch lands somewhere real.
- Remember `/auth` is allow-listed in the proxy guard (§2), so the callback isn't itself
  redirected to `/login`.

---

## 5. Consolidated gotcha checklist for issue #3

- [ ] Install `@supabase/ssr` **and** bump `@supabase/supabase-js` to `^2.108.0`
      (peer-dep requirement of ssr `0.12.0`).
- [ ] Decide env var name: `..._PUBLISHABLE_KEY` (docs) vs existing
      `..._ANON_KEY` (our current `src/lib/supabase.ts`). Pick one; the anon key works.
- [ ] Use `proxy.ts` (not `middleware.ts`), export `proxy`, no `runtime` config.
- [ ] `await cookies()` — async server client factory; callers `await createClient()`.
- [ ] Implement **only** `getAll`/`setAll` in cookie adapters.
- [ ] Keep the `try/catch` in the server client's `setAll`; apply the `headers` arg in
      the proxy client's `setAll`.
- [ ] No code between `createServerClient(...)` and `getClaims()` in the proxy.
- [ ] Return `supabaseResponse` unmodified from the proxy (or copy its cookies).
- [ ] Allow-list `/login` and `/auth/*` in the proxy guard; gate `/` and `/session/*`.
- [ ] Re-check auth inside route handlers / server actions; don't rely on the proxy alone.
- [ ] Add the callback URL to Supabase's redirect allow list (local + prod).
- [ ] Leave session/token lifetimes at defaults — that already gives multi-day,
      multi-device persistence.

## Sources

- Supabase, "Creating a Supabase client for SSR":
  https://supabase.com/docs/guides/auth/server-side/creating-a-client
- Supabase, "Setting up Server-Side Auth for Next.js":
  https://supabase.com/docs/guides/auth/server-side/nextjs
- Supabase v16 auth example (verbatim `client.ts` / `server.ts` / `proxy.ts`):
  `supabase/supabase` repo, `examples/auth/nextjs/`
- Supabase OAuth/PKCE callback partial (verbatim `app/auth/callback/route.ts`):
  `supabase/supabase` repo, `apps/docs/content/_partials/oauth_pkce_flow.mdx`
- Supabase, "Login with Google":
  https://supabase.com/docs/guides/auth/social-login/auth-google
- Supabase, "User sessions":
  https://supabase.com/docs/guides/auth/sessions
- Next.js 16, `proxy.ts` file convention (v16.2.9 docs):
  https://nextjs.org/docs/app/api-reference/file-conventions/proxy
