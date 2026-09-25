export const MUSIC_CATALOG = [
  { id: 'komiku-everything-is-groovy', title: 'Everything Is Groovy', author: 'Komiku' },
  { id: 'holizna-bubbles', title: 'Bubbles', author: 'HoliznaCC0' },
  { id: 'holizna-tranquil-mindscape', title: 'Tranquil Mindscape', author: 'HoliznaCC0' },
  { id: 'holizna-walking-away', title: 'Walking Away', author: 'HoliznaCC0' },
  { id: 'holizna-doodles', title: 'Doodles', author: 'HoliznaCC0' },
  { id: 'holizna-one-good-day', title: 'One Good Day', author: 'HoliznaCC0' },
  { id: 'holizna-warm-fuzz', title: 'Warm Fuzz', author: 'HoliznaCC0' },
  { id: 'holizna-roof-tops', title: 'Roof Tops', author: 'HoliznaCC0' },
  { id: 'holizna-ocean-memory', title: 'Ocean Memory', author: 'HoliznaCC0' },
] as const;
export type MusicTrackId = typeof MUSIC_CATALOG[number]['id'];
export type MusicChoice = 'auto' | 'none' | MusicTrackId;
export function effectiveMusic(choice: string | null, enabled: boolean, index: number): string {
  if (choice === null || choice === 'auto') return enabled
    ? MUSIC_CATALOG[((index - 1) % MUSIC_CATALOG.length + MUSIC_CATALOG.length) % MUSIC_CATALOG.length]!.id : 'none';
  return MUSIC_CATALOG.some(track => track.id === choice) ? choice : 'none';
}
