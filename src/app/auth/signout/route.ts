import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

// Sign out and return to /login. 303 turns the POST into a GET redirect.
export async function POST(request: Request) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
