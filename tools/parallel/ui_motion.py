"""Presentation-only motion hooks for the protected pa-one renderer."""


def apply_motion(source):
    def replace(old, new):
        nonlocal source
        assert source.count(old) == 1, ('motion hook changed', old)
        source = source.replace(old, new)

    replace("'<div class=\"' + CFG.ns + '-k-val\">' + o.value",
            "'<div class=\"' + CFG.ns + '-k-val\" data-pa-next-motion-key=\"' + esc(animKey()) + '\">' + o.value")
    # Keep only the existing new-data animation; resize/tab rerenders still do
    # not animate. This also gates SMIL, which CSS reduced-motion cannot stop.
    replace('ANIM = ak !== state.animSig;',
            "ANIM = ak !== state.animSig && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);")
    replace("var d = +(els[i].getAttribute('data-d') || 0);",
            'var d = 0; // No per-point stagger: all data is visible within 220 ms.')
    replace("{ dur: 480, ease: E1 });\n  run('svg .ln'",
            "{ dur: 220, ease: E1 });\n  run('svg .ln'")
    replace("{ dur: 760, ease: E2 });", "{ dur: 220, ease: E2 });")
    replace("{ dur: 350, delay: 250 });", "{ dur: 180, delay: 0 });")
    replace("{ dur: 480, ease: E1 });\n}", "{ dur: 220, ease: E1 });\n}")
    replace('dur="0.76s"', 'dur="0.22s"')
    return source
