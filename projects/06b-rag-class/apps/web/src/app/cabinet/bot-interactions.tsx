'use client';

import { useState } from 'react';
import type { PublicationData } from '@/server/publish-handler';
import { publicationDemoPath } from '@/lib/demo-presentation';
import { Sandbox } from './sandbox';
import { PublishBot } from './publish-bot';

export function BotInteractions({ initial, proposedOrigins }: { initial: PublicationData; proposedOrigins: string[] }) {
  const [demoPath, setDemoPath] = useState(publicationDemoPath(initial));
  return <><Sandbox botId={initial.id} demoPath={demoPath} />
    <PublishBot initial={initial} proposedOrigins={proposedOrigins} onDemoSaved={setDemoPath} /></>;
}
