// POST /api/import — FR-014.
//
// Два режима: 'preview' ничего не пишет, 'commit' пишет. Это РАЗНЫЕ пути, а не флаг внутри
// одной функции: разбор (parseCsv) физически не имеет доступа к client, поэтому
// «предпросмотр не пишет» — свойство сигнатуры, а не обещание.
//
// Разбор — ВНЕ транзакции. Его длительностью управляет размер файла, то есть клиент; внутри
// он удерживал бы соединение общего пула ровно так, как разбор тела у входа, который проект
// уже вынес наружу.

import { NextResponse } from 'next/server';
import { withAccount } from '@proofwall/db';
import { currentAccountId } from '@/lib/current-session';
import { readBodyAtMost } from '@/lib/request-body';
import { MAX_IMPORT_BODY, importRows, parseCsv, type ColumnMapping } from '@/lib/csv-import';

export const dynamic = 'force-dynamic';

const UNAUTHORIZED = { error: 'требуется вход' } as const;

function isIndex(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1000;
}

export async function POST(request: Request): Promise<NextResponse> {
  const raw = await readBodyAtMost(request, MAX_IMPORT_BODY);
  if (raw === null) {
    return NextResponse.json(
      { error: 'файл слишком большой — разбейте его на части' }, { status: 413 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'тело запроса: ожидается JSON' }, { status: 400 });
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return NextResponse.json({ error: 'тело запроса: ожидается объект' }, { status: 400 });
  }

  // ЕДИНСТВЕННЫЙ источник владельца — проверенная сессия. project_id в теле, если он там
  // есть, не читается никем: класс, закрытый в FR-010 (NFR-010.7) и FR-011.
  const accountId = await currentAccountId();
  if (accountId === null) return NextResponse.json(UNAUTHORIZED, { status: 401 });

  const body = parsed as { slug?: unknown; csv?: unknown; mode?: unknown; mapping?: unknown };
  const slug = typeof body.slug === 'string' ? body.slug : '';
  const csv = typeof body.csv === 'string' ? body.csv : '';
  const mode = body.mode === 'commit' ? 'commit' : 'preview';

  const m = body.mapping as { name?: unknown; text?: unknown; role?: unknown } | undefined;
  if (!m || !isIndex(m.name) || !isIndex(m.text)) {
    return NextResponse.json(
      { error: 'сопоставление колонок: нужны номера колонок имени и текста' }, { status: 400 });
  }
  const mapping: ColumnMapping = {
    name: m.name, text: m.text, role: isIndex(m.role) ? m.role : null,
  };

  // Разбор ВНЕ транзакции.
  const result = parseCsv(csv, mapping);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  if (mode === 'preview') {
    // НИЧЕГО не пишет. importRows отсюда не вызывается и вызвана быть не может: у этой
    // ветки нет client.
    return NextResponse.json({
      mode: 'preview',
      accepted: result.rows.length,
      rejected: result.rejected,
      sample: result.rows.slice(0, 5),
    }, { status: 200 });
  }

  const written = await withAccount(accountId, async (client) => {
    // Проект берётся по slug И по владельцу из сессии: чужой slug не найдётся.
    const { rows } = await client.query<{ id: string }>(
      'select id from projects where slug = $1 and account_id = $2 and deactivated = false',
      [slug, accountId],
    );
    const project = rows[0];
    if (!project) return null;
    return importRows(client, project.id, result.rows);
  });

  if (written === null) {
    return NextResponse.json({ error: 'проект не найден' }, { status: 404 });
  }

  return NextResponse.json({
    mode: 'commit',
    inserted: written,
    skipped: result.rows.length - written,   // уже были — повторный импорт дублей не создаёт
    rejected: result.rejected,
  }, { status: 200 });
}
