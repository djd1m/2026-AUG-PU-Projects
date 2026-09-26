'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { resetLabel } from '../../../lib/limits-contract';
import { rpc } from '../../../lib/rpc';
import type { VideoScreen, ClipScreen } from '../../../lib/screen-contract';
import { ribbonOf, STEP_STATE_TEXT, type RibbonStep, type StepView } from '../../../lib/progress-ribbon';
import { ClipCard } from '../../clips/ClipCard';
import { GuestPacks, type GuestPreselect } from '../../clips/GuestPacks';
import type { GuestPackSummary } from '../../../lib/guest-contract';
import { VideoCtaForm } from '../CtaFields';
// Фича 29: `video_id` — под «Подробнее» в одной строке со ссылкой назад (не съедает первый экран телефона).
export function VideoHeader({ video }: { video: VideoScreen }) {
  return <header className="detail-header"><div className="detail-top"><Link href="/dashboard">← Все записи</Link>
    <details className="video-meta"><summary>Подробнее</summary><p className="video-id">video_id: <code>{video.video_id}</code></p></details></div>
    <p className="eyebrow">ВАШ ВЫПУСК</p><h1>Из длинного разговора —<br />короткие моменты</h1></header>;
}
const STEP_MARK: Record<StepView, string> = { done: '✓', running: '◷', silent: '?', failed: '!', pending: '○' };
/** Лента «Загрузка → Расшифровка → Выбор → Монтаж»: состояние каждой стадии — знаком И текстом, не только цветом. */
export function StageRibbon({ steps }: { steps: RibbonStep[] }) {
  return <ol className="progress-ribbon" aria-label="Этапы обработки">{steps.map(step =>
    <li key={step.key} data-view={step.view} aria-current={step.view === 'running' || step.view === 'silent' || step.view === 'failed' ? 'step' : undefined}>
      <span className="step-mark" aria-hidden="true">{STEP_MARK[step.view]}</span><span className="step-label">{step.label}</span>
      {step.detail && <span className="step-detail">{step.detail}</span>}
      <span className="visually-hidden"> — {STEP_STATE_TEXT[step.view]}</span></li>)}</ol>;
}
export function ProgressPanel({ video, onRetry, busy = false }: { video: VideoScreen; onRetry?: () => void; busy?: boolean }) {
  const { tone, steps } = ribbonOf(video);
  const failure = tone === 'failure', success = tone === 'success', silent = tone === 'silent';
  // Готово — лента сворачивается в одну строку: первый экран телефона отдан клипам (FR-GROWTH-001).
  if (success) return <section className="status-panel success compact" role="status" aria-live="polite" data-state={tone}>
    <p><span className="step-mark" aria-hidden="true">✓</span><strong>Клипы готовы</strong> · {video.clips_done} из {video.clips_total}</p></section>;
  return <section className={`status-panel ${tone}`} role={failure || silent ? 'alert' : 'status'} aria-live="polite" data-state={tone}>
    <h2>{failure ? 'Обработка не завершена' : silent ? 'Нет ответа от обработки' : 'Выполняется'}</h2>
    <StageRibbon steps={steps} />
    <p>{failure ? video.failure_reason ?? 'Не удалось завершить обработку.' : video.stage_label}</p>
    {!failure && !silent && <progress aria-label="Прогресс этапа" max={100} value={video.stage_progress ?? undefined} />}
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
  </section>;
}
export function VideoDetail({ videoId, initialVideo, initialClips, initialPacks = [], consentHash }: { videoId: string; initialVideo: VideoScreen; initialClips: ClipScreen[]; initialPacks?: GuestPackSummary[]; consentHash?: string }) {
  const router = useRouter();
  const [video, setVideo] = useState(initialVideo), [clips, setClips] = useState(initialClips);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [guestPreselect, setGuestPreselect] = useState<GuestPreselect | null>(null);
  // «Гостю» on a card only marks the clip in the guest form; the form stays the one place where consent is given.
  const sendToGuest = consentHash ? (clipId: string) => setGuestPreselect(p => ({ clip_id: clipId, nonce: (p?.nonce ?? 0) + 1 })) : undefined;
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
    <section className="clips-section"><div className="section-heading"><h2>Ваши клипы</h2><span>{video.clips_done} готово / {video.clips_total} выбрано</span></div>
      {video.clips_total > 0 && video.clips_total < 3 && <p className="notice">Найдено фрагментов: {video.clips_total}. Самодостаточных моментов меньше трёх — показываем столько, сколько есть.</p>}
      {video.status === 'done' && video.clips_done < video.clips_total && <p className="notice">Часть клипов не удалось собрать. Готовые клипы доступны для скачивания.</p>}
      <div className="clip-grid">{clips.map(clip => <ClipCard key={clip.clip_id} clip={clip} onSendToGuest={sendToGuest} onMusicQueued={track => setClips(current => current.map(item => item.clip_id === clip.clip_id
        ? { ...item, music_track_id: track === 'auto' ? null : track, rerendering: true } : item))} />)}</div>
      {!clips.length && <p className="empty">{video.status === 'failed' ? 'Готовых клипов нет.' : 'Фрагменты появятся здесь после выделения.'}</p>}</section>
    <VideoCtaForm videoId={videoId} initialKind={initialVideo.cta_kind} initialUrl={initialVideo.cta_url} />
    {consentHash && <GuestPacks videoId={videoId} clips={clips} initialPacks={initialPacks} consentHash={consentHash} preselect={guestPreselect} />}</>;
}
