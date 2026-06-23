import { createClient } from '@supabase/supabase-js';

let supabaseInstance: ReturnType<typeof createClient> | null = null;

export const getSupabaseClient = () => {
  if (supabaseInstance) {
    return supabaseInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing Supabase environment variables. Please check your .env.local file.');
  }

  supabaseInstance = createClient(supabaseUrl, supabaseKey);
  return supabaseInstance;
};

// Server-only client that bypasses Row-Level Security via the service-role key.
// Use this for background jobs — the daily cron and the scraper — which act on
// behalf of the whole app rather than a signed-in user. An anon client has no
// membership, so RLS filters it down to zero rows: the cron would read 0
// sessions and silently scrape nothing. NEVER import this into 'use client'
// code; the service-role key must never reach the browser.
let serviceInstance: ReturnType<typeof createClient> | null = null;

export const getServiceRoleClient = () => {
  if (serviceInstance) {
    return serviceInstance;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY (or NEXT_PUBLIC_SUPABASE_URL). ' +
        'Server-side background jobs need the service-role key to bypass RLS.',
    );
  }

  serviceInstance = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serviceInstance;
};

// For backward compatibility, export a getter that throws at runtime
export const supabase = new Proxy({} as ReturnType<typeof createClient>, {
  get(target, prop) {
    const client = getSupabaseClient();
    return client[prop as keyof typeof client];
  },
});
