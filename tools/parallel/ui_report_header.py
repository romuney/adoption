"""Move title/help/brand above the existing period and audience controls."""
def augment_report_header(source):
    start=source.index("  h.push('</div><span class=\"' + N + '-sp\"></span>' + freshHtml(MODEL.md, N) +")
    end=source.index('\n  // Ряд 2',start)
    old=source[start:end]
    button=old[old.index("    '<button"):].strip()
    suffix="</button></div>');"
    assert button.endswith(suffix)
    button=button[:-len(suffix)]+"</button>'"
    source=source[:start]+"  h.push('</div><span class=\"' + N + '-sp\"></span>' + freshHtml(MODEL.md, N) + '</div>');"+source[end:]
    hook="  h.push('<div class=\"' + N + '-root\">');"
    assert source.count(hook)==1
    source=source.replace(hook,hook+"\n  h.push('<div class=\"pa-next-titlebar\"><h1>Proteus Adoption</h1><div class=\"pa-next-title-actions\">' + "+button+" + PA_NEXT_BRAND(true) + '</div></div>');")
    return source
