import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase';
import { signInAs } from '../signInAs';
import { isDevLoginEnabled } from '../guard';

// Dev-only: create a local account (no confirmation email, no password to
// remember) and sign in as it immediately. Guarded so it can never run outside
// local development.
export async function POST(request: Request) {
  if (!isDevLoginEnabled()) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  }

  const formData = await request.formData();
  const email = String(formData.get('email') ?? '').trim();
  const displayName = String(formData.get('display_name') ?? '').trim();
  const next = String(formData.get('next') ?? '/');

  if (!email) {
    return NextResponse.redirect(new URL('/login/dev', request.url), { status: 303 });
  }

  const admin = getServiceRoleClient();
  const { error: createError } = await admin.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { full_name: displayName || email.split('@')[0] },
  });

  if (createError || !(await signInAs(email))) {
    return NextResponse.redirect(new URL('/login/dev', request.url), { status: 303 });
  }

  const redirectTo = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 });
}
