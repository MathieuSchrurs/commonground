import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';

// Where the callback lands if the code exchange fails (expired/used code, etc.).
export default function AuthCodeError() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-semibold tracking-tight mb-2">Sign-in failed</h1>
        <p className="text-muted-foreground text-sm leading-relaxed mb-8">
          That sign-in link didn&apos;t work — it may have expired or already been used.
          Please try again.
        </p>
        <Link href="/login" className={buttonVariants({ className: 'w-full' })}>
          Back to sign in
        </Link>
      </div>
    </div>
  );
}
