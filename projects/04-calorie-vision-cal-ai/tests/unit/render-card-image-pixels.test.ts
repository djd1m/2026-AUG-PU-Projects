// Пиксельная проверка карточки шеринга — дефект с живого стенда (2026-09-13, «в
// расшаренной копии блюда не видны надписи совершенно»). `render-card-image.test.ts`
// проверяет ТОЛЬКО геометрию (координаты, подгонку ширины) — он читает разметку, а не
// растр, и потому не мог поймать эту находку: `docker exec n4-tarelka-api-1 fc-list | wc -l`
// → `0`. В образе `node:*-slim` нет НИ ОДНОГО шрифта и не установлен `fontconfig` — рисовать
// SVG-текст было нечем, и `sharp`/librsvg молча пропускает глиф без ошибки. Эта проверка
// смотрит на ГОТОВЫЙ JPEG, а не на SVG-разметку (`.claude/rules/embeddable-widget.md`, тот же
// принцип «чужая среда — не своя», перенесённый на «средой без шрифтов» вместо «чужого origin»).
//
// Почему сценарии — ОТДЕЛЬНЫЕ ПРОЦЕССЫ, а не переключение `process.env.FONTCONFIG_FILE`
// внутри одного теста: `fontconfig`, которым пользуется `sharp`, инициализирует своё
// состояние (кэш найденных шрифтов) один раз за процесс — при первом рендере с текстом — и
// дальше НЕ перечитывает `FONTCONFIG_FILE`. Переключение переменной после первого вызова
// ничего не меняет и дало бы тест, зеленеющий при обеих реализациях (то самое нарушение
// `guard-must-be-able-to-fail.md`, которое эта проверка обязана НЕ повторить). Каждый сценарий
// запускает `tests/unit/fixtures/render-card-harness.ts` через `tsx` заново.
//
// ИСПЫТАНИЕ (guard-must-be-able-to-fail): второй тест — не гипотетическая мутация кода, а
// ВОСПРОИЗВЕДЕНИЕ РЕАЛЬНОГО состояния образа ДО этой правки (ноль зарегистрированных
// шрифтов) на ТОМ ЖЕ, уже исправленном коде (с `font-family`). Он использует РОВНО ТЕ ЖЕ
// пороги и РОВНО ТЕ ЖЕ зоны, что и первый тест, и обязан их НЕ пройти — это и есть
// доказательство, что порог различает «текст нарисован» от «текста нет», а не выбран так,
// чтобы совпасть с любым результатом.
//
// Пороги измерены (не «на глаз»): в зоне названия блюда доля ярких пикселей ≈0,11 при
// доступных шрифтах и ≈0,01 без них — на порядок меньше; в плитке числа ≈0,024 против
// ≈0,0007. Пороги 0,03 и 0,005 лежат строго между и разделяют оба случая с запасом (измерено
// локальным прогоном при подготовке этого файла, см. квитанцию фичи).

import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { afterEach, describe, expect, it } from 'vitest';
import { CARD_WIDTH, computeCardGeometry } from '../../apps/api/src/share/render-card-image.js';

const PROJECT_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const HARNESS_SCRIPT = join(PROJECT_ROOT, 'tests/unit/fixtures/render-card-harness.ts');
const SHIPPED_FONTS_DIR = join(PROJECT_ROOT, 'apps/web/public/fonts');

const DISH_NAME_BRIGHT_RATIO_MIN = 0.03;
const TILE_BRIGHT_RATIO_MIN = 0.005;

const cleanupDirs: string[] = [];
afterEach(() => {
  while (cleanupDirs.length > 0) {
    const dir = cleanupDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Изолированный fontconfig: `withShippedFonts=true` регистрирует РОВНО те два файла,
 *  которые кладёт в образ `Dockerfile` (`COPY apps/web/public/fonts/*.ttf`); `false` —
 *  каталог существует, но пуст, то есть РОВНО найденное на стенде состояние. */
function writeFontconfigScenario(workDir: string, withShippedFonts: boolean): string {
  const registeredDir = join(workDir, 'fonts');
  mkdirSync(registeredDir, { recursive: true });
  if (withShippedFonts) {
    cpSync(join(SHIPPED_FONTS_DIR, 'Onest-wght.ttf'), join(registeredDir, 'Onest-wght.ttf'));
    cpSync(join(SHIPPED_FONTS_DIR, 'Unbounded-wght.ttf'), join(registeredDir, 'Unbounded-wght.ttf'));
  }
  const cacheDir = join(workDir, 'cache');
  mkdirSync(cacheDir, { recursive: true });
  const fontsConf = join(workDir, 'fonts.conf');
  writeFileSync(
    fontsConf,
    `<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><dir>${registeredDir}</dir><cachedir>${cacheDir}</cachedir></fontconfig>`,
  );
  return fontsConf;
}

async function brightRatioInRegion(cardPath: string, region: { left: number; top: number; width: number; height: number }): Promise<number> {
  const { data, info } = await sharp(cardPath).extract(region).raw().toBuffer({ resolveWithObject: true });
  let bright = 0;
  const total = info.width * info.height;
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]!;
    const g = data[i + 1]!;
    const b = data[i + 2]!;
    // текст на карточке — белый (#ffffff/#9a9aa5) на тёмном фоне (#101014/#1c1c22);
    // порог заметно выше фона, чтобы не считать JPEG-артефакты сжатия текстом.
    if (r > 150 && g > 150 && b > 150) bright++;
  }
  return bright / total;
}

/** Кэш fontconfig — В ТОМ ЖЕ одноразовом каталоге, что и сцена (см. комментарий ниже). */
function cacheDirOf(workDir: string): string {
  return join(workDir, 'xdg-cache');
}

function renderAndSave(withShippedFonts: boolean): { readonly path: string } {
  const workDir = mkdtempSync(join(tmpdir(), 'n4-share-card-pixels-'));
  cleanupDirs.push(workDir);
  const fontsConf = writeFontconfigScenario(workDir, withShippedFonts);
  mkdirSync(cacheDirOf(workDir), { recursive: true });
  const outPath = join(workDir, 'card.jpg');
  execFileSync('npx', ['tsx', HARNESS_SCRIPT, outPath], {
    cwd: PROJECT_ROOT,
    // МИГАНИЕ, пойманное 17.09.2026: в полном прогоне «без шрифтов» иногда зеленел ложно.
    // `FONTCONFIG_FILE` задаёт СВОЙ список каталогов, но fontconfig вдобавок читает ОБЩИЙ кэш
    // (`$XDG_CACHE_HOME/fontconfig`, иначе `$HOME/.cache`). Соседний тест того же прогона
    // регистрирует настоящие шрифты и наполняет этот кэш — и «пустая» сцена находит их там,
    // текст рисуется, а страж, обязанный покраснеть, зеленеет. Кэш и домашний каталог
    // уводятся в тот же одноразовый рабочий каталог: общего состояния между сценами не
    // остаётся вовсе.
    env: { ...process.env, FONTCONFIG_FILE: fontsConf, XDG_CACHE_HOME: cacheDirOf(workDir), HOME: workDir },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { path: outPath };
}

describe('карточка шеринга: на растре ЕСТЬ видимый текст (не только в SVG-разметке)', () => {
  it(
    'шрифты из образа дают ЗАМЕТНО больше светлых пикселей, чем их отсутствие',
    async () => {
      // СРАВНЕНИЕ ДВУХ РЕНДЕРОВ, а не абсолютный порог. Утверждение стража — «шрифты в образе
      // делают текст видимым», и проверять его надо именно так.
      //
      // Абсолютный порог здесь мигал: 1 отказ на 10 полных прогонов (замерено 17.09.2026).
      // Ветка «без шрифтов» изредка набирала светлых пикселей чуть выше порога — источник
      // нашёлся не полностью, а подбирать порог под наблюдаемый разброс значит подгонять
      // страж под то, что он обязан ловить. Отношение двух рендеров от этого разброса не
      // зависит: если Dockerfile перестанет класть шрифты, обе сцены станут одинаковыми, и
      // отношение схлопнется — страж покраснеет по той самой причине, ради которой написан.
      const geometry = computeCardGeometry();
      const dishNameRegion = { left: 60, top: geometry.heroBaselineY - 120, width: CARD_WIDTH - 120, height: 110 };
      const tileRegion = geometry.tileRects[0]!;
      const tileBox = { left: tileRegion.x, top: tileRegion.y, width: tileRegion.width, height: tileRegion.height };

      const withFonts = renderAndSave(true).path;
      const withoutFonts = renderAndSave(false).path;

      const dishWith = await brightRatioInRegion(withFonts, dishNameRegion);
      const dishWithout = await brightRatioInRegion(withoutFonts, dishNameRegion);
      const tileWith = await brightRatioInRegion(withFonts, tileBox);
      const tileWithout = await brightRatioInRegion(withoutFonts, tileBox);

      // Со шрифтами текст ЕСТЬ: доля светлых пикселей заметна сама по себе.
      expect(dishWith).toBeGreaterThanOrEqual(DISH_NAME_BRIGHT_RATIO_MIN);
      expect(tileWith).toBeGreaterThanOrEqual(TILE_BRIGHT_RATIO_MIN);

      // И она КРАТНО больше, чем без шрифтов, — это и есть проверяемое утверждение.
      expect(dishWith).toBeGreaterThan(dishWithout * 5);
      expect(tileWith).toBeGreaterThan(tileWithout * 5);
    },
    60_000,
  );
});
