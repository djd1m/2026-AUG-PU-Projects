'use client';

// Регистрация владельца — FR-001. Клиентский компонент: AC требует «проверка занятости
// [слага] до сабмита», то есть запрос к /api/projects/slug-available по мере ввода.

import { useCallback, useEffect, useState } from 'react';

type SlugState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'available'; slug: string }
  | { kind: 'taken'; slug: string }
  | { kind: 'invalid'; reason: string };

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [projectName, setProjectName] = useState('');
  const [desiredSlug, setDesiredSlug] = useState('');
  const [slugState, setSlugState] = useState<SlugState>({ kind: 'idle' });
  const [errors, setErrors] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (desiredSlug.trim() === '') {
      setSlugState({ kind: 'idle' });
      return;
    }
    setSlugState({ kind: 'checking' });
    const controller = new AbortController();
    // Дебаунс: без него каждый символ — отдельный запрос к БД.
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/projects/slug-available?slug=${encodeURIComponent(desiredSlug)}`, {
          signal: controller.signal,
        });
        const data = (await res.json()) as { available: boolean; slug: string; reason?: string };
        if (data.reason) setSlugState({ kind: 'invalid', reason: data.reason });
        else setSlugState(data.available ? { kind: 'available', slug: data.slug } : { kind: 'taken', slug: data.slug });
      } catch {
        // Прерванный запрос — не ошибка ввода, состояние просто не обновляем.
      }
    }, 300);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [desiredSlug]);

  const submit = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setErrors([]);
      setSubmitting(true);
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            project_name: projectName,
            ...(desiredSlug.trim() ? { desired_slug: desiredSlug } : {}),
          }),
        });
        const data = (await res.json()) as {
          project_slug?: string;
          errors?: string[];
          error?: string;
        };
        if (res.status === 201 && data.project_slug) {
          // Сессионная cookie уже установлена ответом — уходим на дашборд.
          window.location.href = `/dashboard/${data.project_slug}`;
          return;
        }
        setErrors(data.errors ?? [data.error ?? `Ошибка ${res.status}`]);
      } catch {
        setErrors(['Сеть недоступна — попробуйте ещё раз']);
      } finally {
        setSubmitting(false);
      }
    },
    [email, password, projectName, desiredSlug],
  );

  const slugBlocked = slugState.kind === 'taken' || slugState.kind === 'invalid';

  return (
    <main style={{ maxWidth: 460, margin: '0 auto', padding: '3rem 1.25rem' }}>
      <h1 style={{ fontSize: '1.5rem' }}>Создать проект</h1>
      <p style={{ color: '#666' }}>Получите ссылку на форму сбора, стену отзывов и виджет.</p>

      <form onSubmit={submit} style={{ display: 'grid', gap: '1rem', marginTop: '2rem' }}>
        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Пароль (минимум 8 символов)</span>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={inputStyle}
          />
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>Название проекта</span>
          <input value={projectName} onChange={(e) => setProjectName(e.target.value)} style={inputStyle} />
        </label>

        <label style={{ display: 'grid', gap: '0.35rem' }}>
          <span>
            Адрес проекта <span style={{ color: '#888' }}>(необязательно — выведем из названия)</span>
          </span>
          <input
            value={desiredSlug}
            onChange={(e) => setDesiredSlug(e.target.value)}
            placeholder="acme"
            style={inputStyle}
          />
          <SlugHint state={slugState} />
        </label>

        {errors.length > 0 && (
          <ul style={{ color: '#b00020', margin: 0, paddingLeft: '1.2rem' }}>
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}

        <button
          type="submit"
          disabled={submitting || slugBlocked}
          style={{
            padding: '0.7rem 1rem',
            borderRadius: 8,
            border: 'none',
            background: submitting || slugBlocked ? '#bbb' : '#111',
            color: '#fff',
            fontSize: '1rem',
            cursor: submitting || slugBlocked ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? 'Создаём…' : 'Создать проект'}
        </button>
      </form>
    </main>
  );
}

function SlugHint({ state }: { state: SlugState }) {
  if (state.kind === 'idle') return null;
  const map = {
    checking: { text: 'Проверяем…', color: '#888' },
    available: { text: `Свободен: /w/${'slug' in state ? state.slug : ''}`, color: '#0a7d33' },
    taken: { text: 'Уже занят — выберите другой', color: '#b00020' },
    invalid: { text: `Неверный формат — ${'reason' in state ? state.reason : ''}`, color: '#b00020' },
  } as const;
  const hint = map[state.kind];
  return <small style={{ color: hint.color }}>{hint.text}</small>;
}

const inputStyle: React.CSSProperties = {
  padding: '0.6rem 0.7rem',
  borderRadius: 8,
  border: '1px solid #ccc',
  fontSize: '1rem',
};
