#!/usr/bin/env node
// Проверка двух неизвестностей ДО написания фич 4 и 5. Обе такие, что документация
// отвечает «поддерживается», а факт устанавливает только вызов.
//
//   Проверка A — таймкоды СЛОВ. ADR-003: результат без words[].start/end отвергается
//     до постановки стадии select. Без слов нарезка невозможна в принципе.
//   Проверка B — СТРОГОЕ соблюдение схемы. У Sonnet 5 на OpenRouter строгие только
//     2 эндпоинта из 10; без закрепления поставщика схема становится пожеланием.
//
// Ключ читается из файла вне репозитория и в вывод НЕ попадает ни при каком исходе.
// Каждая проверка печатает, что именно наблюдалось, а не вердикт «ок».
//
//   node scripts/openrouter-probe.mjs            # обе проверки
//   node scripts/openrouter-probe.mjs stt        # только A
//   node scripts/openrouter-probe.mjs schema     # только B

import { readFileSync } from 'node:fs';

const KEY_FILE = process.env.N5_OPENROUTER_ENV ?? '/root/.config/n5/openrouter.env';
const BASE = 'https://openrouter.ai/api/v1';

function readKey() {
  let raw;
  try {
    raw = readFileSync(KEY_FILE, 'utf8');
  } catch (error) {
    throw new Error(`не прочитан ${KEY_FILE}: ${error.code ?? error.message}. Ключ кладётся туда одной строкой OPENROUTER_API_KEY=...`);
  }
  const line = raw.split('\n').find((l) => l.startsWith('OPENROUTER_API_KEY='));
  const key = line?.slice('OPENROUTER_API_KEY='.length).trim();
  // Пустое и отсутствующее — разные случаи, и оба отказ, а не «ключа нет, поработаем без него».
  if (!key) throw new Error(`${KEY_FILE} есть, но OPENROUTER_API_KEY пуст или не найден`);
  return key;
}

const KEY = readKey();
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };

// Ответ провайдера может быть длинным; печатаем ограниченно, но не молча обрезаем до пустоты.
function brief(value, max = 400) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}… [+${s.length - max} симв.]` : s;
}

async function call(path, body, extraHeaders = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { ...H, ...extraHeaders },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* не-JSON ответ тоже результат наблюдения */ }
  return { status: res.status, json, text };
}

// ─────────────────────────────────────────────────────────────────────────────
// Проверка A. Речь синтезируем тем же ключом — иначе нужен свой файл, а вопрос
// стоит про РУССКИЕ слова, и подсунуть английский образец значило бы проверить не то.
// ─────────────────────────────────────────────────────────────────────────────

const PHRASE = 'Самое важное здесь вот что: решение принимается до того, как появятся данные.';

async function probeStt() {
  console.log('\n=== A. Таймкоды слов ===');
  console.log(`фраза: «${PHRASE}»`);

  console.log('\n[A1] синтез речи (OpenRouter /audio/speech)');
  const speech = await call('/audio/speech', {
    model: 'openai/gpt-4o-mini-tts',
    input: PHRASE,
    voice: 'alloy',
    response_format: 'mp3',
  });
  if (speech.status !== 200) {
    console.log(`  ОТКАЗ ${speech.status}: ${brief(speech.json ?? speech.text)}`);
    console.log('  → синтез не обязателен для вывода: положите свой короткий файл и передайте путь');
    console.log('     N5_PROBE_AUDIO=/путь/к/файлу.mp3 node scripts/openrouter-probe.mjs stt');
  }

  let audioB64 = null;
  if (process.env.N5_PROBE_AUDIO) {
    audioB64 = readFileSync(process.env.N5_PROBE_AUDIO).toString('base64');
    console.log(`  взят файл из N5_PROBE_AUDIO (${audioB64.length} симв. base64)`);
  } else if (speech.status === 200) {
    audioB64 = speech.json?.audio ?? speech.json?.data ?? null;
    if (!audioB64) {
      console.log(`  ответ 200, но поля со звуком нет; ключи ответа: ${Object.keys(speech.json ?? {}).join(', ') || '—'}`);
    } else {
      console.log(`  получено ${String(audioB64).length} симв. base64`);
    }
  }
  if (!audioB64) { console.log('  A ПРЕРВАНА: звука нет — это не «слов нет», а «проверка не выполнена»'); return; }

  // Провайдер закрепляется явно: слова поддерживают только OpenAI-совместимые
  // (OpenAI, Groq, Together), остальные отвечают 400. Без закрепления попадание случайно.
  for (const [model, provider] of [
    ['openai/whisper-large-v3', 'Together'],
    ['openai/whisper-large-v3', 'Groq'],
    ['openai/whisper-1', 'OpenAI'],
  ]) {
    console.log(`\n[A2] ${model} @ ${provider}, verbose_json + timestamp_granularities:["word"]`);
    const r = await call('/audio/transcriptions', {
      model,
      audio: audioB64,
      response_format: 'verbose_json',
      timestamp_granularities: ['word'],
      language: 'ru',
      provider: { only: [provider], allow_fallbacks: false },
    });
    if (r.status !== 200) { console.log(`  ОТКАЗ ${r.status}: ${brief(r.json?.error ?? r.text, 220)}`); continue; }
    const words = r.json?.words;
    if (!Array.isArray(words) || words.length === 0) {
      console.log(`  200, но words нет. Поля ответа: ${Object.keys(r.json ?? {}).join(', ')}`);
      console.log(`  → это ОТКАЗ по ADR-003, а не мелочь формата`);
      continue;
    }
    const bad = words.filter((w) => typeof w.start !== 'number' || typeof w.end !== 'number');
    console.log(`  words: ${words.length}, без start/end: ${bad.length}`);
    console.log(`  первые три: ${brief(words.slice(0, 3))}`);
    console.log(`  текст: ${brief(r.json.text, 160)}`);
    console.log(bad.length === 0 ? '  ГОДЕН: у каждого слова есть начало и конец' : '  НЕ ГОДЕН: есть слова без границ');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Проверка B. Схема — настоящая: три компонента 0–33, объяснение у каждого непустое,
// длина 20,0–75,0 с. Проверяем не «похоже на JSON», а выполнение КАЖДОГО ограничения.
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['fragments'],
  properties: {
    fragments: {
      type: 'array', minItems: 3, maxItems: 8,
      items: {
        type: 'object', additionalProperties: false,
        required: ['start_seconds', 'end_seconds', 'title', 'score_hook', 'explain_hook',
                   'score_completeness', 'explain_completeness', 'score_length', 'explain_length'],
        properties: {
          start_seconds: { type: 'number' },
          end_seconds: { type: 'number' },
          title: { type: 'string', minLength: 1 },
          score_hook: { type: 'integer', minimum: 0, maximum: 33 },
          explain_hook: { type: 'string', minLength: 1 },
          score_completeness: { type: 'integer', minimum: 0, maximum: 33 },
          explain_completeness: { type: 'string', minLength: 1 },
          score_length: { type: 'integer', minimum: 0, maximum: 33 },
          explain_length: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

const TRANSCRIPT = [
  '[0.0-12.4] Добрый день, рад вас видеть, сегодня у нас непростая тема, и я думаю она многих заденет.',
  '[12.4-48.0] Главная ошибка, которую делают почти все: они выбирают инструмент раньше, чем формулируют задачу. Звучит банально, но посмотрите на любой провалившийся проект — там всегда сначала купили технологию, а потом искали, куда её приложить.',
  '[48.0-95.0] У меня был случай: команда полгода строила систему рекомендаций, а выяснилось, что пользователю нужен был обычный поиск по названию. Полгода работы, и всё выбросили. Причём каждый отдельный инженер работал хорошо.',
  '[95.0-140.0] Поэтому первое, что я спрашиваю: какое решение человек примет по вашему результату? Если ответа нет — считать нечего, и вся аналитика будет украшением.',
  '[140.0-190.0] И вот отсюда простое правило: сначала опишите решение, потом метрику, и только потом инструмент. В таком порядке, и никак иначе.',
].join('\n');

const PROMPT = `Ты выделяешь самодостаточные фрагменты из расшифровки подкаста для вертикальных коротких клипов.

Расшифровка с таймкодами:
${TRANSCRIPT}

Выдели от 3 до 8 фрагментов. Каждый:
— длится от 20,0 до 75,0 секунд (end_seconds минус start_seconds);
— понятен БЕЗ контекста остального выпуска;
— границы берутся из таймкодов выше.

Оцени каждый тремя компонентами, каждый целым числом от 0 до 33, и к каждому дай непустое объяснение по-русски:
score_hook — цепляет ли первая фраза; score_completeness — самодостаточен ли; score_length — уместна ли длина.`;

function validate(payload) {
  const problems = [];
  const frs = payload?.fragments;
  if (!Array.isArray(frs)) return ['нет массива fragments'];
  if (frs.length < 3 || frs.length > 8) problems.push(`фрагментов ${frs.length}, требуется 3–8`);
  frs.forEach((f, i) => {
    const dur = Number(f.end_seconds) - Number(f.start_seconds);
    if (!(dur >= 20 && dur <= 75)) problems.push(`#${i}: длина ${dur.toFixed(1)} с вне 20,0–75,0`);
    for (const k of ['score_hook', 'score_completeness', 'score_length']) {
      const v = f[k];
      if (!Number.isInteger(v) || v < 0 || v > 33) problems.push(`#${i}: ${k}=${v} вне 0–33 или не целое`);
    }
    for (const k of ['explain_hook', 'explain_completeness', 'explain_length']) {
      if (typeof f[k] !== 'string' || f[k].trim() === '') problems.push(`#${i}: ${k} пусто`);
    }
  });
  return problems;
}

const CANDIDATES = [
  ['anthropic/claude-sonnet-5', ['Anthropic', 'Claude Platform on AWS']],
  ['google/gemini-3.8-flash', null],
  ['deepseek/deepseek-v4-flash', null],
];

async function probeSchema() {
  console.log('\n=== B. Строгое соблюдение схемы ===');
  for (const [model, providers] of CANDIDATES) {
    console.log(`\n[B] ${model}${providers ? ` (поставщик закреплён: ${providers.join(' / ')})` : ' (поставщик не закреплён)'}`);
    const t0 = Date.now();
    const r = await call('/chat/completions', {
      model,
      messages: [{ role: 'user', content: PROMPT }],
      response_format: { type: 'json_schema', json_schema: { name: 'fragments', strict: true, schema: SCHEMA } },
      max_tokens: 4000,
      ...(providers ? { provider: { only: providers, allow_fallbacks: false, require_parameters: true } } : { provider: { require_parameters: true } }),
    });
    const ms = Date.now() - t0;
    if (r.status !== 200) { console.log(`  ОТКАЗ ${r.status} за ${ms} мс: ${brief(r.json?.error ?? r.text, 260)}`); continue; }

    const served = r.json?.provider ?? '—';
    const usage = r.json?.usage ?? {};
    const content = r.json?.choices?.[0]?.message?.content;
    console.log(`  ответил за ${ms} мс | фактический поставщик: ${served} | токены вход/выход: ${usage.prompt_tokens ?? '?'}/${usage.completion_tokens ?? '?'}`);

    let parsed = null;
    try { parsed = JSON.parse(content); }
    catch { console.log(`  НЕ JSON — схема НЕ соблюдена. Начало: ${brief(content, 200)}`); continue; }

    const problems = validate(parsed);
    console.log(`  фрагментов: ${parsed?.fragments?.length ?? '—'}`);
    if (problems.length === 0) {
      console.log('  СХЕМА СОБЛЮДЕНА полностью, включая диапазоны и непустые объяснения');
    } else {
      console.log(`  НАРУШЕНИЙ ${problems.length}:`);
      for (const p of problems.slice(0, 8)) console.log(`    · ${p}`);
    }
    const first = parsed?.fragments?.[0];
    if (first) console.log(`  первый фрагмент: ${first.start_seconds}–${first.end_seconds} с · «${brief(first.title, 70)}» · ${brief(first.explain_hook, 110)}`);
  }
}

const what = process.argv[2] ?? 'all';
if (what === 'all' || what === 'stt') await probeStt();
if (what === 'all' || what === 'schema') await probeSchema();
console.log('\nготово. Ни один вывод выше не содержит ключа.');
