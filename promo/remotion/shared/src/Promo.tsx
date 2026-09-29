import React from 'react';
import {
  AbsoluteFill,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {loadFont} from '@remotion/fonts';
import project from '@project';
import {Crop, Format, FPS, OutroScene, ScreenScene, TitleScene, sceneStarts, validateProject} from './project';

// Проверка конфига при загрузке бандла: сломанный конфиг = упавший бандл/рендер.
validateProject(project);

const T = project.tokens;
const FAMILY = project.font.family;
// loadFont держит delayRender до загрузки; при ошибке рендер падает, а не подменяет шрифт молча.
for (const f of project.font.files) {
  loadFont({family: FAMILY, url: staticFile(f.file), weight: f.weight, format: 'truetype'});
}

const FADE = 12; // кадров на появление/уход сцены

const useFade = (frames: number) =>
  interpolate(useCurrentFrame(), [0, FADE, frames - FADE, frames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

/** Разметка кадра: полоса титра не перекрывает запись (иначе титр закрывает нижний край интерфейса).
 *  16:9 — титр снизу 18 %; 9:16 — сверху 15 % (запись целиком ниже); 1:1 — сверху 30 %. */
const geometry = (format: Format, width: number, height: number) => {
  const share = format === 'wide' ? 0.18 : format === 'tall' ? 0.15 : 0.3;
  const captionH = Math.round(height * share);
  const captionTop = format !== 'wide';
  return {captionTop, captionH, videoTop: captionTop ? captionH : 0, videoH: height - captionH, width};
};

const TitleCard: React.FC<{frames: number; children: React.ReactNode}> = ({frames, children}) => {
  const {width, height} = useVideoConfig();
  const opacity = useFade(frames);
  const rise = interpolate(useCurrentFrame(), [0, 20], [24, 0], {extrapolateRight: 'clamp'});
  const unit = Math.min(width, height);
  return (
    <AbsoluteFill
      style={{
        background: T.paper,
        justifyContent: 'center',
        alignItems: 'center',
        padding: unit * 0.08,
        opacity,
        transform: `translateY(${rise}px)`,
        textAlign: 'center',
        color: T.ink,
        fontFamily: FAMILY,
        fontSize: unit * 0.075,
        lineHeight: 1.2,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Title: React.FC<{scene: TitleScene; frames: number}> = ({scene, frames}) => (
  <TitleCard frames={frames}>
    <span style={{fontWeight: 700}}>
      {scene.lines.map((l, i) => (
        <span key={i} style={{display: 'block', color: l.accent ? T.accent : T.ink}}>
          {l.text}
        </span>
      ))}
    </span>
  </TitleCard>
);

const Outro: React.FC<{scene: OutroScene; frames: number}> = ({scene, frames}) => {
  const {width, height} = useVideoConfig();
  const unit = Math.min(width, height);
  return (
    <TitleCard frames={frames}>
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: unit * 0.04}}>
        <div style={{fontWeight: 700, fontSize: unit * 0.14, color: scene.titleColor ?? T.accent}}>{project.name}</div>
        <div style={{fontWeight: 400, fontSize: unit * 0.055}}>{project.tagline}</div>
        <div style={{fontWeight: 600, fontSize: unit * 0.05, opacity: 0.85}}>{project.url}</div>
      </div>
    </TitleCard>
  );
};

/** Строка сноски экранной сцены живёт ВНУТРИ полосы титра, у внешнего края кадра (9:16 и 1:1 — верх, 16:9 — низ):
 *  запись она не перекрывает по построению, титр сдвигается к записи на высоту строки сноски.
 *  Без сноски полоса титра — ровно прежняя (N2/N4/N5 рендерятся пиксель в пиксель как до правки). */
const footnoteBand = (width: number, height: number) => {
  const unit = Math.min(width, height);
  const fontSize = Math.round(unit * 0.028);
  const line = Math.round(fontSize * 1.25);
  const edge = Math.round(unit * 0.01);
  return {fontSize, line, edge, right: Math.round(unit * 0.02), reserve: edge + line};
};

const Caption: React.FC<{text: string; format: Format; withFootnote: boolean}> = ({text, format, withFootnote}) => {
  const {width, height} = useVideoConfig();
  const g = geometry(format, width, height);
  const unit = Math.min(width, height);
  const border = `4px solid ${T.accent}`;
  const reserve = withFootnote ? footnoteBand(width, height).reserve : 0;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: g.captionTop ? reserve : height - g.captionH,
        height: g.captionH - reserve,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `0 ${unit * 0.06}px`,
        background: T.paper,
        color: T.ink,
        fontFamily: FAMILY,
        fontWeight: 600,
        fontSize: format === 'wide' ? 54 : unit * 0.056,
        lineHeight: 1.25,
        textAlign: 'center',
        borderBottom: g.captionTop ? border : undefined,
        borderTop: g.captionTop ? undefined : border,
      }}
    >
      <span style={{maxWidth: format === 'wide' ? '80%' : '100%'}}>{text}</span>
    </div>
  );
};

/** Размещение записи size в области W×H так, чтобы прямоугольник crop был виден ЦЕЛИКОМ и как можно крупнее;
 *  без crop — вся запись (contain). Поля за краем записи не показываются, пока запись крупнее области. */
export const place = (size: [number, number], W: number, H: number, crop?: Crop) => {
  const [sw, sh] = size;
  const c = crop ?? {x: 0, y: 0, w: sw, h: sh};
  const s = Math.min(W / c.w, H / c.h);
  const rw = sw * s;
  const rh = sh * s;
  const axis = (area: number, rendered: number, center: number) => {
    if (rendered <= area) return (area - rendered) / 2;
    return Math.min(0, Math.max(area - rendered, area / 2 - center * s));
  };
  return {left: axis(W, rw, c.x + c.w / 2), top: axis(H, rh, c.y + c.h / 2), width: rw, height: rh};
};

const Screen: React.FC<{scene: ScreenScene; format: Format; frames: number}> = ({scene, format}) => {
  const {width, height} = useVideoConfig();
  const g = geometry(format, width, height);
  const use = scene.use[format];
  const track = scene.tracks[use.track];
  let at = 0;
  return (
    <AbsoluteFill style={{background: T.paper, opacity: useFade(Math.round(scene.seconds * FPS))}}>
      {track.segments.map((s, i) => {
        const start = at;
        const frames = Math.round(s.seconds * FPS);
        at += frames;
        const box = place(track.size, width, g.videoH, s.crop?.[format] ?? use.crop);
        return (
          <Sequence key={i} from={start} durationInFrames={frames} layout="none">
            <div style={{position: 'absolute', left: 0, width, top: g.videoTop, height: g.videoH, overflow: 'hidden'}}>
              <OffthreadVideo
                src={staticFile(`rec/${track.file}`)}
                trimBefore={Math.round(s.from * FPS)}
                playbackRate={(s.to - s.from) / s.seconds}
                muted
                style={{position: 'absolute', ...box}}
              />
            </div>
            <Caption text={s.caption} format={format} withFootnote={Boolean(scene.footnote)} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

/** Постоянная сноска на всю сцену: ink на paper (контраст проверен в validateProject), затухает синхронно с записью, включая затемнения (отдельного интервала без пометки не возникает).
 *  Экранная сцена — строка в полосе титра у внешнего края кадра (footnoteBand): интерфейс записи не перекрывается ни
 *  в одном формате (круг правок 2, находка Codex №4 — прежняя плашка над записью закрывала кнопку N1).
 *  Сцена-заголовок и финал записи не имеют — плашка у нижнего правого края кадра, как прежде. */
const Footnote: React.FC<{text: string; format: Format; inCaptionBand: boolean; frames: number}> = ({
  text,
  format,
  inCaptionBand,
  frames,
}) => {
  const {width, height} = useVideoConfig();
  const unit = Math.min(width, height);
  const g = geometry(format, width, height);
  const opacity = useFade(frames);
  if (inCaptionBand) {
    const b = footnoteBand(width, height);
    return (
      <div
        style={{
          position: 'absolute',
          right: b.right,
          ...(g.captionTop ? {top: b.edge} : {bottom: b.edge}),
          height: b.line,
          maxWidth: width - 2 * b.right,
          color: T.ink,
          fontFamily: FAMILY,
          fontWeight: 600,
          fontSize: b.fontSize,
          lineHeight: `${b.line}px`,
          whiteSpace: 'nowrap',
          opacity,
        }}
      >
        {text}
      </div>
    );
  }
  const margin = Math.round(unit * 0.02);
  return (
    <div
      style={{
        position: 'absolute',
        right: margin,
        bottom: margin,
        maxWidth: width - 2 * margin,
        padding: `${Math.round(unit * 0.008)}px ${Math.round(unit * 0.016)}px`,
        borderRadius: Math.round(unit * 0.01),
        background: T.paper,
        color: T.ink,
        fontFamily: FAMILY,
        fontWeight: 600,
        fontSize: Math.round(unit * 0.03),
        lineHeight: 1.25,
        whiteSpace: 'nowrap',
        opacity,
      }}
    >
      {text}
    </div>
  );
};

export type PromoProps = {format: Format};

export const Promo: React.FC<PromoProps> = ({format}) => {
  const starts = sceneStarts(project);
  return (
    <AbsoluteFill style={{background: T.paper}}>
      {project.scenes.map((sc, i) => {
        const frames = Math.round(sc.seconds * FPS);
        return (
          <Sequence key={i} from={starts[i]} durationInFrames={frames}>
            {sc.type === 'title' && <Title scene={sc} frames={frames} />}
            {sc.type === 'screen' && <Screen scene={sc} format={format} frames={frames} />}
            {sc.type === 'outro' && <Outro scene={sc} frames={frames} />}
            {sc.footnote && (
              <Footnote text={sc.footnote} format={format} inCaptionBand={sc.type === 'screen'} frames={frames} />
            )}
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
