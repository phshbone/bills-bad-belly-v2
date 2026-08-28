const assert=require('assert');
const fs=require('fs');
const path=require('path');
const Core=require('../bbb-scanner-core.js');
const rules=JSON.parse(fs.readFileSync(path.join(__dirname,'..','bbb-rules.json'),'utf8'));

assert.strictEqual(rules.version,'1.5.1','exactly one intended rules version must be 1.5.1');

function rec(name,ingredients,opts={}){
  return {
    barcode:opts.barcode||'000000000001',productName:name,brand:'Fixture',category:opts.category||'',ingredientsText:ingredients||'',ingredientFamilies:[],ingredientForms:[],
    nutrition:opts.nutrition||{calories:{serving:100,per100g:100,unit:'kcal'},fat:{serving:2,per100g:2,unit:'g'}},
    serving:{size:opts.serving===undefined?'100 g':opts.serving,grams:100,servingsPerContainer:1,explicitServingsPerContainer:true},
    packageQuantity:'100 g',source:{name:'fixture',type:'fixture',retrievedAt:new Date().toISOString(),updatedAt:null},confidence:'fixture',verification:'fixture',fallbackPhotoRefs:[],rulesVersion:'1.5.1'
  };
}
function ev(r,mode='normal',personal=null){return Core.evaluate(r,rules,{mode,personal});}

// Clear Do.
assert.strictEqual(ev(rec('Plain Chicken Breast','chicken breast')).label,'GOOD','plain lean protein should be Good');

// Structural Don’t cannot be portion-downgraded.
assert.strictEqual(ev(rec('Potato Skins','potatoes, salt',{serving:'5 g'})).label,'UGLY','skin-on potato must remain Ugly even at a tiny labeled serving');

// Preparation distinction.
assert.strictEqual(ev(rec('Peeled Soft Cooked Potatoes','potatoes')).label,'GOOD','explicitly peeled + soft potato should be Good');

// Onion/garlic form and role.
assert.strictEqual(ev(rec('Chicken Crackers','chicken breast, enriched flour, salt, onion powder')).label,'HOLD ON','minor onion powder should be Hold On, not Ugly');
assert.strictEqual(ev(rec('Chicken with Dehydrated Onion','chicken breast, dehydrated onion pieces, salt')).label,'UGLY','dehydrated onion pieces should carry the stronger warning');

// Whole form versus processed derivative.
assert.strictEqual(ev(rec('Whole Corn Side','whole corn, salt')).label,'UGLY','whole corn should be Ugly');
assert.notStrictEqual(ev(rec('Cornstarch Pudding','milk, cornstarch, sugar')).label,'UGLY','cornstarch must not inherit whole-corn structural warning');
assert.strictEqual(ev(rec('Seeded Crackers','enriched flour, sesame seeds, salt')).label,'UGLY','whole seeds should be Ugly');
assert.notStrictEqual(ev(rec('Oil Crackers','enriched flour, sesame oil, salt')).label,'UGLY','seed oil must not inherit whole-seed structural warning');

// Main construction must win over garlic fixation.
const pizza=ev(rec('Pepperoni Pizza','enriched wheat flour, cheese, pepperoni, tomato sauce, garlic powder'));
assert.strictEqual(pizza.label,'HOLD ON','pepperoni pizza should be conditional in Normal mode rather than garlic-driven Ugly');
assert.ok(/pepperoni|fatty|processed/i.test(pizza.mainFood.label+' '+pizza.mainFood.reason),'pizza explanation should identify processed-meat/main construction');

// Incomplete essential data is Hold On.
assert.strictEqual(ev(rec('Mystery Product','',{serving:'30 g'})).label,'HOLD ON','missing ingredients must force Hold On');
assert.strictEqual(ev(rec('No Serving Product','chicken breast',{serving:null})).label,'HOLD ON','missing serving information must force Hold On');

// Personal hard stop outranks general guidance; Works for Me does not erase structural guidance.
const chicken=rec('Plain Chicken Breast','chicken breast',{barcode:'111111111111'});
assert.strictEqual(ev(chicken,'normal',{status:'not_for_me',date:new Date().toISOString(),reason:'reaction'}).label,'UGLY','personal Not for Me must be a hard stop');
const seeds=rec('Seeded Bread','enriched flour, sesame seeds',{barcode:'222222222222'});
const seedsWorks=ev(seeds,'normal',{status:'works_for_me',date:new Date().toISOString()});
assert.strictEqual(seedsWorks.label,'UGLY','Works for Me must not downgrade a structural hard stop');
assert.ok(seedsWorks.evidence.some(x=>x.kind==='personal history'),'personal history should still be displayed separately');

// Decision persistence payload must remain product-level unless ingredient flag is deliberately supplied.
const decision=Core.makeDecision(chicken,'not_for_me',{mode:'normal',timing:'after_reaction',reason:'test'});
assert.strictEqual(decision.ingredientFlag,null,'rejecting a mixed product must not auto-create ingredient flags');
assert.strictEqual(decision.timing,'after_reaction');

console.log('scanner core smoke tests passed');
