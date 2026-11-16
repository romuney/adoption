"""Click-only native-header access using ordinary focusable Markdown links.

The report iframe never accesses its parent. Existing v1 control links remain
supported; the new opener targets the permanent Superset app root.
"""


def _chart_id(main: int) -> int:
    if type(main) is not int or main <= 0:
        raise ValueError('main must be a positive chart id')
    return main


def header_control_markdown(main: int) -> str:
    main = _chart_id(main)
    return f'[Открыть шапку дашборда](#app "Открыть шапку дашборда")\n[Закрыть шапку дашборда](#pa-next-header-closed-{main})\n'


def header_reveal_css(main: int) -> str:
    main = _chart_id(main)
    holder = f'.dashboard-component-chart-holder.dashboard-chart-id-{main}'
    same_window = ':is(:not([target]),[target="_self"])'
    legacy_open = f'a[href$="#chart-id-{main}"]{same_window}'
    app_open = f'a[href$="#app"][title="Открыть шапку дашборда"]{same_window}'
    open_link = f':is({legacy_open},{app_open})'
    close_link = f'a[href$="#pa-next-header-closed-{main}"]{same_window}'
    any_link = f':is({open_link},{close_link})'
    board = f'body:has({holder}):has({open_link}):has({close_link}):not(.dashboard--editing):not(:has(.dashboard--editing))'
    enabled = board + f':is(:has({legacy_open}):has(#chart-id-{main}),:has({app_open}):has(#app))'
    header = f'{enabled} .dashboard-header-container'
    # Do not toggle on opener focus: covering it on mousedown would cancel
    # native anchor activation. Collapse the control row before chart mount,
    # but keep the native header visible until a real target exists.
    opened = enabled + f':is(:has(.dashboard-header-container:focus-within),:has(.dashboard-header-container .ant-dropdown-open),:has(.dashboard-header-container [aria-expanded="true"]),:has(#chart-id-{main}:target),:has({app_open}):has(#app:target))'
    row = f'.dragdroppable-row:has(> .with-popover-menu > .grid-row > .dragdroppable:only-child > .with-popover-menu {any_link}):not(:has(.dashboard-chart)):not(:has(.dragdroppable-row))'
    component = f':is(.dashboard-markdown,.dashboard-component-markdown,.resizable-container,.dashboard-component-chart-holder):has({any_link}):not(:has(.dashboard-chart))'
    return f'''/* Optional native-header control v2. Ordinary same-window Markdown links.
   No required Markdown class or sibling paragraph. The new control does
   not depend on the mounted chart ID; legacy controls wait for their target.
   The new link targets the permanent Superset SPA root #app; v1 links work too.
   The permanent URL target retains state across pointer focus differences.
   No hover activation. Native button focus preserves keyboard access.
   Missing/broken/blank controls leave the native header visible. Edit always
   uses native flow. The iframe never reads or writes the parent document. */
@supports selector(:has(*)) and selector(:focus-within) and (clip-path:inset(100% 0 0 0)){{
{enabled} .grid-container:has({holder}){{--pa-next-board-header-height:0px}}
{header}{{position:fixed!important;top:var(--pa-next-nav-height,48px)!important;left:0!important;right:0!important;width:auto!important;min-width:0!important;max-width:none!important;height:65px!important;min-height:65px!important;box-sizing:border-box!important;margin:0!important;overflow:visible!important;z-index:100!important;transform:translateY(-100%)!important;clip-path:inset(100% 0 0 0)!important;transition:none!important}}
{opened} .dashboard-header-container{{transform:none!important;clip-path:none!important}}
{board} {component},{board} p:has({any_link}){{height:0!important;min-height:0!important;max-height:0!important;padding:0!important;margin:0!important;border:0!important;overflow:visible!important;font-size:0!important;line-height:0!important}}
{board} {row},{board} {row} *:not(a){{height:0!important;min-height:0!important;max-height:0!important;margin:0!important;padding:0!important;border:0!important;gap:0!important;overflow:visible!important;font-size:0!important;line-height:0!important}}
{board} {any_link}{{position:fixed!important;top:var(--pa-next-nav-height,48px)!important;left:0!important;right:0!important;width:auto!important;height:8px!important;min-height:0!important;padding:0!important;margin:0!important;border:0!important;background:transparent!important;box-shadow:none!important;color:transparent!important;font-size:0!important;line-height:0!important;text-decoration:none!important;z-index:101!important;transition:none!important}}
{board} {close_link}{{visibility:hidden!important;pointer-events:none!important}}
{opened} {open_link}{{pointer-events:none!important}}
{opened} {close_link}{{visibility:visible!important;pointer-events:auto!important}}
{board} {any_link}:focus-visible{{outline:2px solid #245fd4!important;outline-offset:-2px!important}}
}}
'''
