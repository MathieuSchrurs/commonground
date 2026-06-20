'use client';

import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import SessionManager from '@/components/SessionManager';

// The create / join interactions for the home page. Kept as a client component
// so the page itself can stay a server component and render the AccountBar.
export default function HomeClient() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [, setError] = useState('');

  const handleCreateSession = useCallback(async () => {
    setIsLoading(true);
    setError('');

    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create session');
      }

      const { sessionId } = await response.json();
      router.push(`/session/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setIsLoading(false);
    }
  }, [router]);

  const handleJoinSession = useCallback((sessionId: string) => {
    router.push(`/session/${sessionId}`);
  }, [router]);

  return (
    <SessionManager
      onCreateSession={handleCreateSession}
      onJoinSession={handleJoinSession}
      isLoading={isLoading}
    />
  );
}
