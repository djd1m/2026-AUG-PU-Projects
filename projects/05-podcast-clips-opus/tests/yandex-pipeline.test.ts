import { expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ClientDuplexStream } from '@grpc/grpc-js';
import { createYandexTranscriber, type YandexConnect } from '../apps/worker/src/stt/yandex';
import { extractAudio, runFfmpeg } from '../apps/worker/src/stt/extract';
import { splitAudio, chunkBoundaries } from '../apps/worker/src/stt/chunker';
import { probeFile } from '../apps/worker/src/media/probe';
import { mergeWords } from '../apps/worker/src/stt/merge';
import { createSelector } from '../apps/worker/src/llm/provider';
import { loadLlmConfig } from '../packages/shared/src/config';
import { validateFragments } from '../packages/shared/src/fragments';
import { fakeFragment } from '../apps/worker/src/llm/fake';
import { renderClip } from '../apps/worker/src/render/ffmpeg';
import { generateSubtitleFile } from '../apps/worker/src/render/subtitles';
import { environment } from './fixtures/environment';
it('offline >180s synthetic speech: pause-aware MP3 chunks → Yandex actual fields → overlap merge → segment selection → word snap → real FFmpeg subtitles', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'n5-yandex-pipeline-'));
  const signal = AbortSignal.timeout(110_000), source = join(directory, 'source.mp4'), output = join(directory, 'clip.mp4');
  try {
    // Own synthetic speech; provider words below are injected, never live quality evidence.
    await runFfmpeg(['-y', '-stream_loop', '-1', '-i', 'tests/fixtures/yandex-synthetic-ru.mp3', '-f', 'lavfi', '-i', 'color=c=0x224466:s=320x180:r=2:d=220',
      '-af', "volume=0:enable='between(t,178,180)'", '-t', '220', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-c:a', 'aac', source], signal);
    const duration = (await probeFile(source)).durationSec;
    expect(duration).toBeGreaterThan(180);
    const audio = await extractAudio(source, join(directory, 'audio.mp3'), duration, signal);
    expect(audio.pauses.some(time => time > 178 && time < 180)).toBe(true);
    const boundaries = chunkBoundaries(duration, audio.pauses);
    expect(boundaries).toHaveLength(2); expect(boundaries[0]!.hardCut).toBe(false);
    expect(boundaries[0]!.durationSeconds).toBeGreaterThanOrEqual(160); expect(boundaries[0]!.durationSeconds).toBeLessThanOrEqual(200);
    expect(boundaries[0]!.durationSeconds - boundaries[1]!.offsetSeconds).toBe(2);
    const globalWords = Array.from({ length: 46 }, (_, index) => ({ word: `слово${index}`, start: 160.2 + index, end: 160.8 + index }));
    const results = [];
    let rpcCount = 0;
    for await (const chunk of splitAudio(audio, directory, duration, signal)) {
      const measured = await probeFile(chunk.path); expect(measured.hasAudio).toBe(true);
      const words = globalWords.filter(word => word.start >= chunk.offsetSeconds && word.end <= chunk.offsetSeconds + chunk.durationSeconds);
      const open: YandexConnect = () => {
        rpcCount++;
        const call = new EventEmitter() as ClientDuplexStream<object, unknown>;
        call.write = () => true; call.cancel = vi.fn();
        call.end = (() => { call.emit('finish'); queueMicrotask(() => {
          call.emit('data', { Event: 'final', channel_tag: '0', audio_cursors: { final_index: '0' }, final: { alternatives: [{
            text: `Реальный контекст чанка ${chunk.index}`, start_time_ms: String(Math.round((words[0]!.start - chunk.offsetSeconds) * 1000)),
            end_time_ms: String(Math.round((words.at(-1)!.end - chunk.offsetSeconds) * 1000)), languages: [],
            words: words.map(word => ({ text: word.word, start_time_ms: String(Math.round((word.start - chunk.offsetSeconds) * 1000)), end_time_ms: String(Math.round((word.end - chunk.offsetSeconds) * 1000)) })),
          }] } }); call.emit('end'); call.emit('status', { code: 0 });
        }); return call; }) as typeof call.end;
        return { call, close: () => {} };
      };
      results.push({ result: await createYandexTranscriber('synthetic', open).transcribe(chunk.path, chunk.durationSeconds, signal), offsetSeconds: chunk.offsetSeconds, durationSeconds: chunk.durationSeconds });
    }
    expect(rpcCount).toBe(2);
    const transcript = mergeWords(results, duration, (await probeFile(audio.path)).durationSec);
    expect(transcript.words).toHaveLength(globalWords.length);
    expect(new Set(transcript.words.map(word => word.word)).size).toBe(globalWords.length);
    transcript.words.forEach((word, index) => { expect(word.start).toBeCloseTo(globalWords[index]!.start, 2); expect(word.end).toBeCloseTo(globalWords[index]!.end, 2); });
    const request = vi.fn<typeof fetch>(async () => Response.json({ choices: [{ message: { content: JSON.stringify({ fragments: [{ ...fakeFragment(), start_seconds: 160.13, end_seconds: 201.62 }] }) } }] }));
    const selector = createSelector(loadLlmConfig({ ...environment(), N5_MODEL_PROVIDER: 'live', N5_LLM_PROVIDER: 'cloudru', N5_LLM_MODEL: 'deepseek-ai/DeepSeek-V4-Pro', CLOUDRU_FM_API_KEY: 'synthetic' }), request);
    const selection = validateFragments(await selector.select(transcript, duration, signal), transcript, duration);
    expect(selection).toHaveLength(1);
    const fragment = selection[0]!; expect(fragment.start_seconds).toBeCloseTo(160.2, 2); expect(fragment.end_seconds).toBeCloseTo(201.8, 2);
    const body = JSON.parse(String(request.mock.calls[0]![1]!.body));
    expect(JSON.parse(body.messages[1]!.content).transcript.segments).toEqual(transcript.segments);
    const subtitles = generateSubtitleFile(transcript.words, fragment.start_seconds, fragment.end_seconds, 'portrait')!;
    const events = subtitles.split('\n').filter(line => line.startsWith('Dialogue:'));
    expect(events.length).toBeGreaterThan(20);
    const starts = events.map(line => line.split(',')[1]!); expect(starts).toEqual([...starts].sort());
    await renderClip({ inputPath: source, outputPath: output, startTime: fragment.start_seconds, endTime: fragment.end_seconds,
      words: transcript.words, format: 'portrait', watermark: true, origin: 'https://clipmkr.ru', code: 'WWWWWW', signal });
    expect((await readFile(output)).length).toBeGreaterThan(1000);
    const rendered = await probeFile(output); expect(rendered.durationSec).toBeCloseTo(fragment.end_seconds - fragment.start_seconds, 0);
    console.info(JSON.stringify({ event: 'yandex_offline_pipeline', duration_seconds: duration, chunks: boundaries, actual_words: transcript.words.length, subtitle_events: events.length }));
  } finally { await rm(directory, { recursive: true, force: true }); }
}, 120_000);
