import type { BotStats as Stats } from '@n6b/db';

export function BotStats({ botId, stats }: { botId: string; stats: Stats }) {
  return <div className="bot-stats">
    <p>За 7 дней: вопросов на вашем сайте: {stats.questions_7d}, из них «не знаю»: {stats.dont_know_7d}.</p>
    <p className="job-detail">Вопросы из виджета и демо. Песочница не учитывается.</p>
    <a href={`#add-source-${botId}`}>Добавить источник</a>
  </div>;
}
