'use client';
import { useRef, useState } from 'react';
import { MUSIC_CATALOG } from '@clipmaker/shared/music-catalog';
import type { ClipScreen } from '../../lib/screen-contract';
import { rpc } from '../../lib/rpc';
export function ClipMusicChoice({ clip, onQueued }: { clip: ClipScreen; onQueued?: (track: string) => void }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [preview, setPreview] = useState<string | null>(null);
  const audio = useRef<HTMLAudioElement>(null);
  async function choose(track: string) {
    setBusy(true); setError('');
    try { await rpc('clip.setMusic', { clip_id: clip.clip_id, track }, true); onQueued?.(track); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось сменить музыку'); }
    finally { setBusy(false); }
  }
  function play(id: string) {
    const player = audio.current;
    if (!player) return;
    if (preview === id && !player.paused) { player.pause(); setPreview(null); return; }
    player.src = `/music-previews/${id}.mp3`; setPreview(id);
    void player.play().catch(() => { setPreview(null); setError('Не удалось проиграть превью'); });
  }
  return <section aria-label="Музыка клипа">
    <label>Музыка: <select value={(clip.rerendering ? clip.music_track_id : clip.rendered_music_track_id ?? clip.music_track_id) ?? 'auto'} disabled={!clip.available || busy || clip.rerendering}
      onChange={event => void choose(event.target.value)}>
      <option value="auto">Авто</option>
      {MUSIC_CATALOG.map(track => <option key={track.id} value={track.id}>{track.title} · {track.author}</option>)}
      <option value="none">Без музыки</option>
    </select></label>
    {(busy || clip.rerendering) && <p role="status">Пересобираем…</p>}
    {clip.music_skip_reason && <p role="status">{clip.music_skip_reason === 'measure_failed' ? 'Не удалось проверить громкость музыки' : 'Музыка не подошла по громкости'}</p>}
    <details><summary>Послушать треки</summary>
      {MUSIC_CATALOG.map(track => <p key={track.id}><button type="button" className="secondary"
        aria-label={`${preview === track.id ? 'Остановить' : 'Послушать'} ${track.title}`} onClick={() => play(track.id)}>
        {preview === track.id ? '■' : '▶'}</button> {track.title} · {track.author}</p>)}
    </details>
    <audio ref={audio} preload="none" onEnded={() => setPreview(null)} />
    {error && <p role="alert">{error}</p>}
  </section>;
}
