#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 /absolute/path/to/private-workspace" >&2
  exit 64
fi

project_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
workspace_root=$(cd "$1" && pwd)
target="$workspace_root/projects/ai-chat-export-pro/private-docs"
link="$project_root/private-docs"

if [ ! -d "$target" ]; then
  echo "Private workspace target does not exist: $target" >&2
  exit 1
fi

if [ -e "$link" ] || [ -L "$link" ]; then
  echo "Refusing to replace existing path: $link" >&2
  exit 1
fi

ln -s "$target" "$link"
echo "Created $link -> $target"
