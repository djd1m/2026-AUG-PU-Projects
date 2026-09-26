import { SHOWCASE_CLIPS, showcaseCaption, type ShowcaseClip } from '@clipmaker/shared/showcase';
// Демо первого экрана (фича 28, FR-LOOK-011, ADR-018): готовый вертикальный клип из настоящего длинного разговора.
// Видео не грузится до нажатия (preload="none": постоянная нагрузка лендинга — только постер), без автозвука;
// playsinline — иначе iOS открывает полноэкранный плеер (R5). Файл и постер — ТОЛЬКО через маршрут витрины.
export function LandingDemo({ clip = SHOWCASE_CLIPS[0] ?? null }: { clip?: ShowcaseClip | null }) {
  if (!clip) return null;
  const base = `/api/showcase/${encodeURIComponent(clip.code)}`;
  const caption = showcaseCaption(clip);
  return <figure className="landing-demo">
    <video controls playsInline preload="none" poster={`${base}/thumbnail`} src={`${base}/file`}
      aria-label={`Пример клипа: ${caption}`} />
    <figcaption><strong>{caption}</strong><a href={`/c/${encodeURIComponent(clip.code)}`}>Открыть клип</a></figcaption>
  </figure>;
}
