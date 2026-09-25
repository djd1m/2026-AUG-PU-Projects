#!/usr/bin/env bash
# Run from the project root. Fixture/output paths must be inside the mounted project.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 2
if [[ "${1:-}" == --test ]]; then
  shift
  command=(node node_modules/vitest/vitest.mjs run --config vitest.browser.config.ts "$@")
else
  command=(node scripts/check-responsive.mjs "$@")
fi
if ! command -v docker >/dev/null 2>&1; then
  echo 'НЕ ВЫПОЛНЕНО: Docker недоступен' >&2
  exit 2
fi
# Optional network for the target stack, e.g. DOCKER_NETWORK=host.
network=()
if [[ -n "${DOCKER_NETWORK:-}" ]]; then network=(--network "$DOCKER_NETWORK"); fi
docker run --rm "${network[@]}" --user "$(id -u):$(id -g)" -v "$PWD:/w" -w /w \
  mcr.microsoft.com/playwright:v1.60.0-noble "${command[@]}"
status=$?
# Docker infrastructure errors are not responsive findings.
if [[ $status -ge 125 ]]; then exit 2; fi
exit "$status"
