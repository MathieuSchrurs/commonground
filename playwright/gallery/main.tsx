import React from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import '../../src/app/globals.css';

// Story resolution: `src/**/*.story.tsx` -> `<path under src>/<ExportName>`.
// Inlined here (not shared code) because Vite's import.meta.glob is analyzed
// statically relative to this file.
const stories = import.meta.glob('../../src/**/*.story.tsx');
const idOf = (f: string) => f.replace(/^(\.\.\/)+src\//, '').replace(/\.story\.\w+$/, '');

async function resolve(storyId: string) {
  const sep = storyId.lastIndexOf('/');
  const [path, name] = [storyId.slice(0, sep), storyId.slice(sep + 1)];
  const file = Object.keys(stories).find((f) => idOf(f) === path || idOf(f).endsWith('/' + path));
  const mod = (file && (await stories[file]())) as Record<string, unknown> | undefined;
  return (mod?.[name] ?? mod?.default) as React.ComponentType | undefined;
}

const rootEl = document.getElementById('root')!;
let root: Root | undefined;

(window as unknown as { mount: (params: { story: string; props?: Record<string, unknown> }) => Promise<void> }).mount =
  async ({ story, props }) => {
    const Story = await resolve(story);
    if (!Story) throw new Error(`Unknown story: ${story}`);
    root ??= createRoot(rootEl);
    flushSync(() => {
      root!.render(
        <React.StrictMode>
          <Story {...props} />
        </React.StrictMode>
      );
    });
  };

(window as unknown as { unmount: () => Promise<void> }).unmount = async () => {
  root?.unmount();
  root = undefined;
};
