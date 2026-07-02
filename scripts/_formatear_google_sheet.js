/**
 * Planilla "Nodo Propiedades CRM":
 * - Fila 1: etiquetas en español (asesor).
 * - Fila 2: nombres técnicos en inglés (n8n con Header Row = 2, datos desde fila 3).
 * - Formato: colores por hoja, fila 2 discreta (#444444 / #aaaaaa, 8px), freeze 2 filas,
 *   anchos, bandas y condicionales en Leads desde datos.
 * - Filas de datos (≥3): altura base 30px, hasta 80px en filas con texto largo en columnas
 *   con wrap; alineación MIDDLE + LEFT (numéricas CENTER); wrap solo en columnas largas.
 *
 * Requiere: config/google-credentials.json + config/google-token.json
 */
const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const ROOT = path.join(__dirname, '..');
const CRED_PATH = path.join(ROOT, 'config', 'google-credentials.json');
const TOKEN_PATH = path.join(ROOT, 'config', 'google-token.json');
const REDIRECT_URI = 'http://127.0.0.1:34567/oauth2callback';
const SPREADSHEET_ID = '1a84OL3Y-_ivb9c_dr-galXSM2tMiZtWy6rCJD8ZGLvQ';

const TECH_BG = '#444444';
const TECH_FG = '#aaaaaa';

/** Primera fila de datos (índice 0-based en la hoja). */
const DATA_FIRST_ROW_0 = 2;
const DATA_ROW_HEIGHT_DEFAULT = 30;
const DATA_ROW_HEIGHT_MAX = 80;
/** Aprox. píxeles por carácter (Arial 10) para estimar líneas con wrap. */
const CHAR_WIDTH_PX = 6.5;
const LINE_HEIGHT_PX = 14;
const BASE_TEXT_PADDING_PX = 16;

const SHEETS = [
  {
    title: 'Leads',
    headerColor: { r: 26, g: 58, b: 92 },
    englishHeaders: `lead_id,dedupe_key,created_at,updated_at,source,source_campaign,lead_name,phone,email,city,lead_intent,buyer_profile,operation_type,property_type,preferred_zones,bedrooms,budget_amount,budget_currency,payment_method,urgency_level,timeframe_days,property_ref,current_score,temperature,status,missing_fields,last_message,last_interaction_at,assigned_advisor,advisor_notified,visit_scheduled,next_followup_at,do_not_contact,disqualification_reason,notes_ai_summary`.split(
      ','
    ),
    spanishHeaders: `ID Lead,Clave Única,Fecha Creación,Última Actualización,Canal,Campaña,Nombre,Teléfono,Email,Ciudad,Intención,Perfil,Tipo Operación,Tipo Propiedad,Zonas Preferidas,Ambientes,Presupuesto,Moneda,Forma de Pago,Urgencia,Plazo (días),Propiedad Consultada,Score,Temperatura,Estado,Campos Faltantes,Último Mensaje,Última Interacción,Asesor Asignado,Asesor Notificado,Visita Agendada,Próximo Seguimiento,No Contactar,Motivo Descarte,Resumen IA`.split(
      ','
    ),
    hide: ['dedupe_key', 'missing_fields', 'notes_ai_summary'],
    widths: {
      lead_name: 180,
      phone: 180,
      email: 180,
      source: 120,
      source_campaign: 120,
      city: 120,
      operation_type: 150,
      property_type: 150,
      preferred_zones: 150,
      budget_amount: 120,
      budget_currency: 120,
      payment_method: 120,
      current_score: 100,
      temperature: 100,
      status: 100,
      urgency_level: 100,
      last_message: 250,
      notes_ai_summary: 250,
      created_at: 160,
      updated_at: 160,
      last_interaction_at: 160,
      next_followup_at: 160,
    },
    wrapColumns: ['last_message', 'preferred_zones', 'missing_fields', 'notes_ai_summary'],
    centerNumericColumns: ['current_score', 'budget_amount', 'bedrooms'],
  },
  {
    title: 'Propiedades',
    headerColor: { r: 26, g: 92, b: 42 },
    englishHeaders: `property_id,external_ref,title,operation_type,property_type,address,zone,city,bedrooms,bathrooms,area_m2,price,currency,expenses,features,payment_options,status,publication_link,advisor_owner,updated_at`.split(
      ','
    ),
    spanishHeaders: `ID Propiedad,Referencia,Título,Tipo Operación,Tipo Propiedad,Dirección,Zona,Ciudad,Ambientes,Baños,Superficie m²,Precio,Moneda,Expensas,Características,Formas de Pago,Estado,Link Publicación,Asesor,Actualización`.split(
      ','
    ),
    hide: ['property_id'],
    widths: {
      title: 220,
      address: 160,
      zone: 160,
      city: 160,
      price: 120,
      expenses: 120,
      features: 200,
      payment_options: 200,
      publication_link: 220,
    },
    wrapColumns: ['features', 'payment_options', 'title', 'address'],
    centerNumericColumns: ['price', 'area_m2', 'bedrooms', 'bathrooms', 'expenses'],
  },
  {
    title: 'Interacciones',
    headerColor: { r: 122, g: 58, b: 0 },
    englishHeaders: `interaction_id,lead_id,timestamp,direction,channel,message_raw,message_sent,ai_detected_intent,score_after_interaction,temperature_after_interaction`.split(
      ','
    ),
    spanishHeaders: `ID Interacción,ID Lead,Fecha/Hora,Dirección,Canal,Mensaje Recibido,Mensaje Enviado,Acción IA,Score,Temperatura`.split(
      ','
    ),
    hide: ['interaction_id', 'payload_snapshot'],
    widths: {
      message_raw: 280,
      message_sent: 280,
      channel: 120,
      direction: 120,
      ai_detected_intent: 120,
      timestamp: 160,
    },
    wrapColumns: ['message_raw', 'message_sent'],
    centerNumericColumns: ['score_after_interaction'],
  },
  {
    title: 'Seguimientos',
    headerColor: { r: 58, g: 26, b: 92 },
    englishHeaders: `followup_id,lead_id,created_at,scheduled_at,followup_type,channel,message_template,status,attempt_number,result,advisor_required,closed_reason`.split(
      ','
    ),
    spanishHeaders: `ID Seguimiento,ID Lead,Creado,Programado Para,Tipo seguimiento,Canal,Mensaje,Estado,Intento,Resultado,Requiere asesor,Motivo cierre`.split(
      ','
    ),
    hide: ['followup_id'],
    widths: {
      message_template: 280,
      channel: 120,
      status: 120,
      result: 120,
      scheduled_at: 160,
      created_at: 160,
    },
    wrapColumns: ['message_template'],
    centerNumericColumns: ['attempt_number'],
  },
  {
    title: 'Errores',
    headerColor: { r: 92, g: 26, b: 26 },
    englishHeaders: `error_id,workflow_name,node_name,lead_id,timestamp,error_message,payload_snapshot,status`.split(','),
    spanishHeaders: `ID Error,Workflow,Nodo,ID Lead,Fecha/Hora,Error,Payload,Estado`.split(','),
    hide: ['error_id', 'payload_snapshot'],
    widths: {
      error_message: 280,
      workflow_name: 180,
      node_name: 180,
      timestamp: 160,
      status: 100,
    },
    wrapColumns: ['error_message', 'payload_snapshot'],
    centerNumericColumns: [],
  },
];

function loadCredentials() {
  if (!fs.existsSync(CRED_PATH)) {
    console.error('Falta config/google-credentials.json');
    process.exit(1);
  }
  const raw = JSON.parse(fs.readFileSync(CRED_PATH, 'utf8'));
  return raw.installed || raw.web;
}

async function authorize() {
  const cred = loadCredentials();
  const oAuth2Client = new google.auth.OAuth2(cred.client_id, cred.client_secret, REDIRECT_URI);
  if (!fs.existsSync(TOKEN_PATH)) {
    console.error('Falta config/google-token.json (ejecutá _crear_google_sheet.js antes).');
    process.exit(1);
  }
  oAuth2Client.setCredentials(JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8')));
  return oAuth2Client;
}

function rgb01(hex) {
  const h = hex.replace('#', '');
  return {
    red: parseInt(h.slice(0, 2), 16) / 255,
    green: parseInt(h.slice(2, 4), 16) / 255,
    blue: parseInt(h.slice(4, 6), 16) / 255,
  };
}

function rgbObj(c) {
  return { red: c.r / 255, green: c.g / 255, blue: c.b / 255 };
}

function rowMatchesCanon(row, canon, matchCount = 3) {
  if (!row || !canon.length) return false;
  const n = Math.min(matchCount, canon.length);
  for (let i = 0; i < n; i++) {
    if (String(row[i] ?? '').trim() !== String(canon[i]).trim()) return false;
  }
  return true;
}

function inferDataStart(rows, canon) {
  if (rows.length >= 2 && rowMatchesCanon(rows[1], canon)) return 2;
  if (rows.length >= 1 && rowMatchesCanon(rows[0], canon)) return 1;
  return rows.length >= 1 ? 1 : 0;
}

function padRow(row, len) {
  const r = [...(row || [])];
  while (r.length < len) r.push('');
  return r;
}

/** Altura por fila de datos (índice 0 = fila 3 de la hoja), entre 30 y 80 px. */
function estimateDataRowHeights(matrix, colCount, techHeaders, wrapNames, widthByColIndex) {
  const wrapSet = new Set(wrapNames || []);
  const nData = Math.max(0, matrix.length - DATA_FIRST_ROW_0);
  const heights = [];
  for (let i = 0; i < nData; i++) {
    const row = matrix[DATA_FIRST_ROW_0 + i] || [];
    let h = DATA_ROW_HEIGHT_DEFAULT;
    for (let c = 0; c < colCount; c++) {
      const key = techHeaders[c];
      if (!key || !wrapSet.has(key)) continue;
      const w = widthByColIndex[c] || 120;
      const text = String(row[c] ?? '');
      if (!text) continue;
      const charsPerLine = Math.max(8, Math.floor(w / CHAR_WIDTH_PX));
      const lines = Math.max(1, Math.ceil(text.length / charsPerLine));
      const needed = BASE_TEXT_PADDING_PX + (lines - 1) * LINE_HEIGHT_PX;
      const capped = Math.min(DATA_ROW_HEIGHT_MAX, Math.max(DATA_ROW_HEIGHT_DEFAULT, needed));
      h = Math.max(h, capped);
    }
    heights.push(Math.min(DATA_ROW_HEIGHT_MAX, Math.max(DATA_ROW_HEIGHT_DEFAULT, h)));
  }
  return heights;
}

async function main() {
  const auth = await authorize();
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({
    spreadsheetId: SPREADSHEET_ID,
    fields: 'properties.title,sheets(properties(sheetId,title,gridProperties),conditionalFormats)',
  });

  const results = [];

  for (const cfg of SHEETS) {
    const sheetMeta = (meta.data.sheets || []).find((s) => s.properties.title === cfg.title);
    if (!sheetMeta) {
      results.push({ sheet: cfg.title, ok: false, error: 'Hoja no encontrada' });
      continue;
    }

    const sheetId = sheetMeta.properties.sheetId;
    const canon = cfg.englishHeaders || [];
    const spanCanon = cfg.spanishHeaders || [];

    const fresh = await sheets.spreadsheets.get({
      spreadsheetId: SPREADSHEET_ID,
      fields: 'sheets(properties(sheetId,title),conditionalFormats,bandedRanges)',
    });
    const freshSheet = (fresh.data.sheets || []).find((s) => s.properties.sheetId === sheetId);
    const existingRules = freshSheet?.conditionalFormats || [];
    const existingBanded = (freshSheet?.bandedRanges || []).filter(
      (br) => br.range && br.range.sheetId === sheetId
    );
    const safe = cfg.title.replace(/'/g, "''");

    let rows;
    try {
      const dataRes = await sheets.spreadsheets.values.get({
        spreadsheetId: SPREADSHEET_ID,
        range: `'${safe}'!A:ZZ`,
      });
      rows = dataRes.data.values || [];
    } catch (e) {
      results.push({ sheet: cfg.title, ok: false, error: String(e.message) });
      continue;
    }

    const dataStart = inferDataStart(rows, canon);
    const dataRows = rows.slice(dataStart);

    let colCount = canon.length;
    for (const r of rows) {
      colCount = Math.max(colCount, r.length);
    }
    for (const r of dataRows) {
      colCount = Math.max(colCount, r.length);
    }

    const spanishRow = [];
    const techRow = [];
    for (let i = 0; i < colCount; i++) {
      spanishRow[i] = spanCanon[i] != null && spanCanon[i] !== '' ? spanCanon[i] : String(rows[0]?.[i] || '').trim();
      techRow[i] = canon[i] != null && canon[i] !== '' ? canon[i] : String(rows[1]?.[i] || '').trim();
    }

    const newMatrix = [spanishRow, techRow, ...dataRows.map((r) => padRow(r, colCount))];
    const lastRow = newMatrix.length;
    colCount = Math.max(colCount, ...newMatrix.map((r) => r.length));
    for (const r of newMatrix) {
      while (r.length < colCount) r.push('');
    }

    const techHeaders = [...techRow];

    const widthByColIndex = [];
    for (let c = 0; c < colCount; c++) {
      const colKey = techHeaders[c] || '';
      widthByColIndex[c] = (cfg.widths && cfg.widths[colKey]) || 120;
    }

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `'${safe}'!A1`,
      valueInputOption: 'RAW',
      requestBody: { values: newMatrix },
    });

    const requests = [];

    for (let i = existingRules.length - 1; i >= 0; i--) {
      requests.push({ deleteConditionalFormatRule: { sheetId, index: i } });
    }
    for (const b of existingBanded) {
      const bid = b.bandedRangeId;
      if (bid != null) requests.push({ deleteBanding: { bandedRangeId: bid } });
    }

    requests.push({
      updateSheetProperties: {
        properties: {
          sheetId,
          gridProperties: { frozenRowCount: 2 },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    });

    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 35 },
        fields: 'pixelSize',
      },
    });
    requests.push({
      updateDimensionProperties: {
        range: { sheetId, dimension: 'ROWS', startIndex: 1, endIndex: 2 },
        properties: { pixelSize: 22 },
        fields: 'pixelSize',
      },
    });
    for (let c = 0; c < colCount; c++) {
      const name = techHeaders[c] || '';
      const w = widthByColIndex[c];
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: c, endIndex: c + 1 },
          properties: { pixelSize: w },
          fields: 'pixelSize',
        },
      });
    }

    for (const hideName of cfg.hide || []) {
      const idx = techHeaders.indexOf(hideName);
      if (idx === -1) continue;
      requests.push({
        updateDimensionProperties: {
          range: { sheetId, dimension: 'COLUMNS', startIndex: idx, endIndex: idx + 1 },
          properties: { hiddenByUser: true },
          fields: 'hiddenByUser',
        },
      });
    }

    const grid = (r0, c0, r1ex, c1ex) => ({
      sheetId,
      startRowIndex: r0,
      endRowIndex: r1ex,
      startColumnIndex: c0,
      endColumnIndex: c1ex,
    });

    const borderSpec = {
      style: 'SOLID',
      width: 1,
      color: rgb01('#cccccc'),
    };
    const borderThick = {
      style: 'SOLID_MEDIUM',
      width: 2,
      color: rgb01('#888888'),
    };

    requests.push({
      repeatCell: {
        range: grid(0, 0, 1, colCount),
        cell: {
          userEnteredFormat: {
            backgroundColor: rgbObj(cfg.headerColor),
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            textFormat: {
              foregroundColor: { red: 1, green: 1, blue: 1 },
              bold: true,
              fontFamily: 'Arial',
              fontSize: 10,
            },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    });

    requests.push({
      repeatCell: {
        range: grid(1, 0, 2, colCount),
        cell: {
          userEnteredFormat: {
            backgroundColor: rgb01(TECH_BG),
            horizontalAlignment: 'CENTER',
            verticalAlignment: 'MIDDLE',
            textFormat: {
              foregroundColor: rgb01(TECH_FG),
              bold: false,
              fontFamily: 'Arial',
              fontSize: 8,
            },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment)',
      },
    });

    const cfAppend = [];

    if (lastRow > 2) {
      const rowHeights = estimateDataRowHeights(
        newMatrix,
        colCount,
        techHeaders,
        cfg.wrapColumns,
        widthByColIndex
      );
      for (let i = 0; i < rowHeights.length; i++) {
        requests.push({
          updateDimensionProperties: {
            range: {
              sheetId,
              dimension: 'ROWS',
              startIndex: DATA_FIRST_ROW_0 + i,
              endIndex: DATA_FIRST_ROW_0 + i + 1,
            },
            properties: { pixelSize: rowHeights[i] },
            fields: 'pixelSize',
          },
        });
      }

      requests.push({
        repeatCell: {
          range: grid(2, 0, lastRow, colCount),
          cell: {
            userEnteredFormat: {
              verticalAlignment: 'MIDDLE',
              horizontalAlignment: 'LEFT',
              wrapStrategy: 'CLIP',
              textFormat: { fontFamily: 'Arial', fontSize: 10 },
            },
          },
          fields: 'userEnteredFormat(verticalAlignment,horizontalAlignment,wrapStrategy,textFormat)',
        },
      });

      for (const colName of cfg.centerNumericColumns || []) {
        const c = techHeaders.indexOf(colName);
        if (c === -1) continue;
        requests.push({
          repeatCell: {
            range: grid(2, c, lastRow, c + 1),
            cell: {
              userEnteredFormat: {
                verticalAlignment: 'MIDDLE',
                horizontalAlignment: 'CENTER',
                wrapStrategy: 'CLIP',
              },
            },
            fields: 'userEnteredFormat(verticalAlignment,horizontalAlignment,wrapStrategy)',
          },
        });
      }

      for (const colName of cfg.wrapColumns || []) {
        const c = techHeaders.indexOf(colName);
        if (c === -1) continue;
        requests.push({
          repeatCell: {
            range: grid(2, c, lastRow, c + 1),
            cell: {
              userEnteredFormat: {
                verticalAlignment: 'MIDDLE',
                horizontalAlignment: 'LEFT',
                wrapStrategy: 'WRAP',
              },
            },
            fields: 'userEnteredFormat(verticalAlignment,horizontalAlignment,wrapStrategy)',
          },
        });
      }

      requests.push({
        addBanding: {
          bandedRange: {
            range: grid(2, 0, lastRow, colCount),
            rowProperties: {
              firstBandColor: { red: 1, green: 1, blue: 1 },
              secondBandColor: rgb01('#f5f5f5'),
            },
          },
        },
      });
    }

    if (cfg.title === 'Leads' && lastRow > 2) {
      const scoreCol = techHeaders.indexOf('current_score');
      const tempCol = techHeaders.indexOf('temperature');

      if (scoreCol !== -1) {
        const bands = [
          { min: '0', max: '30', bg: '#ffcccc' },
          { min: '31', max: '55', bg: '#fff3cc' },
          { min: '56', max: '75', bg: '#ffe0cc' },
          { min: '76', max: '100', bg: '#ccffcc' },
        ];
        for (const { min, max, bg } of bands) {
          cfAppend.push({
            addConditionalFormatRule: {
              rule: {
                ranges: [grid(2, scoreCol, lastRow, scoreCol + 1)],
                booleanRule: {
                  condition: {
                    type: 'NUMBER_BETWEEN',
                    values: [{ userEnteredValue: min }, { userEnteredValue: max }],
                  },
                  format: { backgroundColor: rgb01(bg) },
                },
              },
            },
          });
        }
      }

      if (tempCol !== -1) {
        const temps = [
          { v: 'frio', bg: '#cce5ff' },
          { v: 'tibio', bg: '#fff3cc' },
          { v: 'calificado', bg: '#ffe0cc' },
          { v: 'caliente', bg: '#ffcccc' },
        ];
        for (const { v, bg } of temps) {
          cfAppend.push({
            addConditionalFormatRule: {
              rule: {
                ranges: [grid(2, tempCol, lastRow, tempCol + 1)],
                booleanRule: {
                  condition: {
                    type: 'TEXT_EQ',
                    values: [{ userEnteredValue: v }],
                  },
                  format: { backgroundColor: rgb01(bg) },
                },
              },
            },
          });
        }
      }
    }

    for (const r of cfAppend) {
      requests.push(r);
    }

    requests.push({
      updateBorders: {
        range: grid(0, 0, lastRow, colCount),
        top: borderSpec,
        bottom: borderSpec,
        left: borderSpec,
        right: borderSpec,
        innerHorizontal: borderSpec,
        innerVertical: borderSpec,
      },
    });

    requests.push({
      updateBorders: {
        range: grid(0, 0, 1, colCount),
        bottom: borderThick,
      },
    });

    requests.push({
      updateBorders: {
        range: grid(1, 0, 2, colCount),
        bottom: borderThick,
      },
    });

    const chunkSize = 80;
    for (let i = 0; i < requests.length; i += chunkSize) {
      await sheets.spreadsheets.batchUpdate({
        spreadsheetId: SPREADSHEET_ID,
        requestBody: { requests: requests.slice(i, i + chunkSize) },
      });
    }

    results.push({ sheet: cfg.title, ok: true, rows: lastRow, cols: colCount });
  }

  console.log('\n=== Formato Google Sheet (2 filas encabezado) ===');
  console.log('Planilla:', meta.data.properties?.title || SPREADSHEET_ID);
  for (const r of results) {
    if (r.ok) console.log(`  OK  ${r.sheet} (${r.rows} filas × ${r.cols} cols)`);
    else console.log(`  ERR ${r.sheet}: ${r.error}`);
  }
  console.log(
    '\nFila 1 = español · Fila 2 = claves técnicas (inglés) · Datos desde fila 3.\n' +
      'En n8n: Header Row 2 + First Data Row 3 (read) / locationDefine (append-update).\n'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
