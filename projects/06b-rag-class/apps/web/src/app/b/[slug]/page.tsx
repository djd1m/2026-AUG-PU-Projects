import { notFound } from 'next/navigation';
import { readDemoBot } from '@n6b/db';
import { getRuntime } from '@/server/runtime';
import { demoView } from '@/server/demo-view';
import { DemoChat } from './demo-chat';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Демо — RAG-бот для сайта', robots: { index: false, follow: false } };

export default async function DemoPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const bot = await readDemoBot(getRuntime().servicePool, slug);
  if (!bot) notFound();
  return <main className="demo-page"><h1>{bot.name}</h1><p>Задайте вопрос по материалам сайта.</p>
    <DemoChat slug={slug} config={demoView(bot)} /></main>;
}
