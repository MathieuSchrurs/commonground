'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  FileText,
  Folder as FolderIcon,
  FolderPlus,
  Home,
  MoreHorizontal,
  Move,
  Trash2,
  Upload,
} from 'lucide-react';
import { SharedFile, Folder } from '@/types/files';
import {
  ancestorChain,
  buildFolderTree,
  depthOf,
  fileMoveDestinations,
  folderMoveDestinations,
  folderPaths,
  FolderNode,
  MAX_FOLDER_DEPTH,
  resolveCurrentFolder,
} from '@/lib/folders';
import { createClient } from '@/utils/supabase/client';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

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

// Always visible, not hover-revealed: a hover-only affordance is unreachable
// on the phones this group will actually be checking the hub from.
const dropdownTriggerClass = cn(buttonVariants({ variant: 'ghost', size: 'icon-sm' }), 'shrink-0');

// A Dropbox-style hub: one folder's contents at a time, with a breadcrumb back
// to the root, instead of the whole tree unfolded and indented at once. Six
// people filing documents need to see "where am I" more than "everything that
// exists" — the full tree is still there, just one click away per level.
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
  const [newFolder, setNewFolder] = useState('');
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadFolderId, setUploadFolderId] = useState<string | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Resolved synchronously on every render, not just inside the effect below:
  // the render that happens right after another user deletes the folder
  // we're browsing must not derive the breadcrumb/listing from an id that's
  // already gone, and effects only run *after* that render has painted.
  const safeCurrentFolderId = resolveCurrentFolder(folders, currentFolderId);

  // The effect keeps the underlying state itself in sync, so a later render
  // (e.g. after navigating elsewhere and back) isn't still carrying a
  // dangling id around — including when the deleted folder was the only one
  // left in the session.
  useEffect(() => {
    setCurrentFolderId((prev) => resolveCurrentFolder(folders, prev));
  }, [folders]);

  const nameOf = new Map(users.map((u) => [u.id, u.name]));
  const houseLabel = new Map(houseOptions.map((h) => [h.id, h.label]));

  // Rebuilding these walks every folder and file, so they're only worth
  // doing again when the data actually changed — not on every keystroke in
  // the Note or folder-name popovers, and not once per rendered row.
  const paths = useMemo(() => folderPaths(folders), [folders]);
  const { tree, nodeById } = useMemo(() => {
    const tree = buildFolderTree(folders, files);
    const nodeById = new Map<string, FolderNode>();
    (function index(nodes: FolderNode[]) {
      for (const n of nodes) {
        nodeById.set(n.folder.id, n);
        index(n.children);
      }
    })(tree);
    return { tree, nodeById };
  }, [folders, files]);

  const currentNode = safeCurrentFolderId ? nodeById.get(safeCurrentFolderId) : null;
  const subfolders = safeCurrentFolderId === null ? tree : currentNode?.children ?? [];
  const currentFiles = safeCurrentFolderId === null ? files.filter((f) => f.folder_id === null) : currentNode?.files ?? [];
  const crumbs = ancestorChain(folders, safeCurrentFolderId);
  const atMaxDepth = depthOf(folders, safeCurrentFolderId) >= MAX_FOLDER_DEPTH;

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

  // Destination is explicit, not implied: dragging a file onto the visible
  // list drops it in the folder you're looking at, but the "Choose files"
  // flow carries its own destination picker (defaulted to the current folder,
  // overridable) so uploading somewhere else doesn't require navigating away
  // and back.
  const uploadFiles = async (fileList: FileList | null, folderId: string | null) => {
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
            folderId,
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

  const handleMove = (fileId: string, folderId: string | null) =>
    send(
      `/api/sessions/${sessionId}/files/${fileId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folderId }),
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
        body: JSON.stringify({ name: newFolder, parentId: safeCurrentFolderId }),
      },
      'Could not create the folder',
    );
    if (ok) {
      setNewFolder('');
      setNewFolderOpen(false);
    }
  };

  const handleMoveFolder = (folderId: string, parentId: string | null) =>
    send(
      `/api/sessions/${sessionId}/folders/${folderId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parentId }),
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

  const renderFile = (f: SharedFile) => {
    const destinations = fileMoveDestinations(paths, f.folder_id);
    return (
      <div key={f.id} className="group flex items-center gap-1 rounded-lg pr-1 hover:bg-accent/30 transition-colors">
        <a
          href={publicUrl(f.storage_path)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-1 min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm"
        >
          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block truncate font-medium group-hover:underline">{f.file_name}</span>
            <span className="block text-xs text-muted-foreground truncate">
              {[
                formatSize(f.size_bytes),
                f.uploaded_by ? nameOf.get(f.uploaded_by) : null,
                f.listing_id ? `→ ${houseLabel.get(f.listing_id) ?? 'a house'}` : null,
                f.note,
              ].filter(Boolean).join(' · ')}
            </span>
          </span>
        </a>
        <DropdownMenu>
          <DropdownMenuTrigger className={dropdownTriggerClass} aria-label={`Options for ${f.file_name}`}>
            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={destinations.length === 0}>
                <Move className="h-3.5 w-3.5" />
                Move to
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {destinations.map((d) => (
                  <DropdownMenuItem key={d.id ?? 'root'} onClick={() => handleMove(f.id, d.id)}>
                    {d.path}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem variant="destructive" onClick={() => handleDelete(f.id)}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const renderFolder = (node: FolderNode) => {
    const destinations = folderMoveDestinations(folders, paths, node.folder.id);
    return (
      <div key={node.folder.id} className="group flex items-center gap-1 rounded-lg pr-1 hover:bg-accent/30 transition-colors">
        <button
          type="button"
          onClick={() => setCurrentFolderId(node.folder.id)}
          className="flex flex-1 min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm"
        >
          <FolderIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex-1 min-w-0 truncate font-medium">{node.folder.name}</span>
          {node.fileCount > 0 && (
            <span className="text-xs text-muted-foreground shrink-0">
              {node.fileCount} file{node.fileCount === 1 ? '' : 's'}
            </span>
          )}
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className={dropdownTriggerClass} aria-label={`Options for ${node.folder.name}`}>
            <MoreHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger disabled={destinations.length === 0}>
                <Move className="h-3.5 w-3.5" />
                Move to
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {destinations.map((d) => (
                  <DropdownMenuItem key={d.id ?? 'root'} onClick={() => handleMoveFolder(node.folder.id, d.id)}>
                    {d.path}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem variant="destructive" onClick={() => handleDeleteFolder(node)}>
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const empty = subfolders.length === 0 && currentFiles.length === 0;

  return (
    <Card>
      <CardContent className="space-y-3">
        {/* The breadcrumb's root crumb ("Shared files") doubles as the card's
            title — a separate CardHeader saying the same thing right above it
            was pure repetition. */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-sm overflow-x-auto min-w-0">
            <button
              type="button"
              onClick={() => setCurrentFolderId(null)}
              className={`flex items-center gap-1.5 shrink-0 rounded-md px-1.5 py-0.5 hover:bg-accent/40 ${
                safeCurrentFolderId === null ? 'text-foreground font-medium' : 'text-muted-foreground'
              }`}
            >
              <Home className="h-3.5 w-3.5" />
              Shared files
            </button>
            {crumbs.map((c, i) => (
              <React.Fragment key={c.id}>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                <button
                  type="button"
                  onClick={() => setCurrentFolderId(c.id)}
                  className={`truncate shrink-0 rounded-md px-1.5 py-0.5 hover:bg-accent/40 ${
                    i === crumbs.length - 1 ? 'text-foreground font-medium' : 'text-muted-foreground'
                  }`}
                >
                  {c.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Popover open={newFolderOpen} onOpenChange={setNewFolderOpen}>
              <PopoverTrigger
                disabled={atMaxDepth}
                className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-1.5')}
              >
                <FolderPlus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New folder</span>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64">
                <p className="text-xs text-muted-foreground">
                  New folder in {safeCurrentFolderId ? `"${crumbs[crumbs.length - 1]?.name}"` : 'Shared files'}
                </p>
                <Input
                  autoFocus
                  placeholder="Folder name"
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && newFolder.trim()) handleAddFolder(); }}
                />
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => setNewFolderOpen(false)}>Cancel</Button>
                  <Button size="sm" variant="brand" onClick={handleAddFolder} disabled={!newFolder.trim()}>
                    Create
                  </Button>
                </div>
              </PopoverContent>
            </Popover>

            <Popover
              open={uploadOpen}
              onOpenChange={(open) => {
                setUploadOpen(open);
                // Default to wherever you're browsing each time it opens —
                // still overridable below, so uploading somewhere else never
                // requires navigating away and back first.
                if (open) setUploadFolderId(safeCurrentFolderId);
              }}
            >
              <PopoverTrigger
                disabled={uploading}
                className={cn(buttonVariants({ variant: 'brand', size: 'sm' }), 'gap-1.5')}
              >
                <Upload className="h-3.5 w-3.5" />
                {uploading ? 'Uploading…' : 'Upload'}
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72">
                <select
                  value={uploadFolderId ?? ''}
                  onChange={(e) => setUploadFolderId(e.target.value || null)}
                  className={`${selectClass} w-full text-sm`}
                  aria-label="Destination folder"
                >
                  <option value="">Shared files (top level)</option>
                  {paths.map((p) => (
                    <option key={p.id} value={p.id}>{p.path}</option>
                  ))}
                </select>
                <Input
                  placeholder="Note (optional)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <select
                  value={listingId}
                  onChange={(e) => setListingId(e.target.value)}
                  className={`${selectClass} w-full text-sm`}
                >
                  <option value="">Link to a house (optional)</option>
                  {houseOptions.map((h) => (
                    <option key={h.id} value={h.id}>{h.label}</option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="brand"
                  className="w-full"
                  onClick={() => { setUploadOpen(false); inputRef.current?.click(); }}
                >
                  Choose files
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  or drag files onto the list below to upload here
                </p>
              </PopoverContent>
            </Popover>
            <input
              ref={inputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => uploadFiles(e.target.files, uploadFolderId)}
            />
          </div>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        {/* This folder's contents: subfolders first, then files, one level at
            a time — the breadcrumb above is what tells you where you are.
            Dropping a file anywhere in here uploads it to this folder. */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files, safeCurrentFolderId); }}
          className={`rounded-lg transition-colors ${dragOver ? 'bg-brand/5 ring-2 ring-brand/40' : ''}`}
        >
          {empty ? (
            <p className={`text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center ${
              dragOver ? 'border-brand' : 'border-border'
            }`}>
              {safeCurrentFolderId === null && files.length === 0 && folders.length === 0
                ? 'No files yet — drop some here, or use Upload above.'
                : 'Empty — drop files here, or move some in.'}
            </p>
          ) : (
            <div className="space-y-0.5">
              {subfolders.map(renderFolder)}
              {currentFiles.map(renderFile)}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
