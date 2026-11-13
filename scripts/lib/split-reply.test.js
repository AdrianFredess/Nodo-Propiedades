'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { splitReplyParts, pausaMsForPart } = require('./split-reply');

describe('splitReplyParts', () => {
  it('una sola parte si no hay línea en blanco', () => {
    assert.deepEqual(splitReplyParts('Hola todo bien'), ['Hola todo bien']);
  });

  it('corta por línea en blanco', () => {
    assert.deepEqual(splitReplyParts('Primera.\n\nSegunda.'), ['Primera.', 'Segunda.']);
  });

  it('máximo 3 (la 3.ª junta el resto)', () => {
    assert.deepEqual(splitReplyParts('A\n\nB\n\nC\n\nD'), ['A', 'B', 'C\n\nD']);
  });
});

describe('pausaMsForPart', () => {
  it('entre 1s y 4s', () => {
    assert.equal(pausaMsForPart('x'), 1000);
    assert.ok(pausaMsForPart('x'.repeat(200)) <= 4000);
  });
});
