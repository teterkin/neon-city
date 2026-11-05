import test from 'node:test';
import assert from 'node:assert/strict';
import { NIGHT_QUOTES } from '../src/quotes.js';

test('night city quotes are complete', () => {
  assert.equal(NIGHT_QUOTES.length, 4);
  for (const quote of NIGHT_QUOTES) {
    assert.ok(quote.text.length > 10, `short quote ${quote.text}`);
    assert.match(quote.year, /^\d+ BBY$/);
  }
});
