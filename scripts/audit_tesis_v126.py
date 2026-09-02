#!/usr/bin/env python3
"""Auditoría v126 vs Devolución 4 y diff v125→v126."""
import re
import json
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path
from difflib import unified_diff

from docx import Document
from pypdf import PdfReader

PDF_PATH = Path(r"d:\Devolucion_4_Nodo_Propiedades.pdf")
V126_PATH = Path(r"d:\Nodo_Propiedades_Tesis_v126.docx")
V125_PATH = Path(r"d:\Nodo_Propiedades_Tesis_v125.docx")
OUT_DIR = Path(r"D:\Dev\Nodo-Propiedades\scripts\audit_output")
OUT_DIR.mkdir(exist_ok=True)

NS = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}


def extract_docx_text(path: Path) -> str:
    doc = Document(str(path))
    parts = []
    for p in doc.paragraphs:
        if p.text.strip():
            parts.append(p.text)
    for table in doc.tables:
        for row in table.rows:
            cells = [c.text.strip() for c in row.cells if c.text.strip()]
            if cells:
                parts.append(" | ".join(cells))
    return "\n".join(parts)


def extract_docx_xml_text(path: Path) -> str:
    """Fallback: raw XML text from document.xml (captures text boxes etc.)."""
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml")
    root = ET.fromstring(xml)
    texts = []
    for t in root.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"):
        if t.text:
            texts.append(t.text)
        if t.tail:
            texts.append(t.tail)
    return "".join(texts)


def extract_pdf_text(path: Path) -> str:
    reader = PdfReader(str(path))
    pages = []
    for i, page in enumerate(reader.pages):
        text = page.extract_text() or ""
        pages.append(f"--- PAGE {i+1} ---\n{text}")
    return "\n".join(pages)


def norm(s: str) -> str:
    s = s.lower()
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def find_all(pattern: str, text: str, flags=0):
    return list(re.finditer(pattern, text, flags))


def context(text: str, pos: int, radius=120) -> str:
    start = max(0, pos - radius)
    end = min(len(text), pos + radius)
    return text[start:end].replace("\n", " ")


def section_text(text: str, section_id: str) -> str:
    """Extract from section heading to next same-level heading."""
    pat = rf"(?:^|\n)\s*{re.escape(section_id)}\b[^\n]*\n"
    m = re.search(pat, text, re.IGNORECASE)
    if not m:
        return ""
    start = m.start()
    # next section like 5.7 after 5.6
    base = section_id.rsplit(".", 1)[0] if "." in section_id else section_id
    level = section_id.count(".") + 1
    if level == 2:
        nxt = rf"(?:^|\n)\s*{re.escape(base)}\.\d+\b"
    else:
        nxt = rf"(?:^|\n)\s*\d+\.\d+\b"
    m2 = re.search(nxt, text[m.end():], re.IGNORECASE)
    end = m.end() + m2.start() if m2 else len(text)
    return text[start:end]


def check_contains(text: str, patterns, label: str, required=True):
    hits = []
    for p in patterns:
        if isinstance(p, str):
            found = p.lower() in text.lower() or re.search(p, text, re.IGNORECASE)
        else:
            found = bool(re.search(p, text, re.IGNORECASE))
        hits.append((p, bool(found)))
    ok = all(h[1] for h in hits) if required else any(h[1] for h in hits)
    return {"label": label, "ok": ok, "hits": hits}


def main():
    pdf_text = extract_pdf_text(PDF_PATH)
    v126 = extract_docx_text(V126_PATH)
    v126_xml = extract_docx_xml_text(V126_PATH)
    v125 = extract_docx_text(V125_PATH) if V125_PATH.exists() else ""

    (OUT_DIR / "devolucion4.txt").write_text(pdf_text, encoding="utf-8")
    (OUT_DIR / "v126.txt").write_text(v126, encoding="utf-8")
    (OUT_DIR / "v125.txt").write_text(v125, encoding="utf-8")

    v126n = norm(v126)
    v125n = norm(v125) if v125 else ""
    pdfn = norm(pdf_text)

    results = {}

    # --- Parse Devolución 4 structure ---
    q_items = re.findall(r"Q(\d+)[:\.]?\s*([^\n]+)", pdf_text, re.IGNORECASE)
    plan_items = re.findall(r"(?:plan|ítem|item)\s*(\d+)[:\.]?\s*([^\n]+)", pdf_text, re.IGNORECASE)

    # --- CHECKLIST Devolución 4 (based on typical structure + PDF content) ---
    checklist = []

    # Q1: Objetivo general alineado / no marketing
    checklist.append(check_contains(
        v126, [r"objetivo general", r"automatiz", r"inmobiliar"],
        "Q1 Objetivo general presente y alineado"
    ))

    # Q2: Objetivos específicos medibles
    checklist.append(check_contains(
        v126, [r"objetivos? específicos?", r"OE\d|objetivo específico"],
        "Q2 Objetivos específicos declarados"
    ))

    # Q3: Metodología / diseño experimental
    checklist.append(check_contains(
        v126, [r"metodolog", r"diseño", r"evaluación|evaluacion"],
        "Q3 Metodología / diseño experimental"
    ))

    # Q4: Métricas cuantitativas
    checklist.append(check_contains(
        v126, [r"precisión|precision|accuracy|f1|métrica|metrica|porcentaje|%"],
        "Q4 Métricas cuantitativas reportadas"
    ))

    # Q5: Limitaciones
    checklist.append(check_contains(
        v126, [r"limitacion|limitación|amenaza|validez"],
        "Q5 Limitaciones / amenazas a la validez"
    ))

    # Q6: Trabajo futuro
    checklist.append(check_contains(
        v126, [r"trabajo futuro|líneas futuras|lineas futuras|futuras líneas"],
        "Q6 Trabajo futuro"
    ))

    # Q7: Referencias / estado del arte
    checklist.append(check_contains(
        v126, [r"estado del arte|marco teórico|marco teorico|referencias"],
        "Q7 Marco teórico / referencias"
    ))

    # Q8: Arquitectura / implementación
    checklist.append(check_contains(
        v126, [r"n8n|workflow|arquitectura|telegram|whatsapp|meta"],
        "Q8 Descripción técnica / arquitectura"
    ))

    # Q9: Resultados / discusión
    checklist.append(check_contains(
        v126, [r"resultados|discusión|discusion|conclus"],
        "Q9 Resultados y conclusiones"
    ))

    # Plan 10 items - extract from PDF and check each theme
    plan_keywords = [
        ("Plan 1: Alinear objetivos con resultados", [r"objetivo", r"resultado"]),
        ("Plan 2: Métricas y tabla de resultados", [r"tabla", r"resultado", r"%"]),
        ("Plan 3: Eliminar marketing / claims no sustentados", [r"revolucion|único|unico|líder"], False),
        ("Plan 4: Metodología evaluación usuarios", [r"usuario|encuesta|evaluación|evaluacion|n\s*=\s*6|seis participantes"]),
        ("Plan 5: Limitaciones explícitas", [r"limitacion|limitación"]),
        ("Plan 6: Trabajo futuro concreto", [r"trabajo futuro|futuro"]),
        ("Plan 7: Figuras actualizadas", [r"figura\s*\d"]),
        ("Plan 8: Consistencia numérica", [r"n\s*=\s*6|seis"]),
        ("Plan 9: Notificaciones / flujo lead", [r"notificaci[oó]n|lead"]),
        ("Plan 10: Formato / redacción académica", [r"introducción|introduccion|conclusi[oó]n"]),
    ]

    for label, patterns, *rest in plan_keywords:
        required = rest[0] if rest else True
        if label.startswith("Plan 3"):
            # inverted: should NOT contain hype words prominently
            hype = [w for w in ["revolucion", "único en el mercado", "líder del mercado"] if w in v126n]
            checklist.append({"label": label, "ok": len(hype) == 0, "hits": [(h, h not in v126n) for h in ["revolucion", "único", "líder"]]})
        else:
            checklist.append(check_contains(v126, patterns, label, required=required))

    # --- v125 pendientes ---
    pendientes = {}

    s56 = section_text(v126, "5.6") or section_text(v126, "5.6.")
    s56_125 = section_text(v125, "5.6") if v125 else ""
    pendientes["5.6_alineado"] = {
        "v126_section": s56[:2000],
        "v125_section": s56_125[:2000],
        "has_833": "83,3" in s56 or "83.3" in s56,
        "has_5_6": bool(re.search(r"5\s*/\s*6|5 de 6", s56, re.I)),
        "has_quiero_ver": "quiero ver" in s56.lower(),
        "mentions_n6": bool(re.search(r"n\s*=\s*6|n=6", s56, re.I)),
    }

    # Global 83.3% search
    for label, txt in [("v126", v126), ("v125", v125)]:
        matches_833 = [context(txt, m.start()) for m in find_all(r"83[,.]3\s*%?", txt)]
        matches_56 = [context(txt, m.start()) for m in find_all(r"5\s*/\s*6|5 de 6", txt)]
        matches_qv = [context(txt, m.start()) for m in find_all(r"quiero ver", txt, re.I)]
        pendientes[f"{label}_833"] = matches_833
        pendientes[f"{label}_5_6"] = matches_56
        pendientes[f"{label}_quiero_ver"] = matches_qv

    # n=6 global count
    n6_v126 = len(find_all(r"n\s*=\s*6|n=6", v126, re.I))
    n6_v125 = len(find_all(r"n\s*=\s*6|n=6", v125, re.I)) if v125 else 0
    pendientes["n6_count"] = {"v126": n6_v126, "v125": n6_v125}

    # Figura references
    fig_refs_v126 = re.findall(r"figura\s*(\d+)", v126, re.I)
    fig_refs_v125 = re.findall(r"figura\s*(\d+)", v125, re.I) if v125 else []
    pendientes["figuras"] = {"v126": sorted(set(fig_refs_v126)), "v125": sorted(set(fig_refs_v125))}

    # Fig 5-8 content mentions
    for fig in range(5, 9):
        pat = rf"figura\s*{fig}\b"
        pendientes[f"fig{fig}_v126"] = bool(re.search(pat, v126, re.I))
        pendientes[f"fig{fig}_v125"] = bool(re.search(pat, v125, re.I)) if v125 else None

    # Figura 1 / notificación
    fig1_ctx = []
    for m in find_all(r"figura\s*1\b", v126, re.I):
        fig1_ctx.append(context(v126, m.start(), 300))
    pendientes["figura1_contexts"] = fig1_ctx
    pendientes["notif_lead"] = check_contains(
        v126, [r"notificaci[oó]n.*lead|lead.*notificaci[oó]n|IF.*lead|lead completo"],
        "Figura 1: mención notificación bajo IF lead"
    )

    # Diff v125 -> v126
    diff_lines = []
    if v125:
        v125_lines = v125.splitlines()
        v126_lines = v126.splitlines()
        diff_lines = list(unified_diff(v125_lines, v126_lines, lineterm="", n=0))[:500]

    # Key phrase diff
    key_phrases = [
        "83,3", "83.3", "5/6", "5 de 6", "quiero ver", "n=6", "n = 6",
        "5.6", "figura 1", "figura 5", "figura 6", "figura 7", "figura 8",
        "notificación", "lead completo", "limitación", "trabajo futuro",
    ]
    phrase_diff = {}
    for ph in key_phrases:
        c125 = len(re.findall(re.escape(ph), v125, re.I)) if v125 else None
        c126 = len(re.findall(re.escape(ph), v126, re.I))
        phrase_diff[ph] = {"v125": c125, "v126": c126}

    # Score
    ok_count = sum(1 for c in checklist if c["ok"])
    total = len(checklist)
    pct = round(100 * ok_count / total, 1) if total else 0

    # Critical blockers
    blockers = []
    if pendientes["5.6_alineado"]["has_833"] or pendientes["5.6_alineado"]["has_5_6"]:
        blockers.append("§5.6 aún contiene 83,3% o 5/6")
    if pendientes["5.6_alineado"]["has_quiero_ver"]:
        blockers.append("§5.6 contiene 'quiero ver'")
    if len(pendientes.get("v126_833", [])) > 2:
        blockers.append(f"83,3% aparece {len(pendientes['v126_833'])} veces en v126 (>2 residuos)")
    for c in checklist[:2]:
        if not c["ok"]:
            blockers.append(f"Obligatorio fallido: {c['label']}")

    report = {
        "checklist": checklist,
        "ok_count": ok_count,
        "total": total,
        "pct": pct,
        "pendientes": pendientes,
        "phrase_diff": phrase_diff,
        "blockers": blockers,
        "pdf_questions": q_items[:20],
        "diff_sample_lines": diff_lines[:100],
    }

    (OUT_DIR / "audit_report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("=== PDF EXTRACT (first 4000 chars) ===")
    print(pdf_text[:4000])
    print("\n=== CHECKLIST ===")
    for c in checklist:
        icon = "OK" if c["ok"] else "FAIL"
        print(f"[{icon}] {c['label']}")
        for p, h in c.get("hits", []):
            print(f"    {p}: {'yes' if h else 'no'}")
    print(f"\nCUMPLIMIENTO: {ok_count}/{total} = {pct}%")
    print(f"\nBLOCKERS: {blockers}")
    print("\n=== PENDIENTES v125 ===")
    print(json.dumps(pendientes, ensure_ascii=False, indent=2)[:8000])
    print("\n=== PHRASE DIFF ===")
    for k, v in phrase_diff.items():
        if v["v125"] != v["v126"]:
            print(f"  {k}: v125={v['v125']} -> v126={v['v126']}")
    print("\n=== §5.6 v126 (first 1500) ===")
    print(s56[:1500])
    if s56_125:
        print("\n=== §5.6 v125 (first 1500) ===")
        print(s56_125[:1500])


if __name__ == "__main__":
    main()
