'use client';

import React from 'react';
import { Heart, Minus, Split, X } from 'lucide-react';
import { HouseholdPosition, HouseholdStanding } from '@/lib/convergence';

interface HouseholdStandingsProps {
  standings: HouseholdStanding[];
}

const STYLE: Record<HouseholdPosition, { icon: typeof Heart; className: string; label: string }> = {
  yes: { icon: Heart, className: 'text-rose-600', label: 'in' },
  split: { icon: Split, className: 'text-amber-600', label: 'split' },
  no: { icon: X, className: 'text-muted-foreground', label: 'out' },
  silent: { icon: Minus, className: 'text-muted-foreground/60', label: 'no word yet' },
};

// Every household's position on one listing. Showing the whole set — including
// the silent ones — is what makes a disagreement *within* a couple legible
// against one *between* couples, and shows who is still holding things up.
export default function HouseholdStandings({ standings }: HouseholdStandingsProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs">
      {standings.map((s) => {
        const { icon: Icon, className, label } = STYLE[s.position];

        // A split household is only actionable if you know which partner to
        // talk to; a household of one already says it in its name.
        const detail =
          s.position === 'split'
            ? `${s.loveNames.join(', ')} ❤ · ${s.objectNames.join(', ')} ✕`
            : null;

        return (
          <span key={s.householdId} className={`flex items-center gap-1 ${className}`}>
            <Icon className="h-3 w-3" />
            {s.householdName}
            <span className="text-muted-foreground/70">{detail ?? label}</span>
          </span>
        );
      })}
    </div>
  );
}
