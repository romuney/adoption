-- Почему «Есть доступ к отчётам» меньше, чем «Открыли хотя бы раз» (2026-10-07).
-- Один запрос, в SQL Lab как есть. Отчёт ищется по названию — поменяйте строку в dash (сейчас «Proteus Adoption v2»).
-- Права в листе = pa_dash_acl (поимённо + AD-группы) → состав групп pa_adg_member → действующий штат pa_staff.
-- Строки: какие права у отчёта есть в данных, сколько людей за каждой группой, сколько зрителей за 30 дней права
-- в данных не имеют — и кто они (есть ли в штате, в каких группах прав вообще состоят).
WITH
  dash AS (SELECT m.dashboard_id AS did FROM prod_proteus.pa_dash_meta m WHERE m.dashboard_nm = 'Proteus Adoption v2'),
  acl AS (SELECT a.principal AS pr, a.kind AS kind FROM prod_proteus.pa_dash_acl a WHERE a.dashboard_id IN (SELECT did FROM dash)),
  grp AS (
    SELECT c.pr AS pr, uniqExact(g.login) AS gn, uniqExactIf(g.login, g.login IN (SELECT s.login FROM prod_proteus.pa_staff s)) AS gst
    FROM acl c LEFT JOIN prod_proteus.pa_adg_member g ON g.ad_group = c.pr
    WHERE c.kind = 'group' GROUP BY c.pr
  ),
  vw AS (
    SELECT DISTINCT lower(toString(p.login)) AS lg FROM prod_proteus.pa_pair p
    WHERE p.dashboard_id IN (SELECT did FROM dash) AND isNotNull(p.login)
      AND bitAnd(toUInt64(ifNull(p.msk_d, 0)), toUInt64(1073741823)) != 0
  ),
  has AS (
    SELECT DISTINCT lower(toString(x.login)) AS lg FROM prod_proteus.pa_pair_acc x
    WHERE x.dashboard_id IN (SELECT did FROM dash) AND lower(toString(x.login)) IN (SELECT v.lg FROM vw v)
  ),
  noacc AS (SELECT v.lg AS lg FROM vw v WHERE v.lg NOT IN (SELECT h.lg FROM has h))
SELECT r.what AS what, r.n AS n, r.sample AS sample FROM (
  SELECT '1. Отчёт: id и название' AS what, toString(count()) AS n,
    arrayStringConcat(groupArray(concat(toString(m.dashboard_id), ' ', toString(m.dashboard_nm))), '; ') AS sample
  FROM prod_proteus.pa_dash_meta m WHERE m.dashboard_id IN (SELECT did FROM dash)
  UNION ALL
  SELECT '2. Права в данных: поимённо' AS what, toString(countIf(c.kind = 'user')) AS n,
    arrayStringConcat(groupArrayIf(30)(c.pr, c.kind = 'user'), ', ') AS sample FROM acl c
  UNION ALL
  SELECT '3. Права в данных: AD-группы (людей в группе / из них в штате)' AS what, toString(count()) AS n,
    arrayStringConcat(groupArray(30)(concat(g.pr, ' (', toString(g.gn), ' / ', toString(g.gst), ')')), '; ') AS sample FROM grp g
  UNION ALL
  SELECT '4. Зрителей за 30 дней' AS what, toString(count()) AS n, '' AS sample FROM vw
  UNION ALL
  SELECT '5. Из них с правом в данных (поимённо или через группу, в штате)' AS what, toString(count()) AS n, '' AS sample FROM has
  UNION ALL
  SELECT '6. Зрители без права в данных' AS what, toString(count()) AS n, arrayStringConcat(groupArray(40)(z.lg), ', ') AS sample FROM noacc z
  UNION ALL
  SELECT '7. Без права: не в штате (pa_staff)' AS what, toString(count()) AS n, arrayStringConcat(groupArray(20)(z.lg), ', ') AS sample
  FROM noacc z WHERE z.lg NOT IN (SELECT s.login FROM prod_proteus.pa_staff s)
  UNION ALL
  SELECT '8. Без права: в каких группах прав (любых отчётов) состоят — топ' AS what, toString(count()) AS n,
    arrayStringConcat(arraySlice(arrayMap(t -> concat(t.1, ' ', toString(t.2)), arrayReverseSort(t -> t.2, groupArray((q.g, q.c)))), 1, 15), '; ') AS sample
  FROM (SELECT m.ad_group AS g, uniqExact(m.login) AS c FROM prod_proteus.pa_adg_member m WHERE m.login IN (SELECT lg FROM noacc) GROUP BY m.ad_group) q
) r
ORDER BY toUInt32OrZero(splitByChar('.', r.what)[1])
