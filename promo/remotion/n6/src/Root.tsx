import React from 'react';
import {Composition} from 'remotion';
import {Promo, PromoProps} from './Promo';
import {FORMATS, FPS, TOTAL_FRAMES} from './timeline';

// Один набор сцен (<Promo>) — три регистрации, отличаются только размером и раскладкой.
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
        defaultProps={{layout: f.layout}}
      />
    ))}
  </>
);
