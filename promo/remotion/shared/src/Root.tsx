import React from 'react';
import {Composition} from 'remotion';
import {Promo, PromoProps} from './Promo';
import {FORMATS, FPS, TOTAL_FRAMES} from './project';

// Один компонент <Promo> — три регистрации; отличаются только размером и форматом раскладки.
// Какой проект — решает псевдоним @project при сборке бандла (shared/remotion.config.ts, PROMO_PROJECT).
export const Root: React.FC = () => (
  <>
    {FORMATS.map((f) => (
      <Composition<PromoProps, PromoProps>
        key={f.id}
        id={f.id}
        component={Promo}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={f.width}
        height={f.height}
        defaultProps={{format: f.format}}
      />
    ))}
  </>
);
