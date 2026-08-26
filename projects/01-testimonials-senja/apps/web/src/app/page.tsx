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

const BENEFITS = [
  'Текстовые и видео-отзывы по одной ссылке — клиенту не нужно регистрироваться',
  'Модерация: на стену попадает только то, что вы одобрили',
  'Виджет на свой сайт одним тегом, 2,4 КБ и без блокировки загрузки',
];

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
            // UTM-метки со страницы: сюда попадает переход по badge с чужого сайта
            // (FR-GROWTH-003). Сервер сам решит, наш это источник или чужой.
            utm_query: typeof window !== 'undefined' ? window.location.search : '',
            ...(desiredSlug.trim() ? { desired_slug: desiredSlug } : {}),
          }),
        });
        const data = (await res.json()) as { project_slug?: string; errors?: string[]; error?: string };
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
    <main className="stage">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">◆</span>
        Proofwall
      </div>

      <div className="hero card">
        <section className="hero__pitch">
          <p className="eyebrow">Соберите доказательства</p>
          <h1 className="hero__title">
            Отзывы клиентов, которые <span className="hero__accent">работают на вас</span>
          </h1>
          <p className="lede hero__lede">
            Одна ссылка — клиент оставляет отзыв текстом или на видео. Вы одобряете, и он
            появляется на публичной странице и в виджете на вашем сайте.
          </p>

          <ul className="ticks">
            {BENEFITS.map((b) => (
              <li key={b}>
                <span className="ticks__mark" aria-hidden="true">✓</span>
                {b}
              </li>
            ))}
          </ul>
        </section>

        <section className="hero__form">
          <h2 className="hero__formTitle">Создать проект</h2>
          <p className="small muted" style={{ marginTop: 4 }}>
            Три адреса сразу: форма сбора, стена отзывов и сниппет виджета.
          </p>

          <form onSubmit={submit} className="form" style={{ marginTop: 20 }}>
            <label className="field">
              <span>Email</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input" />
            </label>

            <label className="field">
              <span>Пароль <span className="field__hint">минимум 8 символов</span></span>
              <input
                type="password" required minLength={8} value={password}
                onChange={(e) => setPassword(e.target.value)} className="input"
              />
            </label>

            <label className="field">
              <span>Название проекта</span>
              <input value={projectName} onChange={(e) => setProjectName(e.target.value)} className="input" />
            </label>

            <label className="field">
              <span>Адрес <span className="field__hint">необязательно — выведем из названия</span></span>
              <input
                value={desiredSlug} onChange={(e) => setDesiredSlug(e.target.value)}
                placeholder="acme" className="input"
              />
              <SlugHint state={slugState} />
            </label>

            {errors.length > 0 && (
              <ul className="errors">
                {errors.map((e) => <li key={e}>{e}</li>)}
              </ul>
            )}

            <button type="submit" disabled={submitting || slugBlocked} className="btn btn--primary btn--block">
              {submitting ? 'Создаём…' : 'Создать проект'}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}

function SlugHint({ state }: { state: SlugState }) {
  if (state.kind === 'idle') return null;
  if (state.kind === 'checking') return <small className="muted">Проверяем…</small>;
  if (state.kind === 'available') return <small style={{ color: 'var(--ok)' }}>Свободен: /w/{state.slug}</small>;
  if (state.kind === 'taken') return <small style={{ color: 'var(--danger)' }}>Уже занят — выберите другой</small>;
  return <small style={{ color: 'var(--danger)' }}>Неверный формат — {state.reason}</small>;
}
