'use client';
import { useState, useCallback, useRef, useEffect } from 'react';
import { rpc } from '../../lib/rpc';
export function startClipDownload(clipId: string, clipTitle?: string): void {
  const anchor = document.createElement('a');
  anchor.href = `/api/clips/${clipId}/file?download=1`;
  anchor.download = `${clipTitle?.trim().slice(0, 100) || 'clip'}.mp4`;
  anchor.rel = 'noreferrer'; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  // The authorized file route owns delivery; an analytics outage must not block it.
  void rpc('clip.markDownloaded', { clip_id: clipId }, true).catch(() => console.warn('Событие скачивания не записано'));
}
// Donor useClipDownload: keep anchor download and busy/error state; no proxy or invented clip.download procedure.
export function useClipDownload() {
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const download = useCallback(async (clipId: string, clipTitle?: string) => {
    if (busy.current) return;
    busy.current = true; setDownloadingId(clipId); setError(null);
    try {
      startClipDownload(clipId, clipTitle);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Ошибка скачивания'); }
    finally { timer.current = setTimeout(() => { busy.current = false; setDownloadingId(null); }, 1500); }
  }, []);
  return { download, downloadingId, error, clearError: useCallback(() => setError(null), []) };
}
