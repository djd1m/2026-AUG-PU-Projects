'use client';

// Переключатель «текст | видео» на форме сбора (FR-002 + FR-003).

import { useState } from 'react';
import type { Branding } from '@/lib/branding';
import { SubmitForm } from './submit-form';
import { VideoRecorder } from './video-recorder';

export function IntakeTabs({ slug, branding }: { slug: string; branding: Branding }) {
  const [tab, setTab] = useState<'text' | 'video'>('text');

  return (
    <div>
      <div role="tablist" className="tabs">
        {(['text', 'video'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`tabs__btn${tab === key ? ' is-active' : ''}`}
          >
            {key === 'text' ? '✍️ Написать текстом' : '🎥 Записать видео'}
          </button>
        ))}
      </div>

      {tab === 'text' ? (
        <SubmitForm slug={slug} branding={branding} />
      ) : (
        <VideoRecorder slug={slug} branding={branding} />
      )}
    </div>
  );
}
