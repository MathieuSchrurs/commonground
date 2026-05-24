'use client';

import React, { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';

interface SessionManagerProps {
  onCreateSession: () => Promise<void>;
  onJoinSession: (sessionId: string) => void;
  isLoading: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function SessionManager({ onCreateSession, onJoinSession, isLoading }: SessionManagerProps) {
  const [sessionUrl, setSessionUrl] = useState('');
  const [error, setError] = useState('');

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!sessionUrl.trim()) {
      setError('Please enter a session URL');
      return;
    }

    let sessionId = sessionUrl.trim();
    if (sessionId.includes('/session/')) {
      sessionId = sessionId.split('/session/').pop() ?? '';
    }
    sessionId = sessionId.split('?')[0].split('#')[0];

    if (!UUID_RE.test(sessionId)) {
      setError('Invalid session URL format');
      return;
    }

    onJoinSession(sessionId);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-md">
        <div className="mb-12">
          <div className="flex items-center gap-2 mb-8">
            <div className="h-6 w-6 rounded-md bg-foreground" />
            <span className="text-sm font-medium tracking-tight">CommonGround</span>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight mb-3">
            Find shared ground.
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Map everyone&apos;s commute constraints, find the area you all can live, and discover homes for sale inside it.
          </p>
        </div>

        <div className="space-y-6">
          <Button
            onClick={onCreateSession}
            disabled={isLoading}
            size="lg"
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating session
              </>
            ) : (
              <>
                Start a session
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>

          <div className="flex items-center gap-3">
            <Separator className="flex-1" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">or</span>
            <Separator className="flex-1" />
          </div>

          <form onSubmit={handleJoin} className="space-y-3">
            <Label htmlFor="sessionUrl" className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Join existing session
            </Label>
            <Input
              id="sessionUrl"
              type="text"
              value={sessionUrl}
              onChange={(e) => setSessionUrl(e.target.value)}
              placeholder="Paste session URL"
              disabled={isLoading}
              className="font-mono text-sm"
            />

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}

            <Button
              type="submit"
              disabled={isLoading || !sessionUrl.trim()}
              variant="outline"
              className="w-full"
            >
              {isLoading ? 'Joining…' : 'Join session'}
            </Button>
          </form>
        </div>

        <p className="text-xs text-muted-foreground mt-12 text-center">
          Collaborate with friends and family to find the perfect spot.
        </p>
      </div>
    </div>
  );
}
