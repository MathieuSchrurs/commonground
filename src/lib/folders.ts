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

// Depth of a folder from the root, counting the root level as 1. Exported so
// a caller placing a brand-new leaf (subtreeHeight always 1) can check
// `depthOf(folders, parentId) < MAX_FOLDER_DEPTH` directly, instead of
// building a fake Folder just to run it through canMoveFolder.
export function depthOf(folders: Folder[], folderId: string | null): number {
  let depth = 0;
  let current = folderId;
  const seen = new Set<string>();
  while (current !== null && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    current = folders.find((f) => f.id === current)?.parent_id ?? null;
  }
  return depth;
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

// Every folder with its full path and depth, in tree order. The path is what
// makes two folders both called "Survey" distinguishable in a dropdown; the
// depth lets a caller hide parents that are already at the limit.
export function folderPaths(folders: Folder[]): { id: string; path: string; depth: number }[] {
  const out: { id: string; path: string; depth: number }[] = [];
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
