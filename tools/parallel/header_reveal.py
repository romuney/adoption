"""Native dashboard header toggled by safe Markdown links in the outer board.

No iframe-to-parent DOM access and no raw HTML are required. Without both
working links, the native header remains visible.
"""


def _chart_id(main: int) -> int:
    if type(main) is not int or main <= 0:
        raise ValueError('main must be a positive chart id')
    return main


def header_control_markdown(main: int) -> str:
    main = _chart_id(main)
    return f'[Открыть шапку дашборда](#chart-id-{main})\n[Закрыть шапку дашборда](#pa-next-header-closed-{main})\n'


def header_reveal_css(main: int) -> str:
    main = _chart_id(main)
    holder = f'.dashboard-component-chart-holder.dashboard-chart-id-{main}'
    # ReactMarkdown normally emits no target attribute. A fork forcing _blank
    # must fail open rather than hide the only route to dashboard editing.
    open_link = f'a[href="#chart-id-{main}"]:is(:not([target]),[target="_self"])'
    close_link = f'a[href="#pa-next-header-closed-{main}"]:is(:not([target]),[target="_self"])'
    # One Markdown paragraph gives two sibling anchors. This can be detected
    # without nesting :has(), which CSS forbids, and cannot match separate blocks.
    pair = f'.dashboard-markdown {open_link} ~ {close_link}'
    block = f'.dashboard-markdown:has({open_link} ~ {close_link})'
    board = f'body:has({holder}):has(#chart-id-{main}):has({pair}):not(.dashboard--editing):not(:has(.dashboard--editing))'
    header = f'{board} .dashboard-header-container'
    active = board + f':has(#chart-id-{main}:target)'
    # Only a dedicated control row collapses. Other charts or Markdown in a
    # shared row must never disappear because the control was placed beside it.
    row = f'.dragdroppable-row:has(> .with-popover-menu > .grid-row > .dragdroppable:only-child > .with-popover-menu > {pair})'
    return f'''/* Optional native-header control. Install the two ordinary links from
   file 14 in a separate Markdown row. Until both same-window links exist, the
   native header stays visible. Click the invisible 8px zone below Proteus nav;
   click it again to close. Keyboard: Tab and Enter. No hover activation.
   The links change only this page's fragment; no iframe accesses parent DOM. */
@supports selector(:has(*)) and selector(:focus-within) and (clip-path:inset(100% 0 0 0)){{
{board} .grid-container:has({holder}){{--pa-next-board-header-height:0px}}
{header}{{position:fixed!important;top:var(--pa-next-nav-height,48px)!important;left:0!important;right:0!important;width:auto!important;min-width:0!important;max-width:none!important;height:65px!important;min-height:65px!important;box-sizing:border-box!important;margin:0!important;overflow:visible!important;z-index:100!important;transform:translateY(-100%)!important;clip-path:inset(100% 0 0 0)!important;transition:none!important}}
{active} .dashboard-header-container,{header}:focus-within{{transform:none!important;clip-path:none!important}}
{board} {block},{board} {block} .resizable-container,{board} {block} .dashboard-component-chart-holder{{height:0!important;min-height:0!important;max-height:0!important;padding:0!important;margin:0!important;border:0!important;overflow:visible!important}}
{board} {block} p{{margin:0!important;padding:0!important;height:0!important;font-size:0!important;line-height:0!important}}
{board} {row},{board} {row}>.with-popover-menu,{board} {row}>.with-popover-menu>.grid-row,{board} {row}>.with-popover-menu>.grid-row>.dragdroppable:only-child,{board} {row}>.with-popover-menu>.grid-row>.dragdroppable:only-child>.with-popover-menu{{height:0!important;min-height:0!important;max-height:0!important;margin:0!important;padding:0!important;border:0!important;gap:0!important;overflow:visible!important}}
{board} {block} :is({open_link},{close_link}){{position:fixed!important;top:var(--pa-next-nav-height,48px)!important;left:0!important;right:0!important;width:auto!important;height:8px!important;min-height:0!important;padding:0!important;margin:0!important;border:0!important;background:transparent!important;box-shadow:none!important;color:transparent!important;font-size:0!important;line-height:0!important;text-decoration:none!important;z-index:101!important;transition:none!important}}
{board} {block} {close_link}{{visibility:hidden!important;pointer-events:none!important}}
{active} {block} {open_link}{{visibility:hidden!important;pointer-events:none!important}}
{active} {block} {close_link}{{visibility:visible!important;pointer-events:auto!important}}
{board} {block} :is({open_link},{close_link}):focus-visible{{outline:2px solid #245fd4!important;outline-offset:-2px!important}}
}}
'''
