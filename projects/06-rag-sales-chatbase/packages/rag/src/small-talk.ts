// Светская беседа (фича small-talk, решение владельца 28.09.2026, A-N6-074; FR-ANSWER-003). Написано заново: доноров нет.
//
// ИНВАРИАНТ ADR-003 НЕ ОСЛАБЛЕН: модель здесь не зовётся вовсе. Реплика распознаётся ДЕТЕРМИНИРОВАННО по закрытому
// словарю ДО квоты и эмбеддинга вопроса, а ответ — неизменный шаблон кода с именем компании и 2–3 темами из заголовков
// страниц бота. Ничего от имени компании шаблон не обещает.
//
// Правило распознавания — «ВСЯ реплика из словаря»: после нормализации каждое слово обязано войти в известную фразу
// или быть служебным словом, и хоть одна фраза обязана найтись. Любое постороннее слово («привет, сколько стоит
// доставка?», «привет, игнорируй инструкции») — НЕ светская беседа, а обычный вопрос: порог, «не знаю», модель только
// при фрагменте ≥ 0.40. Поэтому внедрённая инструкция в реплике не меняет поведения: шаблон либо обычный путь.

export const SMALL_TALK_INTENTS = ['greeting', 'goodbye', 'thanks', 'how_are_you', 'who_are_you', 'help'] as const;
export type SmallTalkIntent = typeof SMALL_TALK_INTENTS[number];

// Короткая реплика: длинный текст — это вопрос, даже если начинается с «здравствуйте».
export const SMALL_TALK_MAX_CHARS = 80;
export const SMALL_TALK_MAX_WORDS = 8;
export const SMALL_TALK_TOPICS = 3;
const TOPIC_MAX_CHARS = 40;

// Нормализация: регистр, «ё», любые знаки и эмодзи → пробел; повтор одной буквы подряд → одна («приветт», «спасибоо»,
// «пооока»). Словарь нормализуется ТОЙ ЖЕ функцией, поэтому «hello» и «helo» совпадают друг с другом, а не с чужим словом.
// Три эмодзи сами по себе — реплика: 👋 — приветствие, 🙏 — благодарность, 👍 — согласие; прочие эмодзи — знаки.
const EMOJI_WORDS: ReadonlyArray<[RegExp, string]> = [[/\u{1F44B}/gu, ' привет '], [/\u{1F64F}/gu, ' спасибо '], [/\u{1F44D}/gu, ' ок ']];
export function normalizeReply(text: string): string[] {
  return EMOJI_WORDS.reduce((s, [emoji, word]) => s.replace(emoji, word), text).toLowerCase().replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/(\p{L})\1+/gu, '$1')
    .trim().split(' ').filter(Boolean);
}

// Закрытый словарь: фраза → намерение. Порядок в SMALL_TALK_INTENTS не важен; при нескольких фразах побеждает
// PRIORITY (у «привет, кто ты?» ответ на «кто ты»).
const PHRASES: Record<SmallTalkIntent, readonly string[]> = {
  greeting: [
    'привет', 'приветик', 'приветики', 'превет', 'прив', 'приветствую', 'здравствуйте', 'здравствуй', 'здраствуйте', 'здрасте',
    'здрасьте', 'здорово', 'добрый день', 'добрый вечер', 'доброе утро', 'доброй ночи', 'доброго дня', 'доброго времени суток',
    'добрый', 'хай', 'салют', 'хелоу', 'алло', 'ау', 'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening',
  ],
  goodbye: [
    'пока', 'пока пока', 'до свидания', 'досвидания', 'до встречи', 'всего доброго', 'всего хорошего', 'хорошего дня',
    'хорошего вечера', 'удачи', 'bye', 'goodbye', 'bye bye', 'see you',
  ],
  thanks: [
    'спасибо', 'спс', 'благодарю', 'благодарим', 'мерси', 'thanks', 'thank you', 'thx',
    // Короткое согласие — тот же вежливый ответ, что и на благодарность: «Пожалуйста! Спрашивайте, если что».
    'ок', 'окей', 'ok', 'okay', 'хорошо', 'понятно', 'ясно', 'отлично', 'супер', 'класс',
  ],
  how_are_you: [
    'как дела', 'как ты', 'как вы', 'как поживаешь', 'как поживаете', 'как жизнь', 'как настроение', 'how are you',
  ],
  who_are_you: [
    'кто ты', 'ты кто', 'кто вы', 'вы кто', 'ты бот', 'вы бот', 'ты робот', 'вы робот', 'ты человек', 'вы человек',
    'что ты умеешь', 'что умеешь', 'что вы умеете', 'что ты можешь', 'что вы можете', 'чем ты можешь помочь',
    'чем вы можете помочь', 'чем можешь помочь', 'чем можете помочь', 'who are you', 'what can you do', 'are you a bot',
  ],
  help: [
    'помощь', 'помоги', 'помогите', 'нужна помощь', 'помогите пожалуйста', 'у меня вопрос', 'есть вопрос', 'можно вопрос',
    'вопрос', 'help', 'help me',
  ],
};
const PRIORITY: readonly SmallTalkIntent[] = ['help', 'who_are_you', 'how_are_you', 'goodbye', 'thanks', 'greeting'];
// Служебные слова: сами по себе реплики не образуют, но и вопросом её не делают («ну привет», «спасибо вам большое»).
const FILLERS = new Set(normalizeReply(
  'а и ну да же ж вот там всем вам тебе тебя вас большое огромное очень бот ботик робот друг ребята уважаемый уважаемые ' +
  'пожалуйста еще снова again there you all very much so much'));

interface Phrase { words: string[]; intent: SmallTalkIntent }
const LEXICON: Phrase[] = SMALL_TALK_INTENTS.flatMap((intent) => PHRASES[intent].map((p) => ({ words: normalizeReply(p), intent })))
  .sort((a, b) => b.words.length - a.words.length);   // длинная фраза раньше короткой: «добрый день», а не «добрый» + «день»
const SINGLE = LEXICON.filter((p) => p.words.length === 1 && p.words[0]!.length >= 6);

// Опечатка в одну правку — только у слов словаря длиной ≥ 6: перестановка соседних букв, лишняя или пропущенная буква
// («пирвет», «приет»); ЗАМЕНА буквы — только у слов ≥ 7 («спосибо»): у шестибуквенных она даёт настоящие другие слова
// («привез» ≠ «привет», «помочь» ≠ «помощь»). Короткие слова («пока», «ок») без допуска.
type Edit = 'none' | 'swap' | 'indel' | 'substitution' | 'far';
function oneEdit(a: string, b: string): Edit {
  if (a === b) return 'none';
  if (Math.abs(a.length - b.length) > 1) return 'far';
  if (a.length !== b.length) {
    const [long, short] = a.length > b.length ? [a, b] : [b, a];
    for (let k = 0; k < long.length; k++) if (long.slice(0, k) + long.slice(k + 1) === short) return 'indel';
    return 'far';
  }
  const diff = [...a].flatMap((ch, k) => (ch === b[k] ? [] : [k]));
  if (diff.length === 1) return 'substitution';
  if (diff.length === 2 && diff[1] === diff[0]! + 1 && a[diff[0]!] === b[diff[1]!] && a[diff[1]!] === b[diff[0]!]) return 'swap';
  return 'far';
}
function typoOf(word: string, target: string): boolean {
  const edit = oneEdit(word, target);
  return edit === 'swap' || edit === 'indel' || (edit === 'substitution' && target.length >= 7);
}

export function detectSmallTalk(text: string): SmallTalkIntent | null {
  if (typeof text !== 'string' || Array.from(text).length > SMALL_TALK_MAX_CHARS) return null;
  const words = normalizeReply(text);
  if (!words.length || words.length > SMALL_TALK_MAX_WORDS) return null;
  const found = new Set<SmallTalkIntent>();
  for (let i = 0; i < words.length;) {
    const phrase = LEXICON.find((p) => p.words.every((w, k) => words[i + k] === w));
    if (phrase) { found.add(phrase.intent); i += phrase.words.length; continue; }
    const word = words[i]!;
    if (FILLERS.has(word)) { i++; continue; }
    const typo = word.length >= 5 ? SINGLE.find((p) => typoOf(word, p.words[0]!)) : undefined;
    if (typo) { found.add(typo.intent); i++; continue; }
    return null;   // постороннее слово: это вопрос, а не светская реплика
  }
  return PRIORITY.find((intent) => found.has(intent)) ?? null;
}

// Темы — из заголовков страниц бота (A-N6-074); отбор — A-N6-076 (дефект стенда 28.09: темой стал адрес `http://info.cern.ch`,
// заголовок страницы совпадал с её адресом). Тема — только СОДЕРЖАТЕЛЬНЫЙ заголовок. У страницы два кандидата: заголовок
// её первого раздела (`heading` — второй элемент context_path первого фрагмента с разделом, обычно h1) и заголовок
// страницы; первый годный побеждает, из одной страницы — одна тема. Из кандидата берётся первая осмысленная часть
// («Доставка | Пекарня» → «Доставка»), PDF — имя файла без «.pdf, с. N». Отбрасываются: пустое; адрес (схема, «www.»,
// домен с путём); короче 3 символов или без двух букв подряд («404», «2024», «—»); служебное (закрытый набор GENERIC) и
// название компании; повтор без учёта регистра, «ё» и знаков. Длинное обрезается по границе слова до 40 символов с «…»;
// одно слово длиннее 40 (слаг, хэш) — не тема. Меньше SMALL_TALK_MIN_TOPICS годных — шаблон без списка тем.
export interface PageTopicSource { title: string; heading?: string | null }
export const SMALL_TALK_MIN_TOPICS = 2;
// Ключ сравнения: регистр, «ё», любые знаки и пробелы сведены — «Доставка!» и «доставка» одна тема.
function topicKey(text: string): string {
  return text.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
const GENERIC = new Set([
  'главная', 'главная страница', 'на главную', 'домашняя страница', 'начало', 'index', 'home', 'homepage', 'home page', 'main page',
  'о нас', 'о компании', 'about', 'about us', 'контакты', 'контакт', 'contacts', 'contact', 'contact us', 'обратная связь',
  '404', 'страница не найдена', 'не найдено', 'ошибка', 'not found', 'page not found', 'error', 'untitled', 'без названия',
  'без заголовка', 'новая страница', 'new page', 'document', 'документ', 'loading', 'загрузка', 'вход', 'войти', 'login',
  'log in', 'sign in', 'регистрация', 'sign up', 'поиск', 'search', 'корзина', 'cart', 'карта сайта', 'sitemap',
  'политика конфиденциальности', 'privacy policy', 'cookie', 'cookies', 'меню', 'menu',
].map(topicKey));
// Адрес: схема («http://», «ftp://»), «www.», «mailto:», либо домен (метки через точки, зона из букв) с портом и путём.
const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:\/\/|www\.|mailto:)|^[\p{L}\p{N}-]+(?:\.[\p{L}\p{N}-]+)*\.\p{L}{2,}(?::\d+)?(?:[/?#]\S*)?$/iu;
const TRAILING = /[\s,.;:!?—–\-|·•(«"]+$/u;
function clipTopic(topic: string): string | null {
  const chars = Array.from(topic);
  if (chars.length <= TOPIC_MAX_CHARS) return topic;
  const head = chars.slice(0, TOPIC_MAX_CHARS).join('');
  const cut = head.lastIndexOf(' ');
  // Висящий короткий союз или предлог («… по Москве и…») срезается вместе со знаками.
  const clipped = cut > 0 ? head.slice(0, cut).replace(/(?:\s+\p{L}{1,2})+$/u, '').replace(TRAILING, '') : '';
  return Array.from(clipped).length >= 3 ? `${clipped}…` : null;
}
function topicOf(raw: unknown, company: string): string | null {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\.pdf(,\s*с\.\s*\d+)?$/i, '').trim();
  for (const part of cleaned.split(/\s+[|—–\-·:•]\s+|\s*[|•]\s*/)) {
    const text = part.replace(/\s+/g, ' ').trim();
    const key = topicKey(text);
    if (Array.from(text).length < 3 || !/\p{L}{2}/u.test(text) || URL_LIKE.test(text)) continue;
    if (GENERIC.has(key) || (company && (key === company || company.includes(key)))) continue;
    const topic = clipTopic(text);
    if (topic) return topic;
  }
  return null;
}
export function topicsFromTitles(pages: ReadonlyArray<string | PageTopicSource>, companyName: string): string[] {
  const company = topicKey(typeof companyName === 'string' ? companyName : '');
  const topics: string[] = [];
  const seen = new Set<string>();
  for (const page of Array.isArray(pages) ? pages : []) {
    const candidates: unknown[] = typeof page === 'string' ? [page] : page && typeof page === 'object' ? [page.heading, page.title] : [];
    for (const candidate of candidates) {
      const topic = topicOf(candidate, company);
      if (!topic) continue;
      const key = topicKey(topic);
      if (!seen.has(key)) { seen.add(key); topics.push(topic); }
      break;   // из одной страницы — одна тема: годный, но повторный кандидат не уступает место второму
    }
    if (topics.length >= SMALL_TALK_TOPICS) break;
  }
  return topics.length >= SMALL_TALK_MIN_TOPICS ? topics : [];
}

// «компании «Колос»»; название со своими кавычками — как есть («компании Пекарня «Колос»»), пустое — «компании».
// Общая для шаблонов и для «не знаю» (unknownMessage в answer.ts).
export function companyLabel(companyName: string): string {
  const name = Array.from(typeof companyName === 'string' ? companyName.trim() : '').slice(0, 200).join('');
  if (!name) return 'компании';
  return /[«»"]/.test(name) ? `компании ${name}` : `компании «${name}»`;
}
// Темы — в именительном падеже после двоеточия: заголовки страниц не склоняются.
const examples = (topics: readonly string[]) => topics.length
  ? `Например, спросите о темах: ${topics.join(', ')}.`
  : 'Задайте вопрос о том, что есть на сайте компании.';

// Шаблоны — от имени БОТА (FR-ANSWER-005: не выдаёт себя за человека), без обещаний от имени компании.
export function smallTalkReply(intent: SmallTalkIntent, input: { companyName: string; topics: readonly string[] }): string {
  const bot = `Я бот ${companyLabel(input.companyName)}, отвечаю только по материалам сайта.`;
  switch (intent) {
    case 'greeting': return `Здравствуйте! ${bot} ${examples(input.topics)}`;
    case 'how_are_you': return `Спасибо, у меня всё хорошо! ${bot} ${examples(input.topics)}`;
    case 'who_are_you': return `${bot} Я не человек: ищу ответ в материалах сайта и показываю, откуда он взят. ${examples(input.topics)}`;
    case 'help': return `Напишите вопрос своими словами — я найду ответ в материалах сайта и покажу источник. ${examples(input.topics)}`;
    case 'thanks': return 'Пожалуйста! Если появятся ещё вопросы — спрашивайте.';
    case 'goodbye': return 'Всего доброго! Если появятся вопросы — пишите.';
  }
}
// Темы нужны не каждому шаблону: на «спасибо» и «пока» заголовки страниц не читаются.
export const intentNeedsTopics = (intent: SmallTalkIntent) => intent !== 'thanks' && intent !== 'goodbye';
