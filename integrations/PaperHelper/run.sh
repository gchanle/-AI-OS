#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ ! -d ".venv" ]; then
  python3 -m venv .venv
fi

export OPENAI_API_KEY="${OPENAI_API_KEY:-${DASHSCOPE_API_KEY:-}}"
export OPENAI_API_BASE="${OPENAI_API_BASE:-${DASHSCOPE_BASE_URL:-}}"
export PAPERHELPER_CHAT_MODEL="${PAPERHELPER_CHAT_MODEL:-qwen3.5-plus}"

if [ ! -d "index" ]; then
  .venv/bin/python - <<'PY'
import embed_pdf
embed_pdf.embed_all_pdf_docs()
PY
fi

.venv/bin/streamlit run app.py --server.port 8501 --server.headless true
