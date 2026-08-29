// FR-010 — смена пароля и завершение ВСЕХ сессий.
//
// Три ревизии валидации ушли на то, чтобы критерии стали РАЗБОРЧИВЫМИ. Каждый тест ниже
// снабжён строкой «падает при»: если её вырезать из кода, тест обязан покраснеть. Тест без
// такого ответа в набор не берётся — он подтверждает существование кода, а не его работу.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import type { PoolClient } from 'pg';

const DB_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!DB_URL) throw new Error('TEST_DATABASE_URL не задан');
process.env.DATABASE_URL = DB_URL;
process.env.SESSION_SECRET = 'test-secret-at-least-16-chars-long';
process.env.BASE_URL = 'https://proofwall.test';

const { pool, withAccount, withService, closePool, rateLimit } = await import('@proofwall/db');
const { registerAccountAndProject } = await import('../src/lib/register');
const { createSession, hashSessionToken } = await import('../src/lib/session');
const { attemptLogin, hashKey } = await import('../src/lib/login');
const {
  changePassword, validNewPassword,
  PWCHANGE_PAIR_SCOPE, PWCHANGE_IP_SCOPE,
  PWCHANGE_PAIR_THRESHOLD, PWCHANGE_IP_THRESHOLD, PWCHANGE_SUCCESS_THRESHOLD,
  PWCHANGE_WINDOW, PWCHANGE_LOCK_NAMESPACE,
} = await import('../src/lib/password-change');

afterAll(async () => { await closePool(); });

const SRC = path.resolve(__dirname, '../src');
const strip = (code: string) =>
  code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const read = (rel: string) => strip(readFileSync(path.resolve(SRC, rel), 'utf8'));
function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(dir)) {
    const full = path.join(dir, e);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.tsx?$/.test(full)) out.push(full);
  }
  return out;
}

const OLD = 'old-correct-horse-battery';
const NEW = 'new-correct-horse-battery';
let seq = 0;

interface Owner { accountId: string; email: string; slug: string; }

/** Настоящая транзакция: changePassword открывает свою, откатить общую нельзя. */
async function makeOwner(): Promise<Owner> {
  seq += 1;
  const slug = `pwc-${seq}-${Date.now().toString(36)}`;
  const email = `${slug}@example.com`;
  const r = await withService((c) =>
    registerAccountAndProject(c, { email, password: OLD, desired_slug: slug, project_name: 'PWC' }),
  );
  if (!r.ok) throw new Error(`регистрация не удалась: ${JSON.stringify(r.body)}`);
  const { rows } = await withService((c) =>
    c.query<{ id: string }>('select id from accounts where email = $1', [email]),
  );
  return { accountId: rows[0]!.id, email, slug };
}

/** Уникальный ключ на тест — И МЕЖДУ ПРОГОНАМИ.
 *
 *  Первая версия давала `10.x.y.7` от счётчика, который обнуляется при старте набора.
 *  Ключ грубого лимита строится только по адресу, порог 30, окно ЧАС, а таблица
 *  rate_limit_events между прогонами не чистится — поэтому после шести прогонов подряд
 *  один и тот же адрес набирал 30 записей, и ПЕРВАЯ же попытка возвращала too_many.
 *  Тест зеленел ровно до того момента, пока окно не заполнится, и падал «через раз».
 *
 *  На этом уровне ключ никуда не парсится — он только хешируется, — поэтому берём
 *  заведомо уникальную строку вместо правдоподобного адреса. */
const RUN = `${process.pid}-${Date.now().toString(36)}`;
function ip(): string {
  seq += 1;
  return `testkey-${RUN}-${seq}`;
}

async function issueSession(accountId: string): Promise<string> {
  return withService((c) => createSession(c, accountId));
}

async function sessionAlive(token: string): Promise<boolean> {
  const { rows } = await withService((c) =>
    c.query('select 1 from sessions where token_hash = $1 and revoked_at is null', [
      hashSessionToken(token),
    ]),
  );
  return rows.length === 1;
}

async function storedHash(accountId: string): Promise<string> {
  const { rows } = await withService((c) =>
    c.query<{ password_hash: string }>('select password_hash from accounts where id = $1', [accountId]),
  );
  return rows[0]!.password_hash;
}

const change = (o: Owner, current: string, next: string, addr = ip()) =>
  withAccount(o.accountId, (c) => changePassword(c, { accountId: o.accountId, ip: addr, current, next }));

// ─────────────────────────────────────────────────────────────────────────────
describe('AC-010.1 / AC-010.2 — пароль действительно сменился', () => {
  it('верный текущий → ok, и вход НОВЫМ паролем работает', async () => {
    const o = await makeOwner();
    const r = await change(o, OLD, NEW);
    expect(r.ok, JSON.stringify(r)).toBe(true);

    // Падает при: убрать `update accounts set password_hash`.
    const login = await withService((c) => attemptLogin(c, o.email, NEW, ip()));
    expect(login.ok, 'новым паролем войти не удалось').toBe(true);
  });

  it('вход СТАРЫМ паролем после смены → отказ', async () => {
    const o = await makeOwner();
    expect((await change(o, OLD, NEW)).ok).toBe(true);
    const login = await withService((c) => attemptLogin(c, o.email, OLD, ip()));
    expect(login.ok, 'старый пароль всё ещё принимается').toBe(false);
  });
});

describe('AC-010.3 / AC-010.14 / AC-010.4 — объём отзыва', () => {
  it('cookie, КОТОРОЙ аутентифицирован запрос, мертва; вторая тоже; новая жива', async () => {
    const o = await makeOwner();
    const authenticating = await issueSession(o.accountId); // та самая
    const otherDevice = await issueSession(o.accountId);    // второе устройство

    const r = await change(o, OLD, NEW);
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // AC-010.3 — падает при: дописать `and token_hash <> $current` (отзыв «прочих»).
    // Именно эта строка различает «все» и «прочие»: вторую сессию гасят ОБА варианта.
    expect(await sessionAlive(authenticating), 'текущая сессия пережила смену — вор остался внутри')
      .toBe(false);

    // AC-010.14 — падает при: заменить на `and token_hash = $current` (отзыв только текущей).
    expect(await sessionAlive(otherDevice), 'вторая сессия пережила смену').toBe(false);

    // AC-010.4 — падает при: поменять местами отзыв и выдачу, либо убрать createSession.
    expect(await sessionAlive(r.token), 'выданная сессия мертва — владелец заперт').toBe(true);
  });
});

describe('AC-010.5 / AC-010.6 — изоляция аккаунтов', () => {
  it('сессии и пароль ДРУГОГО аккаунта не тронуты', async () => {
    const victim = await makeOwner();
    const actor = await makeOwner();
    const victimSession = await issueSession(victim.accountId);
    const victimHash = await storedHash(victim.accountId);

    expect((await change(actor, OLD, NEW)).ok).toBe(true);

    // AC-010.5 — падает при: убрать `and account_id = $1` из отзыва сессий.
    expect(await sessionAlive(victimSession), 'чужая сессия отозвана').toBe(true);
    // AC-010.6 — падает при: убрать `where id = $2` из смены пароля.
    expect(await storedHash(victim.accountId), 'чужой пароль изменён').toBe(victimHash);
  });
});

describe('AC-010.7 — неверный текущий пароль ничего не меняет', () => {
  it('отказ, пароль прежний, сессии живы', async () => {
    const o = await makeOwner();
    const session = await issueSession(o.accountId);
    const before = await storedHash(o.accountId);

    const r = await change(o, 'совершенно-не-тот-пароль', NEW);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unauthorized');
    expect(await storedHash(o.accountId), 'пароль изменён при неверном текущем').toBe(before);
    expect(await sessionAlive(session), 'сессии отозваны при неверном текущем').toBe(true);
  });
});

describe('AC-010.15 — счётчик пишется, и по КАЖДОМУ ключу отдельно', () => {
  it('одна неверная попытка = +1 в паре И +1 в IP, считая по scope', async () => {
    const o = await makeOwner();
    const addr = ip();
    const keyPair = hashKey(PWCHANGE_PAIR_SCOPE, o.accountId, addr);
    const keyIp = hashKey(PWCHANGE_IP_SCOPE, addr);

    const before = {
      pair: await withService((c) => rateLimit.count(PWCHANGE_PAIR_SCOPE, keyPair, PWCHANGE_WINDOW, c)),
      ip: await withService((c) => rateLimit.count(PWCHANGE_IP_SCOPE, keyIp, PWCHANGE_WINDOW, c)),
    };
    await change(o, 'не-тот', NEW, addr);
    const after = {
      pair: await withService((c) => rateLimit.count(PWCHANGE_PAIR_SCOPE, keyPair, PWCHANGE_WINDOW, c)),
      ip: await withService((c) => rateLimit.count(PWCHANGE_IP_SCOPE, keyIp, PWCHANGE_WINDOW, c)),
    };

    // Считаем ПО SCOPE, а не суммарно. Суммарное «ровно +1» было бы красным здесь
    // (верный код пишет две строки) и зелёным на мутации «убрать запись только по IP».
    // Падает при M8b: убрать record(PWCHANGE_IP_SCOPE, …).
    expect(after.ip - before.ip, 'грубый счётчик по IP не пишется').toBe(1);
    // Падает при M8c: убрать record(PWCHANGE_PAIR_SCOPE, …).
    expect(after.pair - before.pair, 'тугой счётчик по паре не пишется').toBe(1);
  });
});

describe('AC-010.10 / AC-010.16 — лимит достигается НАСТОЯЩИМИ попытками', () => {
  it(`${PWCHANGE_PAIR_THRESHOLD} неверных подряд → следующая даёт too_many`, async () => {
    const o = await makeOwner();
    const addr = ip();
    for (let i = 0; i < PWCHANGE_PAIR_THRESHOLD; i += 1) {
      const r = await change(o, 'не-тот', NEW, addr);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.reason, `попытка ${i + 1} не должна быть too_many`).toBe('unauthorized');
    }
    // Порог набран записями самой фичи, а не засевом — падает при: убрать rateLimit.exceeded.
    const blocked = await change(o, OLD, NEW, addr);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.reason).toBe('too_many');
  });

  it('исчерпанная пара НЕ мешает тому же владельцу с другого адреса', async () => {
    const o = await makeOwner();
    const thief = ip();
    for (let i = 0; i < PWCHANGE_PAIR_THRESHOLD; i += 1) await change(o, 'не-тот', NEW, thief);
    expect((await change(o, OLD, NEW, thief)).ok, 'пара не исчерпана — тест не проверяет ничего').toBe(false);

    // ГЛАВНОЕ: вор не запирает владельца. Падает при M10 — ключ по одному accountId.
    const owner = await change(o, OLD, NEW, ip());
    expect(owner.ok, 'вор с украденной cookie запер владельца — защита стала кнопкой её отключения')
      .toBe(true);
  });
});

describe('AC-010.19 — конкурентная смена это 409, а не 429', () => {
  it('занятый advisory-лок даёт busy, а не too_many', async () => {
    const o = await makeOwner();
    const addr = ip();
    const keyPair = hashKey(PWCHANGE_PAIR_SCOPE, o.accountId, addr);

    const holder = await pool.connect();
    try {
      await holder.query('begin');
      await holder.query('select pg_advisory_xact_lock($1, hashtext($2))', [
        PWCHANGE_LOCK_NAMESPACE, keyPair,
      ]);
      const r = await change(o, OLD, NEW, addr);
      expect(r.ok).toBe(false);
      // Падает при M15: вернуть too_many на неудачу захвата. «Слишком много попыток»
      // на конкуренцию — ответ, не соответствующий происходящему.
      if (!r.ok) expect(r.reason).toBe('busy');
    } finally {
      await holder.query('rollback');
      holder.release();
    }
  });
});

describe('AC-010.26 [ревью B-1] — конкурентные смены одного аккаунта сериализуются', () => {
  it('N одновременных смен с РАЗНЫХ адресов: ровно одна ok, остальные busy', async () => {
    const o = await makeOwner();
    const N = 5;

    // Ключ ЛИМИТА — пара, поэтому разные адреса дают разные ключи и разные локи по паре.
    // До второго лока (по одному accountId) все N читали старый хеш, все проверяли его
    // успешно и все возвращали ok — «последний записавший побеждает». Владелец получал
    // 200 и cookie, уже отозванную чужим UPDATE, а пароль в базе — чужой.
    const results = await Promise.all(
      Array.from({ length: N }, (_, i) => change(o, OLD, `${NEW}-${i}`, ip())),
    );
    const ok = results.filter((r) => r.ok);

    // Утверждается СВОЙСТВО, а не средство. Прежняя редакция требовала ещё и
    // `busy.length === N - 1`, то есть проверяла, каким именно механизмом достигнута
    // сериализация. Такой страж краснеет на УЛУЧШЕНИИ: правка, снявшая лотерейный лок по
    // аккаунту в пользу очереди на FOR UPDATE, уронила бы его вторым утверждением, при
    // зелёном первом. Страж, красный на улучшении, учит сохранять худший вариант — вред
    // тот же, что от зелёного по построению, только с обратным знаком.
    //
    // Проигравшие теперь получают unauthorized, и это ВЕРНЕЕ, чем busy: FOR UPDATE после
    // COMMIT держателя перечитывает строку, проигравший видит уже НОВЫЙ хеш, и его
    // «текущий пароль» действительно перестал быть текущим.
    expect(ok.length, `успешных ${ok.length}, а должна быть ровно одна: ${JSON.stringify(results)}`)
      .toBe(1);

    // И главное свойство: старый пароль после конкурентной гонки не работает НИ РАЗУ.
    const login = await withService((c) => attemptLogin(c, o.email, OLD, ip()));
    expect(login.ok, 'старый пароль пережил конкурентную смену').toBe(false);
  });
});

describe('AC-010.29 [ревью B-1\u2032] — вор не может запереть владельца', () => {
  it('поток попыток вора не мешает владельцу сменить пароль', async () => {
    // Ради этого критерия снят второй advisory-лок по accountId. Он вводился против гонки
    // и создал дефект ХУЖЕ неё: TRY-лок по одному аккаунту — лотерея, а не очередь, и вор
    // с украденной cookie в ОДИН поток выигрывал её почти всегда. Владелец получал 409
    // «смена уже выполняется» на каждую попытку — текст, который в этой ситуации лжёт, —
    // и не мог выгнать вора: маршрута выхода нет, восстановления пароля нет, списка
    // сессий нет. Замерено ревью: успехов владельца 0/15 при потоке вора, 5/5 без него.
    //
    // Последовательный тест этот дефект НЕ ловит: он проявляется только под конкуренцией.
    const o = await makeOwner();
    const ownerIp = ip();

    // ПОТОК, а не последовательность. Первая редакция этого теста слала попытки вора по
    // одной, ожидая каждую: между ними оставался промежуток, в который владелец успевал
    // взять лок, и тест оставался ЗЕЛЁНЫМ даже с возвращённым локом — то есть был зелёным
    // по построению. Дефект проявляется только при непрерывной занятости ресурса, поэтому
    // вор шлёт K параллельных потоков без пауз.
    // K=6, а не 3: ревью замерило, что при K=3 страж ловил возврат дефекта лишь в 3
    // прогонах из 8. Страж, ловящий через раз, не отличим от отсутствующего в тот прогон,
    // когда он промолчал.
    const K = 6;
    let stop = false;
    const thieves = Array.from({ length: K }, async () => {
      // Вор пароля не знает — у него только украденная cookie. Его попытки обречены, но
      // каждая занимала ресурс, разделяемый с владельцем.
      // Адрес МЕНЯЕТСЯ на каждом запросе. С одним адресом парный лимит вора
      // исчерпывался после пяти попыток, его запросы становились мгновенными (отказ на
      // счётчике, до argon2), ресурс освобождался — и тест оставался зелёным даже с
      // внедрённым дефектом. Ротация адресов — то, что делает настоящий атакующий, и
      // именно она держит ресурс занятым: каждый запрос доходит до argon2.
      while (!stop) await change(o, 'вор-пароля-не-знает', `${NEW}-thief`, ip());
    });

    // Утверждается ДОЛЯ успеха, а не «хотя бы раз». «Хотя бы раз из восьми» — слишком
    // слабое требование: владелец, которому нужно восемь попыток, чтобы выгнать вора,
    // практически заперт, а страж при этом зелен.
    let ownerOk = 0;
    const ATTEMPTS = 6;
    // Текущий пароль ОБНОВЛЯЕТСЯ после каждой удачи. Первая версия этого цикла подавала
    // OLD на каждой итерации и потому давала ровно 1 успех из 6 — стабильно, независимо от
    // вора: после первой смены OLD перестаёт быть текущим. Число выглядело как запирание
    // владельца, а было дефектом теста. Отличило их постоянство: конкуренция даёт разброс,
    // а здесь было ровно 1 в каждом из трёх прогонов.
    let currentPw = OLD;
    for (let i = 0; i < ATTEMPTS; i += 1) {
      const nextPw = `${NEW}-owner-${i}`;
      const r = await change(o, currentPw, nextPw, ownerIp);
      if (r.ok) { ownerOk += 1; currentPw = nextPw; }
      await new Promise((r2) => setTimeout(r2, 60));  // пауза человека между кликами
    }
    stop = true;
    await Promise.all(thieves);

    // Падает при: вернуть TRY-лок по одному accountId.
    expect(ownerOk, `владелец прошёл ${ownerOk} из ${ATTEMPTS} — под потоком вора он заперт`)
      .toBeGreaterThanOrEqual(ATTEMPTS - 1);
  });
});

describe('AC-010.32 [ревью H-1] — смена пароля не блокирует ВХОД в тот же аккаунт', () => {
  it('пока строка аккаунта удерживается сменой, createSession проходит', async () => {
    // sessions.account_id — внешний ключ на accounts(id), а INSERT в дочернюю таблицу берёт
    // на РОДИТЕЛЬСКОЙ строке блокировку FOR KEY SHARE. Она конфликтует ровно с одним видом
    // строчной блокировки — с FOR UPDATE. То есть при `for update` вход в аккаунт вставал
    // бы в очередь за сменой пароля и через lock_timeout получал 55P03, а маршрут входа его
    // не ловит и отдал бы 500. Замерено ревью: при 16 одновременных сменах 2 входа из 10.
    //
    // FOR NO KEY UPDATE сериализует смены между собой ровно так же, но вход пропускает.
    const o = await makeOwner();

    const holder = await pool.connect();
    try {
      await holder.query('begin');
      // Худший случай: кто-то удерживает строку аккаунта самой сильной блокировкой.
      // changePassword теперь не берёт её вовсе (сравнение-и-замена в UPDATE), но вход
      // обязан проходить даже когда строку держит кто-то другой.
      await holder.query('select password_hash from accounts where id = $1 for no key update',
        [o.accountId]);

      // Вход в ЭТОТ ЖЕ аккаунт, пока строка удерживается. Падает при: заменить на FOR UPDATE.
      const token = await withService(async (c) => {
        await c.query("set local lock_timeout = '250ms'");
        return createSession(c, o.accountId);
      });
      expect(await sessionAlive(token), 'вход не прошёл во время смены пароля').toBe(true);
    } finally {
      await holder.query('rollback');
      holder.release();
    }
  });
});

describe('AC-010.27 [ревью B-2] — грубый лимит по IP стережётся отдельно', () => {
  it(`${PWCHANGE_IP_THRESHOLD} неверных попыток с одного адреса по РАЗНЫМ аккаунтам → 429`, async () => {
    // Прежде удаление ТОЛЬКО проверки по IP оставляло все 37 тестов зелёными: AC-010.15
    // видел запись (её никто не трогал), AC-010.10 срабатывал на паре, AC-010.16 проходил
    // с другого адреса. Счётчик писали и не читали — зеркало того самого дефекта, который
    // эта фича чинит в sessions.revoked_at.
    const shared = ip();
    const perAccount = 4;                       // меньше порога пары (5) — пара не сработает
    const accounts = Math.ceil((PWCHANGE_IP_THRESHOLD + 2) / perAccount);
    let sawTooMany = false;

    outer: for (let a = 0; a < accounts; a += 1) {
      const o = await makeOwner();
      for (let i = 0; i < perAccount; i += 1) {
        const r = await change(o, 'не-тот', NEW, shared);
        if (!r.ok && r.reason === 'too_many') { sawTooMany = true; break outer; }
      }
    }
    // Падает при: убрать ТОЛЬКО exceeded(PWCHANGE_IP_SCOPE, …).
    expect(sawTooMany, 'грубый лимит по IP не сработал ни разу за 32 попытки').toBe(true);
  });
});

describe('AC-010.28 [ревью H-1] — успешные смены тоже ограничены', () => {
  it(`больше ${PWCHANGE_SUCCESS_THRESHOLD} успешных смен подряд не проходят`, async () => {
    // Прогон ревью: 20 успешных смен подряд за 1131 мс, каждая по два argon2 и 19 МиБ.
    // Комментарий в коде утверждал, что путь успеха «самоограничивается» — неверно:
    // рабочая cookie выдаётся в том же ответе, а новый пароль вызывающий выбирает сам.
    const o = await makeOwner();
    let current = OLD;
    let blocked = false;
    for (let i = 0; i < PWCHANGE_SUCCESS_THRESHOLD + 2; i += 1) {
      const next = `${NEW}-loop-${i}`;
      const r = await change(o, current, next, ip());
      if (!r.ok) {
        expect(r.reason, `смена ${i + 1} отклонена не лимитом`).toBe('too_many');
        blocked = true;
        break;
      }
      current = next;
    }
    // Падает при: убрать exceeded/record по PWCHANGE_SUCCESS_SCOPE.
    expect(blocked, 'цикл смен пароля не ограничен ничем').toBe(true);
  });
});

describe('AC-010.12 — отказ между двумя UPDATE не оставляет частичного состояния', () => {
  it('индуцированный сбой на отзыве сессий откатывает и смену пароля', async () => {
    const o = await makeOwner();
    const session = await issueSession(o.accountId);
    const before = await storedHash(o.accountId);

    // Механизм индукции БЕЗ DDL. Прежняя версия вешала на общую таблицу sessions
    // ограничение CHECK, и пока оно висело, параллельные тестовые ФАЙЛЫ этой же фичи
    // падали на своих законных сменах пароля — набор врал красным примерно раз в десять
    // прогонов. Комментарий там утверждал, что «FR-010 единственный писатель revoked_at,
    // поэтому не заденет»: писатель действительно единственный, но вызывают его ТРИ файла,
    // и запускаются они одновременно.
    //
    // Подменённый клиент роняет ровно второй UPDATE этой транзакции и не трогает схему,
    // поэтому соседям он невидим по построению, а не по рассуждению.
    const failOnRevoke = (client: PoolClient): PoolClient =>
      new Proxy(client, {
        get(target, prop, recv) {
          if (prop !== 'query') return Reflect.get(target, prop, recv);
          return (text: unknown, params?: unknown) => {
            const sql = typeof text === 'string' ? text : (text as { text?: string })?.text ?? '';
            if (/update\s+sessions/i.test(sql)) {
              return Promise.reject(new Error('индуцированный сбой на отзыве сессий'));
            }
            return (target.query as (t: unknown, p?: unknown) => unknown)(text, params);
          };
        },
      }) as PoolClient;

    await expect(
      withAccount(o.accountId, (c) =>
        changePassword(failOnRevoke(c), { accountId: o.accountId, ip: ip(), current: OLD, next: NEW }),
      ),
      'сбой не пробросился наружу',
    ).rejects.toThrow();

    // Падает при M7: заменить один withAccount на два последовательных.
    expect(await storedHash(o.accountId), 'пароль сменён, а сессии нет — частичное состояние')
      .toBe(before);
    expect(await sessionAlive(session)).toBe(true);
  });
});

describe('AC-010.8 / AC-010.9 — границы нового пароля', () => {
  it('короче 8 и длиннее 200 отвергаются, годный принимается', () => {
    expect(validNewPassword('a'.repeat(7))).toBe(false);
    expect(validNewPassword('a'.repeat(8))).toBe(true);
    expect(validNewPassword('a'.repeat(200))).toBe(true);
    expect(validNewPassword('a'.repeat(201))).toBe(false);
    for (const bad of [null, undefined, 42, {}, ['a'.repeat(10)], true]) {
      expect(validNewPassword(bad), JSON.stringify(bad)).toBe(false);
    }
  });
});

// ─── Стражи по исходнику ──────────────────────────────────────────────────────
describe('AC-010.13 — каждый запрос к accounts/sessions фильтрует по владельцу', () => {
  // ФАКТИЧЕСКИЕ имена ключей: у accounts это id, у sessions — account_id. Формулировка
  // «account_id у обеих» падала бы на ВЕРНОЙ реализации (ревизия 1, блокер B-2).
  const FILES = ['lib/password-change.ts', 'app/api/auth/password/route.ts'];

  it.each(FILES)('%s: обращения к accounts несут where id = $', (rel) => {
    const code = read(rel);
    for (const stmt of code.split(';')) {
      if (!/\baccounts\b/.test(stmt)) continue;
      expect(stmt.replace(/\s+/g, ' '), `запрос к accounts без фильтра владельца: ${stmt.trim()}`)
        .toMatch(/where id = \$/i);
    }
  });

  it.each(FILES)('%s: обращения к sessions несут where account_id = $', (rel) => {
    const code = read(rel);
    for (const stmt of code.split(';')) {
      // INSERT в sessions здесь быть не должно вовсе — выдача только через createSession,
      // и это стережёт отдельный страж login.test.ts. Проверяем update/select.
      if (!/\bsessions\b/.test(stmt) || !/\b(update|select|delete)\b/i.test(stmt)) continue;
      expect(stmt.replace(/\s+/g, ' '), `запрос к sessions без account_id: ${stmt.trim()}`)
        .toMatch(/where account_id = \$/i);
    }
  });
});

describe('AC-010.17 — accountId приходит из сессии, а не из тела', () => {
  it('lib не знает про HTTP вовсе', () => {
    const code = read('lib/password-change.ts');
    for (const forbidden of ['next/headers', 'cookies(', 'request.', 'NextRequest', '.json()']) {
      expect(code, `${forbidden} в логике = появился доступ к запросу`).not.toContain(forbidden);
    }
    expect(code, 'accountId обязан быть параметром').toMatch(/accountId:\s*string/);
  });

  it('маршрут берёт accountId ТОЛЬКО из currentAccountId()', () => {
    const code = read('app/api/auth/password/route.ts');
    expect(code).toContain('await currentAccountId()');
    // Ни одна строка, читающая тело, не смеет упоминать идентификатор аккаунта.
    for (const line of code.split('\n')) {
      if (/\bbody\b|\bparsed\b/.test(line)) {
        expect(line, `идентификатор аккаунта читается из тела: ${line.trim()}`)
          .not.toMatch(/account_?[Ii]d/);
      }
    }
  });
});

describe('AC-010.22 / AC-010.23 — порядок операций закреплён по исходнику', () => {
  it('разбор тела — вне withAccount', () => {
    const code = read('app/api/auth/password/route.ts');
    // Позиция ВЫЗОВА, а не импорта: `withAccount` в строке import стоит первым и
    // делал бы страж красным на верном коде.
    const body = code.indexOf('await readBodyAtMost(');
    const tx = code.indexOf('await withAccount(');
    expect(body, 'вызов readBodyAtMost не найден').toBeGreaterThan(-1);
    expect(tx, 'вызов withAccount не найден').toBeGreaterThan(-1);
    expect(body, 'разбор тела внутри транзакции удерживает соединение пула').toBeLessThan(tx);
  });

  it('hashPassword стоит ПОСЛЕ verifyPassword и после обоих лимитов', () => {
    const code = read('lib/password-change.ts');
    const exceeded = code.lastIndexOf('rateLimit.exceeded');
    const verify = code.indexOf('verifyPassword(account.password_hash');
    const hash = code.indexOf('hashPassword(next)');
    expect(hash, 'hashPassword(next) не найден').toBeGreaterThan(-1);
    // Падает при M13: перенести hashPassword в начало.
    expect(verify, 'хеш нового пароля считается до проверки текущего').toBeLessThan(hash);
    // Падает при M13b: перенести hashPassword до лимитера (дефект ревизии 2).
    expect(exceeded, 'хеш считается до лимитера — обречённый на 429 запрос платит argon2')
      .toBeLessThan(hash);
  });

  it('advisory-лок двухаргументный, с пространством имён и таймаутом', () => {
    const code = read('lib/password-change.ts');
    expect(code).toContain('pg_try_advisory_xact_lock($1, hashtext($2))');
    // Падает при M14: одноаргументная форма даёт 32 бита и сталкивается с локами входа.
    expect(code).toContain('PWCHANGE_LOCK_NAMESPACE');
    expect(code, 'ждущий лок копит ожидающих, каждый держит соединение')
      .not.toMatch(/[^_]pg_advisory_xact_lock/);
    expect(code).toContain('lock_timeout');
  });
});

describe('AC-010.24 — hashKey одним объявлением, пороги свои', () => {
  it('hashKey объявлен ровно в одном файле проекта', () => {
    const impls = sourceFiles(SRC).filter((f) =>
      /export\s+function\s+hashKey/.test(strip(readFileSync(f, 'utf8'))),
    );
    // Падает при M16: скопировать hashKey в password-change.ts.
    expect(impls.map((f) => path.relative(SRC, f))).toEqual([path.join('lib', 'login.ts')]);
  });

  it('пороги НЕ импортируются из входа — иначе две фичи связаны', () => {
    const code = read('lib/password-change.ts');
    // Остаётся зелёным на M16b по построению: страж про hashKey, а не про пороги.
    // Эта проверка — обратная: она требует, чтобы связи НЕ появилось.
    expect(code, 'правка порога входа молча меняла бы лимит смены пароля')
      .not.toMatch(/import\s*\{[^}]*\bPAIR_THRESHOLD\b[^}]*\}\s*from\s*'\.\/login'/);
    expect(code).toContain('PWCHANGE_PAIR_THRESHOLD = 5');
    expect(code).toContain('PWCHANGE_IP_THRESHOLD = 30');
    // Окно тоже прибито ЧИСЛОМ. Прежде оно только импортировалось и передавалось в count,
    // а его значение не утверждалось ни разу: правка на { seconds: 1 } превратила бы часовой
    // лимит в секундный, и AC-010.10 со своими пятью попытками за ~200 мс не заметил бы.
    expect(PWCHANGE_WINDOW.seconds, 'окно лимита не закреплено — час мог бы стать секундой')
      .toBe(3600);
  });
});

describe('AC-010.30 [ревью M-3] — «слишком много попыток» объявлено ОДИН раз', () => {
  it('литерал не скопирован: объявление ровно в одном файле', () => {
    const LITERAL = 'слишком много попыток, попробуйте позже';
    const owners = sourceFiles(SRC).filter((f) => {
      const code = strip(readFileSync(f, 'utf8'));
      // Объявление, а не употребление: ищем строку в кавычках рядом с const/export.
      return new RegExp(`(const|export)[^\\n]*['\`"]${LITERAL}`).test(code);
    });
    // Прежде здесь была вторая копия строки при комментарии, обещавшем обратное: расхождение
    // не заметил бы ни один тест. Тот же класс, ради которого стерегутся normalizeEmail и
    // readBodyAtMost, — и оба стража существуют, а этот не появился.
    expect(owners.map((f) => path.relative(SRC, f)))
      .toEqual([path.join('app', 'api', 'auth', 'login', 'route.ts')]);
  });

  it('маршрут смены пароля ИМПОРТИРУЕТ его, а не объявляет свой', () => {
    const code = read('app/api/auth/password/route.ts');
    expect(code).toMatch(/import\s*\{[^}]*\bTOO_MANY\b[^}]*\}\s*from/);
  });
});

describe('AC-010.31 [ревью L-2] — верхняя граница удержания соединения задана', () => {
  it('в транзакции есть statement_timeout, а не только lock_timeout', () => {
    const code = read('lib/password-change.ts');
    // lock_timeout ограничивает ожидание блокировки, но не длительность работы: под
    // насыщенным CPU пакет argon2 растёт нелинейно, и единственной границей удержания
    // оставалось бы время хеширования.
    expect(code, 'нет верхней границы удержания соединения').toContain('statement_timeout');
  });
});

describe('AC-010.20 — форма попадает в дизайн-систему', () => {
  it('классы системы и autocomplete на обоих полях', () => {
    const code = readFileSync(path.resolve(SRC, 'app/dashboard/[slug]/change-password.tsx'), 'utf8');
    for (const cls of ['form', 'field', 'input', 'btn']) {
      expect(code, `нет класса ${cls} — форма верстается в обход системы`)
        .toMatch(new RegExp(`className="[^"]*\\b${cls}\\b`));
    }
    expect(code).toContain('autoComplete="current-password"');
    expect(code).toContain('autoComplete="new-password"');
    // Подтверждение (ревью M-1): опечатка в единственном поле сменила бы пароль на
    // неизвестный владельцу, а восстановления в системе нет — окно на исправление до
    // первой чистки cookie, дальше аккаунт потерян безвозвратно.
    expect(code, 'нет поля подтверждения нового пароля').toContain('new_password_confirm');
    expect(code, 'подтверждение не сверяется с новым паролем')
      .toMatch(/new_password'\)\s*!==\s*data\.get\('new_password_confirm'\)/);
  });
});

describe('AC-010.21 — новый маршрут закрыт пределом тела', () => {
  it('route.ts вызывает readBodyAtMost, своей копии предела нет', () => {
    const code = read('app/api/auth/password/route.ts');
    // ВЫЗОВ, а не импорт. Прежняя форма toContain('readBodyAtMost') находила подстроку в
    // строке import: убери вызов, оставь импорт — страж остался бы зелёным, и заявленная
    // мутация его не роняла. Таблица трассировки при этом утверждала проверку, которой нет.
    expect(code, 'предел тела не ВЫЗЫВАЕТСЯ, а только импортируется')
      .toMatch(/await\s+readBodyAtMost\(\s*request\s*,\s*MAX_JSON_BODY\s*\)/);
  });
});
