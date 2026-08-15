import { Folder, SharedFile } from '@/types/files';

// One folder in the hub's tree, with what sits directly inside it.
export interface FolderNode {
  folder: Folder;
  children: FolderNode[];
  files: SharedFile[];
  // Files in this folder *and* everything beneath it, so a collapsed parent can
  // still say whether it holds anything.
  fileCount: number;
}

// Assemble the hub's tree from flat rows. Folders with no parent sit at the
// root, so a session where nothing has been nested reads exactly as it did
// when folders were flat.
//
// Two data faults are survivable rather than fatal, because either one would
// otherwise hide documents with no way to reach them: a parent that no longer
// exists, and a cycle. Both surface their folders at the root.
export function buildFolderTree(folders: Folder[], files: SharedFile[]): FolderNode[] {
  const filesOf = (folderId: string) => files.filter((f) => f.folder_id === folderId);
  const known = new Set(folders.map((f) => f.id));
  const placed = new Set<string>();

  const parentOf = (f: Folder) => {
    const parent = f.parent_id ?? null;
    return parent !== null && known.has(parent) ? parent : null;
  };

  // `seen` carries the ancestry of the current branch, so a cycle stops at the
  // point it would repeat rather than recursing forever.
  const childrenOf = (parentId: string | null, seen: Set<string>): FolderNode[] =>
    folders
      .filter((f) => parentOf(f) === parentId && !seen.has(f.id))
      .map((folder) => {
        placed.add(folder.id);
        const children = childrenOf(folder.id, new Set(seen).add(folder.id));
        const own = filesOf(folder.id);
        return {
          folder,
          children,
          files: own,
          fileCount: own.length + children.reduce((n, c) => n + c.fileCount, 0),
        };
      });

  const tree = childrenOf(null, new Set());

  // Anything a walk from the root never reached is in a cycle. Show it at the
  // root: a blank hub is worse than an oddly-placed folder.
  for (const folder of folders) {
    if (placed.has(folder.id)) continue;
    placed.add(folder.id);
    const children = childrenOf(folder.id, new Set([folder.id]));
    const own = filesOf(folder.id);
    tree.push({
      folder,
      children,
      files: own,
      fileCount: own.length + children.reduce((n, c) => n + c.fileCount, 0),
    });
  }

  return tree;
}

// How deep the hub may nest, counting the root level as 1. "Houses ->
// Kerkstraat 12 -> Survey" is the case this exists for; beyond that a sidebar
// card stops being readable. Named once here so the store and the UI agree.
export const MAX_FOLDER_DEPTH = 3;

// Every folder underneath this one, at any depth, excluding itself. Both the
// move rule and the delete confirmation read this, so "what is inside this
// folder" has exactly one definition.
export function descendantsOf(folders: Folder[], folderId: string): string[] {
  const found = new Set<string>();
  const walk = (parentId: string) => {
    for (const f of folders) {
      if ((f.parent_id ?? null) !== parentId) continue;
      if (f.id === folderId || found.has(f.id)) continue; // cycle guard
      found.add(f.id);
      walk(f.id);
    }
  };
  walk(folderId);
  return [...found];
}

// Depth of the deepest folder in this subtree, counting the subtree's own root
// as 1. Used to check a move against the limit.
function subtreeHeight(folders: Folder[], folderId: string): number {
  const children = folders.filter((f) => (f.parent_id ?? null) === folderId && f.id !== folderId);
  return children.length === 0
    ? 1
    : 1 + Math.max(...children.map((c) => subtreeHeight(folders.filter((f) => f.id !== folderId), c.id)));
}

// The chain of folders from the root down to (and including) this one — what
// a breadcrumb reads directly off, and what depthOf counts the length of.
// Stops early rather than throwing on a dangling parent, and a cycle can't
// loop it forever.
export function ancestorChain(folders: Folder[], folderId: string | null): Folder[] {
  const chain: Folder[] = [];
  let current = folderId;
  const seen = new Set<string>();
  while (current !== null && !seen.has(current)) {
    const folder = folders.find((f) => f.id === current);
    if (!folder) break;
    chain.unshift(folder);
    seen.add(current);
    current = folder.parent_id ?? null;
  }
  return chain;
}

// Depth of a folder from the root, counting the root level as 1. Exported so
// a caller placing a brand-new leaf (subtreeHeight always 1) can check
// `depthOf(folders, parentId) < MAX_FOLDER_DEPTH` directly, instead of
// building a fake Folder just to run it through canMoveFolder.
export function depthOf(folders: Folder[], folderId: string | null): number {
  return ancestorChain(folders, folderId).length;
}

// What the hub should be looking at after `folders` changes — the same
// folder if it's still there, otherwise the root. Realtime deletes are the
// reason this exists: a folder disappearing out from under whoever's
// browsing it must always bounce them back, even when it was the last
// folder in the session.
export function resolveCurrentFolder(folders: Folder[], currentFolderId: string | null): string | null {
  if (currentFolderId === null) return null;
  return folders.some((f) => f.id === currentFolderId) ? currentFolderId : null;
}

// Whether a folder may be moved into `into` (null = the root).
//
// Moving a folder inside itself or one of its own descendants would detach the
// whole subtree from the hub, and it would vanish with no way back. The depth
// limit is measured against the subtree's deepest folder, not the one being
// moved — otherwise a shallow move could push a grandchild past the limit.
export function canMoveFolder(
  folders: Folder[],
  folderId: string,
  into: string | null,
): boolean {
  if (into === folderId) return false;
  if (into !== null && descendantsOf(folders, folderId).includes(into)) return false;
  if (into !== null && !folders.some((f) => f.id === into)) return false;

  return depthOf(folders, into) + subtreeHeight(folders, folderId) <= MAX_FOLDER_DEPTH;
}

// A folder's full display path and depth. Named so it can be threaded
// through as a parameter (e.g. into the move-destination helpers below)
// instead of every caller recomputing folderPaths for itself.
export interface FolderPathEntry {
  id: string;
  path: string;
  depth: number;
}

// Every folder with its full path and depth, in tree order. The path is what
// makes two folders both called "Survey" distinguishable in a dropdown; the
// depth lets a caller hide parents that are already at the limit.
export function folderPaths(folders: Folder[]): FolderPathEntry[] {
  const out: FolderPathEntry[] = [];
  const walk = (nodes: FolderNode[], prefix: string, depth: number) => {
    for (const node of nodes) {
      const path = prefix ? `${prefix} / ${node.folder.name}` : node.folder.name;
      out.push({ id: node.folder.id, path, depth });
      walk(node.children, path, depth + 1);
    }
  };
  walk(buildFolderTree(folders, []), '', 1);
  return out;
}

// A place a file or folder could be moved to: a real folder (id + display
// path), or the hub's top level (id null).
export interface MoveDestination {
  id: string | null;
  path: string;
}

// Every folder a file could move into, plus the top level when the file
// isn't already there. Files have no depth limit of their own, so any folder
// other than the one it's already in is fair game.
//
// Takes the already-computed folder paths rather than the raw folder list, so
// a caller rendering many rows (one "Move to" menu per file/folder) builds
// the path list once and passes it in, instead of every row recomputing it.
export function fileMoveDestinations(paths: FolderPathEntry[], currentFolderId: string | null): MoveDestination[] {
  const destinations: MoveDestination[] = [];
  if (currentFolderId !== null) destinations.push({ id: null, path: 'Shared files (top level)' });
  for (const p of paths) {
    if (p.id !== currentFolderId) destinations.push({ id: p.id, path: p.path });
  }
  return destinations;
}

// Every folder a folder could move into, plus the top level when it isn't
// already there — reusing canMoveFolder's self/descendant/depth rules rather
// than re-checking them here. Still needs the raw folder list (unlike the
// file case) because canMoveFolder walks descendants and subtree depth.
export function folderMoveDestinations(folders: Folder[], paths: FolderPathEntry[], folderId: string): MoveDestination[] {
  const folder = folders.find((f) => f.id === folderId);
  const destinations: MoveDestination[] = [];
  if (folder && folder.parent_id !== null) destinations.push({ id: null, path: 'Top level' });
  for (const p of paths) {
    if (p.id !== folderId && canMoveFolder(folders, folderId, p.id)) destinations.push({ id: p.id, path: p.path });
  }
  return destinations;
}
