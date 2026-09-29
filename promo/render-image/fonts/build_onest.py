#!/usr/bin/env python3
"""Сборка статических TTF «Onest» из подмножеств @fontsource-variable/onest.

Fontsource раздаёт шрифт кусками по unicode-range (cyrillic, latin, …), каждый —
вариативный woff2. Браузеру этого достаточно (unicode-range в @font-face), а
ffmpeg drawtext и fontconfig берут ОДИН файл: в кириллическом куске нет даже
тире «—» (U+2014), оно в латинском. Поэтому здесь: каждый кусок → статический
экземпляр нужной насыщенности → слияние кусков в один TTF на насыщенность.

Вход:  argv[1] — каталог files/ пакета; argv[2] — каталог вывода.
Выход: Onest-<Weight>.ttf. Отказ (код 1) — если в результате нет кириллицы или тире.
"""
import os
import sys
import tempfile

from fontTools.merge import Merger
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SUBSETS = ["latin", "latin-ext", "cyrillic", "cyrillic-ext"]
WEIGHTS = {400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold"}
REQUIRED = [ord(c) for c in "Суфлёр — проверка кириллицы AZaz09"]


def set_names(font, style, weight):
    family = "Onest"
    full = f"{family} {style}"
    ps = f"{family}-{style}"
    name = font["name"]
    # Убираем всё про вариации и прежние имена, пишем заново.
    name.names = [n for n in name.names if n.nameID not in (1, 2, 3, 4, 6, 16, 17, 25)]
    for nid, val in ((1, family), (2, style if style in ("Regular", "Bold") else "Regular"),
                     (3, f"fontsource-5.3.1;{ps}"), (4, full), (6, ps),
                     (16, family), (17, style)):
        if nid == 1 and style not in ("Regular", "Bold"):
            val = full  # legacy-семейство для «нестандартных» насыщенностей
        name.setName(val, nid, 3, 1, 0x409)
    font["OS/2"].usWeightClass = weight


def main():
    src, out = sys.argv[1], sys.argv[2]
    os.makedirs(out, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        for weight, style in WEIGHTS.items():
            parts = []
            for sub in SUBSETS:
                f = TTFont(os.path.join(src, f"onest-{sub}-wght-normal.woff2"))
                f.flavor = None
                static = instancer.instantiateVariableFont(f, {"wght": weight})
                p = os.path.join(tmp, f"{sub}-{weight}.ttf")
                static.save(p)
                parts.append(p)
            merged = Merger().merge(parts)
            set_names(merged, style, weight)
            dst = os.path.join(out, f"Onest-{style}.ttf")
            merged.save(dst)
            cmap = TTFont(dst).getBestCmap()
            missing = [chr(c) for c in REQUIRED if c not in cmap]
            if missing:
                print(f"ОТКАЗ: в {dst} нет символов {missing!r}", file=sys.stderr)
                return 1
            print(f"ok {dst}: {len(cmap)} символов")
    return 0


if __name__ == "__main__":
    sys.exit(main())
