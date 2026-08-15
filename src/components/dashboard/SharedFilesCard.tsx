'use client';

import React, { useRef, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder as FolderIcon, FolderPlus, Trash2, Upload, ExternalLink } from 'lucide-react';
import { SharedFile, Folder } from '@/types/files';
import { buildFolderTree, canMoveFolder, folderPaths, FolderNode, MAX_FOLDER_DEPTH } from '@/lib/folders';
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
  const [newFolderParent, setNewFolderParent] = useState('');
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const [rootCollapsed, setRootCollapsed] = useState(false);

  const toggleFolder = (folderId: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) next.delete(folderId);
      else next.add(folderId);
      return next;
    });
  };

  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const houseLabel = new Map(houseOptions.map((h) => [h.id, h.label]));

  // Full paths, so two folders both called "Survey" are distinguishable in a
  // dropdown, and depth so parents already at the limit are not offered.
  const paths = folderPaths(folders);
  const parentOptions = paths.filter((p) => p.depth < MAX_FOLDER_DEPTH);

  const tree = buildFolderTree(folders, files);
  const rootFiles = files.filter((f) => f.folder_id === null);

  // Every write reports its reason rather than silently doing nothing — the
  // server rejects moves that would nest a folder inside itself or go too deep.
  const send = async (url: string, init: RequestInit, fallback: string) => {
    setError('');
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        setError((await res.json().catch(() => null))?.error ?? fallback);
        return false;
      }
      onChanged();
      return true;
    } catch {
      setError('Could not reach the server');
      return false;
    }
  };

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

  const handleDelete = (fileId: string) =>
    send(`/api/sessions/${sessionId}/files/${fileId}`, { method: 'DELETE' }, 'Could not delete');

  const handleMove = (fileId: string, folderId: string) =>
    send(
      `/api/sessions/${sessionId}/files/${fileId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId: folderId || null }),
      },
      'Could not move the file',
    );

  const handleAddFolder = async () => {
    if (!newFolder.trim()) return;
    const ok = await send(
      `/api/sessions/${sessionId}/folders`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newFolder, parentId: newFolderParent || null }),
      },
      'Could not create the folder',
    );
    if (ok) {
      setNewFolder('');
      setNewFolderParent('');
    }
  };

  const handleMoveFolder = (folderId: string, parentId: string) =>
    send(
      `/api/sessions/${sessionId}/folders/${folderId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId: parentId || null }),
      },
      'Could not move the folder',
    );

  // Say what will happen before wiping a folder: nothing inside is destroyed,
  // but it does move, and that is worth knowing before confirming.
  const handleDeleteFolder = (node: FolderNode) => {
    const inside = [
      node.fileCount > 0 ? `${node.fileCount} file${node.fileCount === 1 ? '' : 's'}` : null,
      node.children.length > 0
        ? `${node.children.length} folder${node.children.length === 1 ? '' : 's'}`
        : null,
    ].filter(Boolean).join(' and ');

    const message = inside
      ? `Delete "${node.folder.name}"? The ${inside} inside will move to the top level, not be deleted.`
      : `Delete "${node.folder.name}"?`;
    if (!window.confirm(message)) return;

    return send(
      `/api/sessions/${sessionId}/folders/${node.folder.id}`,
      { method: 'DELETE' },
      'Could not delete the folder',
    );
  };

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
          {paths.map((p) => (
            <option key={p.id} value={p.id}>{p.path}</option>
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

  // A folder and everything beneath it. Collapsing a parent hides its whole
  // subtree, because the children render inside this block.
  const renderFolder = (node: FolderNode, depth: number) => {
    const collapsed = collapsedFolders.has(node.folder.id);
    return (
      <div key={node.folder.id} className="space-y-1.5" style={{ marginLeft: depth * 16 }}>
        <div className="flex items-center gap-2 text-sm font-medium">
          <button
            type="button"
            onClick={() => toggleFolder(node.folder.id)}
            className="flex items-center gap-2 min-w-0 flex-1 rounded-md py-0.5 pr-2 text-left hover:bg-accent/40"
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
            )}
            <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{node.folder.name}</span>
            <span className="text-xs font-mono tabular-nums text-muted-foreground">
              {node.fileCount}
            </span>
          </button>
          {folders.length > 1 && (
            <select
              value={node.folder.parent_id ?? ''}
              onChange={(e) => handleMoveFolder(node.folder.id, e.target.value)}
              className={selectClass}
              aria-label={`Move folder ${node.folder.name}`}
            >
              <option value="">Top level</option>
              {parentOptions
                .filter((p) => canMoveFolder(folders, node.folder.id, p.id))
                .map((p) => (
                  <option key={p.id} value={p.id}>{p.path}</option>
                ))}
            </select>
          )}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => handleDeleteFolder(node)}
            aria-label={`Delete folder ${node.folder.name}`}
          >
            <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
          </Button>
        </div>

        {!collapsed && (
          <>
            {node.files.length > 0 && (
              <ul className="space-y-1.5">{node.files.map(renderFile)}</ul>
            )}
            {node.files.length === 0 && node.children.length === 0 && (
              <p className="pl-9 text-xs text-muted-foreground">
                Empty — upload here or move files in.
              </p>
            )}
            {node.children.map((child) => renderFolder(child, depth + 1))}
          </>
        )}
      </div>
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="h-4 w-4" />
          Shared files
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Create a folder, optionally inside another */}
        <div className="flex gap-2">
          <Input
            placeholder="New folder name"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && newFolder.trim()) handleAddFolder(); }}
          />
          {parentOptions.length > 0 && (
            <select
              value={newFolderParent}
              onChange={(e) => setNewFolderParent(e.target.value)}
              className={`${selectClass} text-sm`}
              aria-label="Create inside"
            >
              <option value="">At the top level</option>
              {parentOptions.map((p) => (
                <option key={p.id} value={p.id}>Inside {p.path}</option>
              ))}
            </select>
          )}
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
            {paths.map((p) => (
              <option key={p.id} value={p.id}>{p.path}</option>
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
            {tree.map((node) => renderFolder(node, 0))}

            {/* Files in no folder at all */}
            {rootFiles.length > 0 && (
              <div className="space-y-1.5">
                {folders.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setRootCollapsed((c) => !c)}
                    className="flex items-center gap-2 text-sm font-medium text-muted-foreground rounded-md py-0.5 pr-2 hover:bg-accent/40"
                    aria-expanded={!rootCollapsed}
                  >
                    {rootCollapsed ? (
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    )}
                    <span>No folder</span>
                    <span className="text-xs font-mono tabular-nums text-muted-foreground">
                      {rootFiles.length}
                    </span>
                  </button>
                )}
                {/* Without a toggle to reopen it, collapsed must not hide them:
                    deleting the last folder used to strand every root file. */}
                {(!rootCollapsed || folders.length === 0) && (
                  <ul className="space-y-1.5">{rootFiles.map(renderFile)}</ul>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
