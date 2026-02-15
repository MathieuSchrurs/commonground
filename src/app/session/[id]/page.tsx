'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CommuteConstraint } from '@/types/user';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import { supabase } from '@/lib/supabase';
import UserInputForm from '@/components/UserInputForm';
import UserList from '@/components/UserList';
import Map from '@/components/Map';
import ZoneLegend from '@/components/ZoneLegend';
import ShareLink from '@/components/ShareLink';
import { computeIntersection, calculateArea } from '@/lib/geo';

// Database user type
interface DbUser {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  max_minutes: number;
  transport_mode: 'driving' | 'cycling';
}

// Convert DB user to CommuteConstraint
const dbUserToConstraint = (dbUser: DbUser): CommuteConstraint => ({
  id: dbUser.id,
  name: dbUser.name,
  address: dbUser.address,
  latitude: dbUser.latitude,
  longitude: dbUser.longitude,
  maxMinutes: dbUser.max_minutes,
  transportMode: dbUser.transport_mode,
});

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  const [users, setUsers] = useState<CommuteConstraint[]>([]);
  const [isochrones, setIsochrones] = useState<Feature<Polygon | MultiPolygon>[]>([]);
  const [intersection, setIntersection] = useState<Feature<Polygon | MultiPolygon> | null>(null);
  const [intersectionArea, setIntersectionArea] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<CommuteConstraint | null>(null);

  // Fetch isochrone for a user
  const fetchIsochrone = useCallback(async (user: CommuteConstraint) => {
    const response = await fetch('/api/isochrone', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lat: user.latitude,
        lng: user.longitude,
        minutes: user.maxMinutes,
        mode: user.transportMode,
      }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to fetch isochrone');
    }

    const isochroneData = await response.json();
    return isochroneData.features[0] as Feature<Polygon | MultiPolygon>;
  }, []);

  // Load initial data
  useEffect(() => {
    const loadSession = async () => {
      try {
        setIsLoading(true);

        // Fetch session data
        const response = await fetch(`/api/sessions/${sessionId}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setError('Session not found');
            return;
          }
          throw new Error('Failed to load session');
        }

        const { users: dbUsers } = await response.json();
        
        const constraints = dbUsers.map(dbUserToConstraint);
        setUsers(constraints);

        // Fetch isochrones for all users
        const isochronePromises = constraints.map(fetchIsochrone);
        const isochroneData = await Promise.all(isochronePromises);
        setIsochrones(isochroneData);

        // Compute intersection
        if (isochroneData.length > 0) {
          const newIntersection = computeIntersection(isochroneData);
          setIntersection(newIntersection);
          
          if (newIntersection) {
            const area = calculateArea(newIntersection);
            setIntersectionArea(area);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, [sessionId, fetchIsochrone]);

  // Set up real-time subscription
  useEffect(() => {
    const subscription = supabase
      .channel(`session_${sessionId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'session_users',
          filter: `session_id=eq.${sessionId}`,
        },
        async () => {
          // Reload all data when changes occur
          const response = await fetch(`/api/sessions/${sessionId}`);
          if (response.ok) {
            const { users: dbUsers } = await response.json();
            const constraints = dbUsers.map(dbUserToConstraint);
            setUsers(constraints);

            // Recompute isochrones
            const isochronePromises = constraints.map(fetchIsochrone);
            const isochroneData = await Promise.all(isochronePromises);
            setIsochrones(isochroneData);

            const newIntersection = computeIntersection(isochroneData);
            setIntersection(newIntersection);
            
            if (newIntersection) {
              const area = calculateArea(newIntersection);
              setIntersectionArea(area);
            }
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [sessionId, fetchIsochrone]);

  const computeAndSetIntersection = useCallback((updatedIsochrones: Feature<Polygon | MultiPolygon>[]) => {
    if (updatedIsochrones.length > 0) {
      const newIntersection = computeIntersection(updatedIsochrones);
      setIntersection(newIntersection);

      if (newIntersection) {
        const area = calculateArea(newIntersection);
        setIntersectionArea(area);
      } else {
        setIntersectionArea(null);
      }
    } else {
      setIntersection(null);
      setIntersectionArea(null);
    }
  }, []);

  const handleAddUser = useCallback(async (newUser: CommuteConstraint) => {
    setIsLoading(true);
    setError('');

    try {
      // Add to database
      const response = await fetch(`/api/sessions/${sessionId}/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUser.name,
          address: newUser.address,
          latitude: newUser.latitude,
          longitude: newUser.longitude,
          maxMinutes: newUser.maxMinutes,
          transportMode: newUser.transportMode,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add user');
      }

      const dbUser = await response.json();
      const userWithId = { ...newUser, id: dbUser.id };

      // Fetch isochrone
      const isochrone = await fetchIsochrone(userWithId);

      // Update local state
      const updatedUsers = [...users, userWithId];
      const updatedIsochrones = [...isochrones, isochrone];

      setUsers(updatedUsers);
      setIsochrones(updatedIsochrones);
      computeAndSetIntersection(updatedIsochrones);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, users, isochrones, fetchIsochrone, computeAndSetIntersection]);

  const handleUpdateUser = useCallback(async (updatedUser: CommuteConstraint) => {
    setIsLoading(true);
    setError('');

    try {
      // Update in database
      const response = await fetch(`/api/sessions/${sessionId}/users/${updatedUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: updatedUser.name,
          address: updatedUser.address,
          latitude: updatedUser.latitude,
          longitude: updatedUser.longitude,
          maxMinutes: updatedUser.maxMinutes,
          transportMode: updatedUser.transportMode,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update user');
      }

      // Fetch new isochrone
      const isochrone = await fetchIsochrone(updatedUser);

      // Update local state
      const userIndex = users.findIndex(u => u.id === updatedUser.id);
      const updatedUsers = [...users];
      updatedUsers[userIndex] = updatedUser;
      
      const updatedIsochrones = [...isochrones];
      updatedIsochrones[userIndex] = isochrone;

      setUsers(updatedUsers);
      setIsochrones(updatedIsochrones);
      computeAndSetIntersection(updatedIsochrones);
      setEditingUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, users, isochrones, fetchIsochrone, computeAndSetIntersection]);

  const handleRemoveUser = useCallback(async (userId: string) => {
    try {
      const response = await fetch(`/api/sessions/${sessionId}/users/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete user');
      }

      const userIndex = users.findIndex(u => u.id === userId);
      const updatedUsers = users.filter(u => u.id !== userId);
      const updatedIsochrones = isochrones.filter((_, i) => i !== userIndex);

      setUsers(updatedUsers);
      setIsochrones(updatedIsochrones);

      if (editingUser?.id === userId) {
        setEditingUser(null);
      }

      computeAndSetIntersection(updatedIsochrones);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  }, [sessionId, users, isochrones, editingUser, computeAndSetIntersection]);

  const handleEditUser = useCallback((user: CommuteConstraint) => {
    setEditingUser(user);
    setError('');
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingUser(null);
    setError('');
  }, []);

  if (error === 'Session not found') {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg shadow-md p-8 max-w-md w-full text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Session Not Found</h1>
          <p className="text-gray-600 mb-6">The session you&apos;re looking for doesn&apos;t exist or has been deleted.</p>
          <button
            onClick={() => router.push('/')}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-md hover:bg-blue-700 transition-colors"
          >
            Go Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">CommonGround</h1>
              <p className="text-sm text-gray-600">Find the perfect place for everyone to live</p>
            </div>
            <ShareLink sessionId={sessionId} />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Sidebar - Forms */}
          <div className="space-y-6">
            <UserInputForm 
              onAddUser={handleAddUser} 
              onUpdateUser={handleUpdateUser}
              userToEdit={editingUser}
              onCancelEdit={handleCancelEdit}
              isLoading={isLoading} 
            />
            <UserList 
              users={users} 
              onRemoveUser={handleRemoveUser} 
              onEditUser={handleEditUser}
              editingUserId={editingUser?.id}
              isLoading={isLoading} 
            />
            <ZoneLegend 
              users={users} 
              intersectionArea={intersectionArea} 
              hasIntersection={!!intersection} 
            />
          </div>

          {/* Right Side - Map */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md p-4 h-[600px]">
              <Map 
                users={users} 
                intersection={intersection} 
                isochrones={isochrones}
                isLoading={isLoading}
              />
            </div>

            {error && error !== 'Session not found' && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {intersection && (
              <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                <strong>Success!</strong> Found a common area of {intersectionArea?.toFixed(2)} km² where everyone can live.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
