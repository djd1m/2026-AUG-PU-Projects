// FR-014 — импорт отзывов из CSV.
//
// Главный инвариант: импорт НЕ вторая дверь. Строка из файла проходит ту же валидацию, что
// строка из формы, и это проверяется стражем по исходнику — потому что «та же функция» есть
// свойство ВСЕХ путей кода, включая те, которых сегодня нет.

import { afterAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.BASE_URL = 'https://proofwall.test';

const { withService, withAccount, closePool } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const {
  parseCsv, parseCsvRecords, detectDelimiter, importRows, importFingerprint,
  MAX_IMPORT_ROWS, MAX_IMPORT_BODY, TooManyRecordsError,
} = await import('../src/lib/csv-import');
const { NAME_MAX, TEXT_MAX, ROLE_MAX } = await import('../src/lib/testimonial');

afterAll(async () => { await closePool(); });

const SRC = path.resolve(__dirname, '../src');
const strip = (c: string) => c.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (rel: string) => strip(readFileSync(path.resolve(SRC, rel), 'utf8'));

let seq = 0;
const RUN = Date.now().toString(36);
const MAP = { name: 0, text: 1, role: 2 };

async function makeOwner(): Promise<{ accountId: string; projectId: string }> {
  seq += 1;
  const slug = `imp-${RUN}-${seq}`;
  const r = await withService((c) => registerAccountAndProject(c, {
    email: `${slug}@example.com`, password: 'correct-horse-battery',
    desired_slug: slug, project_name: 'Импорт',
  }));
  if (!r.ok) throw new Error(JSON.stringify(r.body));
  const { rows } = await withService((c) => c.query<{ aid: string; pid: string }>(
    `select a.id as aid, p.id as pid from accounts a join projects p on p.account_id = a.id
      where a.email = $1`, [`${slug}@example.com`]));
  return { accountId: rows[0]!.aid, projectId: rows[0]!.pid };
}

const countRows = (projectId: string) => withService(async (c) => {
  const { rows } = await c.query<{ n: string }>(
    'select count(*)::text as n from testimonials where project_id = $1', [projectId]);
  return Number(rows[0]!.n);
});

const CSV_OK = [
  'name,text,role',
  'Анна Петрова,Отличный сервис и быстрая поддержка,Директор',
  'Борис Иванов,Пользуемся третий год и очень довольны,CTO',
].join('\n');

// ─────────────────────────────────────────────────────────────────────────────
describe('AC-014.1 / AC-014.2 — предпросмотр не пишет, запись пишет pending+import', () => {
  it('разбор НЕ имеет доступа к БД: ноль записей после parseCsv', async () => {
    const o = await makeOwner();
    const before = await countRows(o.projectId);
    const r = parseCsv(CSV_OK, MAP);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rows.length).toBe(2);
    // Падает при: дать parseCsv доступ к client и писать в нём.
    expect(await countRows(o.projectId), 'предпросмотр записал в БД').toBe(before);
  });

  it('запись создаёт отзывы со статусом pending и источником import', async () => {
    const o = await makeOwner();
    const r = parseCsv(CSV_OK, MAP);
    if (!r.ok) throw new Error(r.error);
    const n = await withAccount(o.accountId, (c) => importRows(c, o.projectId, r.rows));
    expect(n).toBe(2);

    const { rows } = await withService((c) => c.query<{ status: string; source: string }>(
      'select status, source from testimonials where project_id = $1', [o.projectId]));
    expect(rows.length).toBe(2);
    // Падает при: поставить approved — импортированное миновало бы модерацию.
    for (const row of rows) {
      expect(row.status).toBe('pending');
      expect(row.source).toBe('import');
    }
  });
});

describe('AC-014.3 / AC-014.9 / AC-014.10 — идемпотентность', () => {
  it('повторный импорт того же не создаёт дублей и НЕ падает', async () => {
    const o = await makeOwner();
    const r = parseCsv(CSV_OK, MAP);
    if (!r.ok) throw new Error(r.error);
    expect(await withAccount(o.accountId, (c) => importRows(c, o.projectId, r.rows))).toBe(2);
    // Падает при: убрать on conflict do nothing — второй импорт бросит ошибку уникальности.
    expect(await withAccount(o.accountId, (c) => importRows(c, o.projectId, r.rows))).toBe(0);
    expect(await countRows(o.projectId)).toBe(2);
  });

  it('строки, отличающиеся только пробелами по краям, — одна строка', async () => {
    const o = await makeOwner();
    const a = parseCsv(CSV_OK, MAP);
    const b = parseCsv(CSV_OK.replace('Анна Петрова', '  Анна Петрова  '), MAP);
    if (!a.ok || !b.ok) throw new Error('разбор не удался');
    await withAccount(o.accountId, (c) => importRows(c, o.projectId, a.rows));
    // Падает при: не нормализовать перед отпечатком.
    expect(await withAccount(o.accountId, (c) => importRows(c, o.projectId, b.rows)),
      'та же строка с пробелами создала дубль').toBe(0);
  });

  it('отзыв из ФОРМЫ импорт дублем не считает и не трогает', async () => {
    const o = await makeOwner();
    // Отзыв из формы: отпечатка нет (NULL).
    await withService((c) => c.query(
      `insert into testimonials (project_id, author_name, text, status)
       values ($1, 'Анна Петрова', 'Отличный сервис и быстрая поддержка', 'approved')`,
      [o.projectId]));
    const r = parseCsv(CSV_OK, MAP);
    if (!r.ok) throw new Error(r.error);
    // Падает при: брать отпечаток и с формы тоже — импорт счёл бы это дублем и пропустил.
    expect(await withAccount(o.accountId, (c) => importRows(c, o.projectId, r.rows))).toBe(2);
    expect(await countRows(o.projectId)).toBe(3);
  });

  it('КОНКУРЕНТНО: два одновременных импорта дают N, а не 2N', async () => {
    const o = await makeOwner();
    const r = parseCsv(CSV_OK, MAP);
    if (!r.ok) throw new Error(r.error);
    // Последовательный тест не отличает ограничение БД от проверки-перед-вставкой:
    // разница между ними — ровно окно между чтением и записью, и видно её только здесь.
    const [x, y] = await Promise.all([
      withAccount(o.accountId, (c) => importRows(c, o.projectId, r.rows)),
      withAccount(o.accountId, (c) => importRows(c, o.projectId, r.rows)),
    ]);
    expect(x + y, `вставлено ${x + y}, а строк всего 2`).toBe(2);
    expect(await countRows(o.projectId)).toBe(2);
  });
});

describe('AC-014.6 — импорт в ЧУЖОЙ проект невозможен даже при попытке в коде', () => {
  it('RLS отвергает вставку в чужой проект под ролью владельца', async () => {
    const victim = await makeOwner();
    const actor = await makeOwner();
    const before = await countRows(victim.projectId);

    const r = parseCsv(CSV_OK, MAP);
    if (!r.ok) throw new Error(r.error);

    // Прямая попытка: контекст аккаунта — actor, а projectId подставлен чужой. Маршрут так
    // не делает (проект ищется по slug И по account_id из сессии), но критерий проверяет
    // ВТОРОЙ рубеж: политика RLS на testimonials объявлена `for all` с
    // `with check (project_id in (select ... where account_id = текущий))`, поэтому такая
    // вставка обязана быть отвергнута самой БД, без единой строки кода.
    await expect(
      withAccount(actor.accountId, (c) => importRows(c, victim.projectId, r.rows)),
      'чужой проект принял импорт — второго рубежа нет',
    ).rejects.toThrow();

    expect(await countRows(victim.projectId), 'в чужом проекте появились строки').toBe(before);
  });

  it('маршрут берёт проект из СЕССИИ: страж по исходнику', () => {
    const code = read('app/api/import/route.ts');
    expect(code).toContain('await currentAccountId()');
    // Ни одна строка, читающая тело, не смеет упоминать идентификатор проекта.
    for (const line of code.split('\n')) {
      if (/\bbody\b|\bparsed\b/.test(line)) {
        expect(line, `идентификатор проекта из тела: ${line.trim()}`).not.toMatch(/project_?[Ii]d/);
      }
    }
    // Поиск проекта — по slug И по владельцу из сессии.
    expect(code).toMatch(/where slug = \$1 and account_id = \$2/);
  });
});

describe('AC-014.4 / AC-014.5 — валидация ТА ЖЕ, что у формы', () => {
  it('короткое имя и слишком длинный текст отклоняются с номером строки', () => {
    const csv = [
      'name,text,role',
      'А,Слишком короткое имя автора здесь,Роль',
      `Нормальное Имя,${'я'.repeat(TEXT_MAX + 1)},Роль`,
      'Валидный Автор,Совершенно нормальный текст отзыва,Роль',
    ].join('\n');
    const r = parseCsv(csv, MAP);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rows.length).toBe(1);
    expect(r.rejected.map((x) => x.line), 'номера строк для человека: заголовок это 1')
      .toEqual([2, 3]);
    expect(r.rejected[0]!.errors.join()).toContain('name');
    expect(r.rejected[1]!.errors.join()).toContain('text');
  });

  it('СТРАЖ: модуль импорта не содержит СВОИХ проверок длины', () => {
    const code = read('lib/csv-import.ts');
    // Падает при: скопировать проверки. Своя валидация здесь — вторая дверь на путь,
    // ведущий на ЧУЖИЕ сайты; ревью уже находило этот класс (L-2).
    expect(code).toContain('validateTextSubmission(');
    for (const own of ['NAME_MIN', 'NAME_MAX', 'TEXT_MIN', 'TEXT_MAX', '.length < 2', '.length > 80']) {
      expect(code, `в импорте своя проверка ${own}`).not.toContain(own);
    }
  });
});

describe('AC-014.17 [валидация B-1] — РОЛЬ ограничена, и на обеих дверях', () => {
  it('роль длиннее предела отклоняется', () => {
    const csv = ['name,text,role',
      `Анна Петрова,Отличный сервис и быстрая поддержка,${'я'.repeat(ROLE_MAX + 1)}`].join('\n');
    const r = parseCsv(csv, MAP);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Прежде роль проверялась ТОЛЬКО по типу: строка в 100 000 символов принималась молча и
    // уходила на чужие сайты через виджет рядом с именем. Не XSS, но неограниченный
    // пользовательский контент на единственном growth-канале.
    expect(r.rows.length, 'роль без предела принята').toBe(0);
    expect(r.rejected[0]!.errors.join()).toContain('role');
  });

  it('роль в пределе принимается', () => {
    const csv = ['name,text,role',
      `Анна Петрова,Отличный сервис и быстрая поддержка,${'я'.repeat(ROLE_MAX)}`].join('\n');
    const r = parseCsv(csv, MAP);
    expect(r.ok && r.rows.length).toBe(1);
  });

  it('предел стоит в ОБЩЕЙ функции, а не в импорте — значит закрыта и форма', () => {
    const shared = read('lib/testimonial.ts');
    expect(shared, 'предел роли не в общей функции — форма осталась открытой')
      .toContain('ROLE_MAX');
    const own = read('lib/csv-import.ts');
    expect(own, 'в импорте появилась своя проверка роли — вторая дверь')
      .not.toContain('ROLE_MAX');
  });
});

describe('AC-014.7 / AC-014.12 / AC-014.13 — отказы понятны', () => {
  it('строк больше предела → отказ ЦЕЛИКОМ, с числом', () => {
    const lines = ['name,text,role'];
    for (let i = 0; i < MAX_IMPORT_ROWS + 1; i += 1) {
      lines.push(`Автор Номер ${i},Совершенно нормальный текст отзыва ${i},Роль`);
    }
    const r = parseCsv(lines.join('\n'), MAP);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(String(MAX_IMPORT_ROWS));
  });

  it('пустой файл и файл с одним заголовком дают ОТКАЗ, а не «импортировано 0»', () => {
    expect(parseCsv('', MAP).ok).toBe(false);
    const only = parseCsv('name,text,role', MAP);
    expect(only.ok, 'файл только с заголовком принят как успех').toBe(false);
    if (!only.ok) expect(only.error).toContain('заголовок');
  });

  it('негодные байты → отказ, а не порча текста', () => {
    const broken = new TextDecoder('utf-8').decode(new Uint8Array([0xff, 0xfe, 0x41]));
    const r = parseCsv(`name,text${'\n'}${broken},текст отзыва нормальной длины`, MAP);
    expect(r.ok).toBe(false);
  });
});

describe('AC-014.11 — разбор по RFC 4180, а не split по запятой', () => {
  it('кавычки, удвоенная кавычка, разделитель и перевод строки ВНУТРИ поля', () => {
    const raw = 'a,b' + '\n' + '"поле, с запятой","строка' + '\n' + 'с переводом"' + '\n' + '"он сказал ""да""",просто';
    const rec = parseCsvRecords(raw, ',');
    expect(rec[1]).toEqual(['поле, с запятой', 'строка' + '\n' + 'с переводом']);
    expect(rec[2]).toEqual(['он сказал "да"', 'просто']);
  });

  it('точка с запятой как разделитель распознаётся', () => {
    expect(detectDelimiter('a;b;c' + '\n' + '1;2;3')).toBe(';');
    expect(detectDelimiter('a,b,c' + '\n' + '1,2,3')).toBe(',');
    // Разделитель определяется ВНЕ кавычек: иначе заголовок с ; внутри поля обманул бы.
    expect(detectDelimiter('"имя; должность",текст' + '\n' + 'а,б')).toBe(',');
  });

  it('оба разделителя дают ОДИН результат', () => {
    const c = 'name,text' + '\n' + 'Анна Петрова,Отличный сервис и поддержка';
    const s = 'name;text' + '\n' + 'Анна Петрова;Отличный сервис и поддержка';
    const rc = parseCsv(c, { name: 0, text: 1 });
    const rs = parseCsv(s, { name: 0, text: 1 });
    expect(rc.ok && rs.ok).toBe(true);
    if (rc.ok && rs.ok) expect(rc.rows).toEqual(rs.rows);
  });
});


describe('разбор на ЗЛЫХ входах — найдено зондом, а не рассуждением', () => {
  it('одинокий CR — конец записи, а не мусор', () => {
    // Пропуск одинокого \r молча СКЛЕИВАЛ заголовок с первой строкой:
    // `name,text\rАнна,текст` давал ОДНУ запись ["name","textАнна",…]. Тихая порча данных.
    const rec = parseCsvRecords('name,text\rАнна,Хороший сервис и поддержка', ',');
    expect(rec.length, 'одинокий CR не разделил записи').toBe(2);
    expect(rec[1]).toEqual(['Анна', 'Хороший сервис и поддержка']);
  });

  it('CRLF — ОДИН разделитель, а не два', () => {
    const rec = parseCsvRecords('a,b\r\n1,2\r\n', ',');
    expect(rec.length, 'CRLF породил пустую запись').toBe(2);
  });

  it('смешанные переводы строк в одном файле', () => {
    const raw = 'name,text\r\nА,первый отзыв достаточной длины\nБ,второй отзыв достаточной длины\rВ,третий отзыв достаточной длины';
    expect(parseCsvRecords(raw, ',').length).toBe(4);
  });

  it('BOM от Excel не попадает в данные', () => {
    // Excel ставит его при КАЖДОМ сохранении в CSV.
    const rec = parseCsvRecords('\uFEFFname,text\nАнна,текст отзыва нормальной длины', ',');
    expect(rec[0]![0], 'BOM остался в заголовке').toBe('name');
  });

  it('незакрытая кавычка — ПОНЯТНЫЙ отказ, а не молчаливое склеивание', () => {
    // Без этого остаток файла уходил в одно поле, строка не проходила валидацию как
    // «текст пуст», и владелец получал отказ с НЕВЕРНОЙ причиной.
    const r = parseCsv('name,text\n"Анна,Хороший сервис и поддержка', MAP);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain('кавычк');
  });

  it('кавычка в СЕРЕДИНЕ поля остаётся символом', () => {
    // Так же ведёт себя Excel: кавычка открывает поле только в его начале.
    const rec = parseCsvRecords('a,b\nab"cd,второе', ',');
    expect(rec[1]![0]).toBe('ab"cd');
  });

  it('строка короче заголовка не роняет разбор', () => {
    const r = parseCsv('name,text,role\nАнна', MAP);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.rejected.length, 'короткая строка обязана быть отклонена').toBe(1);
  });
});

describe('отпечаток', () => {
  it('разделитель обязателен: перенос символа между полями меняет отпечаток', () => {
    // Без разделителя name="ab",text="c" и name="a",text="bc" дали бы один отпечаток.
    expect(importFingerprint('ab', 'c')).not.toBe(importFingerprint('a', 'bc'));
  });
});

describe('соотношение пределов — иначе предел строк только на бумаге', () => {
  it('MAX_IMPORT_ROWS строк предельной длины помещаются в MAX_IMPORT_BODY', () => {
    const perRow = NAME_MAX + TEXT_MAX + NAME_MAX + 10;   // имя + текст + роль + разделители
    const needed = MAX_IMPORT_ROWS * perRow;
    // Если не помещаются, до проверки числа строк дело не дойдёт никогда: сработает 413,
    // и сообщение будет о размере, а не о числе строк — владелец не поймёт, что делать.
    expect(MAX_IMPORT_BODY, `нужно ${needed} байт, предел ${MAX_IMPORT_BODY}`)
      .toBeGreaterThan(needed);
  });
});


describe('AC-014.15 [ревью B-1] — ЦЕНА разбора ограничена числом строк, а не размером файла', () => {
  it('файл в предел тела, но из миллиона строк, отвергается БЫСТРО', () => {
    // Прежде предел строк проверялся ПОСЛЕ полного разбора и ограничивал сообщение, а не
    // ресурс. Замерено ревью на теле ровно в пределе 2 МиБ: 294 мс СИНХРОННОЙ работы и
    // +217 МиБ heap на один запрос, при норме соседнего запроса к БД 0,8 мс. Синхронной —
    // значит процесс в это время не обслуживает никого: ни витрину, ни виджет, ни вход.
    // Реплика web одна, поток в Node один: один аккаунт четырьмя запросами в секунду
    // останавливал бы продукт целиком.
        // Ровно тот размер, на котором ревью замерило 294 мс: тело в пределе MAX_IMPORT_BODY.
    const huge = 'name,text' + '\n'.repeat(1_048_538);
    const started = Date.now();
    const r = parseCsv(huge, MAP);
    const elapsed = Date.now() - started;

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(String(MAX_IMPORT_ROWS));
    // Падает при: вернуть проверку предела ПОСЛЕ разбора. Порог с большим запасом: после
    // починки разбор прекращается на 501-й записи, то есть за микросекунды.
    expect(elapsed, `разбор занял ${elapsed} мс — цена не ограничена числом строк`)
      .toBeLessThan(100);
  });

  it('разбор прекращается на первой записи сверх предела', () => {
    const rows = ['h'];
    for (let i = 0; i < 2000; i += 1) rows.push(`a${i}`);
    // Падает при: убрать maxRecords из parseCsvRecords.
    expect(() => parseCsvRecords(rows.join('\n'), ',', 500)).toThrow(TooManyRecordsError);
  });
});

describe('AC-014.14 — разбор вне транзакции', () => {
  it('маршрут вызывает parseCsv ДО withAccount', () => {
    const code = read('app/api/import/route.ts');
    const parse = code.indexOf('parseCsv(');
    const tx = code.indexOf('await withAccount(');
    expect(parse).toBeGreaterThan(-1);
    expect(tx).toBeGreaterThan(-1);
    // Падает при: занести разбор внутрь транзакции — соединение общего пула удерживалось бы
    // на время, которым управляет размер файла, то есть клиент.
    expect(parse, 'разбор внутри транзакции держит соединение').toBeLessThan(tx);
  });
});
