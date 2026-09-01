#!/usr/bin/env node
'use strict';

const crypto = require('node:crypto');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const CARRIER = path.join('.claude', 'insights', 'index.md');
const DATE_HEADING = /^##\s+\d{4}-\d{2}-\d{2}/gm;
const TEACH_OPTIONS = Object.freeze({
  encoding: 'utf8',
  timeout: 1500,
  killSignal: 'SIGTERM',
  maxBuffer: 1024 * 1024,
  shell: false,
});

class InsightValidationError extends Error {}

function normalizeText(value, field, { singleLine = false } = {}) {
  if (typeof value !== 'string') {
    throw new InsightValidationError(`${field} must be a string`);
  }
  const normalized = value.replace(/\r\n?/g, '\n').trim();
  if (!normalized) throw new InsightValidationError(`${field} must not be blank`);
  if (singleLine && normalized.includes('\n')) {
    throw new InsightValidationError(`${field} must be one line`);
  }
  return normalized;
}

function normalizeArray(value, field) {
  if (!Array.isArray(value)) {
    throw new InsightValidationError(`${field} must be an array`);
  }
  return value.map((member, index) => {
    if (typeof member !== 'string') {
      throw new InsightValidationError(`${field}[${index}] must be a string`);
    }
    const normalized = member.replace(/\r\n?/g, '\n').trim();
    if (normalized.includes('\n')) {
      throw new InsightValidationError(`${field}[${index}] must be one line`);
    }
    return normalized;
  }).filter(Boolean);
}

function normalizeDate(value) {
  const date = normalizeText(value, 'date', { singleLine: true });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new InsightValidationError('date must use YYYY-MM-DD');
  }
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new InsightValidationError('date must be a real calendar date');
  }
  return date;
}

function normalizePayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new InsightValidationError('payload must be one JSON object');
  }
  return {
    date: normalizeDate(payload.date),
    title: normalizeText(payload.title, 'title', { singleLine: true }),
    tags: normalizeArray(payload.tags, 'tags'),
    problem: normalizeText(payload.problem, 'problem'),
    solution: normalizeText(payload.solution, 'solution'),
    references: normalizeArray(payload.references, 'references'),
  };
}

function semanticId(record) {
  const semantic = {
    title: record.title,
    tags: record.tags,
    problem: record.problem,
    solution: record.solution,
    references: record.references,
  };
  return crypto.createHash('sha256').update(JSON.stringify(semantic)).digest('hex');
}

function stableTeachText(record) {
  const tags = record.tags.length ? record.tags.join(', ') : 'none';
  const references = record.references.length ? record.references.join(', ') : 'none';
  // Date stays out because cross-date semantic duplicates must share one projection identity.
  return [
    'p-replicator insight',
    `Title: ${record.title}`,
    `Tags: ${tags}`,
    'Problem:',
    record.problem,
    'Solution:',
    record.solution,
    `References: ${references}`,
  ].join('\n');
}

function teachFailure(error) {
  if (error && error.code === 'ENOENT') return { state: 'absent' };
  if (error && error.code === 'ETIMEDOUT') return { state: 'failed', reason: 'timeout' };
  const code = error && typeof error.code === 'string' && /^[A-Z0-9_-]{1,32}$/.test(error.code)
    ? error.code
    : 'unknown';
  return { state: 'failed', reason: `spawn ${code}` };
}

function teachDuplicate(record, projectRoot, { runner = childProcess.spawnSync } = {}) {
  let temporary;
  try {
    temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'p-replicator-insight-teach-'));
    const input = path.join(temporary, 'insight.json');
    const rows = [{
      pattern: stableTeachText(record),
      type: 'lesson-learned',
      reward: 0.8,
      domain: 'p-replicator-insights',
    }];
    fs.writeFileSync(input, JSON.stringify(rows) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    let result;
    try {
      result = runner('dz', ['teach', '--from-json', input, '--project', projectRoot], {
        ...TEACH_OPTIONS,
        cwd: projectRoot,
      });
    } catch (error) {
      return teachFailure(error);
    }
    if (result.error) return teachFailure(result.error);
    if (result.status !== 0) {
      const status = Number.isInteger(result.status) ? result.status : 'unknown';
      return { state: 'failed', reason: `exit ${status}` };
    }
    return { state: 'ok' };
  } catch (_error) {
    return { state: 'failed', reason: 'prepare import' };
  } finally {
    if (temporary) {
      try { fs.rmSync(temporary, { recursive: true, force: true }); } catch (_error) {}
    }
  }
}

function renderEntry(record, id) {
  const tags = record.tags.length ? record.tags.join(', ') : 'none';
  const references = record.references.length ? record.references.join(', ') : 'none';
  return [
    `## ${record.date} — ${record.title}`,
    '',
    `<!-- insight-id: sha256:${id} -->`,
    `**Tags:** ${tags}`,
    '',
    '**Problem:**',
    record.problem,
    '',
    '**Solution:**',
    record.solution,
    '',
    `**References:** ${references}`,
    '',
    '---',
    '',
  ].join('\n');
}

function entryCount(content) {
  return (content.match(DATE_HEADING) || []).length;
}

function appendBoundary(content) {
  if (!content) return '';
  if (content.endsWith('\n\n')) return '';
  if (content.endsWith('\n')) return '\n';
  return '\n\n';
}

function atomicReplace(index, content) {
  const temporary = `${index}.tmp-${process.pid}-${crypto.randomBytes(8).toString('hex')}`;
  try {
    fs.writeFileSync(temporary, content, { encoding: 'utf8', flag: 'wx' });
    fs.renameSync(temporary, index);
  } catch (error) {
    try { fs.rmSync(temporary, { force: true }); } catch (_cleanupError) {}
    throw error;
  }
}

function writeInsight(projectRoot, payload, options = {}) {
  if (typeof projectRoot !== 'string' || !path.isAbsolute(projectRoot)) {
    throw new InsightValidationError('project root must be absolute');
  }

  // Validate the complete record before even creating the missing parent directory.
  const record = normalizePayload(payload);
  const id = semanticId(record);
  const marker = `<!-- insight-id: sha256:${id} -->`;
  const insightsDir = path.resolve(projectRoot, '.claude', 'insights');
  const index = path.join(insightsDir, 'index.md');
  const existed = fs.existsSync(index);
  const current = existed ? fs.readFileSync(index, 'utf8') : '';

  let receipt;
  if (current.includes(marker)) {
    receipt = { status: 'duplicate', path: CARRIER.split(path.sep).join('/'),
      entryCount: entryCount(current), id: `sha256:${id}` };
  } else {
    const next = current + appendBoundary(current) + renderEntry(record, id);
    fs.mkdirSync(insightsDir, { recursive: true });
    atomicReplace(index, next);
    receipt = { status: existed ? 'appended' : 'created', path: CARRIER.split(path.sep).join('/'),
      entryCount: entryCount(next), id: `sha256:${id}` };
  }
  receipt.teach = teachDuplicate(record, projectRoot, options);
  return receipt;
}

function projectRoot() {
  const fromHost = process.env.CLAUDE_PROJECT_DIR;
  return (fromHost && path.isAbsolute(fromHost))
    ? fromHost
    : path.resolve(__dirname, '..', '..');
}

function main() {
  try {
    const raw = fs.readFileSync(0, 'utf8');
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (_error) {
      throw new InsightValidationError('stdin must contain one valid JSON object');
    }
    const result = writeInsight(projectRoot(), parsed);
    if (result.teach.state === 'failed') {
      process.stderr.write(
        `[write-insight] dz teach unavailable: ${result.teach.reason}; Markdown retained\n`,
      );
    }
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    const kind = error instanceof InsightValidationError ? 'invalid input' : 'write failed';
    process.stderr.write(`[write-insight] ${kind}: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { writeInsight, normalizePayload, stableTeachText, teachDuplicate };

if (require.main === module) main();
