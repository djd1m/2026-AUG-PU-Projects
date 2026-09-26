// «Мои боты» (фича bot-cabinet): список своих ботов, предел плана, создание. Итог сохранения предпросмотра при
// регистрации/входе (preview-flow, SC-US-003-1/2) — уведомлением над списком.
import { listBots } from '@n6/db';
import { currentAccountId } from '../../server/cabinet-session';
import { getRuntime } from '../../server/runtime';
import { CabinetEmpty } from './CabinetEmpty';
import { BotListScreen, CreateBotForm } from './BotListScreen';
export const dynamic = 'force-dynamic';
const NOTICES: Readonly<Record<string, string>> = {
  saved: 'Бот из предпросмотра сохранён в ваш аккаунт и включён. Сайт заново не читался. Укажите контакт для «не знаю» и домен сайта — и забирайте код установки.',
  expired: 'Предпросмотр истёк (он живёт 24 часа) — создайте бота заново: это займёт пару минут.',
  plan_limit: 'Бот из предпросмотра не сохранён: на бесплатном плане — один бот.',
  unavailable: 'Бот из предпросмотра сохранить не удалось — сервис временно недоступен. Откройте предпросмотр и нажмите «Сохранить» ещё раз.',
};
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ saved?: string; preview?: string }> }) {
  const query = await searchParams;
  const key = query.saved === '1' ? 'saved' : typeof query.preview === 'string' ? query.preview : '';
  const notice = NOTICES[key];
  const accountId = await currentAccountId();
  const list = accountId ? await listBots(getRuntime().pool, accountId) : null;
  const banner = notice && <p role="status" className="notice cabinet-notice">{notice}</p>;
  // Пустота показывается пустотой (CFG-I7), но только когда ботов действительно нет.
  if (!list || !list.bots.length) {
    return <>{banner}<CabinetEmpty />
      {list && <section className="card stack create-bot" aria-labelledby="create-title"><h2 id="create-title">Или создайте бота вручную</h2><CreateBotForm /></section>}</>;
  }
  return <>{banner}<BotListScreen list={list} /></>;
}
