'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { PartnerAssetsDTO } from '../../../../../packages/db/src/onboarding-contract';
import { ApiError, errorMessage, onboardingApi } from './api';
import { ErrorNotice, ProgramState } from './shell';

export function PartnerAssets({ programId }: { programId: string }) {
  const [data, setData] = useState<PartnerAssetsDTO | null>(null);
  const [error, setError] = useState('');
  const [unauthorized, setUnauthorized] = useState(false);
  const [denied, setDenied] = useState(false);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    onboardingApi.partnerAssets(programId).then(setData).catch((caught: unknown) => {
      if (caught instanceof ApiError && caught.status === 401) setUnauthorized(true);
      else if (caught instanceof ApiError && caught.status === 404) setDenied(true);
      else setError(errorMessage(caught));
    });
  }, [programId]);

  function displayedValue(asset: PartnerAssetsDTO['assets'][number]) {
    if (asset.kind === 'link' && asset.future_path) return new URL(asset.future_path, window.location.origin).toString();
    return asset.public_code;
  }

  async function copy(asset: PartnerAssetsDTO['assets'][number]) {
    try {
      await navigator.clipboard.writeText(displayedValue(asset));
      setCopied(asset.id);
    } catch {
      setError('Не удалось скопировать автоматически. Выделите значение и скопируйте вручную.');
    }
  }

  if (unauthorized) return <div className="empty-state"><h2>Нужно войти</h2><p>Материалы доступны после входа.</p><Link className="button button-primary" href="/login">Перейти ко входу</Link></div>;
  if (denied) return <div className="empty-state"><h2>Материалы недоступны</h2><p>Проверьте, что участие активно, или вернитесь к списку программ.</p><Link className="button" href="/onboarding">Мои программы</Link></div>;
  if (!data) return error ? <ErrorNotice message={error} /> : <p className="loading" role="status">Загружаем материалы…</p>;

  return (
    <section>
      <ProgramState status={data.program_status} />
      {data.partner_status !== 'active' ? <ErrorNotice message="Участие приостановлено. Материалы сохранены, но сейчас недоступны для использования." /> : null}
      {error ? <ErrorNotice message={error} /> : null}
      <div className="asset-grid">
        {data.assets.map((asset) => {
          const value = displayedValue(asset);
          return <article className={`card asset-card ${asset.status}`} key={asset.id}><div className="card-topline"><span className="tag">{asset.kind === 'link' ? 'Партнёрская ссылка' : 'Промокод'}</span><span className={`status-text ${asset.status}`}>{asset.status === 'active' ? 'Выдан' : 'Отозван'}</span></div><label className="field"><span>Значение</span><input value={value} readOnly onFocus={(event) => event.currentTarget.select()} /></label><p>Материал выдан, но отслеживание переходов и покупок ещё не готово.</p><button className="button button-primary" type="button" disabled={asset.status !== 'active'} onClick={() => void copy(asset)}>{copied === asset.id ? 'Скопировано' : 'Скопировать'}</button></article>;
        })}
      </div>
      {data.assets.length === 0 ? <div className="empty-state"><h2>Материалы пока не выданы</h2><p>Обратитесь к владельцу программы.</p></div> : null}
    </section>
  );
}
