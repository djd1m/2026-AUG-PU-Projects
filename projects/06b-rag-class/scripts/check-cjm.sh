#!/usr/bin/env bash
set -u
if [ "$#" -ne 1 ] || [ -z "$1" ]; then
  echo 'NOT_EXECUTED: usage: bash scripts/check-cjm.sh <explicitBaseURL>' >&2
  exit 2
fi
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
exec node --import tsx "$script_dir/check-cjm.ts" "$1"
