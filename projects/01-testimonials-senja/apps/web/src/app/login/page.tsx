// GET /login — FR-009.3.
//
// Вёрстка — классами дизайн-системы из globals.css (stage, card, field, input, btn),
// теми же, что на главной. Сырые утилиты со ссылками на переменные здесь были ошибкой:
// половина имён не совпала с реальными токенами (--border вместо --line), поля остались
// без границ, и страница выглядела чужой на своём же сайте.

import type { Metadata } from 'next';
import { LoginForm } from './login-form';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Вход — Proofwall',
  robots: { index: false, follow: false },
};

type Props = { searchParams: Promise<{ next?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;

  return (
    <main className="stage stage--narrow">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">◆</span>
        Proofwall
      </div>

      <div className="card">
        <h1 className="hero__formTitle">Вход</h1>
        <p className="small muted" style={{ marginTop: 4 }}>
          Почта и пароль, указанные при создании проекта.
        </p>

        <LoginForm next={next} />

        <p className="small muted" style={{ marginTop: 20 }}>
          Ещё нет проекта? <a href="/">Создать</a> — это займёт минуту.
        </p>
      </div>
    </main>
  );
}
