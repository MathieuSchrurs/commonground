'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CommuteConstraint } from '@/types/user';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import { supabase } from '@/lib/supabase';
import { PropertyListing } from '@/scraper/types';
import { ListingReaction, ReactionKind } from '@/types/reactions';
import UserInputForm from '@/components/UserInputForm';
import UserList from '@/components/UserList';
import Map from '@/components/Map';
import ZoneLegend from '@/components/ZoneLegend';
import SessionHeader from '@/components/SessionHeader';
import IdentityPicker from '@/components/IdentityPicker';
import ShortlistPanel from '@/components/ShortlistPanel';
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
  const [reactions, setReactions] = useState<ListingReaction[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [newListingKeys, setNewListingKeys] = useState<Set<string>>(new Set());

  // Refs so the realtime callback always sees current state without stale closures
  const usersRef = useRef<CommuteConstraint[]>([]);
  const isochronesRef = useRef<Feature<Polygon | MultiPolygon>[]>([]);
  useEffect(() => { usersRef.current = users; }, [users]);
  useEffect(() => { isochronesRef.current = isochrones; }, [isochrones]);

  // Identity ("who am I") is per browser, per session — no login needed
  useEffect(() => {
    setMyUserId(localStorage.getItem(`commonground:me:${sessionId}`));
  }, [sessionId]);

  const handleIdentityChange = useCallback((userId: string) => {
    setMyUserId(userId);
    localStorage.setItem(`commonground:me:${sessionId}`, userId);
  }, [sessionId]);

  // Snapshot of the previous visit's timestamp, taken once per page load.
  // Listings whose first_seen_at is later than this get the NEW badge.
  const lastSeenRef = useRef<string | null>(null);
  useEffect(() => {
    lastSeenRef.current = localStorage.getItem(`commonground:lastSeen:${sessionId}`);
  }, [sessionId]);

  const applyListings = useCallback((listings: PropertyListing[]) => {
    setProperties(listings);
    const lastSeen = lastSeenRef.current;
    if (lastSeen) {
      setNewListingKeys(new Set(
        listings
          .filter(l => l.first_seen_at && l.first_seen_at > lastSeen)
          .map(l => `${l.source}:${l.external_id}`)
      ));
    }
    // Next page load compares against this visit (lastSeenRef keeps the OLD
    // value for the rest of this visit, so refreshes stay consistent)
    localStorage.setItem(`commonground:lastSeen:${sessionId}`, new Date().toISOString());
  }, [sessionId]);

  const loadReactions = useCallback(async () => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/reactions`);
      if (!res.ok) return;
      const data = await res.json();
      setReactions(data.reactions ?? []);
    } catch {
      // Non-fatal: votes simply don't show until the next sync
    }
  }, [sessionId]);

  useEffect(() => { loadReactions(); }, [loadReactions]);

  // Votes from the others land live; refetching the whole (tiny) set is
  // simpler and safer than patching state from realtime payloads
  useEffect(() => {
    const channel = supabase
      .channel(`reactions_${sessionId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'listing_reactions', filter: `session_id=eq.${sessionId}` },
        () => { loadReactions(); }
      )
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [sessionId, loadReactions]);

  const handleToggleReaction = useCallback(async (listingId: string, reaction: ReactionKind) => {
    if (!myUserId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/reactions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId, userId: myUserId, reaction }),
      });
      if (res.ok) loadReactions();
    } catch {
      // Realtime will reconcile on the next event
    }
  }, [sessionId, myUserId, loadReactions]);

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
        async (payload) => {
          const eventType = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE';

          if (eventType === 'DELETE') {
            const deletedId = (payload.old as { id: string }).id;
            const idx = usersRef.current.findIndex(u => u.id === deletedId);
            if (idx === -1) return;
            const updatedUsers = usersRef.current.filter((_, i) => i !== idx);
            const updatedIsochrones = isochronesRef.current.filter((_, i) => i !== idx);
            setUsers(updatedUsers);
            setIsochrones(updatedIsochrones);
            computeAndSetIntersection(updatedIsochrones);
            return;
          }

          // INSERT or UPDATE — only fetch the one changed isochrone
          const constraint = dbUserToConstraint(payload.new as DbUser);

          // Our own inserts already landed in local state via handleAddUser;
          // the realtime echo of that insert must not append a duplicate.
          if (eventType === 'INSERT' && usersRef.current.some(u => u.id === constraint.id)) {
            return;
          }

          const isochrone = await fetchIsochrone(constraint);

          if (eventType === 'INSERT') {
            const updatedUsers = [...usersRef.current, constraint];
            const updatedIsochrones = [...isochronesRef.current, isochrone];
            setUsers(updatedUsers);
            setIsochrones(updatedIsochrones);
            computeAndSetIntersection(updatedIsochrones);
          } else {
            const idx = usersRef.current.findIndex(u => u.id === constraint.id);
            if (idx === -1) return;
            const updatedUsers = [...usersRef.current];
            updatedUsers[idx] = constraint;
            const updatedIsochrones = [...isochronesRef.current];
            updatedIsochrones[idx] = isochrone;
            setUsers(updatedUsers);
            setIsochrones(updatedIsochrones);
            computeAndSetIntersection(updatedIsochrones);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [sessionId, fetchIsochrone, computeAndSetIntersection]);

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
      applyListings(data.listings ?? []);
      setScrapeCompleted(true);
    } catch (err) {
      setScrapeError(err instanceof Error ? err.message : 'Could not load properties');
    } finally {
      setIsScraping(false);
    }
  }, [intersection, applyListings]);

  // The daily cron keeps the DB warm, so stored listings can appear the
  // moment the zone is known — no button press, no scraping on page load.
  const autoLoadedRef = useRef(false);
  useEffect(() => {
    if (!intersection || autoLoadedRef.current) return;
    autoLoadedRef.current = true;
    (async () => {
      try {
        const res = await fetch('/api/scrape', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ polygon: intersection, cacheOnly: true }),
        });
        const data = await res.json();
        if (res.ok && (data.listings?.length ?? 0) > 0) {
          applyListings(data.listings);
          setScrapeCompleted(true);
        }
      } catch {
        // Cache miss is fine — the Find properties button still works
      }
    })();
  }, [intersection, applyListings]);

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
    // Desktop: lock to viewport height so the map always fills to the bottom
    // and the sidebar scrolls internally. Mobile keeps normal page scrolling.
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-background flex flex-col">
      <SessionHeader sessionId={sessionId} />

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
          <IdentityPicker
            users={users}
            value={myUserId}
            onChange={handleIdentityChange}
          />
          <ShortlistPanel
            properties={properties}
            reactions={reactions}
            users={users}
          />
          <ZoneLegend
            users={users}
            intersectionArea={intersectionArea}
            hasIntersection={!!intersection}
            propertiesCount={properties.length}
            isScraping={isScraping}
            scrapeCompleted={scrapeCompleted}
            scrapeError={scrapeError}
            onFindProperties={handleFindProperties}
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
            reactions={reactions}
            myUserId={myUserId}
            onToggleReaction={handleToggleReaction}
            newListingKeys={newListingKeys}
          />
        </div>
      </main>
    </div>
  );
}
