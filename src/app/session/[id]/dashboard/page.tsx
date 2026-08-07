'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { Meeting } from '@/types/meeting';
import { SharedFile, Folder } from '@/types/files';
import { MeetingItem, Todo } from '@/types/todos';
import { Decision } from '@/types/decisions';
import { Convergence } from '@/lib/convergence';
import SessionHeader from '@/components/SessionHeader';
import NextMeetingCard from '@/components/dashboard/NextMeetingCard';
import GroupFavoritesCard from '@/components/dashboard/GroupFavoritesCard';
import SplitVotesCard from '@/components/dashboard/SplitVotesCard';
import TodosCard from '@/components/dashboard/TodosCard';
import SharedFilesCard from '@/components/dashboard/SharedFilesCard';

interface SessionUser {
  id: string;
  name: string;
}

export default function DashboardPage() {
  const params = useParams();
  const sessionId = params.id as string;

  // Authenticated browser client so RLS-aware realtime delivers this session's
  // changes (the anon client sees nothing under RLS).
  const [supabase] = useState(() => createClient());

  const [users, setUsers] = useState<SessionUser[]>([]);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [convergence, setConvergence] = useState<Convergence>({
    engaged: [],
    considered: [],
    favorites: [],
    contested: [],
  });
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<MeetingItem[]>([]);
  const [todos, setTodos] = useState<Todo[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [myUserId, setMyUserId] = useState<string | null>(null);

  // "Who am I" is the participant linked to the signed-in account.
  useEffect(() => {
    fetch(`/api/sessions/${sessionId}/me`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setMyUserId(d?.participant?.id ?? null))
      .catch(() => {});
  }, [sessionId]);

  const loadUsers = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}`);
    if (res.ok) {
      const data = await res.json();
      setUsers((data.users ?? []).map((u: SessionUser) => ({ id: u.id, name: u.name })));
    }
  }, [sessionId]);

  const loadMeeting = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/meeting`);
    if (res.ok) setMeeting((await res.json()).meeting ?? null);
  }, [sessionId]);

  const loadConvergence = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/convergence`);
    // Spread over the defaults: engaged is dereferenced in the render body, so
    // a response missing it would blank the whole dashboard, not just a card.
    if (res.ok) setConvergence({ engaged: [], considered: [], favorites: [], contested: [], ...(await res.json()) });
  }, [sessionId]);

  const loadFiles = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/files`);
    if (res.ok) setFiles((await res.json()).files ?? []);
  }, [sessionId]);

  const loadFolders = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/folders`);
    if (res.ok) setFolders((await res.json()).folders ?? []);
  }, [sessionId]);

  const loadMeetingItems = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/meeting-items`);
    if (res.ok) setItems((await res.json()).items ?? []);
  }, [sessionId]);

  const loadTodos = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/todos`);
    if (res.ok) setTodos((await res.json()).todos ?? []);
  }, [sessionId]);

  const loadDecisions = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/decisions`);
    if (res.ok) setDecisions((await res.json()).decisions ?? []);
  }, [sessionId]);

  // A single "something in the hub changed" reload for the files card.
  const reloadHub = useCallback(() => {
    loadFiles();
    loadFolders();
  }, [loadFiles, loadFolders]);

  useEffect(() => {
    // Initial load. Wrapped in an async IIFE so the setStates run in async
    // callbacks (after each fetch resolves), not synchronously in the effect.
    void (async () => {
      await Promise.all([
        loadUsers(),
        loadMeeting(),
        loadConvergence(),
        loadFiles(),
        loadFolders(),
        loadMeetingItems(),
        loadTodos(),
        loadDecisions(),
      ]);
    })();
  }, [loadUsers, loadMeeting, loadConvergence, loadFiles, loadFolders, loadMeetingItems, loadTodos, loadDecisions]);

  // Live updates: refetch the (small) affected set when others change it.
  useEffect(() => {
    const channel = supabase
      .channel(`dashboard_${sessionId}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'session_meetings', filter: `session_id=eq.${sessionId}` },
        () => loadMeeting())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'shared_files', filter: `session_id=eq.${sessionId}` },
        () => loadFiles())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'session_folders', filter: `session_id=eq.${sessionId}` },
        () => loadFolders())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'listing_reactions', filter: `session_id=eq.${sessionId}` },
        () => loadConvergence())
      // Pairing changes what every heart counts for, and a participant
      // joining or leaving changes the denominator — both re-rank the cards.
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'households', filter: `session_id=eq.${sessionId}` },
        () => loadConvergence())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'session_users', filter: `session_id=eq.${sessionId}` },
        () => { loadConvergence(); loadUsers(); })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'meeting_items', filter: `session_id=eq.${sessionId}` },
        () => loadMeetingItems())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'session_todos', filter: `session_id=eq.${sessionId}` },
        () => loadTodos())
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'session_decisions', filter: `session_id=eq.${sessionId}` },
        () => loadDecisions())
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [sessionId, loadMeeting, loadFiles, loadFolders, loadConvergence, loadUsers, loadMeetingItems, loadTodos, loadDecisions, supabase]);

  const handleSaveMeeting = useCallback(async (meetsAt: string, location: string, note: string) => {
    const res = await fetch(`/api/sessions/${sessionId}/meeting`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetsAt, location, note, updatedBy: myUserId }),
    });
    if (res.ok) setMeeting((await res.json()).meeting);
  }, [sessionId, myUserId]);

  const handleAddMeetingItem = useCallback(async (text: string) => {
    await fetch(`/api/sessions/${sessionId}/meeting-items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, createdBy: myUserId }),
    });
  }, [sessionId, myUserId]);

  const handleToggleMeetingItem = useCallback(async (id: string, done: boolean) => {
    await fetch(`/api/sessions/${sessionId}/meeting-items/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ done }),
    });
  }, [sessionId]);

  const handleDeleteMeetingItem = useCallback(async (id: string) => {
    await fetch(`/api/sessions/${sessionId}/meeting-items/${id}`, { method: 'DELETE' });
  }, [sessionId]);

  // Any house anyone has reacted to, not just the converging ones — a survey
  // report matters most for the house the group is arguing about.
  const houseOptions = convergence.engaged.map((e) => ({
    id: e.listing.id!,
    label: e.listing.address ?? e.listing.city ?? e.listing.title ?? e.listing.url,
  }));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SessionHeader sessionId={sessionId} />

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 py-6 space-y-4">

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <NextMeetingCard
            meeting={meeting}
            canEdit={!!myUserId}
            onSave={handleSaveMeeting}
            items={items}
            users={users}
            onAddItem={handleAddMeetingItem}
            onToggleItem={handleToggleMeetingItem}
            onDeleteItem={handleDeleteMeetingItem}
          />
          <TodosCard
            sessionId={sessionId}
            todos={todos}
            users={users}
            myUserId={myUserId}
            onChanged={loadTodos}
            decisions={decisions}
            onDecisionsChanged={loadDecisions}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <GroupFavoritesCard favorites={convergence.favorites} />
          <SplitVotesCard contested={convergence.contested} />
        </div>

        <SharedFilesCard
          sessionId={sessionId}
          files={files}
          folders={folders}
          users={users}
          houseOptions={houseOptions}
          myUserId={myUserId}
          onChanged={reloadHub}
        />
      </main>
    </div>
  );
}
