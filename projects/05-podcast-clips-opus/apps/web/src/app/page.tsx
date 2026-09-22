import { AuthForm } from './AuthForm';
export default function Page() {
  return <><nav className="navigation"><a className="brand" href="/"><span>◧</span> КлипМейкер</a><span>Из разговора — в ленту</span></nav>
    <main className="landing container"><section><p className="eyebrow">ВАШИ МЫСЛИ. НОВАЯ АУДИТОРИЯ.</p>
      <h1>Хороший разговор<br />заслуживает<br /><em>больше зрителей.</em></h1>
      <p className="intro">Превратите подкаст или вебинар в короткие вертикальные клипы. С субтитрами, готовые к публикации.</p>
      <p className="muted">Загрузите запись → получите фрагменты → скачайте клипы</p></section><AuthForm /></main></>;
}
