import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getServiceRoleClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Logo } from '@/components/Logo';
import { isDevLoginEnabled } from './guard';

// Dev-only login: pick an account out of the local database and sign in as it
// in one click — no password, no Google, no email confirmations. Only reachable
// in local development (NODE_ENV + ENABLE_DEV_LOGIN); both the page and the
// handlers it posts to refuse to run otherwise.

type DevAccount = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export default async function DevLoginPage() {
  if (!isDevLoginEnabled()) redirect('/login');

  // The page is reached signed-out, so RLS (signed-in only) would hide every
  // row. List accounts via the service-role client; this page is server-only so
  // the key never reaches the browser.
  const admin = getServiceRoleClient();
  const { data } = await admin
    .from('profiles')
    .select('id, email, display_name, avatar_url')
    .order('display_name', { ascending: true, nullsFirst: true });
  const accounts = (data ?? []) as DevAccount[];

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-16 sm:px-6">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-32 left-1/2 h-80 w-[36rem] -translate-x-1/2 rounded-full bg-foreground/[0.04] blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-96 w-[28rem] rounded-full bg-brand/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex items-center justify-center gap-2">
          <Logo className="h-8 w-8" />
          <span className="text-sm font-semibold tracking-tight">CommonGround</span>
        </div>

        <Card className="py-6 shadow-xl shadow-foreground/5 ring-border sm:py-7">
          <CardHeader className="gap-1.5 text-center">
            <h1 className="text-xl font-semibold tracking-tight text-card-foreground">
              Dev sign in
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Pick an account from the local database to sign in as.
            </p>
          </CardHeader>

          <CardContent className="mt-6 space-y-5">
            {accounts.length === 0 ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                No accounts yet — create one below.
              </p>
            ) : (
              <ul className="space-y-2">
                {accounts.map((account) => (
                  <li key={account.id}>
                    <form action="/login/dev/signin" method="post">
                      <input type="hidden" name="email" value={account.email ?? ''} />
                      <Button type="submit" variant="outline" size="lg" className="w-full justify-start">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand text-sm font-semibold text-brand-foreground">
                          {(account.display_name ?? account.email ?? '?').charAt(0).toUpperCase()}
                        </span>
                        <span className="flex min-w-0 flex-col items-start">
                          <span className="truncate text-sm font-medium text-foreground">
                            {account.display_name ?? 'No name'}
                          </span>
                          <span className="truncate text-xs font-normal text-muted-foreground">
                            {account.email}
                          </span>
                        </span>
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}

            <Separator />

            <form action="/login/dev/create" method="post" className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="dev-display-name" className="text-xs font-medium text-muted-foreground">
                  Display name
                </Label>
                <Input
                  id="dev-display-name"
                  name="display_name"
                  type="text"
                  autoComplete="off"
                  placeholder="Ada"
                  className="h-10"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dev-email" className="text-xs font-medium text-muted-foreground">
                  Email
                </Label>
                <Input
                  id="dev-email"
                  name="email"
                  type="email"
                  autoComplete="off"
                  placeholder="ada@example.com"
                  required
                  className="h-10"
                />
              </div>
              <Button type="submit" variant="brand" size="lg" className="w-full">
                Create and sign in
              </Button>
            </form>

            <div className="text-center">
              <Link
                href="/login"
                className="text-xs text-muted-foreground hover:text-brand"
              >
                Back to regular sign in
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
