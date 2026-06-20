'use client';

import React, { useState, useEffect } from 'react';
import { Check, Copy, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ShareLinkProps {
  sessionId: string;
}

// Copies the session's invite link. Opening it signs in (if needed) and joins
// the hunt — distinct from the raw session URL, which now requires membership.
export default function ShareLink({ sessionId }: ShareLinkProps) {
  const [copied, setCopied] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/sessions/${sessionId}/invite`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (active && d?.token) setInviteUrl(`${window.location.origin}/join/${d.token}`);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sessionId]);

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Button
      onClick={handleCopy}
      variant="outline"
      size="sm"
      className="gap-2"
      disabled={!inviteUrl}
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          Copied
        </>
      ) : (
        <>
          <UserPlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Invite</span>
          <Copy className="h-3.5 w-3.5" />
        </>
      )}
    </Button>
  );
}
