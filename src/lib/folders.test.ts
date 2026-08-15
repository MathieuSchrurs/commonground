import { describe, expect, it } from 'vitest';
import {
  ancestorChain,
  buildFolderTree,
  canMoveFolder,
  depthOf,
  descendantsOf,
  fileMoveDestinations,
  folderMoveDestinations,
  folderPaths,
  MAX_FOLDER_DEPTH,
  resolveCurrentFolder,
} from './folders';
import { Folder, SharedFile } from '@/types/files';

function folder(id: string, name: string, parent_id: string | null = null): Folder {
  return { id, session_id: 's', name, parent_id };
}

function file(id: string, folder_id: string | null): SharedFile {
  return {
    id,
    session_id: 's',
    uploaded_by: null,
    file_name: `${id}.pdf`,
    storage_path: `s/${id}.pdf`,
    mime_type: null,
    size_bytes: null,
    listing_id: null,
    folder_id,
    note: null,
  };
}

describe('buildFolderTree', () => {
  it('keeps a flat set of folders one level deep, exactly as the hub reads today', () => {
    const tree = buildFolderTree(
      [folder('f1', 'Surveys'), folder('f2', 'Mortgage')],
      [file('a', 'f1'), file('b', null)],
    );

    expect(tree.map((n) => n.folder.name)).toEqual(['Surveys', 'Mortgage']);
    expect(tree.every((n) => n.children.length === 0)).toBe(true);
    expect(tree[0].files.map((f) => f.id)).toEqual(['a']);
  });

  it('nests a child under its parent, and a grandchild one level deeper', () => {
    const tree = buildFolderTree(
      [folder('houses', 'Houses'), folder('k12', 'Kerkstraat 12', 'houses'), folder('sur', 'Survey', 'k12')],
      [file('a', 'sur')],
    );

    expect(tree.map((n) => n.folder.name)).toEqual(['Houses']);
    expect(tree[0].children.map((n) => n.folder.name)).toEqual(['Kerkstraat 12']);
    expect(tree[0].children[0].children.map((n) => n.folder.name)).toEqual(['Survey']);
    expect(tree[0].children[0].children[0].files.map((f) => f.id)).toEqual(['a']);
  });

  it('shows a folder whose parent no longer exists at the root rather than losing it', () => {
    const tree = buildFolderTree([folder('orphan', 'Orphan', 'gone')], [file('a', 'orphan')]);

    // A dangling parent is a data fault; silently dropping the folder would
    // hide its documents with no way to reach them.
    expect(tree.map((n) => n.folder.name)).toEqual(['Orphan']);
    expect(tree[0].files.map((f) => f.id)).toEqual(['a']);
  });

  it('still shows folders caught in a cycle instead of blanking the hub', () => {
    // Nothing roots at null here, so a naive walk returns an empty tree and
    // every document in these folders becomes unreachable.
    const tree = buildFolderTree(
      [folder('a', 'A', 'b'), folder('b', 'B', 'a')],
      [file('doc', 'a')],
    );

    // What matters is that nothing is lost and it terminates — not where the
    // cycle gets broken. Both folders must be reachable somewhere.
    const reachable = (nodes: typeof tree): string[] =>
      nodes.flatMap((n) => [n.folder.name, ...reachable(n.children)]);
    expect(reachable(tree).sort()).toEqual(['A', 'B']);
  });

  it('returns an empty tree for an empty hub', () => {
    expect(buildFolderTree([], [])).toEqual([]);
  });
});

// Houses > Kerkstraat 12 > Survey, plus an unrelated folder.
const nested = [
  folder('houses', 'Houses'),
  folder('k12', 'Kerkstraat 12', 'houses'),
  folder('sur', 'Survey', 'k12'),
  folder('mort', 'Mortgage'),
];

describe('descendantsOf', () => {
  it('returns everything underneath a folder, at any depth', () => {
    expect(descendantsOf(nested, 'houses').sort()).toEqual(['k12', 'sur']);
  });

  it('returns nothing for a leaf, and excludes the folder itself', () => {
    expect(descendantsOf(nested, 'sur')).toEqual([]);
    expect(descendantsOf(nested, 'houses')).not.toContain('houses');
  });

  it('terminates on a cycle', () => {
    expect(descendantsOf([folder('a', 'A', 'b'), folder('b', 'B', 'a')], 'a').sort()).toEqual(['b']);
  });
});

describe('canMoveFolder', () => {
  it('refuses to move a folder into itself', () => {
    expect(canMoveFolder(nested, 'houses', 'houses')).toBe(false);
  });

  it('refuses to move a folder into its own child or a deeper descendant', () => {
    expect(canMoveFolder(nested, 'houses', 'k12')).toBe(false);
    expect(canMoveFolder(nested, 'houses', 'sur')).toBe(false);
  });

  it('allows a move into an unrelated folder, or back to the root', () => {
    // Survey is a leaf, so it fits under Mortgage and at the root alike.
    expect(canMoveFolder(nested, 'sur', 'mort')).toBe(true);
    expect(canMoveFolder(nested, 'sur', null)).toBe(true);
  });

  it('measures the depth limit against the deepest descendant, not the folder moved', () => {
    expect(MAX_FOLDER_DEPTH).toBe(3);

    // Kerkstraat carries Survey beneath it: landing under Mortgage puts Survey
    // at depth 3, which just fits.
    expect(canMoveFolder(nested, 'k12', 'mort')).toBe(true);

    // Add one more level underneath and the same move puts Scans at depth 4 —
    // rejected, even though Kerkstraat itself would only land at depth 2.
    const deeper = [...nested, folder('scan', 'Scans', 'sur')];
    expect(canMoveFolder(deeper, 'k12', 'mort')).toBe(false);

    // And a folder already at the limit cannot take a child at all.
    expect(canMoveFolder(nested, 'mort', 'sur')).toBe(false);
  });
});

describe('subtree file counts', () => {
  it('counts files in descendants, not just direct children', () => {
    const tree = buildFolderTree(nested, [file('a', 'sur'), file('b', 'k12'), file('c', 'mort')]);
    const houses = tree.find((n) => n.folder.id === 'houses')!;

    // A collapsed Houses must still say it holds two documents.
    expect(houses.fileCount).toBe(2);
    expect(houses.files).toEqual([]);
    expect(tree.find((n) => n.folder.id === 'mort')!.fileCount).toBe(1);
  });
});

describe('folderPaths', () => {
  it('labels each folder by its full path, so like-named folders are distinguishable', () => {
    const twoSurveys = [
      folder('h1', 'Kerkstraat 12'),
      folder('s1', 'Survey', 'h1'),
      folder('h2', 'Dorpstraat 3'),
      folder('s2', 'Survey', 'h2'),
    ];
    const paths = folderPaths(twoSurveys);

    expect(paths.find((p) => p.id === 's1')!.path).toBe('Kerkstraat 12 / Survey');
    expect(paths.find((p) => p.id === 's2')!.path).toBe('Dorpstraat 3 / Survey');
  });

  it('reports depth so a caller can hide parents that are already full', () => {
    const paths = folderPaths(nested);
    expect(paths.find((p) => p.id === 'houses')!.depth).toBe(1);
    expect(paths.find((p) => p.id === 'sur')!.depth).toBe(3);
  });
});

describe('ancestorChain', () => {
  it('returns nothing for the root', () => {
    expect(ancestorChain(nested, null)).toEqual([]);
  });

  it('returns the chain from the root down to the folder itself, inclusive', () => {
    expect(ancestorChain(nested, 'sur').map((f) => f.id)).toEqual(['houses', 'k12', 'sur']);
  });

  it('stops early rather than throwing on a dangling parent', () => {
    const chain = ancestorChain([folder('orphan', 'Orphan', 'gone')], 'orphan');
    expect(chain.map((f) => f.id)).toEqual(['orphan']);
  });

  it('terminates on a cycle instead of looping', () => {
    const chain = ancestorChain([folder('a', 'A', 'b'), folder('b', 'B', 'a')], 'a');
    expect(chain.length).toBeLessThanOrEqual(2);
  });
});

describe('depthOf', () => {
  it('is the length of the ancestor chain', () => {
    expect(depthOf(nested, null)).toBe(ancestorChain(nested, null).length);
    expect(depthOf(nested, 'sur')).toBe(ancestorChain(nested, 'sur').length);
    expect(depthOf(nested, 'sur')).toBe(3);
  });
});

describe('resolveCurrentFolder', () => {
  it('returns the id unchanged when the folder still exists', () => {
    expect(resolveCurrentFolder(nested, 'sur')).toBe('sur');
  });

  it('falls back to the root when the folder is gone', () => {
    expect(resolveCurrentFolder(nested, 'deleted')).toBeNull();
  });

  it('falls back to the root even when there are no folders left at all', () => {
    expect(resolveCurrentFolder([], 'sur')).toBeNull();
  });

  it('passes null straight through', () => {
    expect(resolveCurrentFolder(nested, null)).toBeNull();
  });
});

describe('fileMoveDestinations', () => {
  it('offers every other folder plus the top level, when the file is inside a folder', () => {
    const destinations = fileMoveDestinations(folderPaths(nested), 'sur');
    expect(destinations.map((d) => d.id)).toContain(null);
    expect(destinations.map((d) => d.id)).not.toContain('sur');
    expect(destinations.map((d) => d.id)).toEqual(expect.arrayContaining(['houses', 'k12', 'mort']));
  });

  it('omits the top level when the file is already there', () => {
    const destinations = fileMoveDestinations(folderPaths(nested), null);
    expect(destinations.map((d) => d.id)).not.toContain(null);
    expect(destinations.map((d) => d.id)).toEqual(expect.arrayContaining(['houses', 'k12', 'sur', 'mort']));
  });

  it('is empty for a top-level file in a session with no folders', () => {
    expect(fileMoveDestinations(folderPaths([]), null)).toEqual([]);
  });
});

describe('folderMoveDestinations', () => {
  it('reuses canMoveFolder\'s rules: no self, no descendant, respects the depth limit', () => {
    const destinations = folderMoveDestinations(nested, folderPaths(nested), 'houses');
    const ids = destinations.map((d) => d.id);
    expect(ids).not.toContain('houses');
    expect(ids).not.toContain('k12');
    expect(ids).not.toContain('sur');
  });

  it('offers the top level when the folder is nested, and omits it when already there', () => {
    expect(folderMoveDestinations(nested, folderPaths(nested), 'sur').map((d) => d.id)).toContain(null);
    expect(folderMoveDestinations(nested, folderPaths(nested), 'houses').map((d) => d.id)).not.toContain(null);
  });

  it('is empty for the only folder in a session, already at the top level', () => {
    const solo = [folder('solo', 'Solo')];
    expect(folderMoveDestinations(solo, folderPaths(solo), 'solo')).toEqual([]);
  });
});
