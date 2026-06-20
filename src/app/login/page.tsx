'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

export default function LoginPage() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

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
    if (!email.trim() || !password) return;
    setIsLoading(true);
    setError('');
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
    // Session cookies are set by the browser client; a full navigation lets the
    // proxy pick them up and route into the hub.
    window.location.href = nextUrl();
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-6 w-6 rounded-md bg-foreground" />
          <span className="text-sm font-medium tracking-tight">CommonGround</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">
          {mode === 'signin' ? 'Sign in' : 'Create your account'}
        </h1>
        <p className="text-muted-foreground text-sm leading-relaxed mb-8">
          Sign in to find shared ground with your group and pick up where you left off.
        </p>

        <Button onClick={signInWithGoogle} disabled={isLoading} size="lg" className="w-full">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue with Google'}
        </Button>

        <div className="flex items-center gap-3 my-6">
          <Separator className="flex-1" />
          <span className="text-xs text-muted-foreground uppercase tracking-wider">or</span>
          <Separator className="flex-1" />
        </div>

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
          <div className="space-y-1.5">
            <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">Password</Label>
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

          <Button type="submit" variant="outline" disabled={isLoading || !email.trim() || !password} className="w-full">
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === 'signin' ? (
              'Sign in with email'
            ) : (
              'Create account'
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
            : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
