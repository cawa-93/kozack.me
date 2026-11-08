#!/bin/bash
# Хмарна сесія Claude Code (мобільний застосунок, claude.ai/code): репозиторій щойно склоновано,
# залежностей немає. Встановити їх, щоб одразу працювали typecheck, тести й збірка ігор.
# Локально (CLAUDE_CODE_REMOTE не задано) нічого не робить.
set -e
if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund --loglevel=error
fi
