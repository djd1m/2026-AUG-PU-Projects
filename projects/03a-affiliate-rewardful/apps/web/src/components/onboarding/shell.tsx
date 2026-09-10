import Link from 'next/link';
import type { ReactNode } from 'react';

export function OnboardingShell({
  eyebrow,
  title,
  intro,
  children,
  compact = false,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  children: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className="app-shell">
      <a className="skip-link" href="#content">К основному содержанию</a>
      <header className="site-header">
        <Link className="brand" href="/" aria-label="Proofwall, главная">
          Proofwall<span className="dot">.</span>
        </Link>
        <nav className="top-nav" aria-label="Основная навигация">
          <Link href="/onboarding">Мои программы</Link>
          <Link href="/join">Принять приглашение</Link>
          <Link className="button button-small" href="/login">Войти</Link>
        </nav>
      </header>
      <main id="content" className={compact ? 'page-main page-main-compact' : 'page-main'}>
        <div className="page-heading">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          {intro ? <p className="intro">{intro}</p> : null}
        </div>
        {children}
      </main>
      <footer className="site-footer">Партнёрская программа Proofwall · N3a</footer>
    </div>
  );
}

export function ProgramState({ status }: { status: string }) {
  const label = status === 'draft' ? 'черновик' : status === 'active' ? 'активна' : status === 'paused' ? 'приостановлена' : 'недоступна';
  return (
    <div className="program-state" role="status">
      <span className="status-dot" aria-hidden="true" />
      <div>
        <strong>Программа: {label}</strong>
        <p>Интеграция ещё не готова. Отслеживание переходов и покупок пока не работает.</p>
      </div>
    </div>
  );
}

export function ErrorNotice({ message }: { message: string }) {
  return <p className="notice-error" role="alert">{message}</p>;
}

export function SuccessNotice({ children }: { children: ReactNode }) {
  return <div className="notice-success" role="status">{children}</div>;
}
