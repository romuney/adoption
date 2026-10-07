-- Кнопка «Мои» (2026-10-07): под каким логином Proteus подставляет вас в датасет каталога и во что он переводится.
-- Один запрос, в SQL Lab как есть (шаблоны Jinja в SQL Lab включены — как в датасетах).
-- 1 — логин из current_username(): если тут НЕ тот, под кем вы вошли, — дело в сессии Proteus (выйти полностью / другой
--     браузер или инкогнито), а не в кэше. 2 — актуальный логин после склейки (pa_login_map): по нему ищутся «Мои».
-- 3 — сколько отчётов, где он среди автора и владельцев (как число на кнопке, без фильтров «Считать»).
SELECT '1. current_username()' AS what, '{{ current_username() }}' AS v
UNION ALL
SELECT '2. актуальный логин' AS what,
  ifNull(nullIf((SELECT any(toString(lm.canon)) FROM prod_proteus.pa_login_map lm WHERE lm.login = lower('{{ current_username() }}')), ''), lower('{{ current_username() }}')) AS v
UNION ALL
SELECT '3. отчётов с ним среди владельцев' AS what, toString(count()) AS v
FROM prod_proteus.pa_dash_meta m
WHERE has(arrayMap(x -> lower(trim(toString(ifNull(x, '')))), m.owners_string),
  ifNull(nullIf((SELECT any(toString(lm.canon)) FROM prod_proteus.pa_login_map lm WHERE lm.login = lower('{{ current_username() }}')), ''), lower('{{ current_username() }}')))
  OR lower(trim(toString(ifNull(m.owner_login, '')))) =
  ifNull(nullIf((SELECT any(toString(lm.canon)) FROM prod_proteus.pa_login_map lm WHERE lm.login = lower('{{ current_username() }}')), ''), lower('{{ current_username() }}'))
