/* Deploy PANEL-01 with cache gate + IF. Run: node scripts/deploy-panel01-cache.js */
const fs = require('fs');
const path = require('path');

const gateCode = fs.readFileSync(
  path.join(__dirname, 'panel01-cache-gate.js'),
  'utf8',
);
const armarCode = fs.readFileSync(
  path.join(__dirname, 'panel01-armar-payload.js'),
  'utf8',
);

const ops = {
  id: 'TfGR4Uhq2TnSBFLw',
  intent: 'Add payload/stock cache gate to avoid Google Sheets 429',
  operations: [
    {
      type: 'addNode',
      node: {
        id: 'panel01-cache-gate',
        name: 'Payload Cache Gate',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [320, 300],
        parameters: { jsCode: gateCode },
      },
    },
    {
      type: 'addNode',
      node: {
        id: 'panel01-if-cache',
        name: 'IF Cache Hit',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [520, 300],
        parameters: {
          conditions: {
            options: {
              version: 2,
              leftValue: '',
              caseSensitive: true,
              typeValidation: 'loose',
            },
            combinator: 'and',
            conditions: [
              {
                id: 'cache-hit',
                leftValue: '={{ Boolean($json.cacheHit) }}',
                rightValue: '',
                operator: {
                  type: 'boolean',
                  operation: 'true',
                  singleValue: true,
                },
              },
            ],
          },
        },
      },
    },
    {
      type: 'addNode',
      node: {
        id: 'panel01-stock-gate',
        name: 'Stock Cache Gate',
        type: 'n8n-nodes-base.code',
        typeVersion: 2,
        position: [760, 380],
        parameters: {
          jsCode: `let gate = { needStockRead: true, stockFromCache: [] };
try {
  gate = $('Payload Cache Gate').first().json || gate;
} catch (e) {}
return [{
  json: {
    needStockRead: gate.needStockRead !== false,
    stockFromCache: Array.isArray(gate.stockFromCache) ? gate.stockFromCache : [],
  }
}];`,
        },
      },
    },
    {
      type: 'addNode',
      node: {
        id: 'panel01-if-stock',
        name: 'IF Need Stock Read',
        type: 'n8n-nodes-base.if',
        typeVersion: 2.2,
        position: [960, 380],
        parameters: {
          conditions: {
            options: {
              version: 2,
              leftValue: '',
              caseSensitive: true,
              typeValidation: 'loose',
            },
            combinator: 'and',
            conditions: [
              {
                id: 'need-stock',
                leftValue: '={{ Boolean($json.needStockRead) }}',
                rightValue: '',
                operator: {
                  type: 'boolean',
                  operation: 'true',
                  singleValue: true,
                },
              },
            ],
          },
        },
      },
    },
    {
      type: 'updateNode',
      nodeName: 'Armar Payload Panel',
      updates: {
        'parameters.jsCode': armarCode,
        position: [1320, 300],
      },
    },
    {
      type: 'removeConnection',
      source: 'Webhook Leads',
      target: 'Leer Leads_Bot',
      ignoreErrors: true,
    },
    {
      type: 'removeConnection',
      source: 'Leer Consultas',
      target: 'Leer Stock Propiedades',
      ignoreErrors: true,
    },
    {
      type: 'removeConnection',
      source: 'Leer Stock Propiedades',
      target: 'Armar Payload Panel',
      ignoreErrors: true,
    },
    {
      type: 'addConnection',
      source: 'Webhook Leads',
      target: 'Payload Cache Gate',
    },
    {
      type: 'addConnection',
      source: 'Payload Cache Gate',
      target: 'IF Cache Hit',
    },
    {
      type: 'addConnection',
      source: 'IF Cache Hit',
      target: 'Responder JSON',
      branch: 'true',
    },
    {
      type: 'addConnection',
      source: 'IF Cache Hit',
      target: 'Leer Leads_Bot',
      branch: 'false',
    },
    {
      type: 'addConnection',
      source: 'Leer Consultas',
      target: 'Stock Cache Gate',
    },
    {
      type: 'addConnection',
      source: 'Stock Cache Gate',
      target: 'IF Need Stock Read',
    },
    {
      type: 'addConnection',
      source: 'IF Need Stock Read',
      target: 'Leer Stock Propiedades',
      branch: 'true',
    },
    {
      type: 'addConnection',
      source: 'IF Need Stock Read',
      target: 'Armar Payload Panel',
      branch: 'false',
    },
    {
      type: 'addConnection',
      source: 'Leer Stock Propiedades',
      target: 'Armar Payload Panel',
    },
  ],
};

fs.writeFileSync(
  path.join('D:/DevCaches/Temp', 'panel01-ops.json'),
  JSON.stringify(ops),
);
console.log('Wrote ops', ops.operations.length);
