#!/usr/bin/env node
'use strict';

/**
 * Tests offline v1.1 (sin red).
 */
const assert = require('assert');
const {
  systemMinFromAnexo,
  parseClasificadorTemperatura,
  prepararClasificacionFromHistorial,
  sha256,
  loadTagWorkflow,
  deepClone,
} = require('./lib/v11-shared');
const { build, applyV11, assertOnlyAllowedDiff } = require('./build-v11-desde-3f132c3');

function leadBlock(temp) {
  return [
    'texto libre',
    '###LEAD_COMPLETO###',
    JSON.stringify({
      nombre: 'Ana',
      zona: 'Centro',
      presupuesto: '100k',
      operacion: 'compra',
      temperatura: temp,
      resumen: 'ok',
    }),
    '###FIN_LEAD###',
  ].join('\n');
}

function httpOk(content) {
  return {
    choices: [{ message: { content } }],
    usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
  };
}

function testParser() {
  const ok = parseClasificadorTemperatura(httpOk(leadBlock('tibio')));
  assert.strictEqual(ok.ok, true);
  assert.strictEqual(ok.temperatura, 'tibio');

  const tilde = parseClasificadorTemperatura(httpOk(leadBlock('frío')));
  assert.strictEqual(tilde.ok, true);
  assert.strictEqual(tilde.temperatura, 'frio');
  assert.strictEqual(tilde.cruda, 'frío');

  const mayus = parseClasificadorTemperatura(httpOk(leadBlock('Caliente')));
  assert.strictEqual(mayus.ok, true);
  assert.strictEqual(mayus.temperatura, 'caliente');

  const sin = parseClasificadorTemperatura(httpOk('hola sin bloque'));
  assert.strictEqual(sin.ok, false);
  assert.ok(sin.error.includes('sin_bloque'));

  const roto = parseClasificadorTemperatura(
    httpOk('###LEAD_COMPLETO###\n{not valid json}\n###FIN_LEAD###'),
  );
  assert.strictEqual(roto.ok, false);
  assert.ok(roto.error.startsWith('json_roto'));

  const err = parseClasificadorTemperatura({ error: { message: 'rate limit' } });
  assert.strictEqual(err.ok, false);
  assert.ok(err.error.includes('http_error'));

  const inval = parseClasificadorTemperatura(httpOk(leadBlock('hirviendo')));
  assert.strictEqual(inval.ok, false);
  assert.ok(inval.error.startsWith('temperatura_invalida'));
}

function testPreparar() {
  const sm = systemMinFromAnexo();

  // historial vacío + mensaje actual (1 user) — igual a prueba de componente
  const h1 = JSON.stringify([{ role: 'user', content: 'Hola, busco PH en Chacras' }]);
  const r1 = prepararClasificacionFromHistorial(h1, sm);
  assert.strictEqual(r1.messages[0].role, 'system');
  assert.strictEqual(r1.messages[0].content, sm);
  assert.strictEqual(r1.messages[1].role, 'user');
  assert.strictEqual(r1.messages[1].content, 'Hola, busco PH en Chacras');
  assert.strictEqual(r1.content, 'Hola, busco PH en Chacras');

  // 8 mensajes de usuario → últimos 6
  const users = [];
  for (let i = 1; i <= 8; i++) {
    users.push({ role: 'assistant', content: `a${i}` });
    users.push({ role: 'user', content: `u${i}` });
  }
  const r8 = prepararClasificacionFromHistorial(JSON.stringify(users), sm);
  assert.strictEqual(r8.content, ['u3', 'u4', 'u5', 'u6', 'u7', 'u8'].join('\n'));
}

function testIntegridadFallaFuera() {
  const sm = systemMinFromAnexo();
  const tag = loadTagWorkflow();
  const v11 = applyV11(tag, sm);
  const good = assertOnlyAllowedDiff(tag, v11, sm);
  assert.strictEqual(good.issues.length, 0, good.issues.join('; '));

  // cambio fuera de lo permitido
  const bad = deepClone(v11);
  const c = bad.nodes.find((n) => n.name === 'Construir Prompt');
  c.parameters.jsCode = c.parameters.jsCode + '\n// noop\n';
  const check = assertOnlyAllowedDiff(tag, bad, sm);
  assert.ok(check.issues.length > 0, 'debía fallar por cambio en Construir Prompt');
}

function main() {
  testParser();
  testPreparar();
  testIntegridadFallaFuera();
  const built = build();
  assert.ok(built.v11);
  assert.strictEqual(sha256(built.systemMin), built.check.smHash);
  console.log('OK test-v11: parser, preparar, integridad, build');
}

main();
