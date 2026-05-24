'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { Home, Loader2, RefreshCw } from 'lucide-react';
import { CommuteConstraint } from '@/types/user';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import { supabase } from '@/lib/supabase';
import { PropertyListing } from '@/scraper/types';
import UserInputForm from '@/components/UserInputForm';
import UserList from '@/components/UserList';
import Map from '@/components/Map';
import ZoneLegend from '@/components/ZoneLegend';
import ShareLink from '@/components/ShareLink';
import { Button } from '@/components/ui/button';
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<CommuteConstraint | null>(null);
  const [properties, setProperties] = useState<PropertyListing[]>([]);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapeError, setScrapeError] = useState('');
  const [scrapeCompleted, setScrapeCompleted] = useState(false);

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

  const handleFindProperties = useCallback(async (force = false) => {
    if (!intersection) return;
    setIsScraping(true);
    setScrapeError('');
    setScrapeCompleted(false);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polygon: intersection, force }),
      });
      const data = await res.json();
      console.log('[FindProperties] API response:', data);
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch properties');
      }
      setProperties(data.listings ?? []);
      setScrapeCompleted(true);
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : 'Could not load properties');
    } finally {
      setIsScraping(false);
    }
  }, [intersection]);

  if (error === 'Session not found') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-6">
        <div className="max-w-md w-full text-center">
          <h1 className="text-2xl font-semibold tracking-tight mb-2">Session not found</h1>
          <p className="text-sm text-muted-foreground mb-8">
            The session you&apos;re looking for doesn&apos;t exist or has been deleted.
          </p>
          <Button onClick={() => router.push('/')}>Go home</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-background/80 backdrop-blur">
        <div className="px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-2 group">
            <div className="h-5 w-5 rounded-md bg-foreground transition-transform group-hover:scale-110" />
            <span className="text-sm font-medium tracking-tight">CommonGround</span>
            <span className="text-xs text-muted-foreground font-mono ml-2 hidden sm:inline">
              {sessionId.slice(0, 8)}
            </span>
          </Link>
          <ShareLink sessionId={sessionId} />
        </div>
      </header>

      <main className="flex-1 grid grid-cols-1 lg:grid-cols-[360px_1fr] min-h-0">
        <aside className="border-r border-border overflow-y-auto p-4 space-y-4 bg-muted/20 min-h-0">
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

          {error && error !== 'Session not found' && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 text-destructive text-xs p-3">
              {error}
            </div>
          )}
        </aside>

        <div className="relative h-[calc(100vh-3.5rem)] lg:h-full min-h-0">
          <Map
            users={users}
            intersection={intersection}
            isochrones={isochrones}
            properties={properties}
            isLoading={isLoading}
          />

          {intersection && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-[calc(100%-2rem)] max-w-xl">
              <div className="rounded-lg border border-border bg-background/95 backdrop-blur shadow-lg p-3">
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      Common ground found
                    </div>
                    <div className="text-sm">
                      <span className="font-mono tabular-nums font-semibold">
                        {intersectionArea?.toFixed(2)}
                      </span>
                      <span className="text-muted-foreground"> km² overlap</span>
                    </div>
                  </div>
                  <Button
                    onClick={() => handleFindProperties(properties.length > 0)}
                    disabled={isScraping}
                    size="sm"
                    variant={properties.length > 0 ? 'outline' : 'default'}
                  >
                    {isScraping ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        {properties.length > 0 ? 'Refreshing' : 'Searching'}
                      </>
                    ) : properties.length > 0 ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5" />
                        Refresh properties
                      </>
                    ) : (
                      <>
                        <Home className="h-3.5 w-3.5" />
                        Find properties
                      </>
                    )}
                  </Button>
                </div>
                {scrapeCompleted && (
                  <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
                    {properties.length > 0 ? (
                      <>Found <span className="font-mono tabular-nums text-foreground font-medium">{properties.length}</span> {properties.length === 1 ? 'property' : 'properties'} for sale — shown as pins on the map.</>
                    ) : (
                      <>No properties found in this zone yet.</>
                    )}
                  </p>
                )}
                {scrapeError && (
                  <p className="text-xs text-destructive mt-2 pt-2 border-t border-border">
                    {scrapeError}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
