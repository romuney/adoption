{#- pa_strip — шапка листа «Отчёты» (чарт pa-strip), v7.2: ОДНА строка эха условий.
    state_j — все активные условия листа (период, опции, область каталога, людская
    шина панели) для пилюль; area_nm / ppl_nm — подписи пилюль (названия выбранных
    отчётов, ФИО выбранных и исключённых людей). KPI здесь НЕТ — они в панели
    (pa_people). Ни факт, ни pa_pair не читаются: без выбора запрос не трогает
    таблиц вовсе, с выбором — точечные чтения справочников по ключу. -#}
{% set GRAINS = {'d': 30, 'w': 20, 'm': 12, 'q': 8} %}
{% set grain = filter_values('period_param')|first|default('d', true) %}
{% set grain = grain if grain in GRAINS else 'd' %}
{% macro q(values) -%}
{%- set out = [] -%}
{%- for v in values -%}{%- set _ = out.append(v|string|replace('\\', '\\\\')) -%}{%- endfor -%}
{{- out|where_in -}}
{%- endmacro %}
{% macro jes(s) -%}{{ s|string|replace('\\', '\\\\')|replace('"', '\\"')|replace("'", "''") }}{%- endmacro %}
{% macro jal(a) -%}[{% for v in a %}{% if not loop.first %}, {% endif %}"{{ jes(v) }}"{% endfor %}]{%- endmacro %}
{% set pubv = filter_values('pub_f')|first|default('1', true) %}{% set pubv = pubv if pubv in ['0', '1'] else '1' %}
{% set actv = filter_values('act_f')|first|default('1', true) %}{% set actv = actv if actv in ['0', '1'] else '1' %}
{% set excv = filter_values('exc_f')|first|default('1', true) %}{% set excv = excv if excv in ['0', '1'] else '1' %}
{#- Область (каталог) -#}
{% set CUTS = {'cut:lvl3': 'lvl3_management_unit_nm', 'cut:lvl4': 'lvl4_management_unit_nm', 'cut:spec': 'emp_specialization_desc', 'cut:stream': 'emp_stream_desc', 'cut:head': 'toString(management_head_flg)'} %}
{% set pmode = filter_values('mode_param')|first|default('', true) %}
{% set pmode = pmode if pmode in ['report', 'owner', 'collection'] or pmode in CUTS else '' %}
{% set selr = filter_values('sel_f') or [] %}
{% set sel = [] %}{% for v in selr %}{% if v|string != '' %}{% set _ = sel.append(v|string) %}{% endif %}{% endfor %}
{% set have = pmode != '' and sel|length > 0 %}
{% set repids = [] %}{% if have and pmode == 'report' %}{% for v in sel %}{% if v|int > 0 %}{% set _ = repids.append(v|int) %}{% endif %}{% endfor %}{% endif %}
{#- Людская шина (правая панель) -#}
{% set lv3 = [] %}{% for v in (filter_values('lvl3_f') or []) %}{% if v|string != '' %}{% set _ = lv3.append(v|string) %}{% endif %}{% endfor %}
{% set lv4 = [] %}{% for v in (filter_values('lvl4_f') or []) %}{% if v|string != '' %}{% set _ = lv4.append(v|string) %}{% endif %}{% endfor %}
{% set strm = [] %}{% for v in (filter_values('stream_f') or []) %}{% if v|string != '' %}{% set _ = strm.append(v|string) %}{% endif %}{% endfor %}
{% set spcf = [] %}{% for v in (filter_values('spec_f') or []) %}{% if v|string != '' %}{% set _ = spcf.append(v|string) %}{% endif %}{% endfor %}
{% set adgf = [] %}{% for v in (filter_values('adg_f') or []) %}{% if v|string != '' %}{% set _ = adgf.append(v|string) %}{% endif %}{% endfor %}
{% set headsv = filter_values('heads_f')|first|default('0', true) %}{% set headsv = headsv if headsv in ['0', '1', 'n'] else '0' %}
{% set loginf = [] %}{% for v in (filter_values('login_f') or []) %}{% if v|string != '' %}{% set _ = loginf.append(v|string) %}{% endif %}{% endfor %}
{#- Узлы оргструктуры (группировка «Оргструктура» панели): путь «УС-3 › УС-4 › …», глубина = число звеньев. -#}
{% set orgf = [] %}{% for v in (filter_values('org_f') or []) %}{% if v|string != '' and (v|string).split(' › ')|length <= 5 %}{% set _ = orgf.append(v|string) %}{% endif %}{% endfor %}
{#- Исключённые логины (настройки «Кто смотрит»): люди выпадают из всех чисел. -#}
{% set exlf = [] %}{% for v in (filter_values('exl_f') or []) %}{% if v|string != '' %}{% set _ = exlf.append(v|string) %}{% endif %}{% endfor %}
{#- Логины для подписей пилюль: выбранные + исключённые (список строится циклом —
    при сохранении датасета Proteus отдаёт вместо списка AlwaysTrueObject, «+» с ним падает). -#}
{% set pplq = [] %}{% for v in loginf %}{% set _ = pplq.append(v) %}{% endfor %}{% for v in exlf %}{% set _ = pplq.append(v) %}{% endfor %}
{% set freqr = filter_values('freq_f') or [] %}
{% set freqf = [] %}{% for v in freqr %}{% if v|string in ['1', '2', '3', '4'] %}{% set _ = freqf.append(v|string) %}{% endif %}{% endfor %}
{% set SJ = ['"period":"' ~ grain ~ '"'] %}
{% if pubv == '0' %}{% set _ = SJ.append('"pub":"0"') %}{% endif %}
{% if actv == '0' %}{% set _ = SJ.append('"act":"0"') %}{% endif %}
{% if excv == '0' %}{% set _ = SJ.append('"exc":"0"') %}{% endif %}
{% if headsv != '0' %}{% set _ = SJ.append('"heads":"' ~ headsv ~ '"') %}{% endif %}
{% if lv3 %}{% set _ = SJ.append('"lvl3":' ~ jal(lv3)) %}{% endif %}
{% if lv4 %}{% set _ = SJ.append('"lvl4":' ~ jal(lv4)) %}{% endif %}
{% if strm %}{% set _ = SJ.append('"stream":' ~ jal(strm)) %}{% endif %}
{% if spcf %}{% set _ = SJ.append('"spec":' ~ jal(spcf)) %}{% endif %}
{% if adgf %}{% set _ = SJ.append('"adg":' ~ jal(adgf)) %}{% endif %}
{% if orgf %}{% set _ = SJ.append('"org":' ~ jal(orgf)) %}{% endif %}
{% if loginf %}{% set _ = SJ.append('"login":' ~ jal(loginf)) %}{% endif %}
{% if exlf %}{% set _ = SJ.append('"exl":' ~ jal(exlf)) %}{% endif %}
{% if freqf %}{% set _ = SJ.append('"freq":' ~ jal(freqf)) %}{% endif %}
{% if have %}{% set _ = SJ.append('"area_mode":"' ~ pmode ~ '"') %}{% set _ = SJ.append('"area":' ~ jal(sel)) %}{% endif %}
SELECT
  CAST('{{ grain }}' AS String) AS grain,
  CAST({% if have and pmode == 'report' and repids %}ifNull((SELECT arrayStringConcat(groupArray(20)(toString(ifNull(dashboard_nm, ''))), '\n') FROM prod_proteus.pa_dash_meta WHERE dashboard_id IN ({{ repids|join(', ') }})), ''){% else %}''{% endif %} AS String) AS area_nm,
  CAST({% if loginf or exlf %}ifNull((SELECT arrayStringConcat(groupArray(concat(toString(login), '\t', toString(ifNull(fio, '')))), '\n') FROM prod_proteus.pa_emp_attrs WHERE login IN {{ q(pplq) }}), ''){% else %}''{% endif %} AS String) AS ppl_nm,
  CAST('{{ "{" ~ SJ|join(", ") ~ "}" }}' AS String) AS state_j
