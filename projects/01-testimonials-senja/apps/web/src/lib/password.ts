// Пароли владельцев — Architecture §3.2: «argon2id/bcrypt, сверяется константным по
// времени сравнением при входе».
//
// Выбран @node-rs/argon2 (argon2id по умолчанию): prebuilt-бинарники под node:22-alpine,
// то есть образу не нужен компилятор. Сравнение — argon2.verify, оно константное по времени;
// собственного `===` по хешам здесь нет намеренно.

import { hash, verify, Algorithm } from '@node-rs/argon2';

export const PASSWORD_MIN_LENGTH = 8; // Pseudocode §9: «password: минимум 8 символов»

const OPTIONS = { algorithm: Algorithm.Argon2id } as const;

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
