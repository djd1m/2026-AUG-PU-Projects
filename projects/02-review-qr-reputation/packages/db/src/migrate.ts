// Раннер миграций.
//
// ЗАЧЕМ ОН НУЖЕН, а не «накатить файлы руками»: живая база этого проекта уже разошлась
// со схемой ровно так. Миграции применили вручную ДО правки колоночных грантов, правку
// внесли в файл, на стенд она не доехала — и приём падал с permission denied, пока
// расхождение не нашлось прогоном. Файл был верен, база нет, и никто об этом не знал.
//
// Раннер убирает не работу, а ВОЗМОЖНОСТЬ такого расхождения: применённое записано, и
// «что накатано» перестаёт быть знанием человека.

import { readdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL_MIGRATE;
  if (!url) throw new Error('DATABASE_URL_MIGRATE не задан — миграции требуют прав владельца схемы');

  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(`
      create table if not exists schema_migrations (
        filename   text primary key,
        checksum   text not null,
        applied_at timestamptz not null default now()
      )`);

    const applied = new Map<string, string>(
      (await client.query<{ filename: string; checksum: string }>(
        'select filename, checksum from schema_migrations')).rows.map((r) => [r.filename, r.checksum]),
    );

    const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
    let n = 0;

    // ── ПРИНЯТИЕ СУЩЕСТВУЮЩЕЙ СХЕМЫ. Отдельный ЯВНЫЙ флаг, а не автоматика.
    //
    // Случай: база накатана руками до появления раннера — объекты есть, журнала нет.
    // Соблазн сделать миграции идемпотентными (`IF NOT EXISTS` везде) отвергнут: тогда
    // настоящий конфликт схемы проглатывался бы молча, и раннер стал бы печатать
    // «применено» на непримененном. Здесь наоборот: человек ОДИН раз заявляет, что
    // схема соответствует файлам, и это записывается.
    if (process.argv.includes('--baseline')) {
      for (const file of files) {
        if (applied.has(file)) continue;
        const sum = createHash('sha256').update(readFileSync(path.join(DIR, file), 'utf8')).digest('hex').slice(0, 16);
        await client.query('insert into schema_migrations (filename, checksum) values ($1,$2)', [file, sum]);
        console.log(`baseline ${file}  (НЕ выполнена, отмечена применённой)`);
      }
      console.log('схема принята как есть. Проверьте её стражем check-db-grants.sh — ' +
                  'раннер НЕ утверждает, что база соответствует файлам, он лишь записал ваше утверждение.');
      return;
    }

    for (const file of files) {
      const sql = readFileSync(path.join(DIR, file), 'utf8');
      const sum = createHash('sha256').update(sql).digest('hex').slice(0, 16);
      const was = applied.get(file);

      if (was === sum) { console.log(`skip  ${file}`); continue; }

      // ИЗМЕНЁННЫЙ ПОСЛЕ ПРИМЕНЕНИЯ ФАЙЛ — ОТКАЗ, а не тихий пропуск и не повторный
      // прогон. Пропустить значит соврать («всё применено», хотя правка не доехала);
      // прогнать заново значит выполнить CREATE TABLE поверх существующей. Третьего
      // способа нет, поэтому это останов с называнием файла.
      if (was !== undefined) {
        throw new Error(
          `${file} изменён ПОСЛЕ применения (было ${was}, стало ${sum}). ` +
          'Миграции неизменяемы: заведите следующий файл с правкой. ' +
          'Если правка уже накатана руками — обновите checksum в schema_migrations осознанно.',
        );
      }

      console.log(`apply ${file}`);
      await client.query('begin');
      try {
        await client.query(sql);
        await client.query(
          'insert into schema_migrations (filename, checksum) values ($1, $2)', [file, sum]);
        await client.query('commit');
        n += 1;
      } catch (e) {
        await client.query('rollback');
        throw new Error(`${file} упала: ${(e as Error).message}`, { cause: e });
      }
    }
    console.log(n === 0 ? 'схема актуальна' : `применено: ${n}`);
  } finally {
    await client.end();
  }
}

main().catch((e: unknown) => { console.error((e as Error).message); process.exit(1); });
