#!/bin/bash
PROJECT_DIR_BASH="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT_DIR="$(cygpath -w "$PROJECT_DIR_BASH" 2>/dev/null || (cd "$PROJECT_DIR_BASH" && pwd -W))"
powershell.exe -Command "Start-Process powershell -WorkingDirectory '$PROJECT_DIR\\frontend' -ArgumentList '-NoExit','-Command','npm run dev'"
