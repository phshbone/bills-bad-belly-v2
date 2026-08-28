const assert=require('assert');
const E=require('../bbb-scanner-engine.js');
const rules=require('../bbb-rules-v1.5.2.json');

class MemoryStorage{
  constructor(){this.m={}}
  getItem(k){return this.m[k]??null}
  setItem(k,v){this.m[k]=String(v)}
}

const storage=new MemoryStorage();
const record={
  barcode:'1234567890123',
  productName:'Jasmine Rice',
  brand:'Test Brand',
  category:'Rice',
  ingredientsText:'jasmine rice',
  nutrition:{per100g:{},perServing:{}},
  serving:{size:'1 cup',servingsPerContainer:'2'},
  sources:[{name:'fixture'}],
  completeness:{name:true,ingredients:true,serving:true,nutrition:false,essentialComplete:true,missing:[]}
};

let saved=E.saveDecision(storage,record,'works',{mode:'normal',timing:'before',reason:'known safe'});
assert.equal(saved.status,'works');
assert.equal(E.getDecision(storage,record.barcode).status,'works');
let evaluated=E.evaluateProduct(record,rules,{mode:'normal',storage});
assert.equal(evaluated.label,'GOOD');
assert.equal(evaluated.personal.status,'works');

saved=E.saveDecision(storage,record,'hold',{mode:'Flare',timing:'before',reason:'not trying during flare'});
assert.equal(E.getDecision(storage,record.barcode).status,'hold');
evaluated=E.evaluateProduct(record,rules,{mode:'flare',storage});
assert.equal(evaluated.label,'HOLD ON');
assert.equal(evaluated.personal.status,'hold');

saved=E.saveDecision(storage,record,'not_for_me',{mode:'normal',timing:'after',reason:'documented reaction'});
assert.equal(E.getDecision(storage,record.barcode).status,'not_for_me');
evaluated=E.evaluateProduct(record,rules,{mode:'normal',storage});
assert.equal(evaluated.label,'UGLY');
assert.equal(evaluated.personal.status,'not_for_me');
assert.equal(storage.getItem('bbbIngredientFlagsV152'),null,'rejecting a product must not auto-create ingredient-wide flags');

saved=E.saveDecision(storage,record,'works',{mode:'normal',timing:'after',reason:'retested successfully'});
assert.equal(E.getDecision(storage,record.barcode).status,'works');
evaluated=E.evaluateProduct(record,rules,{mode:'normal',storage});
assert.equal(evaluated.label,'GOOD');
assert.equal(evaluated.personal.status,'works');

const persisted=JSON.parse(storage.getItem(E.DECISIONS_KEY));
assert.equal(persisted[record.barcode].status,'works');
assert.ok(Array.isArray(persisted[record.barcode].history));
assert.ok(persisted[record.barcode].history.length>=1,'changing status should retain prior decision history');

console.log('PASS: personal decisions persist, override correctly, can change, and do not auto-flag ingredients');
