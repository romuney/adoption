---
name: proteus-adoption-datamodel
description: "Модель данных дашборда: физическая таблица ClickHouse prod_proteus.proteus_adoption, виртуальные датасеты Superset, семантика полей"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4eef0bb7-7e46-4c7b-bea1-0e4319e8b76b
  modified: 2026-09-14T16:44:14.426Z
---

# Модель данных дашборда Proteus Adoption

БД Superset «Proteus CROSS» = ClickHouse `prod_proteus` (uuid f3cf662e-9267-42ad-85d9-a009bacb4736).

## Физический факт: `prod_proteus.proteus_adoption` (dataset uuid be8fc38c)
Гранулярность: день × юзер × отчёт (page.view). Ключевые поля:
- Время: `log_dttm` (дата события), `max_date` (дата свежести данных, дублируется в каждой строке), `created_dt` (дата создания отчёта).
- Идентификаторы: `user_id`, `login`, `dashboard_id`, `dashboard_nm`, `slug`, `dashboard_url`, `system_nm`.
- Активность: `action` ('page.view'), `action_count` (число просмотров за день).
- Отчёт: `owner_id`/`owner_login` (автор), `owners_string` (все владельцы, массив), `certified_by`, `published`, `actual_flg`, `ad_groups_dash` (AD-группы доступа к отчёту), `allowed_logins`, `collection_names` (массив).
- HR юзера: `mdm_employee_rk`, `emp_specialization_it_code` (IT|nonIT), `emp_specialization_oper_code` (HQ|nonHQ), `emp_specialization_desc`, `emp_stream_desc`, `company_fire_flg`, `management_head_flg`, `lvl3..lvl7_management_unit_nm`, `current_head_lvl_segment` (сегмент руководителя, Cross Data), `ad_groups` (AD-группы юзера).

## Виртуальный датасет №1: `proteus_adoption_virt` (dataset id **35153**, uuid a4adb736) — главный
SQL поверх proteus_adoption, добавляет:
- `first_action` / `last_action` — min/max(log_dttm) по user_id; `first_action_dash` — по (user_id, dashboard_nm).
- `date_filter` (Uint8) — булеан «попадает ли строка в период» из натив-фильтра `period_column` (30д/20н/12м/8к от max_date). Чарты используют его как adhoc WHERE — так обходят отсутствие Time-range.
- `group_users` — переключаемый разрез: джиня смотрит фильтр `group_column` (Стрим/Специализация/HQ|nonHQ/IT|nonIT/УС-3..7/Сегментация Cross Data) и подставляет соотв. колонку. Для «Сегментации»: если текущий логин (current_username + cache_key_wrapper) в cross_data_logins → current_head_lvl_segment, иначе «Нет доступа».
- `dash_url_new` — HTML-ссылка на отчёт.
- WHERE: dashboard_id <> 13040 (сам дашборд), login != 'svc_mon_otpp', опция «Исключить владельцев» (owner_column=Да → hasAny(owners_string,[login])=0), + джиня-зоопарк из ~20 filter_values(...) для всех натив-фильтров.

## Виртуальный датасет №2: `proteus_adoption_virt_bars` (id **35961**)
Бакеты по периоду (day/week/month/quarter — снова джиня от period_column): `user_cnt` (уник юзеров), `new_user_cnt` (first_action попал в тот же бакет), `action_cnt` (сумма просмотров). Питает чарт New2.

## Виртуальный датасет №3: `proteus_retention_2` (id **153285**)
Когорты: `cohort_month` (месяц first_action, за 3 года) × `age` (0..24 мес) → `active_users`, `cohort_size`. Питает retention-хитмап.

## Виртуальный датасет №4: `proteus_adoption_full_employee` (id **137217**) — покрытие
`mdm_employee_daily_proteus` (ВСЕ активные сотрудники: active_type_nm in ('Активная','Стажёры')) LEFT JOIN ежедневные логины (login, log_day, dashboard_id) по (ad_login, business_dt). Даёт: headcount vs юзеры, `group_users2` (тот же переключатель разреза через фильтр `group_column2`), experience_group_nm (стаж), active_type_nm.

## Словарные датасеты (фильтры)
`proteus_period` (0f9ae73d), `proteus_group` (bd55231c, id 36443 — filter_box'ы), `collections_filter` (72e86580), `proteus_dashboards_owners_dist` (0edfdc63), `proteus_dashboards_owners_filter` (947c4c3f), `uniq_ad_group` (bd529abf).

## Антипаттерны (учесть при рефакторинге)
- Один и тот же джиня-переключатель периода скопипащен в 4 датасета (virt, virt_bars, full_employee + чарт-метрики); переключатель разреза продублирован дважды (group_column / group_column2).
- `date_filter` как булеан вместо нормального времени — следствие того, что период «от max_date», а не от today.
- Фильтрация натив-фильтров сделана джиней в SQL датасета, а не стандартными adhoc-фильтрами (чтобы обойти arrayJoin-поля?) — хрупко.
