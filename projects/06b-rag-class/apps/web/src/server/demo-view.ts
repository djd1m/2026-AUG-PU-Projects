import type { DemoBot } from '@n6b/db';
import { badgeRequired, PRIVACY_NOTICE } from './widget-policy';

export interface DemoView {
  readonly name: string;
  readonly contact: string | null;
  readonly privacy_notice: string;
  readonly badge_required: boolean;
  readonly badge_url: string;
}
/** The browser receives no account IDs, plan state or database authority. */
export function demoView(bot: DemoBot): DemoView {
  return { name: bot.name, contact: bot.contact, privacy_notice: PRIVACY_NOTICE,
    badge_required: badgeRequired(bot.plan, bot.badge_removal), badge_url: `/r/b/${encodeURIComponent(bot.public_id)}` };
}
