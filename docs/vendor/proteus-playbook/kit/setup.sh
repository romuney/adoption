#!/usr/bin/env bash
# Окружение стенда Proteus: venv на Python 3.12 с версиями боя и node-пакеты (terser, eslint, playwright) для JS.
#
#   bash kit/setup.sh                  # venv в ~/.venvs/proteus-kit (+ ~/.venvs/proteus-sp044), node-пакеты глобально
#   KIT_VENV=/путь bash kit/setup.sh   # другой каталог venv
#   SP044=0 bash kit/setup.sh          # без второго venv с sqlparse 0.4.4
#   NPM=0 bash kit/setup.sh            # без npm (terser, eslint, playwright не ставить)
#   BROWSER=1 bash kit/setup.sh        # ещё и Chromium для kit/sbx (≈150 МБ)
#   SIDE=0 bash kit/setup.sh           # без каталогов версий для sqlgate (~/sg/<sqlglot>, ~/sp/<sqlparse>)
#
# Версии (почему именно они — 13-stand.md):
#   chdb 2.1.1        = ClickHouse 24.8.4.1 (бой — 24.8.15.1); chdb 3.0.0–3.2.0 — тоже 24.8, 4.x — уже 26.x
#   sqlparse 0.4.3    = Superset 2.1.0 — версия боя (Proteus сообщает 2.1.0, 09.10; requirements/base.txt 2.1.0:
#                       sqlparse==0.4.3); патч лексера Superset (insert(0), как 2.0.1) ставит kit/superset201.py
#   jinja2 3.0.3      = Superset 2.1.0 (requirements/base.txt), markupsafe 2.0.1 — так же (ставится на 3.12)
#   sqlglot 26.33.0   — модель проверки форка «Некорректный SQL запрос» (25–30 — модель; 23 — только предупреждение: отвергает pa_one,
#                       сохранённый в бою; на алиасе в GROUP BY отказ у всех; < 15 не годятся:
#                       не знают CAST(x, 'T') и роняют рабочие датасеты); другие версии — pip install --target
#   pyyaml            — выгрузки Proteus (YAML); psycopg2-binary — стенд GP на PostgreSQL 16
#   sqlparse 0.4.4    — второй venv: запас на обновление форка до Superset 2.1.3–3.x (патч ставит superset201.py так,
#                       как они). Ответы 0.4.3 и 0.4.4 на четырёх проектах совпали (09.10); 0.3.0 (2.0.x) не нужен
#   terser 5.51.2     — сжатие кода чарта (kit/min.cjs): версия закреплена, иначе pack --check разойдётся
#   eslint 10.1.0     — no-undef по kit/eslint.chart.cjs; playwright 1.56.1 — kit/sbx (модель песочницы)
#   каталоги версий   — sqlglot 23.17 / 25.34 / 28.10 / 30.0 в ~/sg/<версия>, sqlparse 0.5.5 / 0.6.0 в ~/sp/<версия>
#                       (pip install --target): kit/sqlgate.py --sqlglot-dirs / --sqlparse-dirs
set -euo pipefail

KIT_VENV="${KIT_VENV:-$HOME/.venvs/proteus-kit}"
SP044_VENV="${SP044_VENV:-$HOME/.venvs/proteus-sp044}"
PY="${PYTHON:-python3.12}"
PKGS=(chdb==2.1.1 sqlparse==0.4.3 sqlglot==26.33.0 jinja2==3.0.3 markupsafe==2.0.1 pyyaml psycopg2-binary)

say() { printf '\n== %s\n' "$*"; }

make_venv() {   # $1 — каталог, остальное — пакеты
  local dir="$1"; shift
  if command -v uv >/dev/null 2>&1; then
    [ -x "$dir/bin/python" ] || uv venv -q -p 3.12 "$dir"
    uv pip install -q -p "$dir/bin/python" "$@"
  else
    command -v "$PY" >/dev/null 2>&1 || { echo "нет $PY и нет uv: поставьте Python 3.12 или uv"; exit 1; }
    [ -x "$dir/bin/python" ] || "$PY" -m venv "$dir"
    "$dir/bin/python" -m pip install -q --upgrade pip
    "$dir/bin/python" -m pip install -q "$@"
  fi
}

say "venv $KIT_VENV (Python 3.12, модель боя: sqlparse 0.4.3 = Superset 2.1.0)"
if ! make_venv "$KIT_VENV" "${PKGS[@]}"; then
  # jinja2 3.0.3 / markupsafe 2.0.1 не встали (сборка из исходников) — ближайшие, это отмечается ниже
  echo "! jinja2 3.0.3 / markupsafe 2.0.1 не встали — беру jinja2 3.0.x/3.1 с новым markupsafe"
  make_venv "$KIT_VENV" chdb==2.1.1 sqlparse==0.4.3 sqlglot==26.33.0 'jinja2>=3.0.3,<3.2' pyyaml psycopg2-binary
fi

if [ "${SP044:-1}" != "0" ]; then
  say "venv $SP044_VENV (sqlparse 0.4.4 — запас на обновление Proteus)"
  make_venv "$SP044_VENV" chdb==2.1.1 sqlparse==0.4.4 sqlglot==26.33.0 jinja2==3.0.3 markupsafe==2.0.1 \
    || make_venv "$SP044_VENV" chdb==2.1.1 sqlparse==0.4.4 sqlglot==26.33.0 'jinja2>=3.0.3,<3.2'
fi

SG_DIR="${SG_DIR:-$HOME/sg}"
SP_DIR="${SP_DIR:-$HOME/sp}"
if [ "${SIDE:-1}" != "0" ]; then
  say "каталоги версий для kit/sqlgate.py: $SG_DIR (sqlglot), $SP_DIR (sqlparse)"
  side() {   # $1 — каталог, $2 — пакет==версия
    # «стоит» — только если модуль берётся из этого каталога и версии нужной: прерванная установка оставляет
    # каталог без пакета, и тогда sqlgate молча взял бы версию из venv
    local mod="${2%%==*}" want="${2##*==}" have
    have="$(PYTHONPATH="$1" PYTHONDONTWRITEBYTECODE=1 "$KIT_VENV/bin/python" -c '
import os, sys, importlib
m = importlib.import_module(sys.argv[1])
inside = os.path.realpath(m.__file__).startswith(os.path.realpath(sys.argv[2]) + os.sep)
print(m.__version__ if inside else "")' "$mod" "$1" 2>/dev/null || true)"
    if [ "$have" = "$want" ]; then echo "$2 уже стоит в $1"; return; fi
    [ -d "$1" ] && echo "! в $1 нет $2 (${have:-пакета нет или он битый}) — ставлю поверх"
    if command -v uv >/dev/null 2>&1; then
      uv pip install -q -p "$KIT_VENV/bin/python" --target "$1" --reinstall "$2"
    else
      "$KIT_VENV/bin/python" -m pip install -q --upgrade --force-reinstall --target "$1" "$2"
    fi
  }
  for v in 23.17.0 25.34.0 28.10.0 30.0.0; do side "$SG_DIR/$v" "sqlglot==$v"; done
  for v in 0.5.5 0.6.0; do side "$SP_DIR/$v" "sqlparse==$v"; done
fi

if [ "${NPM:-1}" != "0" ]; then
  say "node-пакеты глобально: terser 5.51.2 (сжатие), eslint 10.1.0 (no-undef), playwright 1.56.1 (модель песочницы)"
  if command -v npm >/dev/null 2>&1; then
    root="$(npm root -g)"
    for spec in terser@5.51.2 eslint@10.1.0 playwright@1.56.1; do
      name="${spec%@*}"; want="${spec##*@}"
      have="$(NODE_PATH="$root" node -e "try{console.log(require('$name/package.json').version)}catch(e){}" 2>/dev/null || true)"
      if [ "$have" = "$want" ]; then echo "$name $want уже стоит"; else npm i -g "$spec"; fi
    done
    if [ "${BROWSER:-0}" = "1" ]; then
      NODE_PATH="$root" npx -y playwright@1.56.1 install chromium    # ≈150 МБ; путь — PLAYWRIGHT_BROWSERS_PATH
    else
      echo "Chromium для kit/sbx: BROWSER=1 bash kit/setup.sh (или свой PLAYWRIGHT_BROWSERS_PATH)"
    fi
  else
    echo "! нет npm/node — сжатие JS (kit/min.cjs, pack --check), ESLint и kit/sbx работать не будут"
  fi
fi

say "версии"
"$KIT_VENV/bin/python" - <<'EOF'
import sys
from importlib.metadata import version
import chdb
print('python    ', sys.version.split()[0])
for p in ('chdb', 'sqlparse', 'sqlglot', 'jinja2', 'markupsafe', 'pyyaml', 'psycopg2-binary'):
    try:
        print('%-10s' % p, version(p))
    except Exception:
        print('%-10s' % p, 'нет')
print('ClickHouse', str(chdb.query("SELECT version(), getSetting('allow_experimental_analyzer'), "
                                  "getSetting('max_query_size')", 'CSV')).strip())
EOF
if [ -x "$SP044_VENV/bin/python" ]; then
  "$SP044_VENV/bin/python" -c "import sqlparse; print('sp044      sqlparse', sqlparse.__version__)"
fi
if command -v node >/dev/null 2>&1; then
  root="$(npm root -g 2>/dev/null || true)"
  printf 'node       %s' "$(node --version)"
  for name in terser eslint playwright; do
    printf '; %s %s' "$name" "$(NODE_PATH="$root" node -e "try{console.log(require('$name/package.json').version)}catch(e){console.log('нет')}")"
  done
  echo
fi
echo
echo "Готово. Python стенда: $KIT_VENV/bin/python (для pack --gate: PLAYBOOK_PY=$KIT_VENV/bin/python)"
if [ -d "$SG_DIR" ] || [ -d "$SP_DIR" ]; then
  # в кавычках: пути с пробелами (каталог пользователя, «sg dir») иначе разорвутся при вставке в команду
  echo "Гейт с версиями: --sqlglot-dirs \"$(ls -d "$SG_DIR"/*/ 2>/dev/null | sed 's:/$::' | paste -sd, -)\"" \
       "--sqlparse-dirs \"$(ls -d "$SP_DIR"/*/ 2>/dev/null | sed 's:/$::' | paste -sd, -)\""
fi
