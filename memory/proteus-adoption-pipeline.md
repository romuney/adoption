---
name: proteus-adoption-pipeline
description: "DAG Helicopter-ноды 844437 (GP-стейджинг → витрина → ClickHouse), таблица за таблицей; найденный мёртвый код"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4eef0bb7-7e46-4c7b-bea1-0e4319e8b76b
  modified: 2026-09-14T16:43:36.482Z
---

# Helicopter-нода «Proteus Adoption» (id 844437)

Источники (GP, через tables_wait): `prod_sse.proteus_users`, `proteus_dashboards`, `proteus_logs`, `proteus_collection_dashboard`; `prod_v_sse_crossdata.mdm_employee_d`, `event_physical_report`; `prod_v_chrono_idm_tadam.ad_items_records_public`, `ad_item_parent_relations_public`; `usr_cross_data.bl_talent_management`.

## АКТУАЛЬНАЯ ветка
- **`usr_cross_data.proteus_views_1`** — главная витрина фактов. Строится НАПРЯМУЮ из `prod_v_sse_crossdata.event_physical_report` (event_nm='page.view', 13 месяцев) LEFT JOIN `bl_talent_management`. event_physical_report уже обогащён: HR-атрибуты юзера, владельцы отчёта, коллекции, AD-группы — всё в одном событии. Никаких зависимостей от других таблиц ноды.
- **`mdm_employee_daily`** — снэпшоты сотрудников по дням (180 дней): `mdm_employee_d` (self-join на last_state) + `bl_talent_management` + `ad_login_groups`; поля: active_type_nm, experience_group_nm (стаж), УС3–7, стрим, спец-ции, AD-группы.
- `ad_login_groups` — AD-логин → массив AD-групп (только группы, встречающиеся в proteus_dashboard_access). Питает mdm_employee_daily и legacy.
- `collection_array` → `collections_filter` — коллекции отчётов (дочерняя + родительская через proteus_collection_enclosure).
- `proteus_dashboards_owners_dist` — справочник всех владельцев (для фильтра «Владелец»).
- Словари для фильтров: `period_agg` (30 дней/20 недель/12 месяцев/8 кварталов), `proteus_group` (10 разрезов группировки), `proteus_dashboards_owners_filter` (Да/Нет).
- `cross_data_logins` — логины из AD-группы `helicopter_access_team_pd_cross` → gating сегментации Cross Data.
- `uniq_ad_group` — уникальные AD-группы из прав доступа.

## Выгрузка в ClickHouse (`ppy.gp_to_click`)
`usr_cross_data.proteus_views_1` → **`prod_proteus.proteus_adoption`** (partition by toYYYYMM(log_dttm), order by (dashboard_id, log_dttm), array_type_cast=True) — единственный экспорт фактов.
Словари → `prod_proteus`: proteus_period, proteus_dashboards_owners_dist/filter, proteus_group, cross_data_logins, collections_filter, mdm_employee_daily_proteus, uniq_ad_group.
Далее — `refresh_dashboard(slug='proteus-adoption')` + permalink (учётка из env).

## ⚠️ LEGACY-ветка (мёртвый код, КАНДИДАТ НА УДАЛЕНИЕ при рефакторинге ноды)
Использует старый путь через логи Superset-реплики (`DashboardRestApi.get`):
- `superset_proteus_logs` (из prod_sse.proteus_logs) → `superset_proteus_views_restapi` (джсон-парсинг id_or_slug, резолв slug→id) → **`usr_cross_data.proteus_views`** — старая витрина; в ClickHouse НЕ выгружается, датасеты её не читают.
- `superset_proteus_users`, `proteus_dashboards_owners`, `proteus_dashboards` (dim с access-группами, first_flg) — нужны только legacy-ветке (owners_dist использует proteus_dashboard_owner напрямую, не эту таблицу).
- `mdm_employee_last_state` — нужна только legacy `proteus_views`.
- Отключённый блок Actuality (sid 019da0df) ждёт старые таблицы.
- `first_flg` («первый отчёт овнера», dense_rank в proteus_dashboards) — считается, но наружу не выходит; потенциально полезная метрика, если реанимировать при рефакторинге.

## Наблюдения по качеству
- Витрина фактов — event-grain: 1 строка = (день × юзер × отчёт), action_count внутри дня уже агрегирован (count(event_nm)).
- Окно 13 месяцев перечитывается целиком (drop/create) — при рефакторинге можно подумать про инкремент.
- ad-hoc SELECT-блоки (Untitled 1/2) — отладочные, можно убрать.
