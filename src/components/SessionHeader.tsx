'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ShareLink from '@/components/ShareLink';

interface SessionHeaderProps {
  sessionId: string;
}

// Shared top bar for every page within a session: brand, the Map | Dashboard
// tabs, and the share link. Both tabs keep the same session id and identity.
export default function SessionHeader({ sessionId }: SessionHeaderProps) {
  const pathname = usePathname();
  const onDashboard = pathname?.endsWith('/dashboard') ?? false;

  const tabs = [
    { label: 'Map', href: `/session/${sessionId}`, active: !onDashboard },
    { label: 'Dashboard', href: `/session/${sessionId}/dashboard`, active: onDashboard },
  ];

  return (
    <header className="border-b border-border bg-background/80 backdrop-blur">
      <div className="px-4 sm:px-6 py-3 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 group">
          <div className="h-5 w-5 rounded-md bg-foreground transition-transform group-hover:scale-110" />
          <span className="text-sm font-medium tracking-tight">CommonGround</span>
          <span className="text-xs text-muted-foreground font-mono ml-2 hidden sm:inline">
            {sessionId.slice(0, 8)}
          </span>
        </Link>

        <nav className="flex items-center gap-1 ml-2">
          {tabs.map((tab) => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab.active
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>

        <div className="ml-auto">
          <ShareLink sessionId={sessionId} />
        </div>
      </div>
    </header>
  );
}
