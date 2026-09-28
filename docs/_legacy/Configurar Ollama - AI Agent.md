# Configurar Ollama con el AI Agent (WF-02)

Usa esta guía para conectar **Ollama** (gratis, local) en lugar de OpenAI en el nodo AI Agent del WF-02 Core Lead Processor.

---

## Opción rápida: script automático

**Cerrá n8n** y ejecutá en PowerShell (desde la raíz del proyecto):

```powershell
.\scripts\_setup_ollama_completo.ps1
```

Instala Ollama si falta, baja `llama3.2`, escribe el **prompt** en WF-02, crea la credencial **Ollama Local** (`http://127.0.0.1:11434`) y **conecta** el subnodo **Ollama Chat Model** al **AI Agent** en la base SQLite.

Solo Node (n8n cerrado), misma carpeta del proyecto:

```bash
node scripts/_configurar_ai_agent_ollama.js
node scripts/_setup_ollama_n8n.js
```

El JSON `workflows/WF-02 Core Lead Processor.json` ya incluye el nodo y el cable `ai_languageModel`; al importar en otra máquina puede pedirte asignar la credencial una vez, o volvé a correr `_setup_ollama_n8n.js`.

---

## Opción manual

### 1. Instalar Ollama

1. Descargá Ollama: https://ollama.com/download  
2. Instalalo y dejalo corriendo (se abre en segundo plano).
3. En una terminal, bajá un modelo:
   ```bash
   ollama pull llama3.2
   ```
   Otras opciones: `mistral`, `llama3.1`, `qwen2.5` (más grandes = mejor calidad, más RAM).

---

## 2. Crear credenciales Ollama en n8n

1. En n8n: menú **Settings** (engranaje) → **Credentials** → **Add credential**.
2. Buscá **Ollama**.
3. Configurá:
   - **Base URL**: `http://localhost:11434` (o `http://127.0.0.1:11434` si falla).
   - **API Key**: vacío (no hace falta para local).
4. Guardá con un nombre, ej: `Ollama Local`.

---

## 3. Configurar el nodo AI Agent en WF-02 (manual, si no usaste el script)

Si ya corriste `node scripts/_setup_ollama_n8n.js`, **saltá este paso**.

1. Abrí **WF-02 Core Lead Processor**.
2. Deberías ver **Ollama Chat Model** conectado al **AI Agent** (puerto del modelo).
3. Si falta: agregá **Ollama Chat Model**, credencial **Ollama Local**, modelo `llama3.2`, y conectalo al AI Agent.
4. **Prompt**: debe venir de `ai/Prompt AI Agent Inmobiliario.txt` (el script `_configurar_ai_agent_ollama.js` lo escribe en la base).

---

## 4. Verificar que Ollama responde

En una terminal:
```bash
ollama run llama3.2 "Hola"
```

Si responde, Ollama está bien. Si n8n no conecta, probá con `127.0.0.1` en lugar de `localhost` en la Base URL.

---

## 5. Modelos recomendados

| Modelo      | RAM mínima | Calidad JSON | Velocidad |
|------------|------------|--------------|-----------|
| llama3.2   | 8 GB       | Buena        | Rápido    |
| mistral    | 8 GB       | Buena        | Rápido    |
| llama3.1   | 16 GB      | Muy buena    | Media     |
| qwen2.5    | 16 GB      | Muy buena    | Media     |

Para el esquema JSON estructurado del lead, modelos de 8 GB suelen alcanzar. Si ves respuestas mal formateadas, probá con uno más grande.

---

## Nota sobre el esquema de salida

El prompt ya incluye el JSON de ejemplo. Ollama no tiene "structured output" nativo como OpenAI, así que el nodo **Code - Validate AI Output** del WF-02 se encarga de parsear y corregir si algo viene mal. Si el modelo devuelve texto extra (explicaciones, markdown), el código intenta extraer solo el JSON.
