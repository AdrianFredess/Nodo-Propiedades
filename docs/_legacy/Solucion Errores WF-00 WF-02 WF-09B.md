# Solución: "No se pudo encontrar el flujo de trabajo" y "No se pudo encontrar la opción de propiedad"

## Errores que aparecen en WF-00, WF-02 y WF-09B

### 1. "No se pudo encontrar el flujo de trabajo"

**Causa:** Los nodos Execute Workflow apuntaban a IDs de flujos que ya no existen (por ejemplo, después de reimportar workflows).

**Solución aplicada:** Se ejecutó el script `scripts/_corregir_referencias_rotas.js` que reemplaza los IDs viejos por los actuales en la base de datos de n8n.

**Si vuelve a ocurrir:**
```powershell
cd "C:\Users\adrian\Desktop\PROGRAMACION (UTN) Y PROYECTOS\n8n\Nodo Propiedades"
node scripts/_corregir_referencias_rotas.js
```

Luego **reinicia n8n** y vuelve a abrir los workflows.

---

### 2. "No se pudo encontrar la opción de propiedad"

**Causas posibles:**

1. **AI Agent sin modelo configurado (WF-02)**  
   El nodo AI Agent necesita un modelo conectado (por ejemplo, Ollama Chat Model).  
   - Abre WF-02 en n8n  
   - Haz clic en el nodo "AI Agent - Analyze Lead"  
   - En el panel, en "Models", haz clic en "Add Model" → "Ollama Chat Model"  
   - Selecciona tu credencial de Ollama y el modelo (ej. `llama3.2`)

2. **Credenciales faltantes o inválidas**  
   - Google Sheets: verifica que la credencial tenga acceso al documento  
   - Ollama: verifica que Ollama esté corriendo (`http://localhost:11434`)

3. **Cache del navegador**  
   - Prueba en modo incógnito o limpia la caché  
   - O cierra n8n, borra la caché si aplica, y vuelve a abrir

4. **Versión de n8n**  
   Algunos nodos pueden dar este error si la versión de n8n no coincide con la del workflow. Actualiza n8n si es posible.

---

## Scripts útiles

| Script | Uso |
|--------|-----|
| `_diagnosticar_workflow_ids.js` | Ver qué workflowId tiene cada nodo Execute Workflow |
| `_verificar_referencias.js` | Comprobar que todas las referencias sean válidas |
| `_corregir_referencias_rotas.js` | Corregir IDs viejos de Core Lead Processor |
| `_actualizar_ids_importados.js` | Reemplazar placeholders (__SET_*__) por IDs reales |

---

## Orden recomendado después de importar

1. Ejecutar `_actualizar_ids_importados.js`
2. Ejecutar `_corregir_referencias_rotas.js`
3. Reiniciar n8n
4. Configurar Ollama en el nodo AI Agent de WF-02
5. Verificar credenciales de Google Sheets y Meta
