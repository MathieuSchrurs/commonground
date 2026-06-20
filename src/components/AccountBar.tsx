import { createClient } from '@/utils/supabase/server';
import { Button } from '@/components/ui/button';

// A thin bar showing who's signed in, with a sign-out action. Server component:
// reads the session from cookies and the display name from the profiles mirror.
export default async function AccountBar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from('profiles')
    .select('display_name, email')
    .eq('id', user.id)
    .maybeSingle();
  const profile = data as { display_name?: string; email?: string } | null;
  const name = profile?.display_name ?? profile?.email ?? user.email ?? 'there';

  return (
    <div className="border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 sm:px-6 py-2">
        <span className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{name}</span>
        </span>
        <form action="/auth/signout" method="post">
          <Button type="submit" variant="ghost" size="sm">
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}
