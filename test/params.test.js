import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTurnChance } from '../src/params.js';

test('absent turn parameter keeps the scheduled turns enabled', () => {
  assert.equal(parseTurnChance(null), null);
  assert.equal(parseTurnChance(undefined), null);
  assert.equal(parseTurnChance(''), null);
});

test('turn parameter accepts probabilities in [0, 1]', () => {
  assert.equal(parseTurnChance('0'), 0);
  assert.equal(parseTurnChance('0.34'), 0.34);
  assert.equal(parseTurnChance('1'), 1);
});

test('invalid turn parameter falls back to the schedule', () => {
  assert.equal(parseTurnChance('2'), null);
  assert.equal(parseTurnChance('-1'), null);
  assert.equal(parseTurnChance('abc'), null);
  assert.equal(parseTurnChance('0.5x'), null);
});
