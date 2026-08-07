'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';
import { CommuteConstraint } from '@/types/user';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import { createClient } from '@/utils/supabase/client';
import { PropertyListing } from '@/scraper/types';
import { ListingReaction, ReactionKind } from '@/types/reactions';
import UserInputForm from '@/components/UserInputForm';
import UserList from '@/components/UserList';
import ZoneLegend from '@/components/ZoneLegend';
import SessionHeader from '@/components/SessionHeader';
import ShortlistPanel from '@/components/ShortlistPanel';
import { Button } from '@/components/ui/button';
import { toCommuteConstraint, SessionUserRow } from '@/lib/session/mappers';

// The map pulls in mapbox-gl (~480KB gzipped). Code-split it so the page's
// shell (header, sidebar) paints immediately and mapbox parses after first
// paint instead of blocking it.
const Map = dynamic(() => import('@/components/Map'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-muted/20">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading map…
      </div>
    </div>
  ),
});

type ScrapeResponse = { listings?: PropertyListing[]; count?: number; error?: string };

// Read /api/scrape's response defensively. A serverless function that exceeds
// Vercel's time limit is killed by the platform, which returns an HTML 504 page
// — and res.json() on HTML throws a cryptic "unexpected character at line 1
// column 1". This turns that (and any non-JSON body) into a clear message.
async function readScrapeResponse(res: Response): Promise<ScrapeResponse> {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as ScrapeResponse) : {};
  } catch {
    if (res.status === 504) {
      throw new Error('The server took too long and timed out — try again in a moment.');
    }
    throw new Error(`Unexpected response from the server (HTTP ${res.status}).`);
  }
}

export default function SessionPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.id as string;

  // Authenticated browser client — carries the user's JWT so RLS-aware realtime
  // delivers this session's changes (the anon client sees nothing under RLS).
  const [supabase] = useState(() => createClient());

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

  // "Who am I" is the participant linked to the signed-in account — no picking.
  useEffect(() => {
    fetch(`/api/sessions/${sessionId}/me`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMyUserId(d?.participant?.id ?? null))
      .catch(() => {});
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
  }, [sessionId, loadReactions, supabase]);

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

  // Intersection is computed on the server (turf stays off the client bundle
  // and off the main thread). Fire-and-forget: a failure just leaves the last
  // known intersection in place.
  const computeIntersectionOnServer = useCallback(
    async (isochrones: Feature<Polygon | MultiPolygon>[]): Promise<{
      intersection: Feature<Polygon | MultiPolygon> | null;
      area: number | null;
    }> => {
      try {
        const res = await fetch('/api/intersection', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isochrones }),
        });
        if (!res.ok) return { intersection: null, area: null };
        const data = await res.json();
        return { intersection: data.intersection ?? null, area: data.areaKm2 ?? null };
      } catch {
        return { intersection: null, area: null };
      }
    },
    []
  );

  const computeAndSetIntersection = useCallback(
    async (updatedIsochrones: Feature<Polygon | MultiPolygon>[]) => {
      const { intersection, area } = await computeIntersectionOnServer(updatedIsochrones);
      setIntersection(intersection);
      setIntersectionArea(area);
    },
    [computeIntersectionOnServer]
  );

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

        // The store returns participants already as CommuteConstraints.
        const { users: constraints } = await response.json() as { users: CommuteConstraint[] };
        setUsers(constraints);

        // Fetch isochrones for all users
        const isochronePromises = constraints.map(fetchIsochrone);
        const isochroneData = await Promise.all(isochronePromises);
        setIsochrones(isochroneData);

        // Compute intersection
        if (isochroneData.length > 0) {
          const { intersection: newIntersection, area } =
            await computeIntersectionOnServer(isochroneData);
          setIntersection(newIntersection);
          setIntersectionArea(area);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setIsLoading(false);
      }
    };

    loadSession();
  }, [sessionId, fetchIsochrone, computeIntersectionOnServer]);

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
            await computeAndSetIntersection(updatedIsochrones);
            return;
          }

          // INSERT or UPDATE — only fetch the one changed isochrone.
          // Realtime payloads arrive as raw snake_case rows, so they still need
          // the shared mapper (they never pass through the store).
          const constraint = toCommuteConstraint(payload.new as SessionUserRow);

          // Skip if this participant is already in state — guards the add echo
          // and any double-delivered event from duplicating a row.
          if (eventType === 'INSERT' && usersRef.current.some(u => u.id === constraint.id)) {
            return;
          }

          const isochrone = await fetchIsochrone(constraint);

          if (eventType === 'INSERT') {
            // Re-check after the async fetch: a concurrent delivery may have
            // appended it while we were computing the isochrone.
            if (usersRef.current.some(u => u.id === constraint.id)) return;
            const updatedUsers = [...usersRef.current, constraint];
            const updatedIsochrones = [...isochronesRef.current, isochrone];
            setUsers(updatedUsers);
            setIsochrones(updatedIsochrones);
            await computeAndSetIntersection(updatedIsochrones);
          } else {
            const idx = usersRef.current.findIndex(u => u.id === constraint.id);
            if (idx === -1) return;
            const updatedUsers = [...usersRef.current];
            updatedUsers[idx] = constraint;
            const updatedIsochrones = [...isochronesRef.current];
            updatedIsochrones[idx] = isochrone;
            setUsers(updatedUsers);
            setIsochrones(updatedIsochrones);
            await computeAndSetIntersection(updatedIsochrones);
          }
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [sessionId, fetchIsochrone, computeAndSetIntersection, supabase]);

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
      // The constraint I just added is mine — that's now "who I am".
      setMyUserId(userWithId.id);

      // Show it immediately (don't wait on the realtime echo, which may be
      // delayed or — under RLS — not delivered if realtime auth lags). The
      // INSERT handler and this both guard on presence, so no duplicate.
      if (!usersRef.current.some((u) => u.id === userWithId.id)) {
        const isochrone = await fetchIsochrone(userWithId);
        if (!usersRef.current.some((u) => u.id === userWithId.id)) {
          const updatedUsers = [...usersRef.current, userWithId];
          const updatedIsochrones = [...isochronesRef.current, isochrone];
          setUsers(updatedUsers);
          setIsochrones(updatedIsochrones);
          await computeAndSetIntersection(updatedIsochrones);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId, fetchIsochrone, computeAndSetIntersection]);

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
      await computeAndSetIntersection(updatedIsochrones);
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

      await computeAndSetIntersection(updatedIsochrones);
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

  const handleFindProperties = useCallback(async () => {
    if (!intersection) return;
    setIsScraping(true);
    setScrapeError('');
    setScrapeCompleted(false);
    try {
      // cacheOnly: never scrape live from the browser. On Vercel's Hobby plan a
      // full scrape+geocode blows past the 60s function limit and the platform
      // kills it with a 504. The scheduled scraper keeps the cache warm; this
      // button just reads what's already stored, so it always returns instantly.
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ polygon: intersection, cacheOnly: true }),
      });
      const data = await readScrapeResponse(res);
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
        const data = await readScrapeResponse(res);
        if (res.ok && (data.listings?.length ?? 0) > 0) {
          applyListings(data.listings!);
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
