#!/usr/bin/env node
'use strict';
/**
 * check-dangling-refs.cjs — текст ссылается на файл, которого нет?
 *
 * NOT an event hook. Как `check-look-trace.cjs` и соседи, лежит здесь потому, что каталог уже несёт
 * простые утилиты на Node; в `settings.json` он не зарегистрирован и потому вправе отказывать
 * ненулевым кодом.
 *
 * ─── ЗАЧЕМ ───────────────────────────────────────────────────────────────────
 * Один класс дефекта ловился вручную минимум четыре раза: список хуков называл 4 из 8; таблица
 * говорила «Rules 5» при шести; справка обещала 18 видов отказа при 17 в массиве; путь вывода
 * называл каталог, которого не бывает. Форма всегда одна — ТЕКСТ ССЫЛАЕТСЯ НА ОБЪЕКТ, КОТОРОГО НЕТ,
 * и ни одна застава об этом не спрашивала. `verify` спросить не может по построению: он обходит
 * зарегистрированные КОМПОНЕНТЫ и проверяет их наличие, то есть идёт от объекта к тексту, а не от
 * текста к объекту.
 *
 * ─── ЧТО ОН ДЕЛАЕТ, И ЧЕГО НЕ ДЕЛАЕТ ─────────────────────────────────────────
 * Обходит отгружаемые `*.md`, вытаскивает ссылки вида `` `.claude/<путь>` `` на файлы с известными
 * расширениями и проверяет существование цели. Он НЕ разбирает прозу и НЕ угадывает намерение:
 * ссылка засчитывается, только если она в обратных кавычках и оканчивается на расширение из списка.
 * Ссылка на каталог не проверяется вовсе — каталог может создаваться в работе.
 *
 * ─── ПОЧЕМУ БАЗА, А НЕ ПРОСТО ОТКАЗ ──────────────────────────────────────────
 * ИЗМЕРЕНО 2026-09-03 на свежем дереве: 58 висячих ссылок в 23 файлах, и они не появляются после
 * `init` — проверено на пустом проекте. Отказать на всех значило бы отказать каждому проекту прямо
 * сейчас, то есть выключить заставу в первый же день. Поэтому база ЗАКРЕПЛЕНА числом и может только
 * УМЕНЬШАТЬСЯ: новая висячая ссылка даёт отказ, а починка старой обязана уменьшить базу, иначе
 * тест краснеет. Это тот же приём, которым в пакете уже ретирован `Final_Summary.md`: сообщаем,
 * пока не решили, но фиксируем состояние датой и не даём ему ухудшаться.
 *
 * Коды: 0 — не хуже базы · 1 — база превышена (названы новые) · 2 — не удалось установить.
 */

const fs = require('node:fs');
const path = require('node:path');

/** ИЗМЕРЕНО 2026-09-03 на снимке дерева; может только уменьшаться. */
const BASELINE = 58;

const REF = /`(\.claude\/[A-Za-z0-9_\-./]+\.(?:cjs|mjs|js|sh|md|json|yaml|yml))`/g;

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}

/** Pure half: given a root holding `.claude/`, return every dangling reference found. */
function danglingRefs(root) {
  const base = path.join(root, '.claude');
  if (!fs.existsSync(base)) return null; // не установлено — код 2, а не «чисто»
  const out = [];
  for (const file of walk(base)) {
    if (!file.endsWith('.md')) continue;
    const src = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = REF.exec(src))) {
      const target = path.join(root, m[1]);
      if (!fs.existsSync(target)) out.push({ from: path.relative(root, file), to: m[1] });
    }
  }
  return out;
}

function main(argv) {
  const root = argv[2] || process.cwd();
  const found = danglingRefs(root);
  if (found === null) {
    console.error(`НЕ УСТАНОВЛЕНО: каталог .claude не найден в ${root} — проверка не выполнялась, и это не «чисто»`);
    return 2;
  }
  const unique = [...new Set(found.map((f) => `${f.from} → ${f.to}`))];
  if (unique.length > BASELINE) {
    console.error(`❌ висячих ссылок ${unique.length} при базе ${BASELINE} — текст обещает файлы, которых нет:`);
    unique.slice(0, 20).forEach((u) => console.error(`   ${u}`));
    if (unique.length > 20) console.error(`   … и ещё ${unique.length - 20}`);
    return 1;
  }
  console.log(`✅ висячих ссылок ${unique.length}, база ${BASELINE} — не хуже. Проверено файлов: ${walk(path.join(root, '.claude')).filter((f) => f.endsWith('.md')).length}`);
  if (unique.length < BASELINE) {
    console.log(`   База устарела в лучшую сторону: опустите BASELINE до ${unique.length}, чтобы достижение закрепилось.`);
  }
  return 0;
}

module.exports = { danglingRefs, BASELINE, REF };
if (require.main === module) process.exit(main(process.argv));
