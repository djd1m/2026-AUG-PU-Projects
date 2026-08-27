// GET /login — FR-009.3.
//
// Существует потому, что до FR-009 вернуться в кабинет было НЕЧЕМ: сессия жила 30 дней
// без продления, а входа не было вовсе.

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
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Вход</h1>
      <p className="mt-2 text-sm text-[var(--muted)]">
        Введите почту и пароль, указанные при создании проекта.
      </p>
      <LoginForm next={next} />
    </main>
  );
}
