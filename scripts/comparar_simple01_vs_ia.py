"""
Comparación SIMPLE-01 (keywords) vs clasificación IA.

Regla del nodo Set - Clasificar (workflows/SIMPLE-01 Telegram Bot.json):
  comprar|urgente|ya -> caliente
  info|precio|ver -> tibio
  otro -> frio
Match por subcadena sobre el texto en minúsculas.
La primera lista que matchea gana.

Uso:
  py -3 scripts/comparar_simple01_vs_ia.py
  py -3 scripts/comparar_simple01_vs_ia.py --palabra-completa
"""
from __future__ import annotations

import argparse
import csv
import math
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VAL = ROOT / "docs" / "validacion"
GUION = VAL / "guion_conversaciones_perfil.csv"
IA = VAL / "resultados_clasificacion_crudo.csv"
OUT = VAL / "comparacion_simple01_vs_ia_crudo.csv"

CALIENTE = ("comprar", "urgente", "ya")
TIBIO = ("info", "precio", "ver")
FIELDS = [
    "id",
    "perfil_esperado",
    "mensaje_usuario",
    "clasificacion_simple01",
    "coincide_simple01_vs_esperado",
    "clasificacion_ia",
    "coincide_ia_vs_esperado",
    "simple01_igual_ia",
    "keywords_disparadas_simple01",
]


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def hits(text: str, words: tuple[str, ...], whole: bool) -> list[str]:
    low = text.lower()
    found = []
    for w in words:
        if whole:
            if re.search(r"\b" + re.escape(w) + r"\b", low):
                found.append(w)
        elif w in low:
            found.append(w)
    return found


def clasificar(text: str, whole: bool) -> tuple[str, str]:
    hot = hits(text, CALIENTE, whole)
    if hot:
        return "caliente", ",".join(hot)
    warm = hits(text, TIBIO, whole)
    if warm:
        return "tibio", ",".join(warm)
    return "frio", "(ninguna→frio)"


def binom_pmf(k: int, n: int) -> float:
    return math.comb(n, k) / (2**n)


def mcnemar_exact_two_sided(b: int, c: int) -> float:
    """Binomial exacto bilateral sobre los pares discordantes (p=0.5)."""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    tail = sum(binom_pmf(i, n) for i in range(k + 1))
    return min(1.0, 2 * tail)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--palabra-completa",
        action="store_true",
        help="Match con límite de palabra. No escribe el CSV.",
    )
    args = parser.parse_args()
    whole = args.palabra_completa

    ia_rows = {r["id"]: r for r in read_csv(IA)}
    guion = read_csv(GUION)
    out_rows = []
    reglas_ok = 0
    ia_ok = 0
    b = 0
    c = 0

    for g in guion:
        rid = g["id"]
        msg = g["mensaje_usuario"]
        esperado = g["perfil_esperado"].strip().lower()
        ia = ia_rows[rid]
        clas_ia = ia["clasificacion_obtenida"].strip().lower()
        simple, kws = clasificar(msg, whole)
        ok_s = simple == esperado
        ok_i = clas_ia == esperado
        if ok_s:
            reglas_ok += 1
        if ok_i:
            ia_ok += 1
        if (not ok_s) and ok_i:
            b += 1
        elif ok_s and (not ok_i):
            c += 1
        out_rows.append(
            {
                "id": rid,
                "perfil_esperado": esperado,
                "mensaje_usuario": msg,
                "clasificacion_simple01": simple,
                "coincide_simple01_vs_esperado": "si" if ok_s else "no",
                "clasificacion_ia": clas_ia,
                "coincide_ia_vs_esperado": "si" if ok_i else "no",
                "simple01_igual_ia": "si" if simple == clas_ia else "no",
                "keywords_disparadas_simple01": kws,
            }
        )

    n = len(out_rows)
    p = mcnemar_exact_two_sided(b, c)
    print(f"reglas {reglas_ok}/{n}")
    print(f"IA {ia_ok}/{n}")
    print(f"b={b}")
    print(f"c={c}")
    print(f"p={p:.4f}")

    if whole:
        return

    with OUT.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS, lineterminator="\n")
        w.writeheader()
        w.writerows(out_rows)


if __name__ == "__main__":
    main()
