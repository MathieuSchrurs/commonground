'use client';

import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/utils/supabase/client';
import { Button } from '@/components/ui/button';

export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const signInWithGoogle = async () => {
    setIsLoading(true);
    setError('');
    // Carry ?next through OAuth so an invite link resumes after sign-in.
    const next = new URLSearchParams(window.location.search).get('next') ?? '/';
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) {
      setError(error.message);
      setIsLoading(false);
    }
    // On success the browser is redirected to Google, so no further UI here.
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 mb-8">
          <div className="h-6 w-6 rounded-md bg-foreground" />
          <span className="text-sm font-medium tracking-tight">CommonGround</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight mb-2">Sign in</h1>
        <p className="text-muted-foreground text-sm leading-relaxed mb-8">
          Sign in to find shared ground with your group and pick up where you left off.
        </p>

        <Button onClick={signInWithGoogle} disabled={isLoading} size="lg" className="w-full">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue with Google'}
        </Button>

        {error && <p className="text-xs text-destructive mt-3">{error}</p>}
      </div>
    </div>
  );
}
