import { AuthForm } from './AuthForm';
import { ThemeToggle } from './ThemeToggle';
import { requestTheme } from './theme-server';
export default async function Page() {
  const theme = await requestTheme();
  return <><nav className="navigation"><a className="brand" href="/"><span>◧</span> КлипМейкер</a><span>Из разговора — в ленту</span><ThemeToggle initial={theme} /></nav>
    <main className="landing container"><section className="landing-message"><p className="eyebrow">ВАШИ МЫСЛИ. НОВАЯ АУДИТОРИЯ.</p>
      <h1>Хороший разговор<br />{' '}заслуживает<br />{' '}<em>больше зрителей.</em></h1>
      <div className="landing-copy"><p className="intro">Превратите подкаст или вебинар в короткие вертикальные клипы. С субтитрами, готовые к публикации.</p>
      <p className="muted">Загрузите запись → получите фрагменты → скачайте клипы</p></div></section><AuthForm /></main></>;
}
