import type { CitationDocument } from '@n6b/db';
import type { AnswerPayload } from './provider/port.js';
import type { ChunkHit } from './search.js';

export interface Citation {
  readonly chunk_id: string;
  readonly title: string;
  readonly label: string;
  readonly url: string | null;
}

export function citationRefusal(out: AnswerPayload, good: readonly ChunkHit[]): 'model_unknown' | 'invalid_citation' | null {
  if (out.unknown || out.cited_ids.length === 0) return 'model_unknown';
  const allowed = new Set(good.map((h) => h.id));
  if (out.cited_ids.some((id) => !allowed.has(id))) return 'invalid_citation';
  return null;
}

export function resolveCitations(ids: readonly string[], documents: readonly CitationDocument[]): Citation[] | null {
  const byId = new Map(documents.map((d) => [d.chunk_id, d]));
  const citations: Citation[] = [];
  for (const id of new Set(ids)) {
    const d = byId.get(id);
    if (!d) return null;
    if (d.kind === 'pdf') {
      if (!d.file_name || !Number.isSafeInteger(d.locator_page) || d.locator_page! < 1) return null;
      citations.push({ chunk_id: id, title: d.title, label: `${d.file_name}, стр. ${d.locator_page}`, url: null });
    } else {
      if (!d.locator_url) return null;
      try {
        const url = new URL(d.locator_url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
      } catch { return null; }
      citations.push({ chunk_id: id, title: d.title, label: d.title, url: d.locator_url });
    }
  }
  return citations;
}

/** Model text is rendered as plain React text; remove links even inside Markdown/HTML. */
export function stripModelUrls(text: string): string {
  return text.replace(/(?:[a-z][a-z0-9+.-]*:\/{0,2}|\/\/|www\.)[^\s<>"'\[\]()]+/gi, '')
    .replace(/(?<![\p{L}\p{N}_-])(?:[\p{L}\p{N}-]+\.)+[\p{L}]{2,}(?![\p{L}\p{N}_-])(?::\d+)?(?:[/?#][^\s<>"'\[\]()]*)?/giu, '')
    .trim();
}
