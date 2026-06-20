import { createBrowserClient } from '@supabase/ssr';

// Browser / Client Component Supabase client. Reads & writes the auth cookies
// via the document automatically — no cookie adapter needed. Distinct from the
// auth-unaware singleton in src/lib/supabase.ts (which stays for the scraper).
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
