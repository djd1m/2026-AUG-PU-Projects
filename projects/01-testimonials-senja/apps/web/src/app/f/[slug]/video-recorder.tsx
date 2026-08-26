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
      <section style={{ marginTop: '2rem', padding: '2rem', borderRadius: 12, border: `2px solid ${branding.accent_color}`, textAlign: 'center' }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Спасибо! Видео отправлено.</p>
        <p style={{ margin: '0.5rem 0 0', color: '#666' }}>Оно появится после проверки владельцем.</p>
      </section>
    );
  }

  return (
    <form onSubmit={submit} style={{ display: 'grid', gap: '1rem', marginTop: '1.5rem' }}>
      {notice && (
        <p style={{ margin: 0, padding: '0.75rem', background: '#fff6e5', borderRadius: 8, color: '#7a5200' }}>
          {notice}
        </p>
      )}

      {mode === 'choose' && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={startRecording} style={secondaryButton}>
            Записать с камеры
          </button>
          <button type="button" onClick={() => setMode('file')} style={secondaryButton}>
            Загрузить файл
          </button>
        </div>
      )}

      <video
        ref={videoRef}
        muted
        playsInline
        style={{ width: '100%', borderRadius: 8, background: '#000', display: mode === 'recording' ? 'block' : 'none' }}
      />

      {mode === 'recording' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <button type="button" onClick={() => recorderRef.current?.stop()} style={secondaryButton}>
            Остановить
          </button>
          <span style={{ color: elapsed > MAX_DURATION_SEC - 15 ? '#b00020' : '#666' }}>
            {elapsed} / {MAX_DURATION_SEC} с
          </span>
        </div>
      )}

      {mode === 'recorded' && blob && (
        <p style={{ margin: 0, color: '#0a7d33' }}>
          Записано {duration} с ({Math.round(blob.size / 1024)} КБ). Заполните имя и отправьте.
        </p>
      )}

      {mode === 'file' && (
        <label style={{ display: 'grid', gap: '0.35rem' }}>
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
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Ваше имя</span>
            <input required minLength={2} maxLength={80} value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Роль или компания <span style={{ color: '#888' }}>(необязательно)</span></span>
            <input value={role} onChange={(e) => setRole(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: 'grid', gap: '0.35rem' }}>
            <span>Подпись к видео <span style={{ color: '#888' }}>(необязательно)</span></span>
            <input value={caption} onChange={(e) => setCaption(e.target.value)} style={inputStyle} />
          </label>
        </>
      )}

      {errors.length > 0 && (
        <ul style={{ color: '#b00020', margin: 0, paddingLeft: '1.2rem' }}>
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      {(mode === 'recorded' || mode === 'file') && (
        <button
          type="submit"
          disabled={sending || !blob}
          style={{
            padding: '0.7rem 1rem',
            borderRadius: 8,
            border: 'none',
            background: sending || !blob ? '#bbb' : branding.accent_color,
            color: '#fff',
            fontSize: '1rem',
            cursor: sending || !blob ? 'not-allowed' : 'pointer',
          }}
        >
          {sending ? 'Отправляем…' : 'Отправить видео'}
        </button>
      )}
    </form>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.7rem',
  borderRadius: 8,
  border: '1px solid #ccc',
  fontSize: '1rem',
  fontFamily: 'inherit',
};

const secondaryButton: React.CSSProperties = {
  padding: '0.6rem 0.9rem',
  borderRadius: 8,
  border: '1px solid #ccc',
  background: '#fff',
  fontSize: '0.95rem',
  cursor: 'pointer',
};
