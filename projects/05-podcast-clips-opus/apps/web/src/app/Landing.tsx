import type { Theme } from '../lib/theme';
import { AuthForm } from './AuthForm';
import { LandingCta } from './LandingCta';
import { LandingDemo } from './LandingDemo';
import { ThemeToggle } from './ThemeToggle';
// Разметка лендинга отдельно от page.tsx (там только чтение темы): тот же компонент рендерит браузерный набор
// прибора вёрстки (R9 «демо и действие в первом экране»), так что проверяется настоящая разметка, а не копия.
// Порядок на телефоне: заголовок → демо → «Попробовать бесплатно» → форма → текст (.landing-copy order:2).
export function Landing({ theme }: { theme: Theme }) {
  return <><nav className="navigation"><a className="brand" href="/"><span>◧</span> КлипМейкер</a><span>Из разговора — в ленту</span><ThemeToggle initial={theme} /></nav>
    <main className="landing container"><section className="landing-message"><p className="eyebrow">ВАШИ МЫСЛИ. НОВАЯ АУДИТОРИЯ.</p>
      <h1>Хороший разговор<br />{' '}заслуживает<br />{' '}<em>больше зрителей.</em></h1>
      <div className="landing-copy"><p className="intro">Превратите подкаст или вебинар в короткие вертикальные клипы. С субтитрами, готовые к публикации.</p>
      <p className="muted">Загрузите запись → получите фрагменты → скачайте клипы</p></div>
      <LandingDemo /><LandingCta /></section><AuthForm /></main></>;
}
