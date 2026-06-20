import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { getAccountId } from '@/lib/auth';

interface ActivityRow {
  id: string;
  display_name: string | null;
  email: string | null;
  last_sign_in_at: string | null;
  created_at: string | null;
}

function fmt(ts: string | null): string {
  if (!ts) return 'never';
  return new Date(ts).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

// Owner-only: when each member last signed in. The admin_activity() function
// returns rows only to admins, and this page also guards on is_admin so a
// non-owner sees a polite wall, never the data.
export default async function AdminPage() {
  const accountId = await getAccountId();
  if (!accountId) redirect('/login?next=/admin');

  const supabase = await createClient();
  const { data: meRow } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', accountId)
    .maybeSingle();
  const isAdmin = (meRow as { is_admin?: boolean } | null)?.is_admin ?? false;

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Not available</h1>
          <p className="text-sm text-muted-foreground mb-8">This page is for the project owner.</p>
          <Link href="/" className="text-sm underline">Back to your hunts</Link>
        </div>
      </div>
    );
  }

  const { data } = await supabase.rpc('admin_activity');
  const rows = (data ?? []) as ActivityRow[];

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto w-full max-w-3xl px-4 sm:px-6 py-8 space-y-5">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight">Member activity</h1>
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground underline">
            Back
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          When each person last signed in. Only you (the owner) can see this.
        </p>
        <div className="rounded-lg border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left font-medium px-4 py-2">Member</th>
                <th className="text-left font-medium px-4 py-2">Last sign-in</th>
                <th className="text-left font-medium px-4 py-2 hidden sm:table-cell">Joined</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <div className="font-medium">{r.display_name ?? '—'}</div>
                    <div className="text-xs text-muted-foreground">{r.email}</div>
                  </td>
                  <td className="px-4 py-2">{fmt(r.last_sign_in_at)}</td>
                  <td className="px-4 py-2 hidden sm:table-cell text-muted-foreground">
                    {fmt(r.created_at)}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                    No members yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
