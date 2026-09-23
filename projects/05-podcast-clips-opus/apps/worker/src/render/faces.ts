// Запуск детектора лиц отдельным процессом (FR-2).
//
// Питон, а не Node: детектор YuNet живёт в OpenCV, и переписывать его нечем. Процесс отдельный по
// той же причине, что и ffmpeg: тяжёлая работа не должна занимать цикл событий, иначе очередь
// объявит обработчик зависшим.
//
// ОТКАЗ ДЕТЕКТОРА НЕ ВАЛИТ РЕНДЕР. Кадрирование — улучшение картинки, а не условие пригодности
// клипа: если лица найти не удалось, клип выходит с прежним кадрированием, и это записывается.
// Обратное означало бы, что за оплаченные расшифровку и выделение пользователь не получает ничего
// из-за необязательной части.
import { execFile } from 'node:child_process';
import { join } from 'node:path';
import type { FaceReport } from './framing-plan.js';

const ASSETS = join(process.cwd(), 'apps', 'worker', 'assets');
// Пути фиксированы: модель и скрипт лежат в образе. Переопределение через окружение убрано —
// оно никому не было нужно, а страж проброса переменных справедливо требовал объявить его в
// compose каждому воркеру. Настройка без потребителя — это поверхность для ошибки, а не гибкость.
export const FACE_MODEL = join(ASSETS, 'models', 'face_detection_yunet.onnx');
export const FACE_SCRIPT = join(ASSETS, 'scripts', 'detect_faces.py');
/**
 * Шаг между кадрами — 0,5 с, то есть 120 замеров на минуту клипа.
 *
 * Было 2 с, и владелец увидел последствие: «есть моменты во всех клипах, где камера смотрит в
 * стену». Камера в подкасте режет примерно раз в 8 с — при шаге 2 с кадр после КАЖДОЙ склейки до
 * двух секунд смотрел не туда, то есть до четверти клипа сорокасекундной длины.
 *
 * Частоту держал не детектор, а способ доставать кадры: прежний скрипт запускал ffmpeg на каждый
 * кадр отдельно (около секунды на замер). Теперь кадры идут одним проходом через конвейер, и
 * вчетверо более частая выборка стоит дешевле прежней редкой.
 */
export const SAMPLE_SECONDS = 0.5;
/** Потолок времени: детектор необязателен, и ждать его дольше рендера бессмысленно. */
export const FACE_TIMEOUT_MS = 60_000;

export async function detectFaces(path: string, start: number, end: number,
  signal?: AbortSignal): Promise<FaceReport | null> {
  return new Promise(resolve => {
    execFile('python3', [FACE_SCRIPT, path, String(start), String(end), String(SAMPLE_SECONDS), FACE_MODEL],
      { timeout: FACE_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024, signal },
      (error, stdout) => {
        if (error) {
          console.warn(JSON.stringify({ event: 'face_detection_unavailable',
            reason: error.message.slice(0, 200) }));
          return resolve(null);
        }
        try {
          const report = JSON.parse(stdout) as FaceReport;
          if (!Array.isArray(report.samples) || !report.samples.length) return resolve(null);
          resolve(report);
        } catch { resolve(null); }
      });
  });
}
