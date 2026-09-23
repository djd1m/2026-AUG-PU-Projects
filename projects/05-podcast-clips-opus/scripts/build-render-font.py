"""Reproducible ClipMaker Narrow derivative; requires fontTools only when regenerating assets.
Horizontal compression 70%; vertical outlines/em unchanged. GPL-2 font exception retained.
The original editable TTF and license are distributed alongside the derivative.
"""
from pathlib import Path
import json, hashlib
from fontTools.ttLib import TTFont
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.pens.transformPen import TransformPen
root = Path(__file__).resolve().parents[1] / 'apps/worker/assets/fonts'
font = TTFont(root / 'LiberationSansNarrow-Bold.ttf', recalcTimestamp=False)
glyphs = font.getGlyphSet()
# Decompose before transforming so composites are not condensed twice.
from fontTools.pens.recordingPen import DecomposingRecordingPen
recordings = {}
for name in font.getGlyphOrder():
    pen = DecomposingRecordingPen(glyphs); glyphs[name].draw(pen); recordings[name] = pen
for name, recording in recordings.items():
    pen = TTGlyphPen(None); recording.replay(TransformPen(pen, (0.7, 0, 0, 1, 0, 0)))
    font['glyf'][name] = pen.glyph()
    advance, bearing = font['hmtx'][name]
    font['hmtx'][name] = (round(advance * 0.7), round(bearing * 0.7))
for tag in ('kern', 'GPOS', 'GSUB', 'hdmx', 'LTSH', 'VDMX'):
    if tag in font: del font[tag]
for rec in font['name'].names:
    if rec.nameID in (1, 2, 3, 4, 6, 16, 17):
        value = 'Bold' if rec.nameID in (2, 17) else 'ClipMakerNarrow-Bold' if rec.nameID == 6 else 'ClipMaker Narrow'
        rec.string = value.encode(rec.getEncoding())
output = root / 'ClipMakerNarrow-Bold.ttf'; font.save(output)
font = TTFont(output)
metrics = {'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'unitsPerEm': font['head'].unitsPerEm,
           'advance': {str(cp): font['hmtx'][name][0] for cp, name in font.getBestCmap().items()}}
(Path(__file__).resolve().parents[1] / 'packages/shared/src/watermark-metrics.json').write_text(json.dumps(metrics, sort_keys=True) + '\n')
