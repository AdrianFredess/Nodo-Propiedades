'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { isOwnerChat, shouldIgnoreOwnerMessage } = require('./ignore-owner-chat');

describe('isOwnerChat', () => {
  it('match string exacto', () => {
    assert.equal(isOwnerChat('-100123', '-100123'), true);
  });
  it('match numérico vs string', () => {
    assert.equal(isOwnerChat(-100123, '-100123'), true);
  });
  it('no match distinto', () => {
    assert.equal(isOwnerChat('1947576481', '-100123'), false);
  });
  it('vacío = false', () => {
    assert.equal(isOwnerChat('', '-100'), false);
    assert.equal(isOwnerChat('-100', ''), false);
  });
});

describe('shouldIgnoreOwnerMessage', () => {
  it('skip owner', () => {
    assert.deepEqual(shouldIgnoreOwnerMessage({ chat_id: '-100999' }, '-100999'), {
      skip: true,
      reason: 'owner_chat',
    });
  });
  it('no skip cliente', () => {
    assert.deepEqual(shouldIgnoreOwnerMessage({ chat_id: '893000001' }, '-100999'), {
      skip: false,
    });
  });
});
