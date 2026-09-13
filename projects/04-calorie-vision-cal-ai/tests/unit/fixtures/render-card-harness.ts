// Вспомогательный скрипт для `tests/unit/render-card-image-pixels.test.ts`.
//
// Fontconfig, которым пользуется `sharp`/librsvg, инициализирует своё состояние ОДИН раз за
// процесс и дальше не замечает смену `FONTCONFIG_FILE` — поэтому каждый сценарий («шрифты
// есть» / «шрифтов нет, как в найденном на стенде дефекте») обязан запускаться в ОТДЕЛЬНОМ
// процессе. Этот файл — тело такого процесса: запускается `tsx`, читает путь вывода первым
// аргументом, рендерит карточку с фиксированным реалистичным содержимым и пишет JPEG на диск.
//
// Живёт ВНУТРИ дерева проекта (не во временном каталоге) намеренно: `renderCardImage`
// импортирует `sharp` динамически ОТНОСИТЕЛЬНО СВОЕГО файла (это уже работает откуда угодно),
// а вот прямой `import sharp` в этом файле разрешается относительно ЕГО собственного
// расположения — во временном каталоге `node_modules` не было бы.

import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import type { Kcal, Macro } from '@n4/shared';
import { renderCardImage } from '../../../apps/api/src/share/render-card-image.js';

const outPathArg = process.argv[2];
if (outPathArg === undefined) {
  console.error('usage: render-card-harness.ts <outPath>');
  process.exit(2);
}
const outPath: string = outPathArg;

async function main(): Promise<void> {
  // Фото — крошечный сгенерированный JPEG (сеть не нужна, `fetchImpl` подменяет `fetch`).
  const photoBuf = await sharp({ create: { width: 20, height: 20, channels: 3, background: '#888888' } })
    .jpeg()
    .toBuffer();

  const buf = await renderCardImage(
    {
      dishName: 'Овсянка с ягодами и мёдом',
      kcal: 420 as Kcal,
      proteinG: 12 as Macro,
      fatG: 8 as Macro,
      carbG: 65 as Macro,
      sourceLabel: 'USDA FDC #123456 · 250 г',
      badgeRendered: true,
      photoUrl: 'https://example.invalid/photo.jpg',
    },
    {
      fetchImpl: (async () => new Response(new Uint8Array(photoBuf), { status: 200 })) as unknown as typeof fetch,
    },
  );

  writeFileSync(outPath, buf);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
