# Набор «пустых» символов правила ou() датасетов — снят с ClickHouse 24.8 (chdb 2.1.1): символ c «пустой», если
# match(c, '^(?:\\s|\\p{P})*$'). Результат — punct_ch248.json (его берёт gp_part3.py). Символы — байтами (unhex):
# chdb меняет «—» в тексте запроса на «--».
# какие символы ClickHouse 24.8 считает «пустыми» в ou(): match(c, '^(?:\s|\p{P})*$') — точный набор для GP
import chdb, json
PAT = "'^(?:\\\\s|\\\\p{P})*$'"
def lit(c):
    return "unhex('" + chr(c).encode('utf-8', 'surrogatepass').hex() + "')"
out = []
cands = [c for c in range(1, 0x110000) if not (0xD800 <= c <= 0xDFFF)]
for i in range(0, len(cands), 5000):
    part = cands[i:i + 5000]
    r = chdb.query('SELECT arrayFilter(x -> match(x.2, ' + PAT + '), arrayZip(array(' + ','.join(str(c) for c in part) + '), array(' + ','.join(lit(c) for c in part) + ')))', 'JSONCompact')
    out += [x[0] for x in json.loads(r.bytes())['data'][0][0]]
print(len(out))
open(__file__.replace('.py', '.json'), 'w').write(json.dumps(out))
