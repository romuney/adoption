"""Make the custom-date mode actionable; preserve date math and filter protocol."""


def augment_custom_dates(source):
    def replace(old, new):
        nonlocal source
        assert source.count(old) == 1, ('custom date UI hook changed', old)
        source = source.replace(old, new)

    replace("var sel = d.pick ? { a: d.a, b: d.a } : cpSnap(d.a, d.b, d.g), pr = d.pick ? null : cpPrev(sel);",
            "var sel = d.ownAwait ? { a: null, b: null } : (d.pick ? { a: d.a, b: d.a } : cpSnap(d.a, d.b, d.g)), pr = d.ownAwait || d.pick ? null : cpPrev(sel);")
    replace('fits = !d.pick && p.n <= CFG.custom.max[d.g];',
            'fits = !d.ownAwait && !d.pick && p.n <= CFG.custom.max[d.g];')
    old = '''      h += '<button type="button"' + (PRE[i][0] === 'own' ? ' tabindex="-1"' : ' data-cppre="' + PRE[i][0] + '"') + ' class="' + (d.pre === PRE[i][0] ? 'on' : '') + '">' + PRE[i][1] + '</button>';'''
    new = '''      h += '<button type="button" data-cppre="' + PRE[i][0] + '" aria-pressed="' + (d.pre === PRE[i][0] ? 'true' : 'false') + '"' + (PRE[i][0] === 'own' ? ' aria-controls="' + N + '-custom-calendar" aria-describedby="' + N + '-custom-instruction"' : '') + ' class="' + (d.pre === PRE[i][0] ? 'on' : '') + '">' + PRE[i][1] + '</button>';'''
    replace(old, new)
    replace('''  h += '<div class="' + N + '-cal-main"><div class="' + N + '-cal-top">' +''', '''  var instruction = d.pre !== 'own' ? 'Для своего периода выберите первый и последний день в календаре.' : d.ownAwait ? '1. Выберите первый день периода в календаре.' : d.pick ? '2. Выберите последний день периода.' : 'Даты выбраны. Нажмите «Применить».';
  h += '<div class="' + N + '-cal-main" role="group" aria-label="Календарь выбора дат" aria-describedby="' + N + '-custom-instruction"><div id="' + N + '-custom-instruction" class="' + N + '-cal-help' + (d.pre === 'own' && (d.ownAwait || d.pick) ? ' choosing' : '') + '" role="status" aria-live="polite">' + instruction + '</div><div class="' + N + '-cal-top">' +''')
    # The field labels are embedded in a larger concatenated HTML string.
    replace("<em>с</em>' + dnFull(p.a)", "<em>с</em>' + (d.ownAwait ? 'выбери день' : dnFull(p.a))")
    replace("(d.pick ? 'выбери день' : dnFull(p.b))", "(d.ownAwait || d.pick ? 'выбери день' : dnFull(p.b))")
    replace(''''<div class="' + N + '-cal-ms">' + cpMonthHtml''', ''''<div id="' + N + '-custom-calendar" class="' + N + '-cal-ms' + (d.pre === 'own' && (d.ownAwait || d.pick) ? ' choosing' : '') + '">' + cpMonthHtml''')
    replace("(d.pick ? 'Выбери последний день периода' : fits",
            "(d.ownAwait ? 'Выберите даты в календаре' : d.pick ? 'Выбери последний день периода' : fits")
    replace("          cpd.pre = 'own'; renderDd(); return;", '''          cpd.ownAwait = false; cpd.pre = 'own'; renderDd();
          if (!cpd.pick && e.detail === 0) getDd().querySelector('[data-cpapply]').focus({preventScroll:true});
          else cpFocusDay(dn);
          return;''')
    replace("        if (pz) { cpPreset(cpd, pz.getAttribute('data-cppre')); renderDd(); return; }", '''        if (pz) {
          var preset = pz.getAttribute('data-cppre');
          if (preset === 'own') {
            if (cpd.pre !== 'own') { cpd.pre = 'own'; cpd.pick = 0; cpd.ownAwait = true; }
            renderDd(); cpFocusDay(cpd.ownAwait ? null : cpd.a); return;
          }
          cpd.ownAwait = false; cpPreset(cpd, preset); renderDd();
          getDd().querySelector('[data-cppre="' + preset + '"]').focus({preventScroll:true}); return;
        }''')
    replace("        if (trigger(e.target, 'data-cpapply')) {", "        if (trigger(e.target, 'data-cpapply')) {\n          if (cpd.ownAwait || cpd.pick) return;")
    replace('    function onClick(e) {', '''    function cpFocusDay(day) {
      var dd = getDd(), button = day == null ? null : dd.querySelector('[data-cpday="' + day + '"]');
      if (!button) button = dd.querySelector('[data-cpday]');
      if (button) button.focus({preventScroll:true});
    }
    function onClick(e) {''')
    replace("    P + '-cal-row{display:flex;gap:14px;flex:0 0 auto;}',", """    P + '-cal-row{display:flex;gap:14px;flex:0 0 auto;}',
    P + '-cal-help{font:11.5px/1.45 Arial,Helvetica,sans-serif;color:#737d90;background:#f6f7fb;border:1px solid transparent;border-radius:6px;padding:8px 10px;}',
    P + '-cal-help.choosing{color:#454b55;background:#f3f6fd;border-color:#c5d2ed;}',
    P + '-cal-ms.choosing{outline:2px solid #c5d2ed;outline-offset:3px;border-radius:6px;}',
    P + '-dd [data-cppre]:focus-visible,' + P + '-dd [data-cpday]:focus-visible{outline:2px solid #245fd4;outline-offset:-2px;}',""")
    return source
