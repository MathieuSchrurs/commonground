'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Meeting } from '@/types/meeting';
import { SharedFile, Folder } from '@/types/files';
import { Favorite } from '@/lib/favorites';
import SessionHeader from '@/components/SessionHeader';
import NextMeetingCard from '@/components/dashboard/NextMeetingCard';
import GroupFavoritesCard from '@/components/dashboard/GroupFavoritesCard';
import SharedFilesCard from '@/components/dashboard/SharedFilesCard';

interface SessionUser {
  id: string;
  name: string;
}

export default function DashboardPage() {
  const params = useParams();
  const sessionId = params.id as string;

  const [users, setUsers] = useState<SessionUser[]>([]);
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [favorites, setFavorites] = useState<Favorite[]>([]);
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
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

  const loadFavorites = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/favorites`);
    if (res.ok) setFavorites((await res.json()).favorites ?? []);
  }, [sessionId]);

  const loadFiles = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/files`);
    if (res.ok) setFiles((await res.json()).files ?? []);
  }, [sessionId]);

  const loadFolders = useCallback(async () => {
    const res = await fetch(`/api/sessions/${sessionId}/folders`);
    if (res.ok) setFolders((await res.json()).folders ?? []);
  }, [sessionId]);

  // A single "something in the hub changed" reload for the files card.
  const reloadHub = useCallback(() => {
    loadFiles();
    loadFolders();
  }, [loadFiles, loadFolders]);

  useEffect(() => {
    loadUsers();
    loadMeeting();
    loadFavorites();
    loadFiles();
    loadFolders();
  }, [loadUsers, loadMeeting, loadFavorites, loadFiles, loadFolders]);

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
        () => loadFavorites())
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [sessionId, loadMeeting, loadFiles, loadFolders, loadFavorites]);

  const handleSaveMeeting = useCallback(async (meetsAt: string, location: string, note: string) => {
    const res = await fetch(`/api/sessions/${sessionId}/meeting`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ meetsAt, location, note, updatedBy: myUserId }),
    });
    if (res.ok) setMeeting((await res.json()).meeting);
  }, [sessionId, myUserId]);

  // Files can be linked to any house the group has reacted to.
  const houseOptions = favorites.map((f) => ({
    id: f.listing.id!,
    label: f.listing.address ?? f.listing.city ?? f.listing.title ?? f.listing.url,
  }));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SessionHeader sessionId={sessionId} />

      <main className="flex-1 mx-auto w-full max-w-5xl px-4 sm:px-6 py-6 space-y-4">

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          <NextMeetingCard meeting={meeting} canEdit={!!myUserId} onSave={handleSaveMeeting} />
          <GroupFavoritesCard favorites={favorites} />
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
