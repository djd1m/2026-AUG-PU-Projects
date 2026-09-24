import type { MusicTrack } from '../../apps/worker/src/render/music';

export const TEST_MUSIC_TRACKS = [
  { id: 'test-komiku-a', sha256: 'a'.repeat(64), path: '/test/komiku-a.mp3' },
  { id: 'test-komiku-b', sha256: 'b'.repeat(64), path: '/test/komiku-b.mp3' },
  { id: 'test-komiku-c', sha256: 'c'.repeat(64), path: '/test/komiku-c.mp3' },
] as const satisfies readonly [MusicTrack, ...MusicTrack[]];
