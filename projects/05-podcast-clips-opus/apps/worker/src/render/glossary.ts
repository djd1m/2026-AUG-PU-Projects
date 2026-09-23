// Словарь терминов: английские названия, услышанные распознавателем на слух (FR-4).
//
// Заслужено жалобой владельца 23.09.2026: «качество и оформление транскрипта плохое, особенно
// когда английские слова обозначаются русскими буквами». В его записи одно и то же название
// писалось двумя способами — «Велоклауд» и «Виллоклауд», — то есть страдала ещё и однородность.
//
// ПОЧЕМУ ЗАМЕНОЙ, А НЕ ПОДСКАЗКОЙ МОДЕЛИ. У Whisper есть поле словаря, и это был бы более честный
// путь. Проверено опытом 23.09.2026 на 30 секундах живого звука: поставщик поле ИГНОРИРУЕТ —
// «Виллоклауда» осталось и с подсказкой, и без. Вдобавок вариант с подсказкой дописал выдуманное
// «субтитры сделал DimaTorzok», чего в звуке нет. Рычаг остался один.
//
// ЦЕНА РЕШЕНИЯ НАЗВАНА: это правка того, что человек сказал. Поэтому словарь МАЛЕНЬКИЙ и
// курируемый, каждая замена пишется в журнал, и применяется он ТОЛЬКО к субтитрам — сохранённая
// расшифровка остаётся нетронутой. Так замену можно отменить, не распознавая заново.

export interface GlossaryEntry { pattern: RegExp; replacement: string }

/**
 * Значения по умолчанию — сетевая и облачная тематика, снятая с настоящей записи владельца.
 * Пополняется под тематику; `N5_GLOSSARY` задаёт замены строкой вида `услышано=правильно;…`.
 */
export const DEFAULT_GLOSSARY: GlossaryEntry[] = [
  { pattern: /^велоклауд\w*$/iu, replacement: 'VeloCloud' },
  { pattern: /^виллоклауд\w*$/iu, replacement: 'VeloCloud' },
  { pattern: /^клауд\w*$/iu, replacement: 'Cloud' },
  { pattern: /^эс-?ди-?вэн\w*$/iu, replacement: 'SD-WAN' },
  { pattern: /^зиро[- ]?тач\w*$/iu, replacement: 'Zero-Touch' },
  { pattern: /^провижининг\w*$/iu, replacement: 'Provisioning' },
  { pattern: /^кубернетес\w*$/iu, replacement: 'Kubernetes' },
  { pattern: /^кубернетис\w*$/iu, replacement: 'Kubernetes' },
  { pattern: /^вмваре$|^вимваре$/iu, replacement: 'VMware' },
  { pattern: /^эм-?пи-?эл-?эс$/iu, replacement: 'MPLS' },
  { pattern: /^файр-?вол\w*$/iu, replacement: 'firewall' },
  { pattern: /^оверлей\w*$/iu, replacement: 'overlay' },
];

export function parseGlossary(raw: string | undefined): GlossaryEntry[] {
  if (!raw?.trim()) return DEFAULT_GLOSSARY;
  const extra: GlossaryEntry[] = [];
  for (const pair of raw.split(';')) {
    const [heard, correct] = pair.split('=').map(s => s.trim());
    // Непригодная пара — пропускается с записью, а не валит рендер: словарь это украшение,
    // а не условие пригодности клипа.
    if (!heard || !correct) { if (pair.trim()) console.warn(JSON.stringify({ event: 'glossary_bad_pair', pair })); continue; }
    extra.push({ pattern: new RegExp(`^${heard.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*$`, 'iu'), replacement: correct });
  }
  return [...extra, ...DEFAULT_GLOSSARY];
}

/**
 * Заменяет одно слово, сохраняя знаки препинания вокруг него.
 * Времена слова НЕ трогаются вовсе: меняется только показываемая строка.
 */
export function applyGlossary(word: string, glossary: GlossaryEntry[] = DEFAULT_GLOSSARY): string {
  const match = /^([^\p{L}\p{N}]*)(.*?)([^\p{L}\p{N}]*)$/u.exec(word);
  if (!match) return word;
  const [, before, core, after] = match;
  if (!core) return word;
  for (const entry of glossary) {
    if (entry.pattern.test(core)) {
      console.info(JSON.stringify({ event: 'glossary_applied', heard: core, shown: entry.replacement }));
      return `${before}${entry.replacement}${after}`;
    }
  }
  return word;
}
