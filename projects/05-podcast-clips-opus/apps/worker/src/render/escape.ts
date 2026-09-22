// Transferred from jan-clone/apps/worker/lib/ffmpeg.ts.
export function escapeDrawtext(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:');
}

export function escapeFFmpegPath(filePath: string): string {
  return filePath
    .replace(/\\/g, '\\\\\\\\')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");
}

export function escapeAssText(text: string): string {
  return text
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}');
}
