// /preview?url=… — цель формы лендинга (GET, работает и без скриптов): поле адреса и запуск CreatePreview.
import { SiteHeader } from '../SiteHeader';
import { requestTheme } from '../theme-server';
import { PreviewStart } from './PreviewStart';
export const dynamic = 'force-dynamic';
export default async function PreviewStartPage({ searchParams }: { searchParams: Promise<{ url?: string | string[] }> }) {
  const raw = (await searchParams).url;
  const url = typeof raw === 'string' ? raw.slice(0, 2048) : '';
  return <><SiteHeader theme={await requestTheme()} /><main className="center container"><PreviewStart initialUrl={url} /></main></>;
}
