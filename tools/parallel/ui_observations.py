"""Make observations a responsive, accessible disclosure without metric changes."""
def augment_observations(source):
    def replace(old, new):
        nonlocal source
        assert source.count(old) == 1, ('observations hook changed', old)
        source = source.replace(old, new)
    replace('  var o = list[0], open = !!state.obsOpen && list.length > 1;', '''  if (!state.obsManual) {
    var band = window.__paNext && window.__paNext.visibleBand;
    var visibleHeight = band ? band.bottom - band.top : window.innerHeight;
    var panel = document.querySelector('[data-pa-next-host="one"]');
    state.obsOpen = window.innerWidth >= 1600 && visibleHeight >= 740 && (!panel || panel.clientWidth >= 900);
  }
  var o = list[0], open = !!state.obsOpen && list.length > 1;''')
    replace("'-obs sev-' + o.sev + '\"><div", "'-obs sev-' + o.sev + '\"' + (list.length > 1 ? ' data-obs=\"toggle\" role=\"button\" tabindex=\"0\" aria-label=\"Выводы: раскрыть или свернуть\" aria-expanded=\"' + open + '\"' : '') + '><div")
    replace("'<button type=\"button\" class=\"' + N + '-obs-tog\" data-obs=\"toggle\" aria-expanded=\"' + open + '\">'", "'<span class=\"' + N + '-obs-tog\" aria-hidden=\"true\">'")
    replace("(open ? 'Свернуть ▴' : 'Ещё ' + (list.length - 1) + ' ▾') + '</button>'", "(open ? 'Свернуть ▴' : 'Ещё ' + (list.length - 1) + ' ▾') + '</span>'")
    replace('        state.obsOpen = !state.obsOpen;', '        state.obsManual = true; state.obsOpen = !state.obsOpen;')
    replace("        state.obsManual = true; state.obsOpen = !state.obsOpen;   // раскрыть список фактов вниз / свернуть\n        render();", "        state.obsManual = true; state.obsOpen = !state.obsOpen;   // раскрыть список фактов вниз / свернуть\n        var focusObservation = document.activeElement === ob;\n        render();\n        if (focusObservation) { var nextObservation = overlay.querySelector('[data-obs]'); if (nextObservation) nextObservation.focus({preventScroll:true}); }")
    replace('    function render() {', "    function render() {\n      var restoreObservationFocus = document.activeElement && document.activeElement.hasAttribute('data-obs');")
    replace('      scrPut(scr);', "      scrPut(scr);\n      if (restoreObservationFocus) { var observationFocus = overlay.querySelector('[data-obs]'); if (observationFocus) observationFocus.focus({preventScroll:true}); }")
    return source
