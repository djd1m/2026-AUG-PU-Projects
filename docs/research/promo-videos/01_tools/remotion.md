# Remotion

Проверено: 2026-09-29. Всё без ссылки — «не проверено».

## Что это и кто делает

Фреймворк «видео как React»: кадр — чистая функция номера кадра (`useCurrentFrame()`), композиции регистрируются
компонентом `<Composition>`. Рендер: Chrome Headless Shell покадрово + FFmpeg. Делает Remotion AG (Jonny Burger),
репозиторий `remotion-dev/remotion` с 2020-06. [1][2][3]

## Версия, активность

- npm `remotion` / `@remotion/renderer` **4.0.529**, опубликованы 2026-09-25. [4]
- ≈61 тыс. звёзд, последний push 2026-09-28. Проект существует с 2020 года; текущая стабильная ветка 4.x
  (инструкция Docker переведена на 4.0 в мае 2023), релизы регулярные. [3][8]
- Готовится Remotion 5.0 со сменой лицензии (PR #3750, статус Draft на 2026-08-10). [6]

## Лицензия и цена — точно

Лицензия собственная (npm: «SEE LICENSE IN LICENSE.md»), не OSI. [4][5]

**Бесплатно** (в т.ч. коммерчески) для: физлица; коммерческой организации **до 3 сотрудников**; некоммерческой
организации; на время оценки, пока нет коммерческого использования. [5]

**Company License обязательна** для всех остальных коммерческих организаций (4+ человек). Цены [7]:

| План | Цена | Для кого |
|---|---|---|
| Remotion for Creators | $25/мес за место | люди, делающие видео в Remotion |
| Remotion for Automators | $0,01 за рендер, минимум $100/мес | приложения и системы, рендерящие автоматически |
| Enterprise | от $500/мес | индивидуальные условия |

- «Developers working on automation projects do not require a Seat». [7]
- Запрещено продавать/сублицензировать производную Remotion. [5]
- В 5.0 (черновик): **подрядчики учитываются в численности**; условия привязываются к Terms and Conditions; запрет
  на «bring-your-own-code rendering services» для бесплатной лицензии. [6]

**Когда какой план (FAQ лицензии, круг 2) [13]:**
- Creators — «for organizations wanting to produce videos without setting up an automation»: люди пишут код
  Remotion сами или с ИИ-инструментами.
- Automators — когда код «programmatically calls» `renderMedia()`, `renderStill()` или `npx remotion render`:
  «automated video pipelines». Участие агента само по себе Automators не требует; скриптовый пакетный рендер —
  может потребовать.
- Подрядчики, работающие с Remotion в том же проекте, суммируются с численностью команды.

**Три сценария для нас** (юрстатус и способ использования — **уточнить у владельца**):

| Сценарий | Условие | Цена за период работ |
|---|---|---|
| Free | физлицо или компания ≤3 человек вместе с подрядчиками | $0 |
| Creators | компания 4+, агент пишет код, рендер запускается вручную по ролику | $25/мес за место |
| Automators | компания 4+, рендер шести роликов × трёх форматов идёт скриптом-конвейером | $0,01 за рендер, минимум $100/мес |

## Движок и требования

- Системные требования: «at least Node 16 or Bun 1.0.3»; Linux с glibc ≥ 2.35; Alpine и nixOS не поддерживаются.
  Node 20 на хосте формально подходит. [14]
- Chrome Headless Shell (`npx remotion browser ensure`), FFmpeg встроен в пакеты рендера (не проверено для
  4.0.529). GPU не нужен. [8]
- Пример Docker в документации: `FROM node:22-bookworm-slim` + `RUN npx remotion browser ensure` — это выбранный
  базовый образ, не требование. На Linux включать `enableMultiProcessOnLinux`. [8]
- **Разрешённое окружение (круг 2):** контейнер `playwright:v1.60.0-noble` — Ubuntu 24.04, Node v24.15.0 (проверено
  локально). Совместимость Remotion с его Chromium вместо собственного Headless Shell и загрузка Headless Shell в этот
  образ — не проверено, пилот.
- Скорость рендера 60 с на 8 vCPU: официальных цифр для нашей конфигурации не найдено — **не проверено, мерить
  пилотом**.

## Как в кадр попадает живой интерфейс

- **React-компоненты напрямую**: наши N5/N6 на Next.js 15 и React — компоненты и CSS-токены можно импортировать в
  сцену. Серверные компоненты Next и загрузка данных в Remotion не работают — нужны презентационные копии (не
  проверено на наших кодах).
- Запись Playwright как клип: `<OffthreadVideo>`/`<Video>`. В OpenMontage есть готовый навык «playwright-recording …
  for Remotion videos». [9]
- `<IFrame>` есть, но «the website should not have any animations, since only animations using useCurrentFrame() are
  supported». Для живого стенда с анимацией непригоден. [10]

## Русская озвучка и субтитры

- Встроенного TTS нет; голос — внешний файл через `<Audio>` (Piper `ru_RU`, ElevenLabs, OpenAI и др.).
- Субтитры: `@remotion/captions`, `@remotion/install-whisper-cpp` (локальный Whisper.cpp), `@remotion/openai-whisper`,
  `@remotion/elevenlabs` — все 4.0.529. [4]
- Кириллические шрифты: `@remotion/google-fonts` (используется в OpenMontage [9]); Кириллица в конкретных шрифтах —
  не проверено.

## Форматы 9:16 / 16:9 / 1:1

Несколько `<Composition>` с разными `width/height` над одним компонентом; `calculateMetadata` для динамических
размеров (не проверено в этой сессии). Один исходник — три регистрации. Что адаптивная вёрстка сцены выдержит
русский текст и субтитры во всех трёх форматах — не проверено, пилот.

## Агентопригодность

- Официальные Agent Skills: `npx skills add remotion-dev/skills` (11 навыков: композиции, анимации, captions,
  рендер, поиск по документации). [11]
- Официальный плагин Claude Code: `claude plugin marketplace add remotion-dev/claude-code-plugin` →
  `claude plugin install remotion@remotion`. [12]
- TypeScript-типы, огромная документация, много примеров — лучшая «обученность» моделей среди кандидатов (оценка).

## Минимальный пример (по документации [2])

```tsx
import {AbsoluteFill, Composition, interpolate, useCurrentFrame} from 'remotion';

const Title: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 15], [0, 1], {extrapolateRight: 'clamp'});
  return (
    <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', background: '#0a0a0a'}}>
      <h1 style={{color: '#fff', fontSize: 120, opacity}}>Суфлёр</h1>
    </AbsoluteFill>
  );
};

export const Root = () => (
  <Composition id="Title" component={Title} durationInFrames={90} fps={30} width={1920} height={1080} />
);
```

Рендер: `npx remotion render src/index.ts Title out/title.mp4`. (`interpolate`/`AbsoluteFill` — из API Remotion;
пример собран по документации, дословно в ней только `<Composition>` и `useCurrentFrame`.)

## Известные ограничения

- Лицензия с порогом по численности; в 5.0 подрядчики считаются. [5][6]
- Анимации вне `useCurrentFrame()` (CSS-анимации, GSAP без адаптера) не синхронизируются с кадром. [10]
- Работа в разрешённом Playwright-контейнере не проверена. [8][14]

## Источники (проверено 2026-09-29)

1. https://www.remotion.dev
2. https://www.remotion.dev/docs/the-fundamentals
3. https://api.github.com/repos/remotion-dev/remotion (+ `/releases/latest`)
4. https://registry.npmjs.org/remotion, `/@remotion/renderer`, `/@remotion/captions`, `/@remotion/install-whisper-cpp`,
   `/@remotion/openai-whisper`, `/@remotion/elevenlabs`
5. https://raw.githubusercontent.com/remotion-dev/remotion/main/LICENSE.md
6. https://github.com/remotion-dev/remotion/pull/3750
7. https://www.remotion.pro/license
8. https://www.remotion.dev/docs/docker
9. https://github.com/calesthio/OpenMontage — `.claude/skills/playwright-recording/SKILL.md`, `remotion-composer/package.json`
10. https://www.remotion.dev/docs/iframe
11. https://www.remotion.dev/docs/ai/skills
12. https://www.remotion.dev/docs/ai/claude-code-plugin
13. https://www.remotion.dev/docs/license/faq
14. https://www.remotion.dev/docs — системные требования
