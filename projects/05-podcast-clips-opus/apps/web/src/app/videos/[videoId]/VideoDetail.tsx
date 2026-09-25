'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { resetLabel } from '../../../lib/limits-contract';
import { rpc } from '../../../lib/rpc';
import type { VideoScreen, ClipScreen } from '../../../lib/screen-contract';
import { ClipCard } from '../../clips/ClipCard';
import { GuestPacks } from '../../clips/GuestPacks';
import type { GuestPackSummary } from '../../../lib/guest-contract';
export function VideoHeader({ video }: { video: VideoScreen }) {
  return <header className="detail-header"><Link href="/dashboard">← Все записи</Link><p className="eyebrow">ВАШ ВЫПУСК</p>
    <h1>Из длинного разговора —<br />короткие моменты</h1><p className="video-id">video_id: <code>{video.video_id}</code></p></header>;
}
export function ProgressPanel({ video, onRetry, busy = false }: { video: VideoScreen; onRetry?: () => void; busy?: boolean }) {
  const failure = video.user_state === 'отказ', success = video.user_state === 'успех';
  const tone = failure ? 'failure' : success ? 'success' : video.no_response ? 'silent' : 'running';
  return <section className={`status-panel ${tone}`} role={failure || video.no_response ? 'alert' : 'status'} aria-live="polite" data-state={tone}>
    <span className="state-icon" aria-hidden="true">{failure ? '!' : success ? '✓' : video.no_response ? '?' : '◷'}</span><div>
      <h2>{failure ? 'Обработка не завершена' : success ? 'Клипы готовы' : video.no_response ? 'Нет ответа от обработки' : 'Выполняется'}</h2>
      <p>{failure ? video.failure_reason ?? 'Не удалось завершить обработку.' : video.stage_label}</p>
      {!failure && !success && !video.no_response && <progress aria-label="Прогресс этапа" max={100} value={video.stage_progress ?? undefined} />}
      {failure && video.retry_after && <p>{Date.parse(video.retry_after) > Date.now() ? 'Лимиты обновятся' : 'Лимиты обновились'} {resetLabel(video.retry_after)}.</p>}
      {/* Кнопка НЕ гасится по предсказанию: `retry_after` — это «когда обновятся лимиты, ЕСЛИ они
          не изменятся», а они меняются (владелец может поднять потолок, слот может вернуться).
          Экран, гасящий кнопку по такому предсказанию, утверждает то, чего не проверял. Решает
          сервер: у него счётчик перед глазами, и при настоящей нехватке он ответит отказом с
          причиной. Заслужено 23.09.2026: потолок подняли, места стало 284 минуты, а кнопка
          оставалась серой до полуночи. */}
      {video.next_action === 'retry' && <button disabled={busy} onClick={onRetry}>
        {busy ? 'Запускаем…' : 'Повторить'}</button>}
      {video.next_action === 'upload' && <Link className="button secondary" href="/dashboard">Загрузить другой файл</Link>}
      {video.next_action === 'tomorrow' && <p>После обновления лимитов можно загрузить файл заново.</p>}
    </div></section>;
}
export function VideoDetail({ videoId, initialVideo, initialClips, initialPacks = [], consentHash }: { videoId: string; initialVideo: VideoScreen; initialClips: ClipScreen[]; initialPacks?: GuestPackSummary[]; consentHash?: string }) {
  const router = useRouter();
  const [video, setVideo] = useState(initialVideo), [clips, setClips] = useState(initialClips);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const controller = new AbortController();
    let inFlight = false;
    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const [next, result] = await Promise.all([rpc<VideoScreen>('video.get', { video_id: videoId }, false, undefined, controller.signal),
          rpc<{ clips: ClipScreen[] }>('clip.list', { video_id: videoId }, false, undefined, controller.signal)]);
        if (!controller.signal.aborted) { setVideo(next); setClips(result.clips); setError(null); }
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Связь потеряна'); }
      finally { inFlight = false; }
    };
    const timer = setInterval(() => { setNow(Date.now()); void poll(); }, 5000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [videoId]);
  async function retry() {
    setBusy(true); setError(null);
    try { await rpc('video.retry', { video_id: videoId }, true); setVideo(await rpc<VideoScreen>('video.get', { video_id: videoId })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Не удалось повторить'); }
    finally { setBusy(false); router.refresh(); }
  }
  // Local clock also detects silence when polling itself loses the network.
  const shown = video.user_state === 'выполняется' && now - Date.parse(video.updated_at) > 300000
    ? { ...video, no_response: true, stage_label: 'Нет ответа от обработки, проверяем' } : video;
  return <><VideoHeader video={video} /><ProgressPanel video={shown} onRetry={() => void retry()} busy={busy} />
    {error && <p className="notice" role="alert">Не удалось обновить данные: {error}. Повторяем запрос каждые 5 секунд.</p>}
    <section><div className="section-heading"><h2>Ваши клипы</h2><span>{video.clips_done} готово / {video.clips_total} выбрано</span></div>
      {video.clips_total > 0 && video.clips_total < 3 && <p className="notice">Найдено фрагментов: {video.clips_total}. Самодостаточных моментов меньше трёх — показываем столько, сколько есть.</p>}
      {video.status === 'done' && video.clips_done < video.clips_total && <p className="notice">Часть клипов не удалось собрать. Готовые клипы доступны для скачивания.</p>}
      <div className="clip-grid">{clips.map(clip => <ClipCard key={clip.clip_id} clip={clip} onMusicQueued={track => setClips(current => current.map(item => item.clip_id === clip.clip_id
        ? { ...item, music_track_id: track === 'auto' ? null : track, rerendering: true } : item))} />)}</div>
      {!clips.length && <p className="empty">{video.status === 'failed' ? 'Готовых клипов нет.' : 'Фрагменты появятся здесь после выделения.'}</p>}</section>
    {consentHash && <GuestPacks videoId={videoId} clips={clips} initialPacks={initialPacks} consentHash={consentHash} />}</>;
}
