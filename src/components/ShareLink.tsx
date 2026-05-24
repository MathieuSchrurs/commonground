'use client';

import React, { useState, useEffect } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ShareLinkProps {
  sessionId: string;
}

export default function ShareLink({ sessionId }: ShareLinkProps) {
  const [copied, setCopied] = useState(false);
  const [sessionUrl, setSessionUrl] = useState('');

  useEffect(() => {
    setSessionUrl(`${window.location.origin}/session/${sessionId}`);
  }, [sessionId]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(sessionUrl);
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
      className="font-mono text-xs gap-2"
    >
      {copied ? (
        <>
          <Check className="h-3.5 w-3.5" />
          Copied
        </>
      ) : (
        <>
          <Share2 className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">
            {sessionId.slice(0, 8)}
          </span>
          <Copy className="h-3.5 w-3.5" />
        </>
      )}
    </Button>
  );
}
