// Пароли владельцев — Architecture §3.2: «argon2id/bcrypt, сверяется константным по
// времени сравнением при входе».
//
// Выбран @node-rs/argon2 (argon2id по умолчанию): prebuilt-бинарники под node:22-alpine,
// то есть образу не нужен компилятор. Сравнение — argon2.verify, оно константное по времени;
// собственного `===` по хешам здесь нет намеренно.

import { hash, verify } from '@node-rs/argon2';

export const PASSWORD_MIN_LENGTH = 8; // Pseudocode §9: «password: минимум 8 символов»

/**
 * Верхняя граница (NFR-009.10, введена вместе с FR-009). До неё границы НЕ БЫЛО НИГДЕ:
 * `register.ts` проверял только минимум, и пароль в 10 МБ уходил в argon2 на
 * неаутентифицированном маршруте. argon2 memory-hard, то есть это расход общего CPU и
 * памяти процесса — тот же разделяемый ресурс, что и пул соединений, только другая дверь
 * (.claude/rules/shared-resource-verification.md).
 *
 * 200 — с большим запасом над любой парольной фразой и на три порядка ниже вредного.
 */
export const PASSWORD_MAX_LENGTH = 200;

// Числовой литерал, а не Algorithm.Argon2id: это ambient const enum, а Next принудительно
// включает isolatedModules, при котором обращение к нему не компилируется. Значение 2 закреплено
// не комментарием, а тестом «хеш помечен $argon2id$» — если апстрим переставит номера, упадёт
// тест, а не продакшен (лестница стоимости обнаружения, слой 1).
const OPTIONS = { algorithm: 2 } as const;

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  try {
    return await verify(storedHash, plain, OPTIONS);
  } catch {
    // Битый/чужого формата хеш в БД — это «не совпало», а не 500.
    return false;
  }
}
