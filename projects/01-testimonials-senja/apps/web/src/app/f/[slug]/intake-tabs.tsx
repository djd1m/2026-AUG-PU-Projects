'use client';

// Переключатель «текст | видео» на форме сбора (FR-002 + FR-003).

import { useState } from 'react';
import type { Branding } from '@/lib/branding';
import { SubmitForm } from './submit-form';
import { VideoRecorder } from './video-recorder';

export function IntakeTabs(
  { slug, branding, videoEnabled }: { slug: string; branding: Branding; videoEnabled: boolean },
) {
  const [tab, setTab] = useState<'text' | 'video'>('text');

  // Когда платный путь закрыт, вкладки нет ВООБЩЕ — а не есть, но отвечает отказом.
  // Показанная и неработающая кнопка это обещание, которое продукт не выполнит.
  const tabs = videoEnabled ? (['text', 'video'] as const) : (['text'] as const);

  return (
    <div>
      <div role="tablist" className="tabs">
        {tabs.map((key) => (
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
