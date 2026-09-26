// из N5: projects/05-podcast-clips-opus/apps/web/src/app/Landing.tsx (коммит 90fe80a) — шапка .navigation вынесена в
// общий компонент: бренд «Суфлёр», «Тарифы» (FR-LOOK-002: тарифы в одно действие), «Войти», переключатель темы.
import type { ReactNode } from 'react';
import type { Theme } from '../lib/theme';
import { ThemeToggle } from './ThemeToggle';
export function SiteHeader({ theme, home = '/', children }: { theme: Theme; home?: string; children?: ReactNode }) {
  return <nav className="navigation" aria-label="Основная навигация">
    <a className="brand" href={home}><span aria-hidden="true">С</span> Суфлёр</a>
    {children ?? <><a href="/pricing">Тарифы</a><a href="/login">Войти</a></>}
    <ThemeToggle initial={theme} />
  </nav>;
}
