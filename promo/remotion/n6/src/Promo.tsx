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
import {CLIPS, Clip, FPS, Layout, SCENES, TOKENS} from './timeline';

// Onest из образа promo-render, скопирован в public/fonts (OFL). loadFont сам держит
// delayRender до загрузки; при ошибке рендер падает, а не подменяет шрифт молча.
const FAMILY = 'Onest';
for (const [file, weight] of [
  ['Onest-Regular.ttf', '400'],
  ['Onest-SemiBold.ttf', '600'],
  ['Onest-Bold.ttf', '700'],
] as const) {
  loadFont({family: FAMILY, url: staticFile(`fonts/${file}`), weight, format: 'truetype'});
}

export type PromoProps = {layout: Layout};

const FADE = 12; // кадров на появление/уход

const useFade = (frames: number) => {
  const f = useCurrentFrame();
  return interpolate(f, [0, FADE, frames - FADE, frames], [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

const Title: React.FC<{frames: number; children: React.ReactNode}> = ({frames, children}) => {
  const {width, height} = useVideoConfig();
  const f = useCurrentFrame();
  const opacity = useFade(frames);
  const rise = interpolate(f, [0, 20], [24, 0], {extrapolateRight: 'clamp'});
  const unit = Math.min(width, height);
  return (
    <AbsoluteFill
      style={{
        background: TOKENS.paper,
        justifyContent: 'center',
        alignItems: 'center',
        padding: unit * 0.08,
        opacity,
        transform: `translateY(${rise}px)`,
        textAlign: 'center',
        color: TOKENS.ink,
        fontFamily: FAMILY,
        fontSize: unit * 0.075,
        lineHeight: 1.2,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

/** Область под запись: 16:9 — запись сверху, полоса титра снизу; 9:16 и 1:1 — титр сверху, запись ниже.
 *  Титр запись не перекрывает: иначе он закрывает ответ бота у нижнего края. */
const frameGeometry = (layout: Layout, width: number, height: number) => {
  if (layout === 'wide') return {captionTop: false, captionH: height * 0.18, videoTop: 0, videoH: height * 0.82};
  const captionH = layout === 'tall' ? height * 0.2 : height * 0.3;
  return {captionTop: true, captionH, videoTop: captionH, videoH: height - captionH};
};

const Caption: React.FC<{text: string; layout: Layout}> = ({text, layout}) => {
  const {width, height} = useVideoConfig();
  const g = frameGeometry(layout, width, height);
  const unit = Math.min(width, height);
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: g.captionTop ? 0 : height - g.captionH,
        height: g.captionH,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: `0 ${unit * 0.06}px`,
        background: TOKENS.paper,
        color: TOKENS.ink,
        fontFamily: FAMILY,
        fontWeight: 600,
        fontSize: layout === 'wide' ? 54 : unit * 0.056,
        lineHeight: 1.25,
        textAlign: 'center',
        borderBottom: g.captionTop ? `4px solid ${TOKENS.accent}` : undefined,
        borderTop: g.captionTop ? undefined : `4px solid ${TOKENS.accent}`,
      }}
    >
      <span style={{maxWidth: layout === 'wide' ? '80%' : '100%'}}>{text}</span>
    </div>
  );
};

const ClipScene: React.FC<{clip: Clip; layout: Layout; frames: number}> = ({clip, layout, frames}) => {
  const {width, height} = useVideoConfig();
  const g = frameGeometry(layout, width, height);
  const opacity = useFade(frames);
  let at = 0;
  return (
    <AbsoluteFill style={{background: TOKENS.paper, opacity}}>
      {clip.segments.map((s, i) => {
        const start = at;
        at += s.frames;
        const rate = ((s.to - s.from) * FPS) / s.frames;
        const view = s.view ?? clip.view;
        return (
          <Sequence key={i} from={start} durationInFrames={s.frames} layout="none">
            <div
              style={{
                position: 'absolute',
                left: 0,
                width,
                top: g.videoTop,
                height: g.videoH,
                overflow: 'hidden',
              }}
            >
              <OffthreadVideo
                src={staticFile(`rec/${clip.file}`)}
                trimBefore={Math.round(s.from * FPS)}
                playbackRate={rate}
                muted
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: view.fit,
                  objectPosition: view.origin,
                  transform: view.scale !== 1 ? `scale(${view.scale})` : undefined,
                  transformOrigin: view.origin,
                }}
              />
            </div>
            <Caption text={s.caption} layout={layout} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

export const Promo: React.FC<PromoProps> = ({layout}) => {
  const clips = CLIPS[layout];
  const {width, height} = useVideoConfig();
  const unit = Math.min(width, height);
  return (
    <AbsoluteFill style={{background: TOKENS.paper}}>
      <Sequence from={SCENES.s1.from} durationInFrames={SCENES.s1.frames}>
        <Title frames={SCENES.s1.frames}>
          <span style={{fontWeight: 700}}>
            Посетители спрашивают —<br />
            <span style={{color: TOKENS.accent}}>сайт молчит.</span>
          </span>
        </Title>
      </Sequence>
      <Sequence from={SCENES.s2.from} durationInFrames={SCENES.s2.frames}>
        <ClipScene clip={clips.s2} layout={layout} frames={SCENES.s2.frames} />
      </Sequence>
      <Sequence from={SCENES.s3.from} durationInFrames={SCENES.s3.frames}>
        <ClipScene clip={clips.s3} layout={layout} frames={SCENES.s3.frames} />
      </Sequence>
      <Sequence from={SCENES.s4.from} durationInFrames={SCENES.s4.frames}>
        <ClipScene clip={clips.s4} layout={layout} frames={SCENES.s4.frames} />
      </Sequence>
      <Sequence from={SCENES.s5.from} durationInFrames={SCENES.s5.frames}>
        <Title frames={SCENES.s5.frames}>
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: unit * 0.04}}>
            <div style={{fontWeight: 700, fontSize: unit * 0.14, color: TOKENS.accent}}>Суфлёр</div>
            <div style={{fontWeight: 400, fontSize: unit * 0.055}}>Отвечает только по вашим материалам.</div>
            <div style={{fontWeight: 600, fontSize: unit * 0.05, opacity: 0.85}}>sufler.aicoding.space</div>
          </div>
        </Title>
      </Sequence>
    </AbsoluteFill>
  );
};
