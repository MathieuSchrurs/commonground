'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// Landing page for a password-reset link. The recovery code is exchanged for a
// session by /auth/callback before redirecting here, so updateUser can set the
// new password.
export default function ResetPage() {
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    setIsLoading(true);
    setError('');
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (error) {
      setError(
        error.message.includes('session')
          ? 'This reset link has expired or was already used. Request a new one.'
          : error.message,
      );
      return;
    }
    setDone(true);
    setTimeout(() => {
      window.location.href = '/';
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-6 w-6 rounded-md bg-foreground" />
          <span className="text-sm font-medium tracking-tight">CommonGround</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">Set a new password</h1>

        {done ? (
          <p className="text-muted-foreground text-sm leading-relaxed">
            Password updated — taking you to your hunts…
          </p>
        ) : (
          <>
            <p className="text-muted-foreground text-sm leading-relaxed mb-8">
              Choose a new password for your account.
            </p>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                  New password
                </Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  disabled={isLoading}
                />
              </div>
              <Button type="submit" disabled={isLoading || !password} className="w-full">
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Update password'}
              </Button>
            </form>
            {error && <p className="text-xs text-destructive mt-3">{error}</p>}
          </>
        )}
      </div>
    </div>
  );
}
