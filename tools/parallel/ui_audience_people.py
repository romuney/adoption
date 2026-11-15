"""Inject the isolated person-list audience editor into the original header.

Call augment_head(source, module_text) from build_ui.renderer before wrapping.
The original production file and numerical metric renderers remain untouched.
"""


def augment_head(source: str, module_text: str) -> str:
    def replace(old, new):
        nonlocal source
        assert source.count(old) == 1, ('audience people hook changed', old)
        source = source.replace(old, new)

    replace("'ca_head_f', 'ca_adg_f'],", "'ca_head_f', 'ca_adg_f', 'ca_login_f', 'ca_master_f'],")
    replace("heads: '', adg: [] }; }", "heads: '', adg: [], peopleMode: 'login', people: [] }; }")
    replace("heads: c.heads || '', adg: c.adg.slice() }; }", "heads: c.heads || '', adg: c.adg.slice(), peopleMode: c.peopleMode || 'login', people: (c.people || []).slice() }; }")
    replace("c.it.length || c.heads || c.adg.length); }", "c.it.length || c.heads || c.adg.length || caPeopleOn(c)); }")
    replace("  if (!state.applied) state.applied = caEmpty();", "  if (!state.applied) state.applied = caEmpty();\n  [state.draft, state.applied].forEach(function(c) { if (!c.people) c.people = []; if (!c.peopleMode) c.peopleMode = 'login'; });")
    replace("function orgUnder(path, node)", module_text + "\nfunction orgUnder(path, node)")
    replace("  if (c.adg.length) fl.push({ column: 'ca_adg_f', operator: 'IN', value: c.adg.slice() });", "  if (c.adg.length) fl.push({ column: 'ca_adg_f', operator: 'IN', value: c.adg.slice() });\n  if (caPeopleOn(c)) fl.push({ column: c.peopleMode === 'master' ? 'ca_master_f' : 'ca_login_f', operator: 'IN', value: c.people.slice() });")
    replace("  h.push('<span class=\"' + N + '-sp\"></span>');", "  h.push(caPeopleButton(d));\n  h.push('<span class=\"' + N + '-sp\"></span>');")
    replace("(on ? (d.adg.length", "(caPeopleOn(d) ? 'ЦА — после «Применить»' : on ? (d.adg.length")
    replace("      : 'число — сколько сотрудников пройдут остальные условия')", "      : caPeopleOn(d) ? 'числа — без учёта списка людей' : 'число — сколько сотрудников пройдут остальные условия')")
    replace("(d.adg.length && !MODEL.adgExact ? 'В ЦА — после «Применить»'", "(caPeopleOn(d) || (d.adg.length && !MODEL.adgExact) ? 'В ЦА — после «Применить»'")
    replace("(!pend || (on && !f.n) ? ' disabled' : '')", "(!pend || (on && !caPeopleOn(d) && !f.n) ? ' disabled' : '')")
    replace("    var prev = host.querySelector('.' + CFG.ns + '-overlay');", "    if (state.peopleClose) state.peopleClose(false);\n    var prev = host.querySelector('.' + CFG.ns + '-overlay');")
    replace("    function onClick(e) {", "    function onClick(e) {\n      if (trigger(e.target, 'data-ca-people')) { caPeopleOpen(overlay, render, openDd); return; }")
    return source
