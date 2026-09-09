#!/usr/bin/env node

import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  readdirSync,
  rmSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';

const usage = `Usage: n3-check-feature-catalog.mjs PROJECT_ROOT TARGET_CATALOG [modes]

TARGET_CATALOG must resolve to PROJECT_ROOT/docs/features/<slug>.
Modes: --traceability --report-revision --criterion-scenarios --completion
With no modes, the three PLAN modes are run (all except --completion).

Exit 0: the selected contour passed every requested mode
Exit 1: the unchanged vendor checker established a content gap
Exit 2: a trustworthy scoped comparison could not be established`;

const allowedModes = new Set([
  '--traceability',
  '--report-revision',
  '--criterion-scenarios',
  '--completion',
]);
const args = process.argv.slice(2);

function stop(message) {
  process.stderr.write(`NOT-ESTABLISHED scoped-catalog ${message}\n`);
  process.exitCode = 2;
  throw new Error('SCOPED_CHECK_STOP');
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(file)).digest('hex');
}

function isContained(root, candidate) {
  const rel = relative(root, candidate);
  return rel === '' || (!rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel));
}

function assertNoSymlinkPath(root, candidate, expectedType, label) {
  if (!isContained(root, candidate)) stop(`${label} escapes root path=${candidate}`);
  const rel = relative(root, candidate);
  const parts = rel === '' ? [] : rel.split(sep);
  let current = root;
  let stat;
  try {
    stat = lstatSync(current);
  } catch {
    stop(`${label} is missing path=${current}`);
  }
  if (stat.isSymbolicLink()) stop(`${label} uses symlink path=${current}`);
  for (const part of parts) {
    if (part === '' || part === '.' || part === '..') stop(`${label} has unsafe component path=${candidate}`);
    current = join(current, part);
    try {
      stat = lstatSync(current);
    } catch {
      stop(`${label} is missing path=${current}`);
    }
    if (stat.isSymbolicLink()) stop(`${label} uses symlink path=${current}`);
  }
  if (expectedType === 'file' && !stat.isFile()) stop(`${label} is not a regular file path=${candidate}`);
  if (expectedType === 'directory' && !stat.isDirectory()) stop(`${label} is not a directory path=${candidate}`);
  return current;
}

function findRepoRoot(projectRoot) {
  let candidate = projectRoot;
  for (;;) {
    const wrapper = join(candidate, 'projects/03-affiliate-rewardful/scripts/check-pipeline.mjs');
    const featureMap = join(candidate, '.claude/commands/feature.md');
    const projectMap = join(candidate, '.claude/skills/sparc-prd-mini/SKILL.md');
    try {
      if (lstatSync(wrapper).isFile() && lstatSync(featureMap).isFile() && lstatSync(projectMap).isFile()) {
        return candidate;
      }
    } catch {
      // Continue toward the filesystem root.
    }
    const parent = resolve(candidate, '..');
    if (parent === candidate) stop(`repository root could not be found from project=${projectRoot}`);
    candidate = parent;
  }
}

function walkRegularFiles(sourceRoot) {
  const files = [];
  function visit(directory, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const source = join(directory, entry.name);
      const rel = prefix ? join(prefix, entry.name) : entry.name;
      if (entry.isSymbolicLink()) stop(`catalog contains symlink path=${source}`);
      if (entry.isDirectory()) visit(source, rel);
      else if (entry.isFile()) files.push({ source, relative: rel });
      else stop(`catalog contains non-regular entry path=${source}`);
    }
  }
  visit(sourceRoot);
  return files;
}

function completionTestReferences(completionFile) {
  const lines = readFileSync(completionFile, 'utf8').replaceAll('\r\n', '\n').split('\n');
  const section = lines.findIndex((line) => line === '## Criterion coverage');
  if (section < 0) return [];
  let header = -1;
  for (let index = section + 1; index < lines.length && !/^##\s/.test(lines[index]); index += 1) {
    if (lines[index].trim() === '| Criterion | Test file | Test title |') {
      header = index;
      break;
    }
  }
  if (header < 0) return [];
  const references = [];
  for (let index = header + 2; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.trim() === '' || /^##?\s/.test(line) || !line.trimStart().startsWith('|')) break;
    const cells = line.split('|');
    if (cells.length === 5) references.push(cells[2].trim());
  }
  return [...new Set(references.filter(Boolean))].sort();
}

function safeProjectRelativeFile(projectRoot, rawPath) {
  if (rawPath.includes('\0') || isAbsolute(rawPath)) stop(`completion test path is unsafe path=${rawPath}`);
  const parts = rawPath.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    stop(`completion test path has unsafe component path=${rawPath}`);
  }
  const candidate = resolve(projectRoot, ...parts);
  assertNoSymlinkPath(projectRoot, candidate, 'file', 'completion test');
  return candidate;
}

try {
  if (args.length < 2 || args.includes('--help') || args.includes('-h')) {
    process.stderr.write(`${usage}\n`);
    process.exitCode = args.includes('--help') || args.includes('-h') ? 0 : 2;
  } else {
    const [projectArg, catalogArg, ...requested] = args;
    for (const mode of requested) {
      if (!allowedModes.has(mode)) stop(`unknown argument=${mode}`);
    }
    if (new Set(requested).size !== requested.length) stop('duplicate mode argument');
    if (catalogArg.split(/[\\/]/).includes('..')) stop(`target catalog contains path traversal path=${catalogArg}`);
    const modes = requested.length > 0
      ? requested
      : ['--traceability', '--report-revision', '--criterion-scenarios'];

    const projectLexical = resolve(projectArg);
    assertNoSymlinkPath(projectLexical, projectLexical, 'directory', 'project root');
    const projectRoot = realpathSync(projectLexical);
    const catalogLexical = isAbsolute(catalogArg) ? resolve(catalogArg) : resolve(projectRoot, catalogArg);
    const catalogRelative = relative(projectRoot, catalogLexical);
    const catalogParts = catalogRelative.split(sep);
    if (catalogParts.length !== 3 || catalogParts[0] !== 'docs' || catalogParts[1] !== 'features' ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(catalogParts[2])) {
      stop(`target catalog must be docs/features/<slug> path=${catalogArg}`);
    }
    assertNoSymlinkPath(projectRoot, catalogLexical, 'directory', 'target catalog');
    const catalog = realpathSync(catalogLexical);
    if (!isContained(projectRoot, catalog)) stop(`target catalog resolves outside project path=${catalogArg}`);

    const repoRoot = findRepoRoot(projectRoot);
    assertNoSymlinkPath(repoRoot, repoRoot, 'directory', 'repository root');
    const wrapper = join(repoRoot, 'projects/03-affiliate-rewardful/scripts/check-pipeline.mjs');
    const vendor = join(repoRoot, 'projects/03-affiliate-rewardful/node_modules/@dzhechkov/p-replicator/scripts/check-pipeline-gaps.sh');
    const featureMap = join(repoRoot, '.claude/commands/feature.md');
    const projectMap = join(repoRoot, '.claude/skills/sparc-prd-mini/SKILL.md');
    for (const [label, file] of [
      ['N3 wrapper', wrapper],
      ['vendor checker', vendor],
      ['feature role map', featureMap],
      ['project role map', projectMap],
    ]) assertNoSymlinkPath(repoRoot, file, 'file', label);

    const catalogFiles = walkRegularFiles(catalog);
    if (catalogFiles.length === 0) stop(`target catalog is empty path=${catalog}`);
    const requiredNames = [
      '01_specification.md',
      '02_pseudocode.md',
      '03_architecture.md',
      '04_refinement.md',
      '05_completion.md',
    ];
    for (const name of requiredNames) {
      if (!catalogFiles.some((file) => file.relative === name)) stop(`target catalog lacks required role file=${name}`);
    }

    const stagedRoot = mkdtempSync(join(tmpdir(), 'n3-scoped-catalog.'));
    try {
      const stagedCatalog = join(stagedRoot, 'docs/features', catalogParts[2]);
      mkdirSync(stagedCatalog, { recursive: true, mode: 0o700 });
      const receipts = [];
      for (const file of catalogFiles) {
        const destination = join(stagedCatalog, file.relative);
        mkdirSync(resolve(destination, '..'), { recursive: true, mode: 0o700 });
        copyFileSync(file.source, destination);
        const sourceHash = sha256(file.source);
        if (sha256(destination) !== sourceHash) stop(`staged catalog byte mismatch path=${file.source}`);
        receipts.push({ kind: 'catalog', path: file.source, sha256: sourceHash });
      }

      if (modes.includes('--completion')) {
        const completion = join(catalog, '05_completion.md');
        for (const testRelative of completionTestReferences(completion)) {
          const source = safeProjectRelativeFile(projectRoot, testRelative);
          const destination = join(stagedRoot, ...testRelative.split('/'));
          if (!isContained(stagedRoot, destination)) stop(`staged completion path escapes root path=${testRelative}`);
          mkdirSync(resolve(destination, '..'), { recursive: true, mode: 0o700 });
          copyFileSync(source, destination);
          const sourceHash = sha256(source);
          if (sha256(destination) !== sourceHash) stop(`staged completion test byte mismatch path=${source}`);
          receipts.push({ kind: 'completion-test', path: source, sha256: sourceHash });
        }
      }

      for (const [kind, file] of [
        ['n3-wrapper', wrapper],
        ['vendor-checker', vendor],
        ['feature-role-map', featureMap],
        ['project-role-map', projectMap],
      ]) receipts.push({ kind, path: file, sha256: sha256(file) });

      process.stdout.write(`SCOPED-CATALOG project=${projectRoot} catalog=${catalogRelative.split(sep).join('/')} contour=${catalogParts[2]}\n`);
      for (const receipt of receipts) {
        process.stdout.write(`INPUT kind=${receipt.kind} sha256=${receipt.sha256} path=${receipt.path}\n`);
      }
      const checkerArgs = [
        wrapper,
        stagedRoot,
        ...modes,
        '--role-map-source', featureMap,
        '--project-role-map-source', projectMap,
      ];
      const result = spawnSync(process.execPath, checkerArgs, {
        encoding: 'utf8',
        maxBuffer: 4 * 1024 * 1024,
      });
      process.stdout.write(result.stdout || '');
      process.stderr.write(result.stderr || '');
      if (result.error) stop(`N3 wrapper could not run error=${result.error.message}`);
      const status = Number.isInteger(result.status) ? result.status : 2;
      process.stdout.write(`SCOPED-VERDICT contour=${catalogParts[2]} modes=${modes.join(',')} status=${status}\n`);
      process.exitCode = status;
    } finally {
      rmSync(stagedRoot, { recursive: true, force: true });
    }
  }
} catch (error) {
  if (error?.message !== 'SCOPED_CHECK_STOP') throw error;
}
