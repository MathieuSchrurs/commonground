'use client';

import React, { useState } from 'react';

interface SessionManagerProps {
  onCreateSession: () => Promise<void>;
  onJoinSession: (sessionId: string) => void;
  isLoading: boolean;
}

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
      const parts = sessionId.split('/session/');
      sessionId = parts[parts.length - 1];
    }
    
    sessionId = sessionId.split('?')[0].split('#')[0];

    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(sessionId)) {
      setError('Invalid session URL format');
      return;
    }

    onJoinSession(sessionId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">CommonGround</h1>
          <p className="text-gray-600">Find the perfect place for everyone to live</p>
        </div>

        <div className="space-y-6">
          <div className="text-center">
            <button
              onClick={onCreateSession}
              disabled={isLoading}
              className="w-full bg-blue-600 text-white py-4 px-6 rounded-xl font-semibold text-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl"
            >
              {isLoading ? 'Creating...' : 'Create New Session'}
            </button>
            <p className="text-sm text-gray-500 mt-2">
              Start a new collaborative session
            </p>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or</span>
            </div>
          </div>

          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label htmlFor="sessionUrl" className="block text-sm font-medium text-gray-700 mb-2">
                Join Existing Session
              </label>
              <input
                type="text"
                id="sessionUrl"
                value={sessionUrl}
                onChange={(e) => setSessionUrl(e.target.value)}
                placeholder="Paste session URL here"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={isLoading}
              />
            </div>

            {error && (
              <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading || !sessionUrl.trim()}
              className="w-full bg-white border-2 border-blue-600 text-blue-600 py-3 px-6 rounded-xl font-semibold hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {isLoading ? 'Joining...' : 'Join Session'}
            </button>
          </form>
        </div>

        <div className="mt-8 text-center text-sm text-gray-500">
          <p>Collaborate with friends and family</p>
          <p>to find the perfect living location</p>
        </div>
      </div>
    </div>
  );
}
