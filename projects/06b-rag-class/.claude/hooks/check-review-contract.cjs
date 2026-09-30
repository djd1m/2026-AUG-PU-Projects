#!/usr/bin/env node
'use strict';

/**
 * Validate the feature review's binding to the specification it judged.
 *
 * Usage: node check-review-contract.cjs <project-root> <feature-slug>
 * Exit 0: contract passes; 1: named contract gaps; 2: inputs could not be established.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const AC_ID_SOURCE = 'AC-[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*-[0-9]+';
const AC_HEADING = new RegExp('^###\\s+(' + AC_ID_SOURCE + ')(?:\\s|$)');
const FAMILIES = new Set(['claude', 'codex', 'human', 'unknown']);
const VERDICTS = new Set(['met', 'not met', 'unverifiable']);

function say(line) { process.stdout.write(line + '\n'); }

function cannotCheck(reason) {
  say('NOT-ESTABLISHED review contract: ' + reason);
  process.exit(2);
}

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep)
    && !path.isAbsolute(relative);
}

function projectRoot(input) {
  let root;
  try { root = fs.realpathSync(path.resolve(input)); } catch (error) {
    cannotCheck('project root is missing or unreadable: ' + ((error && error.message) || error));
  }
  let stat;
  try { stat = fs.statSync(root); } catch (error) {
    cannotCheck('project root cannot be inspected: ' + ((error && error.message) || error));
  }
  if (!stat.isDirectory()) cannotCheck('project root is not a directory: ' + root);
  return root;
}

function safeRead(root, relative, label) {
  const candidate = path.resolve(root, relative);
  if (!isInside(root, candidate)) cannotCheck(label + ' escapes the project root: ' + relative);

  let current = root;
  const parts = path.relative(root, candidate).split(path.sep);
  for (let index = 0; index < parts.length; index++) {
    current = path.join(current, parts[index]);
    let stat;
    try { stat = fs.lstatSync(current); } catch (error) {
      cannotCheck(label + ' is missing or unreadable: ' + current + ' ('
        + ((error && error.message) || error) + ')');
    }
    if (stat.isSymbolicLink()) cannotCheck(label + ' is a symlink: ' + current);
    if (index < parts.length - 1 && !stat.isDirectory()) {
      cannotCheck(label + ' has a non-directory path component: ' + current);
    }
    if (index === parts.length - 1) {
      if (!stat.isFile()) cannotCheck(label + ' is not a regular file: ' + current);
      if ((stat.mode & 0o444) === 0) cannotCheck(label + ' is unreadable: ' + current);
    }
  }

  let real;
  try { real = fs.realpathSync(candidate); } catch (error) {
    cannotCheck(label + ' cannot be resolved: ' + ((error && error.message) || error));
  }
  if (!isInside(root, real)) cannotCheck(label + ' resolves outside the project root: ' + real);

  try { return fs.readFileSync(real); } catch (error) {
    cannotCheck(label + ' is unreadable: ' + ((error && error.message) || error));
  }
}

function specificationIds(buffer) {
  const lines = buffer.toString('utf8').split(/\n/).map((line) => line.replace(/\r$/, ''));
  const ids = [];
  let fence = '';
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const marker = line.trimStart().match(/^(```|~~~)/);
    if (marker) {
      if (!fence) fence = marker[1][0];
      else if (marker[1][0] === fence) fence = '';
      continue;
    }
    if (fence) continue;
    if (!/^###\s+AC-/.test(line)) continue;
    const match = line.match(AC_HEADING);
    if (!match) cannotCheck('malformed AC heading at specification line ' + (index + 1));
    ids.push(match[1]);
  }
  if (fence) cannotCheck('specification has an unclosed fenced code block');
  const duplicate = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  if (duplicate.length) cannotCheck('specification has duplicate AC id: ' + duplicate.join(', '));
  return ids;
}

function reportRows(lines, gaps) {
  const section = lines.findIndex((line) => line.trim() === '## Spec conformance');
  if (section < 0) {
    gaps.push('GAP Spec conformance section missing');
    return [];
  }

  let header = -1;
  for (let index = section + 1; index < lines.length; index++) {
    if (/^##\s+/.test(lines[index])) break;
    if (lines[index].trim() === '| Criterion | Verdict | Evidence |') {
      header = index;
      break;
    }
  }
  if (header < 0 || !/^\|\s*-+\s*\|\s*-+\s*\|\s*-+\s*\|$/.test((lines[header + 1] || '').trim())) {
    gaps.push('GAP Spec conformance table missing or malformed');
    return [];
  }

  const rows = [];
  for (let index = header + 2; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) break;
    if (/^##?\s+/.test(line)) break;
    if (!line.trimStart().startsWith('|')) break;
    const match = line.match(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]*?)\s*\|\s*$/);
    if (!match) cannotCheck('malformed Spec conformance row at report line ' + (index + 1));
    rows.push({ id: match[1].trim(), verdict: match[2].trim(), evidence: match[3].trim() });
  }
  return rows;
}

function validateReport(specification, report, slug) {
  const ids = specificationIds(specification);
  const idSet = new Set(ids);
  const lines = report.toString('utf8').split(/\n/).map((line) => line.replace(/\r$/, ''));
  const firstTwenty = lines.slice(0, 20);
  const gaps = [];

  const familyLine = firstTwenty.find((line) => /^Reviewer family:/.test(line));
  if (familyLine === undefined) gaps.push('GAP Reviewer family line missing');
  else {
    const family = familyLine.replace(/^Reviewer family:\s*/, '').trim();
    if (!FAMILIES.has(family)) gaps.push('GAP Reviewer family invalid value=' + (family || '<empty>'));
  }

  const revisionLines = firstTwenty.filter((line) => /^Spec revision:/.test(line));
  if (revisionLines.length !== 1) {
    cannotCheck('first 20 report lines require exactly one Spec revision line');
  }
  const revision = revisionLines[0].match(/^Spec revision: sha256:([a-f0-9]{64})$/);
  if (!revision) cannotCheck('malformed Spec revision line in first 20 report lines');
  const actual = crypto.createHash('sha256').update(specification).digest('hex');
  if (revision[1] !== actual) {
    gaps.push('GAP Spec revision mismatch report=' + revision[1].slice(0, 12)
      + ' specification=' + actual.slice(0, 12));
  }

  const rows = reportRows(lines, gaps);
  const counts = new Map();
  for (const row of rows) counts.set(row.id, (counts.get(row.id) || 0) + 1);

  for (const id of ids) {
    if (!counts.has(id)) gaps.push('GAP ' + id + ' has no Spec conformance row');
  }
  for (const row of rows) {
    if (!idSet.has(row.id)) gaps.push('GAP ' + row.id + ' row id is not in the specification');
    if ((counts.get(row.id) || 0) > 1 && rows.findIndex((item) => item.id === row.id) === rows.indexOf(row)) {
      gaps.push('GAP ' + row.id + ' duplicate Spec conformance row');
    }
    if (!VERDICTS.has(row.verdict)) {
      gaps.push('GAP ' + row.id + ' verdict invalid value=' + (row.verdict || '<empty>'));
    }
    if ((row.verdict === 'met' || row.verdict === 'not met') && !row.evidence) {
      gaps.push('GAP ' + row.id + ' evidence empty for verdict=' + row.verdict);
    }
  }

  if (gaps.length) {
    for (const gap of gaps) say(gap);
    process.exit(1);
  }
  say('PASS review-contract feature=' + slug + ' AC-ids=' + ids.length + ' rows=' + rows.length);
  process.exit(0);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2) cannotCheck('usage: node check-review-contract.cjs <project-root> <feature-slug>');
  const [rootInput, slug] = args;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(slug)) cannotCheck('malformed feature slug: ' + slug);
  const root = projectRoot(rootInput);
  const base = path.join('docs', 'features', slug);
  const specification = safeRead(root, path.join(base, '01_specification.md'), 'specification');
  const report = safeRead(root, path.join(base, 'review-report.md'), 'review report');
  validateReport(specification, report, slug);
}

try { main(); } catch (error) {
  cannotCheck('internal error: ' + String((error && error.message) || error));
}
