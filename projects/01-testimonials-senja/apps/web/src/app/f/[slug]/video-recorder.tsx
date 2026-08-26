'use client';

// Видео-ветвь формы (FR-003) + Pseudocode §1.2: отказ в доступе к камере НЕ тупик,
// а переход на загрузку файла с понятным сообщением.

import { useCallback, useRef, useState } from 'react';
import type { Branding } from '@/lib/branding';

const MAX_DURATION_SEC = 120;
const MAX_SIZE_BYTES = 100 * 1024 * 1024;

type Mode = 'choose' | 'recording' | 'recorded' | 'file';

export function VideoRecorder({ slug, branding }: { slug: string; branding: Branding }) {
  const [mode, setMode] = useState<Mode>('choose');
  const [notice, setNotice] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [caption, setCaption] = useState('');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [duration, setDuration] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTracks = useCallback(() => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    stream?.getTracks().forEach((t) => t.stop());
    if (videoRef.current) videoRef.current.srcObject = null;
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const startRecording = useCallback(async () => {
    setErrors([]);
    setNotice(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      chunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        setBlob(new Blob(chunksRef.current, { type: 'video/webm' }));
        setDuration(Math.round((Date.now() - startedAtRef.current) / 1000));
        stopTracks();
        setMode('recorded');
      };
      startedAtRef.current = Date.now();
      recorder.start();
      recorderRef.current = recorder;
      setMode('recording');
      timerRef.current = setInterval(() => {
        const sec = Math.round((Date.now() - startedAtRef.current) / 1000);
        setElapsed(sec);
        // Жёсткая остановка на пределе — иначе автор запишет 5 минут и получит отказ сервера.
        if (sec >= MAX_DURATION_SEC) recorderRef.current?.stop();
      }, 250);
    } catch (err) {
      // Pseudocode §1.2 — различаем «не разрешили» и «нет устройства», обе ветви ведут к файлу.
      const name = (err as { name?: string }).name;
      setNotice(
        name === 'NotFoundError' || name === 'DevicesNotFoundError'
          ? 'Камера не найдена. Загрузите файл.'
          : 'Доступ к камере не разрешён. Загрузите файл вместо записи.',
      );
      setMode('file');
    }
  }, [stopTracks]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setErrors([]);
    if (!blob) {
      setErrors(['video: обязателен для type=video']);
      return;
    }
    if (blob.size > MAX_SIZE_BYTES) {
      setErrors(['video: больше 100 MB']);
      return;
    }
    setSending(true);
    try {
      const form = new FormData();
      form.set('slug', slug);
      form.set('name', name);
      form.set('role', role);
      form.set('text_caption', caption);
      form.set('duration_sec', String(duration));
      form.set('video', blob, blob.type === 'video/mp4' ? 'video.mp4' : 'video.webm');

      const res = await fetch('/api/testimonials/video', { method: 'POST', body: form });
      if (res.status === 201) {
        setDone(true);
        return;
      }
      if (res.status === 429) {
        setErrors(['Слишком много отправок с этого адреса. Попробуйте позже.']);
        return;
      }
      if (res.status === 503) {
        setErrors(['Сервис временно недоступен — попробуйте ещё раз.']);
        return;
      }
      const data = (await res.json()) as { errors?: string[]; error?: string };
      setErrors(data.errors ?? [data.error ?? `Ошибка ${res.status}`]);
    } catch {
      setErrors(['Сеть недоступна — попробуйте ещё раз']);
    } finally {
      setSending(false);
    }
  }

  if (done) {
    return (
      <section className="thanks" style={{ borderColor: branding.accent_color }}>
        <span className="thanks__mark" style={{ background: branding.accent_color }}>✓</span>
        <p className="thanks__title">Спасибо! Видео отправлено.</p>
        <p className="muted small" style={{ marginTop: 6 }}>Оно появится после проверки владельцем.</p>
      </section>
    );
  }

  return (
    <form onSubmit={submit} className="form" style={{ marginTop: 22 }}>
      {notice && (
        <p className="notice">{notice}</p>
      )}

      {mode === 'choose' && (
        <div className="row">
          <button type="button" onClick={startRecording} className="btn btn--ghost btn--sm">
            Записать с камеры
          </button>
          <button type="button" onClick={() => setMode('file')} className="btn btn--ghost btn--sm">
            Загрузить файл
          </button>
        </div>
      )}

      <video
        ref={videoRef}
        muted
        playsInline
        className="recorder__video"
        style={{ display: mode === 'recording' ? 'block' : 'none' }}
      />

      {mode === 'recording' && (
        <div className="row">
          <button type="button" onClick={() => recorderRef.current?.stop()} className="btn btn--ghost btn--sm">
            Остановить
          </button>
          <span className="small" style={{ color: elapsed > MAX_DURATION_SEC - 15 ? 'var(--danger)' : 'var(--muted)' }}>
            {elapsed} / {MAX_DURATION_SEC} с
          </span>
        </div>
      )}

      {mode === 'recorded' && blob && (
        <p style={{ margin: 0, color: 'var(--ok)', fontWeight: 600 }}>
          Записано {duration} с ({Math.round(blob.size / 1024)} КБ). Заполните имя и отправьте.
        </p>
      )}

      {mode === 'file' && (
        <label className="field">
          <span>Видеофайл (webm или mp4, до 120 с и 100 МБ)</span>
          <input
            type="file"
            accept="video/webm,video/mp4"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBlob(file);
              // Длительность читается из метаданных файла — сервер её проверить не может.
              const probe = document.createElement('video');
              probe.preload = 'metadata';
              probe.onloadedmetadata = () => {
                setDuration(Math.round(probe.duration));
                URL.revokeObjectURL(probe.src);
              };
              probe.src = URL.createObjectURL(file);
            }}
          />
        </label>
      )}

      {(mode === 'recorded' || mode === 'file') && (
        <>
          <label className="field">
            <span>Ваше имя</span>
            <input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} className="input" />
          </label>
          <label className="field">
            <span>Роль или компания <span style={{ color: '#888' }}>(необязательно)</span></span>
            <input value={role} onChange={(e) => setRole(e.target.value)} className="input" />
          </label>
          <label className="field">
            <span>Подпись к видео <span style={{ color: '#888' }}>(необязательно)</span></span>
            <input value={caption} onChange={(e) => setCaption(e.target.value)} className="input" />
          </label>
        </>
      )}

      {errors.length > 0 && (
        <ul className="errors">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {(mode === 'recorded' || mode === 'file') && (
        <button
          type="submit"
          disabled={sending || !blob}
          className="btn btn--primary btn--block"
          style={sending || !blob ? undefined : { background: branding.accent_color }}
        >
          {sending ? 'Отправляем…' : 'Отправить видео'}
        </button>
      )}
    </form>
  );
}


