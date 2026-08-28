/* Run with Node from repository root: node tests/scanner-engine-smoke.test.js */
const assert = require('assert');
const E = require('../bbb-scanner-engine.js');
const rules = require('../bbb-rules-v1.5.2.json');

const rec = (name, ingredients, serving = '1 serving') => ({
  barcode: Math.random().toString(16).slice(2),
  productName: name,
  brand: '',
  category: '',
  ingredientsText: ingredients,
  nutrition: { per100g: {}, perServing: {} },
  serving: { size: serving, servingsPerContainer: '' },
  sources: [{ name: 'fixture' }],
  completeness: {
    name: !!name,
    ingredients: !!ingredients,
    serving: !!serving,
    essentialComplete: !!name && !!ingredients && !!serving,
    missing: [!name && 'product name', !ingredients && 'ingredients', !serving && 'serving information'].filter(Boolean)
  }
});

const verdict = (record, mode = 'normal', personalDecision = null) =>
  E.evaluateProduct(record, rules, { mode, personalDecision, storage: null }).label;

assert.equal(verdict(rec('Jasmine Rice', 'jasmine rice')), 'GOOD');
assert.equal(verdict(rec('Plain Chicken Breast', 'chicken breast, water, salt')), 'GOOD');
assert.equal(verdict(rec('Skin-On Potato', 'potato, potato skin, salt')), 'UGLY');
assert.equal(verdict(rec('Peeled Mashed Potatoes', 'peeled potatoes, water, salt')), 'GOOD');
assert.equal(verdict(rec('Seasoned Crackers', 'wheat flour, onion powder, salt')), 'HOLD ON');
assert.equal(verdict(rec('Onion Roll', 'wheat flour, dehydrated onion, salt')), 'HOLD ON');
assert.equal(verdict(rec('Onion Roll', 'wheat flour, onion pieces, salt')), 'UGLY');
assert.equal(verdict(rec('Corn Starch Pudding', 'corn starch, milk')), 'HOLD ON');
assert.equal(verdict(rec('Whole Corn', 'whole corn, salt')), 'UGLY');
assert.equal(verdict(rec('Sesame Oil Noodles', 'wheat flour, sesame seed oil, salt')), 'HOLD ON');
assert.equal(verdict(rec('Sesame Seed Roll', 'wheat flour, sesame seeds, salt')), 'UGLY');
assert.equal(verdict(rec('Pepperoni Pizza', 'wheat flour, tomato sauce, pepperoni, garlic powder, cheese')), 'HOLD ON');
assert.equal(verdict(rec('Pepperoni Pizza', 'wheat flour, tomato sauce, pepperoni, garlic powder, cheese'), 'flare'), 'UGLY');
assert.equal(verdict(rec('Rice', 'rice', '')), 'HOLD ON');
assert.equal(verdict(rec('Jasmine Rice', 'jasmine rice'), 'normal', { status: 'not_for_me', date: '2026-08-01T00:00:00Z', reason: 'reaction' }), 'UGLY');
assert.equal(verdict(rec('Almond Snack', 'almonds, salt')), 'UGLY');
assert.equal(verdict(rec('Onion Roll', 'wheat flour, onions, salt')), 'UGLY');

console.log('PASS: 17 locked scanner/rules regression tests');
