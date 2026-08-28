const assert=require('assert');
const E=require('../bbb-scanner-engine.js');
class MemoryStorage{constructor(){this.m={}}getItem(k){return this.m[k]??null}setItem(k,v){this.m[k]=String(v)}}
const response=(ok,data,status=200)=>({ok,status,json:async()=>data});
function offComplete(code='111') {return {status:1,product:{code,product_name:'Test Rice',brands:'Test',categories:'Rice',ingredients_text:'jasmine rice',serving_size:'1 cup',number_of_servings:'2',quantity:'2 cups',nutriments:{'energy-kcal_100g':130,'fat_100g':0.3,'carbohydrates_100g':28,'proteins_100g':2.7,'sodium_100g':1}}};}
function usda(code='222'){return {ok:true,foods:[{gtinUpc:code,description:'USDA Chicken',brandName:'Test',brandedFoodCategory:'Chicken',ingredients:'chicken breast, water, salt',servingSize:100,servingSizeUnit:'g',householdServingFullText:'1 serving',foodNutrients:[{nutrientName:'Protein',value:31},{nutrientName:'Sodium, Na',value:74}]}]};}
(async()=>{
  {
    const s=new MemoryStorage();let calls=[];
    const f=async url=>{calls.push(url);return response(true,offComplete('111'));};
    const r=await E.retrieveProduct('111',{storage:s,fetchFn:f});
    assert.equal(r.sources[0].name,'Open Food Facts');assert.equal(r.retrieval.attempts.length,1);assert.equal(calls.length,1);
  }
  {
    const s=new MemoryStorage();let n=0;
    const f=async url=>{n++;if(url.includes('openfoodfacts'))return response(true,{status:1,product:{code:'222',product_name:'USDA Chicken',brands:'Test',ingredients_text:'chicken breast, water, salt'}});return response(true,usda('222'));};
    const r=await E.retrieveProduct('222',{storage:s,fetchFn:f,usdaWorker:'https://worker.test'});
    assert.equal(n,2);assert.equal(r.serving.size,'100 g');assert.equal(r.sources.length,2);assert.equal(r.completeness.essentialComplete,true);
  }
  {
    const s=new MemoryStorage();
    const f=async url=>url.includes('openfoodfacts')?response(true,{status:0}):response(true,usda('333'));
    const r=await E.retrieveProduct('333',{storage:s,fetchFn:f,usdaWorker:'https://worker.test'});
    assert.equal(r.productName,'USDA Chicken');assert.equal(r.sources[0].name,'USDA FoodData Central via protected Worker');
  }
  {
    const s=new MemoryStorage();
    const f=async url=>url.includes('openfoodfacts')?response(true,{status:0}):response(true,{ok:true,foods:[]});
    const r=await E.retrieveProduct('404',{storage:s,fetchFn:f,usdaWorker:'https://worker.test'});
    assert.equal(r.notFound,true);assert.deepEqual(r.completeness.missing,['product facts']);
  }
  {
    const s=new MemoryStorage();
    const f=async()=>{throw new Error('offline')};
    const r=await E.retrieveProduct('500',{storage:s,fetchFn:f,usdaWorker:'https://worker.test'});
    assert.equal(r.notFound,true);assert.equal(r.retrieval.errors.length,2);
  }
  {
    const s=new MemoryStorage();let calls=0;
    const first=async()=>{calls++;return response(true,offComplete('777'));};
    await E.retrieveProduct('777',{storage:s,fetchFn:first});
    const second=async()=>{throw new Error('should not fetch')};
    const r=await E.retrieveProduct('777',{storage:s,fetchFn:second});
    assert.equal(r.retrieval.cacheHit,true);assert.equal(calls,1);
  }
  console.log('PASS: 6 retrieval/cache smoke tests');
})().catch(e=>{console.error(e);process.exit(1)});
