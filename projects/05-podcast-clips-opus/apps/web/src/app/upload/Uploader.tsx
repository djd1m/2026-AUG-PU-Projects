'use client';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useRouter } from 'next/navigation';
import { uploadParts } from '../../lib/upload-parts';
import { rpc } from '../../lib/rpc';
import type { UploadData } from '../../server/video';
import { readCtaKind, type CtaKind } from '@clipmaker/shared/enums';
import { CtaFields, ctaProblem } from '../videos/CtaFields';
interface Resume { key: string; fingerprint: string; music: boolean; teaser: boolean; compact: boolean; ctaKind: CtaKind; ctaUrl: string | null; videoId?: string; parts?: { part_number: number; etag: string }[] }
const storageKey = 'n5-upload-resume';
// Adapted VideoUploader: same file selection, abort, error and resume flow; existing feature-2 transport owns multipart.
export function VideoUploader() {
  const router = useRouter();
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [videoId, setVideoId] = useState<string | null>(null);
  const [music, setMusic] = useState(false);
  const [teaser, setTeaser] = useState(true);
  const [compact, setCompact] = useState(true);
  const [ctaKind, setCtaKind] = useState<CtaKind>('none'), [ctaUrl, setCtaUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const controller = useRef<AbortController | null>(null), resume = useRef<Resume | null>(null);
  useEffect(() => { try { const value = sessionStorage.getItem(storageKey); if (value) { const saved = JSON.parse(value); resume.current = { ...saved, music: saved.music === true, teaser: saved.teaser === true, compact: saved.compact === true, ctaKind: readCtaKind(saved.ctaKind), ctaUrl: typeof saved.ctaUrl === 'string' ? saved.ctaUrl : null }; } } catch { setMessage('Не удалось восстановить предыдущую загрузку. Выберите файл заново.'); }
    return () => controller.current?.abort(); }, []);
  function save(value: Resume) { resume.current = value; try { sessionStorage.setItem(storageKey, JSON.stringify(value)); } catch { /* in-memory retry stays available */ } }
  async function upload() {
    if (!file || controller.current) return;
    if (!file.size || file.size > 2_000_000_000) { setMessage('Выберите непустой файл до 2 ГБ.'); return; }
    const fingerprint = `${file.name}:${file.size}:${file.lastModified}`;
    const resumed = resume.current?.fingerprint === fingerprint;
    // Непригодный адрес — отказ до заявки ключа: сервер ответил бы 422 тем же текстом.
    const problem = resumed ? null : ctaProblem(ctaKind, ctaUrl);
    if (problem) { setMessage(problem); return; }
    const current = resumed && resume.current ? resume.current : { key: crypto.randomUUID(), fingerprint, music, teaser, compact,
      ctaKind, ctaUrl: ctaKind === 'none' ? null : ctaUrl.trim() };
    save(current); const abort = new AbortController(); controller.current = abort; setBusy(true); setMessage('Подготавливаем загрузку…');
    try {
      const create = () => rpc<UploadData>('video.create', { filename: file.name, declared_bytes: file.size, source: 'upload', music: current.music, teaser: current.teaser, compact: current.compact, cta_kind: current.ctaKind, cta_url: current.ctaUrl }, true, current.key, abort.signal);
      if (!current.parts) {
        const upload = await create(); current.videoId = upload.video_id; save(current);
        // Commit video_id to DOM before uploadParts can send the first byte.
        flushSync(() => { setVideoId(upload.video_id); setMessage('Отправляем файл в хранилище…'); });
        current.parts = await uploadParts(file, upload, abort.signal, create); save(current);
      } else setVideoId(current.videoId ?? null);
      setMessage('Завершаем загрузку…');
      const response = await fetch('/api/upload/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_id: current.videoId, parts: current.parts }), signal: abort.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error?.message ?? 'Не удалось завершить загрузку');
      try { sessionStorage.removeItem(storageKey); } catch { /* cleanup cannot undo the successful upload */ }
      resume.current = null;
      router.push(`/dashboard/videos/${result.data.video_id}`); router.refresh();
    } catch (cause) { setMessage(abort.signal.aborted ? 'Загрузка приостановлена. Продолжите с тем же файлом.' : cause instanceof Error ? cause.message : 'Ошибка загрузки'); }
    finally { controller.current = null; setBusy(false); router.refresh(); }
  }
  return <section className="upload-panel"><div><p className="eyebrow">НОВЫЙ ВЫПУСК</p><h2>Один разговор.<br />Несколько сильных моментов.</h2>
    <p>Загрузите подкаст или вебинар. Мы найдём фрагменты и соберём вертикальные клипы с субтитрами.</p></div>
    <div className="upload-controls"><label htmlFor="source-file">Выберите видео или аудио</label>
      <input id="source-file" type="file" accept=".mp4,.mov,.webm,.m4a,.mp3" disabled={busy} onChange={e => { const selected = e.target.files?.[0] ?? null; setFile(selected);
        const previous = selected && resume.current?.fingerprint === `${selected.name}:${selected.size}:${selected.lastModified}` ? resume.current : null;
        if (previous) { setMusic(previous.music); setTeaser(previous.teaser); setCompact(previous.compact); setCtaKind(previous.ctaKind); setCtaUrl(previous.ctaUrl ?? ''); } setMessage(''); }} />
      <p className="muted">MP4, MOV, WebM, M4A, MP3 · 2–90 минут · до 2 ГБ</p>
      <label className="check"><input type="checkbox" checked={music} disabled={busy || !!(file && resume.current?.fingerprint === `${file.name}:${file.size}:${file.lastModified}`)}
        onChange={e => setMusic(e.target.checked)} /> Добавить музыку и финальный акцент</label>
      <small className="muted">Komiku, HoliznaCC0 — музыка CC0 · Kenney — Sci-Fi Sounds, CC0</small>
      <label className="check"><input type="checkbox" checked={teaser} disabled={busy || !!(file && resume.current?.fingerprint === `${file.name}:${file.size}:${file.lastModified}`)}
        onChange={e => setTeaser(e.target.checked)} /> Заголовок в начале клипа</label>
      <label className="check"><input type="checkbox" checked={compact} disabled={busy || !!(file && resume.current?.fingerprint === `${file.name}:${file.size}:${file.lastModified}`)}
        onChange={e => setCompact(e.target.checked)} /> Убрать паузы</label>
      <CtaFields id="upload-cta" kind={ctaKind} url={ctaUrl} disabled={busy || !!(file && resume.current?.fingerprint === `${file.name}:${file.size}:${file.lastModified}`)}
        onKind={setCtaKind} onUrl={setCtaUrl} />
      <button disabled={busy || !file} onClick={() => void upload()}>{busy ? 'Загружаем…' : resume.current ? 'Начать / продолжить загрузку' : 'Создать клипы →'}</button>
      {busy && <button className="secondary" onClick={() => controller.current?.abort()}>Приостановить</button>}
      <p role="status">{message}</p>{videoId && <p className="video-id">video_id: <a href={`/dashboard/videos/${videoId}`}>{videoId}</a></p>}</div></section>;
}
