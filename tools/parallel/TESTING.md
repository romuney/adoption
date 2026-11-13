# Локальная проверка параллельной поставки

Рабочая папка — корень Adoption. Исходные файлы и старые поставки проверки не перезаписывают. Тестовые таблицы создаются только в явно выбранных локальных БД.

Проверено: Python 3.12.14; chdb 2.1.1 / ClickHouse 24.8.4.1; PostgreSQL 17.12 (модель GP, не корпоративный Greenplum); библиотеки закреплены в `requirements.txt`. Встроенный стенд содержит настройку более нового CH `use_variant_as_common_type`; `verify_numbers.load_stand()` условно применяет только эту настройку по версии движка, не меняя выражения расчётов или исходный `.stand/stand.py`.

## Зависимости и сервис

```bash
python3 -m venv /workspace/.venvs/pa-next-test
/workspace/.venvs/pa-next-test/bin/python -m pip install -r tools/parallel/requirements.txt
```

Для браузерных тестов дополнительно установи Playwright в тот же venv:

```bash
/workspace/.venvs/pa-next-test/bin/python -m pip install playwright==1.62.0
/workspace/.venvs/pa-next-test/bin/python tools/parallel/test_ui.py
/workspace/.venvs/pa-next-test/bin/python tools/parallel/test_board_css.py
/workspace/.venvs/pa-next-test/bin/python tools/parallel/test_ui_controls.py
```

Эти скрипты явно запускают **`/usr/bin/chromium`**. Установи системный Chromium штатным механизмом среды; `playwright install` сам по себе этот путь не создаёт. Проверено на Chromium 156.0.8078.79. Пересборка JS/ID требует также Node.js и закреплённых npm-пакетов: команды и поддерживаемые версии приведены в [UI.md](<../../Параллельный отчёт — pa_next/UI.md>). Системный `python3` в примерах ниже допустим только если в нём уже установлены нужные зависимости; иначе используй Python подготовленного venv.

Нужны PostgreSQL server + `psql`, `createdb`, `initdb`, `pg_ctl` в PATH. В облачной проверке использованы официальные подписанные пакеты Debian `postgresql-17=17.12-0+deb13u1` и `postgresql-client-17=17.12-0+deb13u1`, извлечённые вне репозитория в `/workspace/.local/pa-next-pg`; системные файлы не менялись. При другом образе поставьте PostgreSQL штатным механизмом среды. PostgreSQL 17 не доказывает совместимость с конкретным корпоративным GP: для него остаётся запуск новой ноды владельцем.

Пример изолированного сервиса (существующий кластер повторно не инициализировать):

```bash
export PATH=/workspace/.local/pa-next-pg/usr/lib/postgresql/17/bin:$PATH
mkdir -p /workspace/.cache/pa-next-pgsocket
initdb -D /workspace/.cache/pa-next-pgdata --auth=trust --no-locale --encoding=UTF8
pg_ctl -D /workspace/.cache/pa-next-pgdata -l /workspace/.cache/pa-next-pg.log -o '-h 127.0.0.1 -p 55432 -k /workspace/.cache/pa-next-pgsocket' start
export PGHOST=/workspace/.cache/pa-next-pgsocket PGPORT=55432 PA_PG=pa
createdb pa
psql -d pa -c 'CREATE SCHEMA IF NOT EXISTS usr_cross_data; ALTER DATABASE pa SET search_path TO usr_cross_data,public;'
```

## Разные уровни доказательства

```bash
# В shallow checkout сначала доставить только закреплённый эталон.
# Это чтение GitHub; ветка и рабочие файлы не переключаются/не сбрасываются.
git cat-file -e 167c2edcfae1bee7a4fcd830052a9d2dfea49edb^{commit} 2>/dev/null || \
  git fetch --depth=1 origin 167c2edcfae1bee7a4fcd830052a9d2dfea49edb

# Компаратор: ошибки, дубли, NaN, служебная версия.
python3 tools/parallel/verify_numbers.py --selftest

# Действительный исходный GP-SQL двух нод, искусственные исходные события.
/workspace/.venvs/pa-next-test/bin/python tools/parallel/verify_events.py

# Синтетический мир существующего стенда (~1,3 млн дневных строк).
# Генерирует один мир для обеих версий; генератор использует случайность,
# поэтому абсолютное число строк между независимыми пересозданиями меняется.
export PA_DB=/workspace/.cache/pa-next-db
/workspace/.venvs/pa-next-test/bin/python tools/parallel/prepare_numeric_fixture.py --regenerate

# Вторая версия GP-ускорения выполняется из нового YAML и сравнивается
# с прежними GP-выражениями, затем выгружается в локальный CH.
# Без --regenerate повторно использует уже построенный исходный мир.

/workspace/.venvs/pa-next-test/bin/python tools/parallel/verify_numbers.py \
  --baseline-revision 167c2edcfae1bee7a4fcd830052a9d2dfea49edb \
  --baseline-yaml 'Proteus Adoption (4).yaml' \
  --output /tmp/pa-next-numeric-results.json
```

`--quick` сокращает матрицу; `--modes` проверяет дополнительные режимы анализатора и Nullable. `--mode-smoke` — пять характерных наборов фильтров во всех профилях; `--identity-smoke --kinds cat` — прежний/текущий логин, регистр и пробелы. Полный прогон длиннее; отчёт записывается после каждого сценария, итоговый код 0 требует отсутствия всех ошибок. Не открывайте один chdb-каталог из двух процессов одновременно. Не воспринимайте частичный JSON текущего прогона как завершённый результат.

Генератор `prepare_numeric_fixture.py` исполняет новые GP-параграфы ускорения на PostgreSQL, а базовые таблицы берёт из прежней синтетической модели. Это не запуск полного корпоративного ETL. Фильтрация фактических событий проверяется отдельно `verify_events.py` (в обеих тестовых копиях SQL `current_date` фиксируется на 2026-11-13; поставка не изменяется); доступ к настоящим источникам, транспорту `gp_to_click`, планировщику Helicopter, кэшу Proteus и боевой сборке ClickHouse не проверяется этими командами.

Результаты по умолчанию — `/tmp/pa-next-events-results.json`, `/tmp/pa-next-gp-results.json`, `/tmp/pa-next-numeric-results.json`. Они содержат только искусственные данные/условия. В итог поставки включайте обезличенную сводку завершённого прогона и его ограничения. Перед публикацией сравнения проверьте, что SHA-256 исходного YAML и версия текущих сгенерированных файлов соответствуют последнему запуску.

Для интеграционной браузерной проверки после освобождения chdb выполните `/workspace/.venvs/pa-next-test/bin/python tools/parallel/export_browser_fixtures.py` тем же Python/PA_DB, затем `/workspace/.venvs/pa-next-test/bin/python tools/parallel/test_ui_periods.py /tmp/pa-next-periods`. Экспорт запишет фактические ответы SQL для d/w/m/q в `/tmp/pa-next-periods`, без выдуманных KPI и без замены бизнес-строк. Браузерный тест может заменить только транспортные nonce `pa_next_request`.

Сеть нужна для установки зависимостей из PyPI/npm/пакетного источника и (только если эталона нет в shallow checkout) для чтения закреплённого Git-коммита с GitHub. После подготовки SQL/PG/браузерные тесты работают локально; GitHub-токен в чат не требуется, используется штатная аутентификация среды.

Оптимизация исходного события: удалены два скалярных MAX-подзапроса к исходному журналу; неиспользуемый `max_date` остаётся NULL. Фактическое число сканирований и выигрыш на GP не измерялись. `verify_events.py` проверяет отсутствие потребителей и исключает только эту колонку из побайтового сравнения значений. `verify_gp_pipeline.py` отдельно доказывает точное равенство 12 потребляемых базовых витрин.

## Сохранение SQL и путь Superset в двух моделях лексера

Основной venv из `requirements.txt` содержит `sqlparse==0.4.3`. Дополнительная версия ставится **в отдельный каталог**, не заменяя основную. Из корня Adoption, при наличии `uv`:

```bash
uv --cache-dir /workspace/.cache/uv pip install \
  --python /workspace/.venvs/pa-next-test/bin/python \
  --target /workspace/.cache/pa-next-sp044 sqlparse==0.4.4

/workspace/.venvs/pa-next-test/bin/python tools/parallel/verify_sql_path.py \
  --sp044 /workspace/.cache/pa-next-sp044 --output /tmp/pa-next-parser
```

Если `uv` не установлен, эквивалентная установка:

```bash
/workspace/.venvs/pa-next-test/bin/python -m pip install \
  --target /workspace/.cache/pa-next-sp044 sqlparse==0.4.4
```

Это проверяет три датасета на сохранение с AlwaysTrueObject, добавляемый LIMIT 1000, открытие, внешнюю обёртку `GROUP BY section,g,k,parent,n`, соответствие лексеров и враждебные значения фильтров. В обеих моделях применяется патч Superset из kit. Отдельно проверяется файл 11 в режиме SQL Lab. Новая корпоративная сессия, учётные данные и сеть после установки зависимостей **не нужны**. Гейт моделирует документированный форк; успешный результат не означает, что запрос уже сохранён в живом Proteus.

`summary.json` содержит SHA-256 SQL, число вариантов, ошибки и предупреждения. Предупреждения о времени разбора сохраняются отдельно от синтаксических ошибок. Для измерения скорости запускайте без конкурирующих тестов; сравнение с секундным бюджетом при одновременном полном числовом регрессе не является изолированным замером.

Другие самостоятельные проверки новой ноды:

```bash
# Без БД: изоляция таблиц, точность генерации, все точки отказа выгрузки.
python3 tools/parallel/verify_data.py
# Временная отдельная CH-база: generation/nonce, смешанные и пустые состояния.
/workspace/.venvs/pa-next-test/bin/python tools/parallel/verify_publication.py
# Отдельная локальная PG-база: все GP-параграфы и 12 базовых таблиц.
/workspace/.venvs/pa-next-test/bin/python tools/parallel/verify_gp_pipeline.py
# Три отдельные локальные PG-базы: Unicode и полные поля ФИО против CH 24.8.
# Воспроизводит chr(894) и скрытую порчу ФИО в старом коде SQL_ASCII.
/workspace/.venvs/pa-next-test/bin/python tools/parallel/verify_encoding.py
# Отдельная CH-база, 13 млн строк: цена полной проверки штампов версий.
# Запускать после окончания других замеров; не доказывает скорость всего отчёта.
/workspace/.venvs/pa-next-test/bin/python tools/parallel/benchmark_generation.py
```

## Воспроизвести сводку 380 сравнений

После полной матрицы 320 и проверок GP выше, на том же `PA_DB`, последовательно:

```bash
/workspace/.venvs/pa-next-test/bin/python tools/parallel/verify_numbers.py \
  --baseline-revision 167c2edcfae1bee7a4fcd830052a9d2dfea49edb --baseline-yaml 'Proteus Adoption (4).yaml' \
  --identity-smoke --kinds cat --output /tmp/pa-next-identity-results.json
/workspace/.venvs/pa-next-test/bin/python tools/parallel/verify_numbers.py \
  --baseline-revision 167c2edcfae1bee7a4fcd830052a9d2dfea49edb --baseline-yaml 'Proteus Adoption (4).yaml' \
  --mode-smoke --kinds cat one --output /tmp/pa-next-profile-results.json
/workspace/.venvs/pa-next-test/bin/python tools/parallel/verify_numbers.py \
  --baseline-revision 167c2edcfae1bee7a4fcd830052a9d2dfea49edb --baseline-yaml 'Proteus Adoption (4).yaml' \
  --modes --kinds head --output /tmp/pa-next-head-results.json
```

Выполни файл 11 на той же локальной фикстуре и сохрани его ответ. Это чтение локальной модели, не корпоративная проверка:

```bash
/workspace/.venvs/pa-next-test/bin/python - <<'PY'
import json, os
from pathlib import Path
from chdb.session import Session
db = Session(os.environ['PA_DB'])
sql = Path('Параллельный отчёт — pa_next/11. SQL Lab — готовность витрин.sql').read_text()
rows = json.loads(db.query(sql, 'JSON').bytes())['data']
assert len(rows) == 21 and all(row['ready'] == 1 for row in rows)
Path('/tmp/pa-next-readiness-results.json').write_text(json.dumps({
    'status': 'passed', 'rows': rows, 'scope': 'local synthetic fixture; read-only shipment SQL Lab probe'
}, ensure_ascii=False, indent=2) + '\n')
PY
/workspace/.venvs/pa-next-test/bin/python tools/parallel/summarize_numbers.py
```

Сводка откажет при незавершённых/ошибочных прогонах, другом числе случаев, изменённых SQL или YAML. Она читает перечисленные JSON из `/tmp` и обновляет `Проверки/Численная сверка.json`; старые протоколы не подставляются вместо нового исполнения.
