import { afterEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { execFFmpeg } from '../apps/worker/src/render/exec';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));
afterEach(() => vi.restoreAllMocks());
function child() {
  const proc = Object.assign(new EventEmitter(), { stderr: new PassThrough(), kill: vi.fn() });
  vi.mocked(spawn).mockReturnValue(proc as unknown as ReturnType<typeof spawn>);
  return proc;
}
it('RD-002 logs exit code and stderr tail when ffmpeg fails', async () => {
  const proc = child(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const result = execFFmpeg(['-i', '/local/source']);
  proc.stderr.write('unneeded\n'.repeat(10000) + 'No such filter: broken_filter\n');
  proc.emit('close', 7, null);
  await expect(result).rejects.toThrow('ffmpeg_failed');
  const record = JSON.parse(log.mock.calls[0]![0] as string);
  expect(record).toMatchObject({ event: 'ffmpeg_failed', exit_code: 7, signal: null });
  expect(record.stderr_tail).toContain('No such filter: broken_filter');
  expect(record.stderr_tail.length).toBeLessThanOrEqual(4096);
  expect(log).toHaveBeenCalledTimes(1);
});
it('RD-002 signed URLs and credentials never reach failure logs', async () => {
  const proc = child(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const result = execFFmpeg([]);
  proc.stderr.write('Cannot open https://user:pw@example.invalid/file?X-Amz-Signature=PRIVATE_SIGNATURE&X-Amz-Credential=PRIVATE_KEY\n');
  proc.stderr.write('Authorization: Bearer PRIVATE_BEARER\nCookie: session=PRIVATE_COOKIE\n');
  proc.stderr.write('X-Amz-Security-Token=PRIVATE_TOKEN\npassword=PRIVATE_PASSWORD\nInvalid argument\n');
  proc.emit('close', 1, null);
  await expect(result).rejects.toThrow('ffmpeg_failed');
  expect(log).toHaveBeenCalledTimes(1);
  const logged = JSON.stringify(log.mock.calls);
  expect(logged).toContain('Invalid argument');
  expect(logged).not.toMatch(/PRIVATE_|https:\/\/|user:pw/);
});
it('RD-002 timeout logs signal and final stderr after killing and awaiting close', async () => {
  const proc = child(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const abort = new AbortController(), result = execFFmpeg([], 1000, abort.signal);
  abort.abort();
  expect(proc.kill).toHaveBeenCalledWith('SIGKILL');
  expect(log).not.toHaveBeenCalled();
  proc.stderr.write('last diagnostic\n'); proc.emit('close', null, 'SIGKILL');
  await expect(result).rejects.toThrow('ffmpeg_timeout');
  expect(JSON.parse(log.mock.calls[0]![0] as string)).toMatchObject({ event: 'ffmpeg_timeout', exit_code: null, signal: 'SIGKILL', stderr_tail: 'last diagnostic' });
});
it('RD-002 spawn failure logs safe code once without raw process arguments', async () => {
  const proc = child(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const result = execFFmpeg([]);
  proc.emit('error', Object.assign(new Error('PRIVATE_SECRET'), { code: 'ENOENT' }));
  proc.emit('close', -2, null);
  await expect(result).rejects.toThrow('ffmpeg_failed');
  expect(log).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(log.mock.calls)).toContain('ENOENT');
  expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_SECRET');
});
it('RD-002 buffer truncation never exposes the tail of a long signed URL', async () => {
  const proc = child(), log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const result = execFFmpeg([]);
  proc.stderr.write('https://example.invalid/?X-Amz-Signature=' + 'PRIVATE_'.repeat(15000));
  proc.stderr.write('\nInvalid input\n'); proc.emit('close', 1, null);
  await expect(result).rejects.toThrow('ffmpeg_failed');
  expect(JSON.stringify(log.mock.calls)).toContain('Invalid input');
  expect(JSON.stringify(log.mock.calls)).not.toContain('PRIVATE_');
});
