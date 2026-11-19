# Proteus: точные версии и код пути SQL. Запускать там, где работает Superset Proteus (в его контейнере, поде или venv).
# Только читает. Пароли, адреса и ключи не печатает: из конфига берутся только тип кэша, срок и лимиты строк.
echo "== Python и Superset"; python --version; superset version 2>/dev/null | sed 's/\x1b\[[0-9;]*m//g' | grep -i superset
echo "== пакеты"; (python -m pip freeze 2>/dev/null || pip freeze 2>/dev/null) | grep -iE '^(apache[-_]superset|[a-z0-9_.-]*proteus[a-z0-9_.-]*|sqlparse|sqlglot|clickhouse[-_]connect|clickhouse[-_]sqlalchemy|jinja2|sqlalchemy|flask|flask[-_]caching|pandas)=='
python -c "import sqlparse; print('sqlparse', sqlparse.__version__)"
python -c "import sqlglot; print('sqlglot', sqlglot.__version__)" 2>&1 | tail -1
S=$(python -c "import importlib.util, os; print(os.path.dirname(importlib.util.find_spec('superset').origin))")
echo "== патч лексера (superset/sql_parse.py)"; grep -n -A4 "SQL_REGEX" "$S/sql_parse.py"
echo "== регулярка ключа кэша (superset/jinja_context.py)"; grep -n -A7 "regex = " "$S/jinja_context.py"
echo "== откуда «Некорректный SQL запрос»"
M=$(grep -rh -B1 "Некорректный SQL" "$S" --include=*.po 2>/dev/null | sed -n 's/^msgid "\(.*\)"$/\1/p' | head -1)
echo "msgid: ${M:-не найден в переводах}"; grep -rn --include=*.py -e "Некорректный SQL" ${M:+-e "$M"} "$S" 2>/dev/null | head -6
C=$(python -c "import importlib.util; s = importlib.util.find_spec('superset_config'); print(s.origin if s else '')" 2>/dev/null)
echo "== кэш и лимиты (superset_config)"; [ -n "$C" ] && grep -noE "^[A-Z_]*CACHE_CONFIG|['\"](CACHE_TYPE|CACHE_DEFAULT_TIMEOUT)['\"] *: *['\"]?[A-Za-z0-9_. *]+|^(ROW_LIMIT|SQL_MAX_ROW|SQLLAB_TIMEOUT|SUPERSET_WEBSERVER_TIMEOUT|CACHE_DEFAULT_TIMEOUT) *= *[0-9_. *]+" "$C"
