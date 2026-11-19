"""Unify presentation-only tooltip lifecycles; keep metric HTML untouched."""


def augment_tooltips(source, controller, part):
    model_prefix = source[:source.index('(function mount()')]
    def replace(old, new):
        nonlocal source
        assert source.count(old) == 1, ('tooltip hook changed', part, old)
        source = source.replace(old, new)

    replace('    getTip();\n', '    getTip();\n' + controller + '\n')
    for signature, replacement in [
        ('    function showTip(html, rect) {', '    function showTip(html, rect) { paNextTip.show(html, rect); }'),
        ('    function hideTip() {', '    function hideTip() { paNextTip.hide(); }'),
    ]:
        start = source.index(signature)
        end = source.index('\n    }', start) + len('\n    }')
        source = source[:start] + replacement + source[end:]
    # Only pointer exits get a grace period. Explicit dismissals (click,
    # loading, scroll, blur, remount) keep their immediate hide semantics.
    start = source.index('    function onOut(e) {')
    end = source.index('\n    }', start) + len('\n    }')
    block = source[start:end]
    assert block.count('hideTip();') == 1, ('tooltip mouseout changed', part)
    source = source[:start] + block.replace('hideTip();', 'paNextTip.defer(e);') + source[end:]
    if part in ('cat', 'one'):
        start = source.index('    function onTipMove(e) {')
        end = source.index('\n    }', start) + len('\n    }')
        block = source[start:end]
        assert block.count('hideTip();') == 1, ('tooltip mousemove changed', part)
        source = source[:start] + block.replace('hideTip();', 'paNextTip.defer(e);') + source[end:]
    if part == 'one':
        start = source.index('    function placeTip(x, y) {')
        end = source.index('\n    function onMove(e) {', start)
        source = source[:start] + '''    function placeTip(x, y) {
      showTip(getTip().innerHTML, {left:x,top:y,width:0,height:0,pt:true});
    }
''' + source[end:]
        replace('if (state.dynEl) { state.dynEl = null; state.dynI = -1; hideTip(); }',
                'if (state.dynEl) { state.dynEl = null; state.dynI = -1; if (!state.tip) hideTip(); }')
    assert source[:source.index('(function mount()')] == model_prefix, ('tooltip transform touched model/formatting', part)
    return source
