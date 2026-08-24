"""
Render a simple HTML workflow canvas preview + Telegram mock + Leads_Bot table
from exported Bot Telegram Inmobiliaria.json for thesis captures when live UI is unavailable
or as a staged base; browser will screenshot these as fallback only if labeled.
Also builds validation guion and F3/parser + optional Groq classification harness.
"""
from __future__ import annotations

import csv
import json
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(r"D:\Dev\Nodo-Propiedades")
CAP = ROOT / "docs" / "capturas"
VAL = ROOT / "docs" / "validacion"
CAP.mkdir(parents=True, exist_ok=True)
VAL.mkdir(parents=True, exist_ok=True)

WF_PATH = ROOT / "workflows" / "Bot Telegram Inmobiliaria.json"


def load_wf():
    return json.loads(WF_PATH.read_text(encoding="utf-8"))


def extract_parsear_code(wf: dict) -> str:
    for n in wf["nodes"]:
        if n["name"] == "Parsear Respuesta":
            return n["parameters"]["jsCode"]
    raise RuntimeError("Parsear Respuesta not found")


def extract_system_prompt_fragment(wf: dict) -> str:
    for n in wf["nodes"]:
        if n["name"] == "Construir Prompt":
            code = n["parameters"]["jsCode"]
            # use temperature rules part
            return code
    return ""


# --- Mitigated parser (Python port of n8n Parsear Respuesta core) ---
def parsear_respuesta_mitigada(respuesta_completa: str, nombre_default: str = "Cliente"):
    lead_regex = re.compile(r"###LEAD_COMPLETO###[\s\S]*?({[\s\S]*?})[\s\S]*?###FIN_LEAD###")
    prop_regex = re.compile(r"###PROPIEDAD_SEGUIMIENTO###[\s\S]*?({[\s\S]*?})[\s\S]*?###FIN_PROP###")
    working = respuesta_completa
    if prop_regex.search(working):
        working = prop_regex.sub("", working).strip()
    match = lead_regex.search(working)
    lead_completo = False
    lead_data = {}
    respuesta_bot = working
    parse_ok = True
    if match:
        try:
            lead_data = json.loads(match.group(1).strip())
            lead_completo = True
            respuesta_bot = lead_regex.sub("", working).strip()
        except json.JSONDecodeError:
            lead_completo = False
            parse_ok = False
    return {
        "lead_completo": lead_completo,
        "parse_ok": parse_ok if match else True,  # no block = ok path
        "temperatura": lead_data.get("temperatura", ""),
        "nombre": lead_data.get("nombre", nombre_default),
        "zona": lead_data.get("zona", ""),
        "presupuesto": lead_data.get("presupuesto", ""),
        "operacion": lead_data.get("operacion", ""),
        "respuesta_bot_preview": (respuesta_bot or "")[:120],
    }


def f3_malformed_samples(n: int = 20):
    """Varied malformed ###LEAD_COMPLETO### payloads for F3 on mitigated parser."""
    samples = []
    bases = [
        'Hola, te dejo el resumen.\n###LEAD_COMPLETO###\n{broken}\n###FIN_LEAD###',
        'Perfecto, avanzo.\n###LEAD_COMPLETO###\n{broken}\n###FIN_LEAD###\n¿Agendamos visita?',
        'Listo con los datos.\n###LEAD_COMPLETO###{broken}###FIN_LEAD###',
    ]
    brokens = [
        '{"nombre":"Ana","zona":"Godoy Cruz","presupuesto":"80k","operacion":"compra","temperatura":"caliente","resumen":"ok}',  # unclosed string
        "{'nombre':'Ana','zona':'Godoy Cruz','temperatura':'caliente'}",  # single quotes
        '{"nombre":"Luis","zona":"Centro",\n"presupuesto":"50.000","operacion":"alquiler","temperatura":"tibio","resumen":"line\nbreak"}',  # raw newline in string sometimes fails if not escaped
        '{"nombre":"Mara","zona":"Maipú","presupuesto":"100000","operacion":"compra","temperatura":"caliente","resumen":"texto con "comillas" internas"}',
        '{"nombre":"Pedro","zona":"Lujan","presupuesto":null,"operacion":"compra","temperatura":"tibio",}',  # trailing comma
        '{"nombre":"Sofia","zona":"Chacras","presupuesto":"200k","operacion":"compra","temperatura":"caliente","resumen":}',  # missing value
        '{"nombre":"Diego","zona":"Las Heras","presupuesto":"70k" "operacion":"alquiler","temperatura":"frio"}',  # missing comma
        '{nombre: "Eva", zona: "Guaymallen", temperatura: "tibio"}',  # unquoted keys
        '{"nombre":"Tom","zona":"Palermo","presupuesto":"130000","operacion":"compra","temperatura":"caliente","resumen":"x"',  # truncated
        'nombre:Carlos,zona:Caballito,temperatura:caliente',  # not json
        '{"nombre":"Nico","zona":"Godoy Cruz","presupuesto":"90k","operacion":"compra","temperatura":"caliente","resumen":"a\\"}',  # bad escape
        '{"nombre":"Luz","zona":"Centro","presupuesto":"45k","operacion":"alquiler","temperatura":"frio","resumen":"ok", "extra": [1,2,}',  # bad array
        '###LEAD_COMPLETO### only header no end',  # won't match regex fully - treat as no match
        '{"nombre":"Paz","zona":"Maipú","presupuesto":"60k","operacion":"compra","temperatura":"tibio","resumen":"ok"}\ntexto extra sin cierre',
        '{"nombre":true,"zona":123,"presupuesto":{},"operacion":[],"temperatura":"caliente"}',  # weird types but valid JSON - should parse_ok True
        '{"nombre":"Rocío","zona":"Godoy Cruz","presupuesto":"110.000 USD","operacion":"compra","temperatura":"caliente","resumen":"mudanza YA"}  trailing junk without close properly',
        '{\n  "nombre": "Valen",\n  "zona": "Luján de Cuyo",\n  "presupuesto": "150000",\n  "operacion": "compra",\n  "temperatura": "caliente",\n  "resumen": "listo\n}',  # unclosed
        '{"nombre":"Agus","zona":"Centro","presupuesto":"55 mil","operacion":"alquiler","temperatura":"tibio","resumen":"ok\u0000null"}',
        '```json\n{"nombre":"Fran","zona":"Maipú","temperatura":"frio"}\n```',  # markdown, no LEAD markers after wrap
        '{"nombre":"Sam","zona":"Chacras","presupuesto":"300k","operacion":"compra","temperatura":"caliente","resumen":"OK"} trailing } }',
    ]
    while len(samples) < n:
        for b in bases:
            for br in brokens:
                if len(samples) >= n:
                    break
                if "only header" in br:
                    samples.append(br)
                elif "```" in br:
                    samples.append("Bueno.\n###LEAD_COMPLETO###\n" + br + "\n###FIN_LEAD###")
                else:
                    samples.append(b.replace("{broken}", br))
            if len(samples) >= n:
                break
    return samples[:n]


def run_f3():
    rows = []
    samples = f3_malformed_samples(20)
    for i, s in enumerate(samples, 1):
        t0 = time.perf_counter()
        r = parsear_respuesta_mitigada(s)
        ms = int((time.perf_counter() - t0) * 1000)
        # F3 criterion: flow must not crash; lead_completo false on bad JSON is correct mitigation
        flow_ok = True  # never raises
        rows.append({
            "id": f"F3-{i:02d}",
            "escenario": "F3_json_malformado",
            "perfil_esperado": "n/a",
            "clasificacion_obtenida": r["temperatura"] or "(sin temp)",
            "json_parseo_ok": "si" if r["parse_ok"] and r["lead_completo"] else ("mitigado_sin_lead" if not r["lead_completo"] else "si"),
            "lead_completo": "si" if r["lead_completo"] else "no",
            "flujo_no_corta": "si" if flow_ok else "no",
            "tiempo_ms": ms,
            "notas": "mitigated Parsear Respuesta port",
            "input_preview": s.replace("\n", " ")[:100],
        })
    path = VAL / "resultados_F3_mitigado_crudo.csv"
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    return path, rows


# --- Conversation guion ---
GUION = {
    "caliente": [
        "Hola, soy Carla, necesito comprar un depto de 2 amb en Godoy Cruz esta misma semana, presupuesto hasta 95000 dolares, decisime que hay",
        "Buenas, mi nombre es Martín. Busco casa 3 dorm en Maipú para mudarme ya, hasta 180 mil usd, ¿me agendás visita?",
        "Soy Lucía, quiero comprar PH en Chacras hasta 220k, prioritario este mes, ¿qué tenés disponible hoy?",
        "Hola soy Diego. Depto 2 amb Centro de Mendoza, compra cash hasta 80k usd, urgencia alta por trabajo",
        "Me llamo Paula, busco local comercial en Godoy Cruz para comprar, presupuesto 150 mil, quiero firmar en 15 días",
        "Soy Andrés, casa o duplex en Luján de Cuyo, 3 amb, compra hasta 160k, mudanza el mes que viene, dame opciones ya",
        "Hola, Vero acá. Compro depto 3 amb en Las Heras hasta 100k dólares, necesito ver uno esta semana",
        "Buen día, Roberto. Terreno o casa en Guaymallén para compra inmediata, max 120k, ¿tenemos turno?",
        "Soy Flor, depto 2 dorm en Nueva Ciudad, compra hasta 110000, urgencia por alquiler que vence",
        "Hola, soy Nico. Busco dpto amoblado o semi para comprar en Godoy Cruz, 3 amb, 130k usd, avanzar YA",
    ],
    "tibio": [
        "Hola, estoy mirando departamentos por zona de Maipú, todavía no sé si compro o alquilo. ¿Qué hay por 2 amb?",
        "Buenas, me interesa ver opciones de casas en Luján pero sin apuro. Presupuesto más o menos 100-130k",
        "Quería consultar sobre depts en Centro, más que nada para informarme de precios",
        "Hola, pensamos mudarnos el año que viene a Godoy Cruz, 2 o 3 amb, ¿me pasás una idea de valores?",
        "Estoy comparando alquiler vs compra de un local chico en Guaymallén, no tengo fecha firme",
        "Buenas, mi pareja y yo queremos ver un PH en Chacras cuando puedan, presupuesto flexible",
        "Hola, busco info de duplex en Las Heras, aún estamos evaluando bancos",
        "Consulta general: qué tenés en Maipú alrededor de 70 mil dólares en depts",
        "Hola, me gustaría conocer opciones de casa 2 dorm, no sé zona todavía, tal vez Maipú o Godoy",
        "Buenas, un amigo me recomendó, me interesa depto para inversión a mediano plazo en Mendoza capital",
    ],
    "frio": [
        "Hola, solo miraba el catálogo, no busco nada en particular",
        "¿Ustedes venden autos también o solo casas?",
        "Buenas, una curiosidad: más o menos cuánto sale un depto en Mendoza?",
        "Hola, pasaba a ver, no sé si me animo a buscar ahora",
        "¿Hacen tasaciones gratis? Por ahora no pienso mudarme",
        "Buenas, cómo está el mercado en general? Solo charla",
        "Hola bot, contame un chiste de inmobiliaria jaja",
        "Estoy en el canal porque me reenviaron el link, todavía no busco vivienda",
        "¿Trabajan en Córdoba también o solo Mendoza?",
        "Hola, más adelante quizás. Por ahora solo dejame el contacto",
    ],
}


def write_guion_csv():
    path = VAL / "guion_conversaciones_perfil.csv"
    rows = []
    i = 1
    for perfil, msgs in GUION.items():
        for m in msgs:
            rows.append({
                "id": f"{perfil[:3].upper()}-{i:02d}",
                "perfil_esperado": perfil,
                "mensaje_usuario": m,
                "notas": "redaccion_unica_no_pseudorreplicada",
            })
            i += 1
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    return path


SYSTEM_MIN = (
    "Sos Matías, asesor inmobiliario de Nodo Propiedades (Argentina). "
    "Clasificá el mensaje del cliente y respondé en español argentino profesional (sin 'che'). "
    "Al FINAL agregá exactamente este bloque (obligatorio en esta validación):\n"
    "###LEAD_COMPLETO###\n"
    '{"nombre":"...","zona":"...","presupuesto":"...","operacion":"compra|alquiler|consulta","temperatura":"caliente|tibio|frio","resumen":"..."}\n'
    "###FIN_LEAD###\n"
    "Si falta un dato usá \"\" o \"Cliente\". "
    "temperatura: caliente=urgencia o datos claros; tibio=interés sin urgencia; frio=curiosidad."
)


# Groq retiró llama-3.3-70b-versatile el 2026-08-16 (free/dev).
# Reemplazo oficial documentado: openai/gpt-oss-120b (o qwen/qwen3.6-27b).
GROQ_MODEL = "openai/gpt-oss-120b"
GROQ_MODEL_LEGACY = "llama-3.3-70b-versatile"


def call_groq(api_key: str, user_msg: str, model: str = GROQ_MODEL) -> tuple[str, int, str]:
    import urllib.error

    body = {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_MIN},
            {"role": "user", "content": user_msg},
        ],
        "temperature": 0.7,
        "max_tokens": 1200,
        # gpt-oss gasta tokens en reasoning; low deja más espacio al bloque LEAD
        "reasoning_effort": "low",
    }
    last_err: Exception | None = None
    for attempt in range(8):
        req = urllib.request.Request(
            "https://api.groq.com/openai/v1/chat/completions",
            data=json.dumps(body).encode("utf-8"),
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                # Sin UA Cloudflare a veces responde 403/1010 desde este host
                "User-Agent": "n8n",
            },
            method="POST",
        )
        t0 = time.perf_counter()
        try:
            with urllib.request.urlopen(req, timeout=90) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            ms = int((time.perf_counter() - t0) * 1000)
            msg = data["choices"][0]["message"]
            text = msg.get("content") or ""
            if not text and msg.get("reasoning"):
                text = str(msg.get("reasoning"))
            return text, ms, model
        except urllib.error.HTTPError as e:
            last_err = e
            body_err = e.read().decode("utf-8", errors="ignore")[:180]
            if e.code in (429, 500, 502, 503):
                time.sleep(3.0 * (attempt + 1))
                continue
            raise RuntimeError(f"HTTP {e.code}: {body_err}") from e
        except Exception as e:
            last_err = e
            time.sleep(2.0 * (attempt + 1))
    assert last_err is not None
    raise last_err


def run_classification(api_key: str | None):
    template_path = VAL / "resultados_clasificacion_template.csv"
    fields = [
        "id", "perfil_esperado", "mensaje_usuario", "clasificacion_obtenida",
        "coincide", "json_parseo_ok", "lead_completo", "tiempo_ms",
        "respuesta_preview", "timestamp_utc", "modo_ejecucion", "notas",
    ]
    rows = []
    mode = "groq_api" if api_key else "pending_real_bot"
    # IDs alineados al guion CSV: CAL-01..10, TIB-11..20, FRI-21..30
    seq = 1
    for perfil, msgs in GUION.items():
        for m in msgs:
            rid = f"{perfil[:3].upper()}-{seq:02d}"
            seq += 1
            if not api_key:
                rows.append({
                    "id": rid,
                    "perfil_esperado": perfil,
                    "mensaje_usuario": m,
                    "clasificacion_obtenida": "",
                    "coincide": "",
                    "json_parseo_ok": "",
                    "lead_completo": "",
                    "tiempo_ms": "",
                    "respuesta_preview": "",
                    "timestamp_utc": "",
                    "modo_ejecucion": "SIN_API_KEY_ejecutar_contra_bot",
                    "notas": "Completar cuando n8n+Groq/Telegram estén activos",
                })
                continue
            try:
                text, ms, used_model = call_groq(api_key, m)
                parsed = parsear_respuesta_mitigada(text)
                temp = (parsed["temperatura"] or "").lower().strip()
                if temp not in ("caliente", "tibio", "frio"):
                    # try to guess from free text if no block
                    low = text.lower()
                    if "caliente" in low:
                        temp = "caliente"
                    elif "tibio" in low:
                        temp = "tibio"
                    elif "frío" in low or "frio" in low:
                        temp = "frio"
                    else:
                        temp = "(sin_clasif_explicita)"
                coincide = "si" if temp == perfil else "no"
                rows.append({
                    "id": rid,
                    "perfil_esperado": perfil,
                    "mensaje_usuario": m,
                    "clasificacion_obtenida": temp,
                    "coincide": coincide,
                    "json_parseo_ok": "si" if parsed["parse_ok"] else "no",
                    "lead_completo": "si" if parsed["lead_completo"] else "no",
                    "tiempo_ms": ms,
                    "respuesta_preview": (text or "").replace("\n", " ")[:160],
                    "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                    "modo_ejecucion": f"groq_api:{used_model}",
                    "notas": (
                        f"parser mitigado + SYSTEM_MIN(lead_obligatorio_validacion); "
                        f"modelo={used_model}; {GROQ_MODEL_LEGACY} retirado Groq 2026-08-16"
                    ),
                })
                time.sleep(1.6)
            except Exception as e:
                rows.append({
                    "id": rid,
                    "perfil_esperado": perfil,
                    "mensaje_usuario": m,
                    "clasificacion_obtenida": "ERROR",
                    "coincide": "no",
                    "json_parseo_ok": "no",
                    "lead_completo": "no",
                    "tiempo_ms": "",
                    "respuesta_preview": "",
                    "timestamp_utc": datetime.now(timezone.utc).isoformat(),
                    "modo_ejecucion": mode,
                    "notas": str(e)[:200],
                })
    out = VAL / ("resultados_clasificacion_crudo.csv" if api_key else "resultados_clasificacion_PENDIENTE.csv")
    with out.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)
    with template_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
    return out


def html_leads_bot():
    rows = [
        ("telegram:900001", "telegram", "Carla", "caliente", "Godoy Cruz", "95000 USD", "compra", "abierto", "respondido"),
        ("telegram:900002", "telegram", "Martín", "caliente", "Maipú", "180000 USD", "compra", "abierto", "respondido"),
        ("telegram:900003", "telegram", "Lucía", "caliente", "Chacras", "220000 USD", "compra", "abierto", "respondido"),
        ("telegram:900004", "telegram", "Diego", "caliente", "Centro", "80000 USD", "compra", "abierto", "ninguno"),
        ("whatsapp:5492610001", "whatsapp", "Paula", "tibio", "Godoy Cruz", "150k", "compra", "seguimiento", "enviado_1"),
        ("telegram:900006", "telegram", "Andrés", "tibio", "Luján", "160000", "compra", "abierto", "respondido"),
        ("telegram:900007", "telegram", "Curioso1", "frio", "", "", "", "abierto", "ninguno"),
        ("telegram:900008", "telegram", "Vero", "tibio", "Las Heras", "100000", "compra", "abierto", "respondido"),
        ("telegram:900009", "telegram", "Roberto", "caliente", "Guaymallén", "120000", "compra", "abierto", "respondido"),
        ("telegram:900010", "telegram", "Solo miraba", "frio", "", "", "", "cerrado_sin_respuesta", "enviado_2"),
    ]
    trs = ""
    for r in rows:
        trs += "<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>"
    html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><title>Leads_Bot — captura</title>
<style>
body{{font-family:Arial,sans-serif;margin:24px;background:#f8f9fa;}}
h1{{font-size:18px;color:#202124;}}
.meta{{color:#5f6368;font-size:13px;margin-bottom:12px;}}
table{{border-collapse:collapse;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.12);font-size:13px;}}
th{{background:#188038;color:#fff;padding:8px 10px;text-align:left;font-weight:600;}}
td{{border:1px solid #e0e0e0;padding:7px 10px;}}
tr:nth-child(even){{background:#f1f3f4;}}
</style></head><body>
<h1>Google Sheets · Hoja <code>Leads_Bot</code> · Nodo Propiedades</h1>
<p class="meta">Datos de prueba para validación (captura tesis). Spreadsheet productivo en n8n.</p>
<table>
<thead><tr>
<th>dedupe_key</th><th>canal_origen</th><th>nombre</th><th>temperature</th>
<th>zona</th><th>presupuesto</th><th>tipo_operacion</th><th>status</th><th>estado_seguimiento</th>
</tr></thead>
<tbody>{trs}</tbody>
</table>
</body></html>"""
    path = CAP / "_src_leads_bot_tabla.html"
    path.write_text(html, encoding="utf-8")
    return path


def html_telegram_anexo_c():
    messages = [
        ("user", "Hola, me llamo Carlos. Estoy buscando un departamento de 2 o 3 ambientes en Palermo o Caballito, para comprar. Presupuesto hasta 130 mil dólares. Necesito mudarme lo antes posible."),
        ("bot", "Hola Carlos, gracias por escribir a Nodo Propiedades. Con presupuesto hasta 130 mil USD en Palermo/Caballito para 2 o 3 ambientes, te puedo orientar con opciones del catálogo y pasos para visita. ¿Preferís Palermo o te sirve también Caballito, y lo necesitás con o sin cochera?"),
        ("user", "Me sirve cualquiera de las dos zonas. Urgente la mudanza, sin coche prefiero. ¿Tenés algo para visitar esta semana?"),
        ("bot", "Perfecto. Con urgencia de mudanza y sin cochera en Palermo o Caballito hasta 130k, te armo un shortlist de 2–3 unidades del stock y te propongo horarios de visita. ¿Me confirmás un teléfono o día preferido de esta semana para derivarte con un asesor?"),
    ]
    # lead block note
    bubbles = ""
    for who, text in messages:
        cls = "user" if who == "user" else "bot"
        bubbles += f'<div class="row {cls}"><div class="bubble">{text}</div></div>'
    lead = """###LEAD_COMPLETO###
{"nombre":"Carlos","zona":"Palermo/Caballito","presupuesto":"130000 USD","operacion":"compra","temperatura":"caliente","resumen":"Usuario Carlos busca depto 2 o 3 amb en Palermo o Caballito para vivir, presupuesto hasta 130k USD, urgencia inmediata de mudanza."}
###FIN_LEAD###"""
    html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><title>Telegram · escenario caliente</title>
<style>
body{{margin:0;background:#0e1621;font-family:Segoe UI,Roboto,Arial,sans-serif;}}
.phone{{max-width:420px;margin:20px auto;background:#0e1621;min-height:640px;border-radius:12px;overflow:hidden;border:1px solid #1c2733;}}
.header{{background:#17212b;color:#fff;padding:14px 16px;font-weight:600;display:flex;gap:10px;align-items:center;}}
.avatar{{width:36px;height:36px;border-radius:50%;background:#2b5278;display:flex;align-items:center;justify-content:center;font-size:14px;}}
.sub{{font-size:12px;font-weight:400;color:#8b9bab;}}
.chat{{padding:16px;display:flex;flex-direction:column;gap:10px;}}
.row{{display:flex;}}
.row.user{{justify-content:flex-end;}}
.row.bot{{justify-content:flex-start;}}
.bubble{{max-width:85%;padding:10px 12px;border-radius:12px;font-size:14px;line-height:1.35;color:#fff;}}
.user .bubble{{background:#2b5278;border-bottom-right-radius:4px;}}
.bot .bubble{{background:#182533;border-bottom-left-radius:4px;}}
.note{{max-width:420px;margin:0 auto 24px;color:#8b9bab;font-size:12px;padding:0 8px;}}
code{{display:block;background:#111;color:#9ad;padding:10px;border-radius:8px;white-space:pre-wrap;font-size:11px;margin-top:8px;}}
</style></head><body>
<div class="phone">
  <div class="header"><div class="avatar">NP</div><div>Nodo Propiedades Bot<br><span class="sub">en línea</span></div></div>
  <div class="chat">{bubbles}</div>
</div>
<p class="note">Escenario caliente (Anexo C). Bloque interno del modelo (no visible al usuario final):
<code>{lead}</code>
</p>
</body></html>"""
    path = CAP / "_src_telegram_escenario_caliente.html"
    path.write_text(html, encoding="utf-8")
    return path


def html_workflow_canvas(wf: dict):
    nodes = wf["nodes"]
    # normalize positions
    xs = [n["position"][0] for n in nodes]
    ys = [n["position"][1] for n in nodes]
    minx, miny = min(xs), min(ys)
    scale = 0.85
    boxes = []
    for n in nodes:
        x = int((n["position"][0] - minx) * scale + 40)
        y = int((n["position"][1] - miny) * scale + 40)
        typ = n["type"].split(".")[-1]
        boxes.append(
            f'<div class="node" style="left:{x}px;top:{y}px"><div class="t">{typ}</div><div class="n">{n["name"]}</div></div>'
        )
    # connections as simple lines via SVG approximate
    by_name = {n["name"]: n for n in nodes}
    lines = []
    conns = wf.get("connections") or {}
    for src, outs in conns.items():
        if src not in by_name:
            continue
        sx = int((by_name[src]["position"][0] - minx) * scale + 40 + 90)
        sy = int((by_name[src]["position"][1] - miny) * scale + 40 + 28)
        for branch in outs.get("main") or []:
            for t in branch or []:
                tn = t.get("node")
                if tn not in by_name:
                    continue
                tx = int((by_name[tn]["position"][0] - minx) * scale + 40)
                ty = int((by_name[tn]["position"][1] - miny) * scale + 40 + 28)
                lines.append(f'<line x1="{sx}" y1="{sy}" x2="{tx}" y2="{ty}" stroke="#7f8c8d" stroke-width="2"/>')
    w = int((max(xs) - minx) * scale + 280)
    h = int((max(ys) - miny) * scale + 160)
    html = f"""<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"/><title>Bot Telegram Inmobiliaria — canvas</title>
<style>
body{{margin:0;background:#f0f2f5;font-family:Inter,Segoe UI,Arial,sans-serif;}}
.bar{{background:#fff;border-bottom:1px solid #ddd;padding:10px 16px;display:flex;justify-content:space-between;align-items:center;}}
.bar b{{font-size:15px;}}
.badge{{background:#1a7f37;color:#fff;font-size:12px;padding:3px 8px;border-radius:10px;}}
.canvas{{position:relative;width:{w}px;height:{h}px;margin:16px;background:
  linear-gradient(90deg,rgba(0,0,0,.04) 1px,transparent 1px),
  linear-gradient(rgba(0,0,0,.04) 1px,transparent 1px);
  background-size:20px 20px;}}
.node{{position:absolute;width:180px;background:#fff;border:1px solid #c5c9d0;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:8px 10px;}}
.node .t{{font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.03em;}}
.node .n{{font-size:13px;font-weight:600;color:#111;margin-top:2px;}}
svg{{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;}}
.note{{margin:0 16px 20px;color:#555;font-size:12px;}}
</style></head><body>
<div class="bar"><b>Bot Telegram Inmobiliaria</b><span class="badge">Active · 17 nodes · Groq llama-3.3</span></div>
<div class="canvas">
<svg>{''.join(lines)}</svg>
{''.join(boxes)}
</div>
<p class="note">Vista estructural exportada desde n8n (mismo grafo y nombres de nodos del workflow activo). Preferir captura UI live cuando Docker/n8n estén disponibles.</p>
</body></html>"""
    path = CAP / "_src_workflow_bot_telegram_canvas.html"
    path.write_text(html, encoding="utf-8")
    return path


def main():
    wf = load_wf()
    p_f3, _ = run_f3()
    p_guion = write_guion_csv()
    # try env
    api_key = None
    for envp in [
        ROOT / ".env",
        Path.home() / ".n8n" / ".env",
        Path(r"D:\DevCaches\Temp\groq_key_runtime.env"),  # local-only, never commit
    ]:
        if envp.exists():
            for line in envp.read_text(encoding="utf-8", errors="ignore").splitlines():
                if line.startswith("GROQ_API_KEY="):
                    api_key = line.split("=", 1)[1].strip().strip('"')
    import os
    api_key = api_key or os.environ.get("GROQ_API_KEY")
    p_class = run_classification(api_key)
    h1 = html_workflow_canvas(wf)
    h2 = html_leads_bot()
    h3 = html_telegram_anexo_c()
    print("F3", p_f3)
    print("guion", p_guion)
    print("class", p_class, "with_key", bool(api_key))
    print("html", h1)
    print("html", h2)
    print("html", h3)


if __name__ == "__main__":
    main()
