// Untrusted media metadata and process errors may contain credentials. Never log argv/Error objects.
export function safeDiagnostic(text: string): string {
  return text.replace(/\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]+/gi, '[redacted-url]')
    .split(/[\r\n]+/)
    .map(line => /authorization|cookie|x-amz-|x-goog-|(?:api[_-]?key|secret|password|token|signature)\s*[=:]/i.test(line)
      ? '[redacted-credentials]' : line)
    .join('\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '').trim()
    .split('\n').slice(-20).join('\n').slice(-4096);
}
export function renderErrorMessage(error: unknown): string {
  return safeDiagnostic(error instanceof Error ? error.message : typeof error === 'string' ? error : 'Unknown render error');
}
