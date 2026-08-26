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
      <div role="tablist" style={{ display: 'flex', gap: '0.5rem', marginTop: '1.5rem' }}>
        {(['text', 'video'] as const).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            style={{
              padding: '0.5rem 0.9rem',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: '0.95rem',
              border: tab === key ? `2px solid ${branding.accent_color}` : '1px solid #ccc',
              background: tab === key ? '#fff' : '#f6f6f6',
              fontWeight: tab === key ? 600 : 400,
            }}
          >
            {key === 'text' ? 'Написать текстом' : 'Записать видео'}
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
