'use client';

import React, { useRef, useState } from 'react';
import { FileText, Folder as FolderIcon, FolderPlus, Trash2, Upload, ExternalLink } from 'lucide-react';
import { SharedFile, Folder } from '@/types/files';
import { createClient } from '@/utils/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const BUCKET = 'shared-files';
const selectClass =
  'h-8 rounded-lg border border-input bg-transparent px-2 text-xs outline-none focus-visible:border-ring';

interface SharedFilesCardProps {
  sessionId: string;
  files: SharedFile[];
  folders: Folder[];
  users: { id: string; name: string }[];
  houseOptions: { id: string; label: string }[];
  myUserId: string | null;
  onChanged: () => void; // refetch files + folders after any change
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function publicUrl(path: string): string {
  return createClient().storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export default function SharedFilesCard({
  sessionId,
  files,
  folders,
  users,
  houseOptions,
  myUserId,
  onChanged,
}: SharedFilesCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [listingId, setListingId] = useState('');
  const [targetFolderId, setTargetFolderId] = useState('');
  const [newFolder, setNewFolder] = useState('');

  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const houseLabel = new Map(houseOptions.map((h) => [h.id, h.label]));

  const uploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);
    setError('');
    const supabase = createClient();
    try {
      for (const file of Array.from(fileList)) {
        const path = `${sessionId}/${crypto.randomUUID()}-${file.name}`;
        const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file);
        if (uploadError) throw uploadError;

        const res = await fetch(`/api/sessions/${sessionId}/files`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: file.name,
            storagePath: path,
            mimeType: file.type || null,
            sizeBytes: file.size,
            listingId: listingId || null,
            folderId: targetFolderId || null,
            note: note.trim() || null,
            uploadedBy: myUserId,
          }),
        });
        if (!res.ok) throw new Error('Failed to save file');
      }
      setNote('');
      setListingId('');
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = async (fileId: string) => {
    const res = await fetch(`/api/sessions/${sessionId}/files/${fileId}`, { method: 'DELETE' });
    if (res.ok) onChanged();
  };

  const handleMove = async (fileId: string, folderId: string) => {
    const res = await fetch(`/api/sessions/${sessionId}/files/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderId: folderId || null }),
    });
    if (res.ok) onChanged();
  };

  const handleAddFolder = async () => {
    if (!newFolder.trim()) return;
    const res = await fetch(`/api/sessions/${sessionId}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newFolder }),
    });
    if (res.ok) {
      setNewFolder('');
      onChanged();
    }
  };

  const handleDeleteFolder = async (folderId: string) => {
    const res = await fetch(`/api/sessions/${sessionId}/folders/${folderId}`, { method: 'DELETE' });
    if (res.ok) onChanged();
  };

  // Group files by folder; null folder_id is the root bucket. Show every folder
  // (even empty ones the group just created), plus root if it has files.
  const filesByFolder = new Map<string | null, SharedFile[]>();
  for (const f of files) {
    const key = f.folder_id ?? null;
    const arr = filesByFolder.get(key) ?? [];
    arr.push(f);
    filesByFolder.set(key, arr);
  }

  const renderFile = (f: SharedFile) => (
    <li
      key={f.id}
      className="group flex items-center gap-2 rounded-md border border-border p-2.5 text-sm"
    >
      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
      <a
        href={publicUrl(f.storage_path)}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 min-w-0"
      >
        <span className="block truncate font-medium hover:underline">{f.file_name}</span>
        <span className="block text-xs text-muted-foreground truncate">
          {[
            formatSize(f.size_bytes),
            f.uploaded_by ? nameOf.get(f.uploaded_by) : null,
            f.listing_id ? `→ ${houseLabel.get(f.listing_id) ?? 'a house'}` : null,
            f.note,
          ].filter(Boolean).join(' · ')}
        </span>
      </a>
      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      {folders.length > 0 && (
        <select
          value={f.folder_id ?? ''}
          onChange={(e) => handleMove(f.id, e.target.value)}
          className={selectClass}
          aria-label="Move to folder"
        >
          <option value="">No folder</option>
          {folders.map((folder) => (
            <option key={folder.id} value={folder.id}>{folder.name}</option>
          ))}
        </select>
      )}
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => handleDelete(f.id)}
        aria-label={`Delete ${f.file_name}`}
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
      </Button>
    </li>
  );

  const rootFiles = filesByFolder.get(null) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Shared files
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Create a folder */}
        <div className="flex gap-2">
          <Input
            placeholder="New folder name"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAddFolder(); }}
          />
          <Button size="sm" variant="ghost" onClick={handleAddFolder} disabled={!newFolder.trim()}>
            <FolderPlus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </div>

        {/* Optional metadata applied to the next upload */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <Input
            placeholder="Note (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <select
            value={listingId}
            onChange={(e) => setListingId(e.target.value)}
            className={`${selectClass} text-sm`}
          >
            <option value="">Link to a house (optional)</option>
            {houseOptions.map((h) => (
              <option key={h.id} value={h.id}>{h.label}</option>
            ))}
          </select>
          <select
            value={targetFolderId}
            onChange={(e) => setTargetFolderId(e.target.value)}
            className={`${selectClass} text-sm`}
          >
            <option value="">Upload to root</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-1 rounded-md border border-dashed p-6 text-center cursor-pointer transition-colors ${
            dragOver ? 'border-ring bg-accent/40' : 'border-border hover:bg-accent/20'
          }`}
        >
          <Upload className="h-5 w-5 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">
            {uploading ? 'Uploading…' : 'Drop files here or click to browse'}
          </span>
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => uploadFiles(e.target.files)}
          />
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {files.length === 0 && folders.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files yet.</p>
        ) : (
          <div className="space-y-4">
            {/* One section per folder, in creation order */}
            {folders.map((folder) => {
              const folderFiles = filesByFolder.get(folder.id) ?? [];
              return (
                <div key={folder.id} className="space-y-1.5">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <FolderIcon className="h-4 w-4 text-muted-foreground" />
                    <span>{folder.name}</span>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">
                      {folderFiles.length}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto"
                      onClick={() => handleDeleteFolder(folder.id)}
                      aria-label={`Delete folder ${folder.name}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                  {folderFiles.length === 0 ? (
                    <p className="pl-6 text-xs text-muted-foreground">Empty — upload here or move files in.</p>
                  ) : (
                    <ul className="space-y-1.5">{folderFiles.map(renderFile)}</ul>
                  )}
                </div>
              );
            })}

            {/* Files not in any folder */}
            {rootFiles.length > 0 && (
              <div className="space-y-1.5">
                {folders.length > 0 && (
                  <div className="text-sm font-medium text-muted-foreground">No folder</div>
                )}
                <ul className="space-y-1.5">{rootFiles.map(renderFile)}</ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
