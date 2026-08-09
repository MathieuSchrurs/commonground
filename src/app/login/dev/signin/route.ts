import { NextResponse } from 'next/server';
import { signInAs } from '../signInAs';
import { isDevLoginEnabled } from '../guard';

// Dev-only: sign in as any account in the local database. Guarded so it can
// never run outside local development.
export async function POST(request: Request) {
  if (!isDevLoginEnabled()) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  }

  const formData = await request.formData();
  const email = String(formData.get('email') ?? '').trim();
  const next = String(formData.get('next') ?? '/');

  if (!email || !(await signInAs(email))) {
    return NextResponse.redirect(new URL('/login/dev', request.url), { status: 303 });
  }

  const redirectTo = next.startsWith('/') && !next.startsWith('//') ? next : '/';
  return NextResponse.redirect(new URL(redirectTo, request.url), { status: 303 });
}
