'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

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
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-6 w-6 rounded-md bg-foreground" />
          <span className="text-sm font-medium tracking-tight">CommonGround</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">{titles[mode]}</h1>

        {sentTo ? (
          <div className="space-y-6">
            <p className="text-muted-foreground text-sm leading-relaxed">
              If an account exists for <span className="font-medium text-foreground">{sentTo}</span>,
              a password-reset link is on its way. Follow it to set a new password.
            </p>
            <button
              type="button"
              onClick={() => {
                setSentTo('');
                setMode('signin');
              }}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <p className="text-muted-foreground text-sm leading-relaxed mb-8">
              {mode === 'reset'
                ? 'Enter your email and we’ll send you a link to set a new password.'
                : 'Sign in to find shared ground with your group and pick up where you left off.'}
            </p>

            {mode !== 'reset' && (
              <>
                <Button onClick={signInWithGoogle} disabled={isLoading} size="lg" className="w-full">
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue with Google'}
                </Button>
                <div className="flex items-center gap-3 my-6">
                  <Separator className="flex-1" />
                  <span className="text-xs text-muted-foreground uppercase tracking-wider">or</span>
                  <Separator className="flex-1" />
                </div>
              </>
            )}

            <form onSubmit={submitEmail} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  disabled={isLoading}
                />
              </div>
              {mode !== 'reset' && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">Password</Label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => {
                          setMode('reset');
                          setError('');
                        }}
                        className="text-xs text-muted-foreground hover:text-foreground"
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
                  />
                </div>
              )}

              <Button
                type="submit"
                variant={mode === 'reset' ? 'default' : 'outline'}
                disabled={isLoading || !email.trim() || (mode !== 'reset' && !password)}
                className="w-full"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : mode === 'signin' ? (
                  'Sign in with email'
                ) : mode === 'signup' ? (
                  'Create account'
                ) : (
                  'Send reset link'
                )}
              </Button>
            </form>

            {error && <p className="text-xs text-destructive mt-3">{error}</p>}

            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signin' ? 'signup' : 'signin');
                setError('');
              }}
              className="text-xs text-muted-foreground hover:text-foreground mt-6"
            >
              {mode === 'signin'
                ? "Don't have an account? Create one"
                : mode === 'signup'
                  ? 'Already have an account? Sign in'
                  : 'Back to sign in'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
