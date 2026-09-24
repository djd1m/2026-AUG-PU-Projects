import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
// Minimal hook host: exercise actual handlers and rerenders without adding a DOM dependency.
const host = vi.hoisted(() => ({ values: [] as unknown[], cursor: 0, effects: [] as (() => unknown)[], initialized: false }));
vi.mock('react', async original => ({ ...await original<typeof import('react')>(),
  useState: (initial: unknown) => {
    const i = host.cursor++;
    if (!(i in host.values)) host.values[i] = initial;
    return [host.values[i], (value: unknown) => { host.values[i] = value; }];
  },
  useRef: (initial: unknown) => {
    const i = host.cursor++;
    if (!(i in host.values)) host.values[i] = { current: initial };
    return host.values[i];
  },
  useEffect: (effect: () => unknown) => { if (!host.initialized) host.effects.push(effect); },
}));
vi.mock('react-dom', () => ({ flushSync: (fn: () => void) => fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('../apps/web/src/lib/rpc', () => ({ rpc: vi.fn() }));
import { rpc } from '../apps/web/src/lib/rpc';
import { VideoUploader } from '../apps/web/src/app/upload/Uploader';
type Props = { children?: unknown; type?: string; disabled?: boolean; checked?: boolean; onChange?: (e: unknown) => void; onClick?: () => void };
let storage: Map<string, string>;
function render() {
  host.cursor = 0;
  const tree = VideoUploader();
  if (!host.initialized) { host.initialized = true; host.effects.forEach(f => f()); }
  const nodes: ReactElement<Props>[] = [];
  function visit(value: unknown) {
    if (Array.isArray(value)) { value.forEach(visit); return; }
    if (!value || typeof value !== 'object' || !('props' in value)) return;
    const node = value as ReactElement<Props>; nodes.push(node); visit(node.props.children);
  }
  visit(tree); return nodes;
}
const input = (nodes: ReactElement<Props>[], type: string) => nodes.filter(n => n.props.type === type)[type === 'checkbox' ? 1 : 0]!;
const file = { name: 'podcast.mp3', size: 24, lastModified: 123 };
beforeEach(() => {
  host.values = []; host.cursor = 0; host.effects = []; host.initialized = false; storage = new Map();
  vi.stubGlobal('sessionStorage', { getItem: (key: string) => storage.get(key), setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) });
  vi.mocked(rpc).mockRejectedValue(new Error('offline'));
});
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('default on; selected flag is sent and locked during upload and after failure', async () => {
  let nodes = render(); expect(input(nodes, 'checkbox').props.checked).toBe(true);
  input(nodes, 'file').props.onChange!({ target: { files: [file] } });
  nodes = render(); input(nodes, 'checkbox').props.onChange!({ target: { checked: true } });
  nodes = render(); nodes.find(n => n.type === 'button')!.props.onClick!();
  expect(input(render(), 'checkbox').props.disabled).toBe(true);
  await vi.waitFor(() => expect(vi.mocked(rpc)).toHaveBeenCalled());
  expect(vi.mocked(rpc).mock.calls[0]![1]).toMatchObject({ teaser: true });
  expect(JSON.parse(storage.get('n5-upload-resume')!).teaser).toBe(true);
  expect(input(render(), 'checkbox').props.disabled).toBe(true);
});
it.each([true, false, undefined])('resume restores locked teaser %s for same file, another file unlocks', async value => {
  storage.set('n5-upload-resume', JSON.stringify({ key: 'key', fingerprint: 'podcast.mp3:24:123', teaser: value }));
  input(render(), 'file').props.onChange!({ target: { files: [file] } });
  expect(input(render(), 'checkbox').props.checked).toBe(value === true);
  expect(input(render(), 'checkbox').props.disabled).toBe(true);
  render().find(n => n.type === 'button')!.props.onClick!();
  await vi.waitFor(() => expect(vi.mocked(rpc)).toHaveBeenCalled());
  expect(vi.mocked(rpc).mock.calls[0]![1]).toMatchObject({ teaser: value === true });
  expect(vi.mocked(rpc).mock.calls[0]![3]).toBe('key');
  input(render(), 'file').props.onChange!({ target: { files: [{ ...file, name: 'other.mp3' }] } });
  expect(input(render(), 'checkbox').props.disabled).toBe(false);
  expect(input(render(), 'checkbox').props.checked).toBe(value === true);
});

it.each([true, false])('file without Resume preserves current teaser %s', value => {
  input(render(), 'checkbox').props.onChange!({ target: { checked: value } });
  input(render(), 'file').props.onChange!({ target: { files: [file] } });
  expect(input(render(), 'checkbox').props.checked).toBe(value);
  expect(input(render(), 'checkbox').props.disabled).toBe(false);
  input(render(), 'file').props.onChange!({ target: { files: [{ ...file, name: 'other.mp3' }] } });
  expect(input(render(), 'checkbox').props.checked).toBe(value);
});
