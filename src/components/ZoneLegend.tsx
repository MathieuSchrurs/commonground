'use client';

import React from 'react';
import { CommuteConstraint } from '@/types/user';

interface ZoneLegendProps {
  users: CommuteConstraint[];
  intersectionArea: number | null;
  hasIntersection: boolean;
}

const COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#96CEB4', // Green
  '#FFEAA7', // Yellow
  '#DDA0DD', // Plum
  '#98D8C8', // Mint
  '#F7DC6F', // Gold
];

const TransportIcon = ({ mode }: { mode: string }) => {
  if (mode === 'driving') {
    return (
      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    );
  }
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
};

export default function ZoneLegend({ users, intersectionArea, hasIntersection }: ZoneLegendProps) {
  if (users.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6">
        <h3 className="text-lg font-semibold mb-2 text-gray-800">Zone Legend</h3>
        <p className="text-gray-500 text-sm">Add locations to see the legend</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">Zone Legend</h3>
      
      <div className="space-y-3">
        {users.map((user, index) => (
          <div key={user.id} className="flex items-center gap-3">
            <div
              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold relative"
              style={{ backgroundColor: COLORS[index % COLORS.length] }}
            >
              {index + 1}
              <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-white rounded-full flex items-center justify-center shadow-sm">
                <TransportIcon mode={user.transportMode} />
              </div>
            </div>
            <div className="flex-1">
              <div className="font-medium text-gray-800">{user.name}</div>
              <div className="text-xs text-gray-500">{user.maxMinutes} min max • {user.transportMode === 'driving' ? 'Car' : 'Bike'}</div>
            </div>
          </div>
        ))}
      </div>

      {hasIntersection && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded bg-green-500"></div>
            <div className="flex-1">
              <div className="font-medium text-gray-800">Common Area</div>
              <div className="text-xs text-gray-500">
                {intersectionArea !== null 
                  ? `${intersectionArea.toFixed(2)} km²`
                  : 'All users can live here'}
              </div>
            </div>
          </div>
        </div>
      )}

      {!hasIntersection && users.length > 1 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="text-amber-600 text-sm bg-amber-50 p-2 rounded">
            ⚠️ No overlapping area found. Try increasing commute times.
          </div>
        </div>
      )}
    </div>
  );
}
