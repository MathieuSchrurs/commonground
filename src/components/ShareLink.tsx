'use client';

import React, { useState, useEffect } from 'react';

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
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 min-w-0">
          <label className="block text-sm font-medium text-blue-800 mb-1">
            Share this session
          </label>
          <div className="text-sm text-blue-600 truncate">
            {sessionUrl}
          </div>
        </div>
        <button
          onClick={handleCopy}
          className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors flex items-center gap-2 whitespace-nowrap ${
            copied
              ? 'bg-green-100 text-green-700 border border-green-300'
              : 'bg-blue-600 text-white hover:bg-blue-700'
          }`}
        >
          {copied ? (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Copied!
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy Link
            </>
          )}
        </button>
      </div>
    </div>
  );
}
