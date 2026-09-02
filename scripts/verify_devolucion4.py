#!/usr/bin/env python3
"""Verify v125 thesis against Devolución 4 corrections."""
from docx import Document
import re
from pathlib import Path

DOCX = Path(r"D:\Nodo_Propiedades_Tesis_v125.docx")
doc = Document(str(DOCX))

# Build full text with section markers
paragraphs = []
for i, p in enumerate(doc.paragraphs):
    style = p.style.name if p.style else ""
    text = p.text.strip()
    if text:
        paragraphs.append({"i": i, "style": style, "text": text})

full_text = "\n".join(p["text"] for p in paragraphs)
full_lower = full_text.lower()

def find_context(needle, context=120):
    results = []
    for p in paragraphs:
        if needle.lower() in p["text"].lower():
            t = p["text"]
            idx = t.lower().find(needle.lower())
            start = max(0, idx - 60)
            end = min(len(t), idx + len(needle) + 60)
            results.append(t[start:end])
    return results

def section_text(marker_patterns):
    """Get paragraphs after heading matching any pattern."""
    out = []
    in_section = False
    for p in paragraphs:
        t = p["text"]
        if any(re.search(pat, t, re.I) for pat in marker_patterns):
            in_section = True
            out.append(t)
            continue
        if in_section:
            # stop at next major heading
            if re.match(r"^\d+\.\s", t) and not any(re.search(pat, t, re.I) for pat in marker_patterns):
                if re.match(r"^\d+\.\d", t) is None or len(out) > 3:
                    break
            out.append(t)
    return "\n".join(out)

checks = {}

# === PLAN 10 ITEMS (from section 3) ===

# Item 1: §2.1 notification
checks["plan1_2.1_notificacion"] = {
    "desc": "Plan ítem 1: §2.1 notificación activa al operador",
    "ok": "notificación activa" in full_lower and "mecanismo explícito" in full_lower,
    "evidence": find_context("notificación activa")[:2],
}

# Item 2: §5.6 n=6
s56 = find_context("n=6") + find_context("n = 6") + find_context("seis ejecuciones")
checks["plan2_5.6_n6"] = {
    "desc": "Plan ítem 2: §5.6 unificado n=6",
    "ok": bool(re.search(r"n\s*=\s*6|seis ejecuciones|6 ejecuciones", full_lower)),
    "evidence": find_context("seis")[:3],
}

# Item 2 partial: enumerate 6 comparisons
checks["plan2_5.6_enumerar"] = {
    "desc": "Plan ítem 2 (parte): enumerar las 6 comparaciones",
    "ok": bool(re.search(r"(enumer|las seis|6 conversaciones|CAL-|TIB-|AMB-)", full_lower)) and "tres perfiles" in full_lower,
    "evidence": find_context("seis")[:2],
}

# Item 3: Tabla 7 dates, Figuras 3 a 6
checks["plan3_tabla7_fechas"] = {
    "desc": "Plan ítem 3: nota Tabla 7 fechas MCP/repo",
    "ok": "5 de agosto" in full_lower and ("21 de agosto" in full_lower or "repositorio" in full_lower),
    "evidence": find_context("5 de agosto")[:1],
}
checks["plan3_figuras_3_6"] = {
    "desc": "Plan ítem 3: Figuras 3 a 6 (no 5 a 8)",
    "ok": "figuras 3 a 6" in full_lower and "figuras 5 a 8" not in full_lower,
    "evidence": find_context("Figuras 3")[:1],
}

# Item 4: Fredes 2026, Zhao/Zheng
checks["plan4_fredes"] = {
    "desc": "Plan ítem 4: cita (Fredes, 2026)",
    "ok": "(fredes, 2026)" in full_lower or "fredes, 2026" in full_lower,
    "evidence": find_context("Fredes, 2026")[:2],
}

# Item 5: repository - can't verify externally
checks["plan5_repo"] = {
    "desc": "Plan ítem 5: repositorio público (declarado en doc)",
    "ok": "github.com" in full_lower or "repositorio" in full_lower,
    "evidence": find_context("repositorio")[:2],
}

# Item 6: Figura 1 notification branch
checks["plan6_figura1"] = {
    "desc": "Plan ítem 6: Figura 1 rama notificación caliente",
    "ok": "temperatura caliente" in full_lower and ("telegram" in full_lower or "alerta" in full_lower),
    "evidence": find_context("Temperatura Caliente")[:2],
}

# Item 7: heading levels, resumen, keywords, index, tabla 6
checks["plan7_resumen_matiz"] = {
    "desc": "Plan ítem 7: matiz Resumen (experiencia Mendoza, condicional)",
    "ok": ("experiencia del autor" in full_lower or "mendoza" in full_lower) and "concentrarían" in full_lower,
    "evidence": find_context("concentrarían")[:1],
}

# Keywords - count occurrences of keyword lists
kw_panel = full_lower.count("panel comercial")
checks["plan7_keywords"] = {
    "desc": "Plan ítem 7 / Q6: palabras clave unificadas",
    "ok": kw_panel >= 1,  # will check portada separately
    "evidence": [f"'panel comercial' aparece {kw_panel} veces"],
}

# Item 8: Figura 8 recorte
checks["plan8_figura8"] = {
    "desc": "Plan ítem 8: epígrafe Figura 8 recorte declarado",
    "ok": "recorte" in full_lower or "diez registros" in full_lower or "10 registros" in full_lower,
    "evidence": find_context("Figura 8")[:2] if find_context("Figura 8") else find_context("recorte")[:1],
}

# Item 9: long sentences
checks["plan9_oraciones"] = {
    "desc": "Plan ítem 9: reducción oraciones largas (parcial verificable)",
    "ok": True,  # hard to verify programmatically
    "evidence": ["Verificación cualitativa: requiere conteo de oraciones"],
}

# Item 10: optional planilla
checks["plan10_planilla"] = {
    "desc": "Plan ítem 10 (opcional): planilla ejecuciones individuales",
    "ok": "planilla" in full_lower and ("anexo" in full_lower or "ausente" in full_lower or "limitación" in full_lower),
    "evidence": find_context("planilla")[:2],
}

# === NEW FINDINGS Q1-Q9 (section 8 correction plan) ===

# Q1: §3.1 reformulated + §3.7 item
q1_31 = find_context("condición de contraste") + find_context("grupo de control")
q1_neg = "no hay grupo de control" in full_lower and "condición de contraste" not in full_lower
q1_pos = "condición de contraste" in full_lower and ("clasificador por reglas" in full_lower or "§5.4" in full_text or "5.4" in full_text)
checks["Q1_anclaje_metodologico"] = {
    "desc": "Q1 OBLIGATORIA: §3.1 reformulado + ítem §3.7 campaña §5.4",
    "ok": q1_pos and not (q1_neg and not q1_pos),
    "evidence": find_context("condición de contraste")[:2] or find_context("grupo de control")[:2],
}

# Check §3.7 mentions campaign
s37 = ""
for p in paragraphs:
    if re.search(r"3\.7|procedimiento", p["text"], re.I):
        s37 += p["text"] + "\n"
checks["Q1_3.7_item"] = {
    "desc": "Q1: §3.7 menciona campaña comparativa/clasificador reglas",
    "ok": bool(re.search(r"clasificador.*reglas|comparaci[oó]n.*pareada|simple-01|treinta conversaciones|30 conversaciones", s37, re.I)),
    "evidence": [s37[:500]] if s37 else [],
}

# Q2: example fix
checks["Q2_ejemplo_ver"] = {
    "desc": "Q2 OBLIGATORIA: ejemplo §5.4 sin contradicción 'ver'",
    "ok": not bool(re.search(r"quiero ver uno.*no activan ninguna|no activan ninguna.*quiero ver", full_lower, re.DOTALL)),
    "evidence": find_context("quiero ver")[:2] or find_context("decisime que hay")[:2],
}

# Q3: TIB-13/TIB-14 rules classification + fragility
checks["Q3_TIB13_14"] = {
    "desc": "Q3 MUY REC: clasificación reglas TIB-13/TIB-14 + fragilidad p-valor",
    "ok": ("tib-13" in full_lower or "tib-14" in full_lower) and (
        "frágil" in full_lower or "fragil" in full_lower or "discordantes" in full_lower
    ),
    "evidence": find_context("TIB-13")[:2] or find_context("discordantes")[:2],
}

# Q4: enumerate 6 in §5.6, fix §3.7 sum
checks["Q4_seis_comparaciones"] = {
    "desc": "Q4 MUY REC: enumerar 6 comparaciones §5.6 y §3.7 coherente",
    "ok": bool(re.search(r"seis.*(ejecuciones|comparaciones|conversaciones)", full_lower)),
    "evidence": find_context("seis ejecuciones")[:2] or find_context("seis comparaciones")[:2],
}

# Q5: Figura 1 topology - hard to verify from text only
checks["Q5_figura1_topologia"] = {
    "desc": "Q5 REC: topología Figura 1 (notificación bajo IF lead completo)",
    "ok": None,  # needs image inspection
    "evidence": find_context("Figura 1")[:2],
}

# Q6: keywords portada vs post-resumen
# Find keyword sections
portada_kw = []
resumen_kw = []
found_resumen = False
for p in paragraphs[:30]:
    if "palabras clave" in p["text"].lower():
        portada_kw.append(p["text"])
for p in paragraphs:
    if re.match(r"^Resumen$", p["text"], re.I):
        found_resumen = True
    if found_resumen and "palabras clave" in p["text"].lower():
        resumen_kw.append(p["text"])

# Count keyword lists
kw_lists = []
for p in paragraphs:
    if "palabras clave" in p["text"].lower() or "keywords" in p["text"].lower():
        kw_lists.append(p["text"])

checks["Q6_keywords_unificadas"] = {
    "desc": "Q6 REC: palabras clave portada y post-Resumen unificadas",
    "ok": full_lower.count("palabras clave") <= 1 or (
        "panel comercial" in full_lower and not bool(re.search(r"palabras clave.*\n.*palabras clave", full_text, re.I))
    ),
    "evidence": kw_lists[:4],
}

# Q7: McNemar before Meta
refs_section = ""
in_refs = False
for p in paragraphs:
    if re.match(r"^Referencias$", p["text"], re.I):
        in_refs = True
    if in_refs:
        refs_section += p["text"] + "\n"

mcnemar_idx = refs_section.lower().find("mcnemar")
meta_idx = refs_section.lower().find("meta platforms")
checks["Q7_mcnemar_orden"] = {
    "desc": "Q7 REC: McNemar antes de Meta Platforms en referencias",
    "ok": mcnemar_idx >= 0 and meta_idx >= 0 and mcnemar_idx < meta_idx,
    "evidence": [refs_section[mcnemar_idx:mcnemar_idx+80] if mcnemar_idx>=0 else "McNemar no encontrado",
                 refs_section[meta_idx:meta_idx+80] if meta_idx>=0 else "Meta no encontrado"],
}

# Q8: §5.4 self-reference and chapter 8 reference
checks["Q8_autorreferencia"] = {
    "desc": "Q8 REC: corregir autorreferencia §5.4 y ref capítulo 8",
    "ok": "sección 5.4" not in full_lower or "documentados más arriba" in full_lower or "más arriba en esta misma sección" in full_lower,
    "evidence": find_context("sección 5.4")[:2] or find_context("revisiones anteriores")[:2],
}

# Q9: Tabla 9 for §5.4 comparison
checks["Q9_tabla9"] = {
    "desc": "Q9 MENOR: Tabla 9 comparación §5.4",
    "ok": "tabla 9" in full_lower or re.search(r"tabla\s*9", full_lower),
    "evidence": find_context("Tabla 9")[:2],
}

# §5.4 McNemar exists
checks["extra_5.4_mcnemar"] = {
    "desc": "Extra: §5.4 comparación clasificadores con McNemar",
    "ok": "mcnemar" in full_lower and ("66,7" in full_text or "66.7" in full_text) and ("93,3" in full_text or "93.3" in full_text),
    "evidence": find_context("McNemar")[:2],
}

# Zhao before Zheng
zhao_idx = refs_section.lower().find("zhao")
zheng_idx = refs_section.lower().find("zheng")
checks["plan4_zhao_zheng"] = {
    "desc": "Plan ítem 4: Zhao antes de Zheng",
    "ok": zhao_idx >= 0 and zheng_idx >= 0 and zhao_idx < zheng_idx,
    "evidence": [],
}

# §3.1 still denies control?
checks["Q1_3.1_negacion"] = {
    "desc": "Q1 inverso: §3.1 NO debe negar condición de contraste sin matiz",
    "ok": not bool(re.search(r"no hay grupo de control.*no hay manipulación", full_lower, re.DOTALL)) or "condición de contraste" in full_lower,
    "evidence": find_context("grupo de control")[:2],
}

# Print results
print("=" * 80)
print(f"ARCHIVO: {DOCX.name}")
print(f"Párrafos: {len(paragraphs)}, caracteres: {len(full_text)}")
print("=" * 80)

for key, c in checks.items():
    status = c["ok"]
    if status is True:
        icon = "✅"
    elif status is False:
        icon = "❌"
    else:
        icon = "⚠️"
    print(f"\n{icon} [{key}] {c['desc']}")
    for ev in (c.get("evidence") or [])[:2]:
        ev_short = ev[:200].replace("\n", " ")
        print(f"   → {ev_short}")

# Additional targeted searches
print("\n" + "=" * 80)
print("BÚSQUEDAS ADICIONALES")
print("=" * 80)

searches = [
    "quiero ver uno esta semana",
    "decisime que hay",
    "no activan ninguna palabra",
    "activan una clave de la categoría equivocada",
    "condición de contraste",
    "única condición de contraste",
    "SIMPLE-01",
    "clasificador por reglas",
    "20/30",
    "28/30",
    "p=0,021",
    "p = 0,021",
    "fragilidad",
    "frágil",
    "documentados más arriba",
    "revisiones anteriores",
    "Figuras 5 a 8",
    "Figuras 3 a 6",
    "panel comercial",
    "Tabla 9",
    "sección 5.4",
    "capítulo 8",
    "resuelve la recomendación",
]

for s in searches:
    count = full_lower.count(s.lower())
    print(f"  '{s}': {count} apariciones")
    if count > 0 and count <= 3:
        for ev in find_context(s)[:1]:
            print(f"    → {ev[:150]}")

# Extract §3.1, §3.7, §5.4 snippets
print("\n" + "=" * 80)
print("FRAGMENTOS CLAVE")
print("=" * 80)
for label, patterns in [
    ("§3.1", [r"3\.1\s", r"tipo de investigación", r"diseño.*investigación"]),
    ("§3.7", [r"3\.7\s", r"procedimiento"]),
    ("§5.4", [r"5\.4\s", r"clasificador.*reglas", r"comparación.*pareada"]),
    ("§5.6", [r"5\.6\s", r"concordancia"]),
]:
    print(f"\n--- {label} ---")
    found = False
    for p in paragraphs:
        if any(re.search(pat, p["text"], re.I) for pat in patterns):
            print(p["text"][:400])
            found = True
            break
    if not found:
        print("(no encontrado por patrón de encabezado)")

# References order snippet
print("\n--- REFERENCIAS (McNemar/Meta/Zhao/Zheng) ---")
for line in refs_section.split("\n"):
    if any(x in line.lower() for x in ["mcnemar", "meta", "zhao", "zheng", "n8n"]):
        print(line[:120])
