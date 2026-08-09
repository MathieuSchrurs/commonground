'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Logo } from '@/components/Logo';

function GoogleIcon() {
  return (
    <svg className="size-4" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.86c2.26-2.09 3.56-5.17 3.56-8.87Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29a7.18 7.18 0 0 1 0-4.58V6.62H1.29a12 12 0 0 0 0 10.76l3.98-3.09Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75Z"
      />
    </svg>
  );
}

type Mode = 'signin' | 'signup' | 'reset';

export default function LoginPage() {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [sentTo, setSentTo] = useState('');

  const nextUrl = () => new URLSearchParams(window.location.search).get('next') ?? '/';

  const signInWithGoogle = async () => {
    setIsLoading(true);
    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(nextUrl())}` },
    });
    if (error) {
      setError(error.message);
      setIsLoading(false);
    }
  };

  const submitEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (mode === 'reset') {
      if (!email.trim()) return;
      setIsLoading(true);
      const supabase = createClient();
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent('/auth/reset')}`,
      });
      setIsLoading(false);
      if (error) {
        setError(error.message);
        return;
      }
      setSentTo(email.trim());
      return;
    }

    if (!email.trim() || !password) return;
    setIsLoading(true);
    const supabase = createClient();
    const { error } =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });
    if (error) {
      setError(error.message);
      setIsLoading(false);
      return;
    }
    window.location.href = nextUrl();
  };

  const titles: Record<Mode, string> = {
    signin: 'Sign in',
    signup: 'Create your account',
    reset: 'Reset your password',
  };

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
              {titles[mode]}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {mode === 'reset'
                ? 'Enter your email and we’ll send you a link to set a new password.'
                : 'Sign in to find shared ground with your group and pick up where you left off.'}
            </p>
          </CardHeader>

          <CardContent className="mt-6 space-y-5">
            {sentTo ? (
              <div className="space-y-6 pt-2">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  If an account exists for{' '}
                  <span className="font-medium text-foreground">{sentTo}</span>, a password-reset
                  link is on its way. Follow it to set a new password.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="lg"
                  onClick={() => {
                    setSentTo('');
                    setMode('signin');
                  }}
                  className="w-full"
                >
                  Back to sign in
                </Button>
              </div>
            ) : (
              <>
                {mode !== 'reset' && (
                  <>
                    <Button
                      onClick={signInWithGoogle}
                      disabled={isLoading}
                      size="lg"
                      className="w-full"
                    >
                      {isLoading ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <>
                          <GoogleIcon />
                          Continue with Google
                        </>
                      )}
                    </Button>
                    <div className="flex items-center gap-3">
                      <Separator className="flex-1" />
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">
                        or
                      </span>
                      <Separator className="flex-1" />
                    </div>
                  </>
                )}

                <form onSubmit={submitEmail} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                      Email
                    </Label>
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      disabled={isLoading}
                      className="h-10 focus-visible:border-brand focus-visible:ring-brand/50 dark:focus-visible:border-brand/70 dark:focus-visible:ring-brand/40"
                    />
                  </div>
                  {mode !== 'reset' && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label
                          htmlFor="password"
                          className="text-xs font-medium text-muted-foreground"
                        >
                          Password
                        </Label>
                        {mode === 'signin' && (
                          <button
                            type="button"
                            onClick={() => {
                              setMode('reset');
                              setError('');
                            }}
                            className="text-xs text-muted-foreground hover:text-brand"
                          >
                            Forgot password?
                          </button>
                        )}
                      </div>
                      <Input
                        id="password"
                        type="password"
                        autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        disabled={isLoading}
                        className="h-10 focus-visible:border-brand focus-visible:ring-brand/50 dark:focus-visible:border-brand/70 dark:focus-visible:ring-brand/40"
                      />
                    </div>
                  )}

                  <Button
                    type="submit"
                    variant="brand"
                    size="lg"
                    disabled={isLoading || !email.trim() || (mode !== 'reset' && !password)}
                    className="w-full"
                  >
                    {isLoading ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : mode === 'signin' ? (
                      'Sign in with email'
                    ) : mode === 'signup' ? (
                      'Create account'
                    ) : (
                      'Send reset link'
                    )}
                  </Button>
                </form>

                {error && <p className="text-xs text-destructive">{error}</p>}
              </>
            )}
          </CardContent>
        </Card>

        {!sentTo && (
          <>
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError('');
              }}
              className="mt-6 w-full text-center text-xs text-muted-foreground hover:text-brand"
            >
              {mode === 'signin'
                ? "Don't have an account? Create one"
                : mode === 'signup'
                  ? 'Already have an account? Sign in'
                  : 'Back to sign in'}
            </button>
            {process.env.NODE_ENV === 'development' && (
              <Link
                href="/login/dev"
                className="mt-3 block w-full text-center text-xs text-muted-foreground hover:text-brand"
              >
                Dev: sign in as an account in this database
              </Link>
            )}
          </>
        )}
      </div>
    </div>
  );
}
