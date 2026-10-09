#!/bin/zsh
# Доставка полосы полного разрешения: слайсы по 9000 символов, склейка, проверка SHA.
# Использование: ./_pull.sh <tab> <band>
# Служебный скрипт, в поставку макета не входит.
set -e
setopt null_glob
cd "$(dirname "$0")"
TAB=$1; BAND=$2
SLICE=9000
SHAF="$TAB"_c"$BAND"_sha.txt
rm -f "_shots/$SHAF" _shots/"$TAB"_c"$BAND"_*.b64

OUT=$(node _render.js crop "$TAB" "$BAND" 0 2>/dev/null)
TOTAL=$(print -r -- "$OUT" | grep -o 'из [0-9]*' | tail -1 | cut -d' ' -f2)
if [ -z "$TOTAL" ]; then print -u2 "нет TOTAL в ответе"; print -r -- "$OUT" | tail -3; exit 1; fi
print "полоса $BAND: $TOTAL b64-символов → $(( (TOTAL + SLICE - 1) / SLICE )) слайс(а)"

FROMS=(0)
FROM=$SLICE
while [ $FROM -lt $TOTAL ]; do
  node _render.js crop "$TAB" "$BAND" $FROM 2>/dev/null | grep -v 'полоса px'
  FROMS+=($FROM)
  FROM=$((FROM + SLICE))
done

# целостность: все SHA одной полосы обязаны совпадать (детерминизм рендера)
if [ -s "_shots/$SHAF" ]; then
  UNSORTED=$(cut -f1 "_shots/$SHAF" | sort -u | wc -l | tr -d ' ')
  if [ "$UNSORTED" -ne 1 ]; then
    print -u2 "ОШИБКА: рендер недетерминирован — SHA разошлись"; cut -f1 "_shots/$SHAF"; exit 1
  fi
fi

PARTS=()
for f in "${FROMS[@]}"; do PARTS+=("_shots/$TAB"_c"$BAND"_"$f".b64); done
cat "${PARTS[@]}" | base64 -D -o "_shots/$TAB"_c"$BAND".webp 2>/dev/null \
  || cat "${PARTS[@]}" | base64 -d > "_shots/$TAB"_c"$BAND".webp
rm -f _shots/"$TAB"_c"$BAND"_*.b64
OUTWEBP="_shots/$TAB"_c"$BAND".webp
SZ=$(wc -c < "$OUTWEBP" | tr -d ' ')
print "готово: $OUTWEBP ($SZ байт)"
