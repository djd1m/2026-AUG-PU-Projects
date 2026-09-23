#!/usr/bin/env python3
"""Поиск лиц в кадрах клипа для выбора кадрирования (FR-2, FR-3).

Печатает JSON в stdout. Ничего не решает про раскладку — только СООБЩАЕТ, где лица и где их нет.
Замер БЕЗ лица — это данные, а не пропуск: именно по ним видно, что камера ушла на общий план,
и кадр не должен продолжать смотреть в прежнюю точку.

Кадры берутся ОДНИМ проходом ffmpeg через конвейер. Прежняя версия запускала ffmpeg на каждый
кадр отдельно, и это стоило около секунды за замер — из-за чего шаг приходилось держать в 2 с,
а после каждой склейки кадр до двух секунд смотрел не туда.

Аргументы: <видео> <начало_сек> <конец_сек> <шаг_сек> <модель.onnx>
"""
import json
import subprocess
import sys

import cv2
import numpy as np

SCORE = 0.6
NMS = 0.3
TOPK = 20
LONG_SIDE = 640   # кадр уменьшается перед поиском: лицо остаётся различимым, счёт втрое быстрее


def main():
    path, start, end, step, model = sys.argv[1], float(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]

    probe = subprocess.run(
        ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
         '-show_entries', 'stream=width,height', '-of', 'json', path],
        capture_output=True, timeout=30)
    stream = json.loads(probe.stdout)['streams'][0]
    width, height = int(stream['width']), int(stream['height'])

    scale = LONG_SIDE / max(width, height)
    small = (int(width * scale), int(height * scale))
    detector = cv2.FaceDetectorYN.create(model, '', small, SCORE, NMS, TOPK)

    fps = 1.0 / step
    frame_bytes = width * height * 3
    proc = subprocess.Popen(
        ['ffmpeg', '-v', 'error', '-ss', f'{start:.3f}', '-t', f'{max(0.0, end - start):.3f}',
         '-i', path, '-vf', f'fps={fps:.6f}', '-f', 'rawvideo', '-pix_fmt', 'bgr24', '-'],
        stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)

    samples = []
    index = 0
    try:
        while True:
            raw = proc.stdout.read(frame_bytes)
            if len(raw) != frame_bytes:
                break
            frame = np.frombuffer(raw, np.uint8).reshape(height, width, 3)
            _, faces = detector.detect(cv2.resize(frame, small))
            found = []
            if faces is not None:
                for f in faces:
                    x, y, w, h = (float(v) / scale for v in f[:4])
                    found.append({
                        'cx': round((x + w / 2) / width, 4),   # доли кадра, а не пиксели:
                        'cy': round((y + h / 2) / height, 4),  # вызывающий не обязан знать размер
                        'w': round(w / width, 4),
                        'h': round(h / height, 4),
                        'score': round(float(f[-1]), 3),
                    })
            samples.append({'t': round(start + index * step, 2), 'faces': found})
            index += 1
    finally:
        proc.stdout.close()
        proc.wait(timeout=30)

    json.dump({'width': width, 'height': height, 'step': step, 'samples': samples}, sys.stdout)


if __name__ == '__main__':
    main()
