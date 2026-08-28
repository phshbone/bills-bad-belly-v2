(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports) module.exports=api;
  else root.BBBScannerCore=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const RULE_VERSION='1.5.1';
  const LABELS={good:'GOOD',hold:'HOLD ON',ugly:'UGLY'};

  function clean(v){return v==null?'':String(v).trim();}
  function lower(v){return clean(v).toLowerCase().replace(/[’']/g,"'").replace(/\s+/g,' ');}
  function num(v){if(v===null||v===undefined||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null;}
  function isoDate(v){if(!v)return null;try{return new Date(v).toISOString();}catch(_){return null;}}
  function first(){for(const v of arguments){if(v!==undefined&&v!==null&&String(v).trim()!=='')return v;}return null;}
  function containsAlias(hay,alias){
    const a=lower(alias); if(!a)return false;
    const h=' '+lower(hay).replace(/[^a-z0-9%+\- ]+/g,' ')+' ';
    const p=' '+a.replace(/[^a-z0-9%+\- ]+/g,' ')+' ';
    return h.includes(p);
  }

  function parseQuantityGrams(v){
    const s=lower(v); if(!s)return null;
    const m=s.match(/([0-9]+(?:\.[0-9]+)?)\s*(kg|g|mg)\b/);
    if(!m)return null;
    const n=Number(m[1]); return m[2]==='kg'?n*1000:m[2]==='mg'?n/1000:n;
  }

  function offNutrient(n,key){
    if(!n)return {serving:null,per100g:null,unit:null};
    const unit=first(n[key+'_unit'],key==='sodium'?'g':'g');
    return {serving:num(n[key+'_serving']),per100g:num(n[key+'_100g']),unit:unit?String(unit):null};
  }

  function normalizeOFF(product,barcode){
    product=product||{}; const n=product.nutriments||{};
    const nutrition={
      calories:{serving:num(first(n['energy-kcal_serving'],n.energy_kcal_serving)),per100g:num(first(n['energy-kcal_100g'],n.energy_kcal_100g)),unit:'kcal'},
      fat:offNutrient(n,'fat'),
      saturatedFat:offNutrient(n,'saturated-fat'),
      carbohydrates:offNutrient(n,'carbohydrates'),
      fiber:offNutrient(n,'fiber'),
      sugars:offNutrient(n,'sugars'),
      addedSugars:offNutrient(n,'added-sugars'),
      sugarAlcohols:offNutrient(n,'polyols'),
      protein:offNutrient(n,'proteins'),
      sodium:offNutrient(n,'sodium')
    };
    const servingSize=clean(first(product.serving_size,product.serving_quantity?product.serving_quantity+' g':''));
    const quantity=clean(first(product.quantity,product.product_quantity?product.product_quantity+' g':''));
    const servingGrams=num(product.serving_quantity)||parseQuantityGrams(servingSize);
    const packageGrams=num(product.product_quantity)||parseQuantityGrams(quantity);
    const servingsPerContainer=(servingGrams&&packageGrams)?Math.round((packageGrams/servingGrams)*100)/100:null;
    return {
      barcode:clean(first(barcode,product.code,product._id)),
      productName:clean(first(product.product_name,product.generic_name,'Unknown product')),
      brand:clean(product.brands),
      category:clean(product.categories),
      ingredientsText:clean(first(product.ingredients_text,product.ingredients_text_en)),
      ingredientFamilies:[], ingredientForms:[], nutrition,
      serving:{size:servingSize||null,grams:servingGrams,servingsPerContainer,explicitServingsPerContainer:false},
      packageQuantity:quantity||null,
      source:{name:'Open Food Facts',type:'open_food_facts',retrievedAt:new Date().toISOString(),updatedAt:product.last_modified_t?new Date(Number(product.last_modified_t)*1000).toISOString():null},
      confidence:'retrieved', completeness:null, verification:'database', fallbackPhotoRefs:[], rulesVersion:RULE_VERSION,
      raw:{offLastModified:product.last_modified_t||null}
    };
  }

  function nutrientMapFromUsda(food){
    const out={};
    if(food&&food.nutrients&&!Array.isArray(food.nutrients)){
      for(const [k,v] of Object.entries(food.nutrients)){
        const key=lower(k).replace(/[^a-z0-9]/g,'');
        const amount=num(v&&typeof v==='object'?first(v.amount,v.value):v);
        const unit=v&&typeof v==='object'?clean(first(v.unit,v.unitName)):'';
        if(amount!=null) out[key]={amount,unit};
      }
    }
    const arr=Array.isArray(food&&food.foodNutrients)?food.foodNutrients:[];
    for(const item of arr){
      const nutrient=item.nutrient||{};
      const name=lower(first(nutrient.name,item.nutrientName));
      const amount=num(first(item.amount,item.value)); if(amount==null)continue;
      const unit=clean(first(nutrient.unitName,item.unitName));
      out[name.replace(/[^a-z0-9]/g,'')]={amount,unit};
    }
    return out;
  }
  function pickUsda(map,names,unit){
    for(const name of names){
      const k=lower(name).replace(/[^a-z0-9]/g,'');
      if(map[k])return {serving:null,per100g:map[k].amount,unit:map[k].unit||unit||null};
    }
    return {serving:null,per100g:null,unit:unit||null};
  }
  function normalizeUSDA(food,barcode){
    food=food||{}; const map=nutrientMapFromUsda(food);
    const nutrition={
      calories:pickUsda(map,['energy','energykcal','calories'],'kcal'),
      fat:pickUsda(map,['total lipid fat','totalfat','fat'],'g'),
      saturatedFat:pickUsda(map,['fatty acids total saturated','saturatedfat'],'g'),
      carbohydrates:pickUsda(map,['carbohydrate by difference','carbohydrates'],'g'),
      fiber:pickUsda(map,['fiber total dietary','fiber'],'g'),
      sugars:pickUsda(map,['sugars total including nlea','totalsugars','sugars'],'g'),
      addedSugars:pickUsda(map,['sugars added','addedsugars'],'g'),
      sugarAlcohols:pickUsda(map,['sugar alcohols','polyols'],'g'),
      protein:pickUsda(map,['protein'],'g'),
      sodium:pickUsda(map,['sodium na','sodium'],'mg')
    };
    const servingSize=clean(first(food.householdServingFullText,food.servingSize?food.servingSize+' '+(food.servingSizeUnit||''):''));
    const servings=num(first(food.servingsPerContainer,food.servingsPerPackage));
    const quantity=clean(first(food.packageWeight,food.packageQuantity));
    return {
      barcode:clean(first(food.gtinUpc,barcode)), productName:clean(first(food.description,'Unknown product')),
      brand:clean(first(food.brandName,food.brandOwner)), category:clean(first(food.foodCategory,food.foodCategoryDescription)),
      ingredientsText:clean(food.ingredients), ingredientFamilies:[], ingredientForms:[], nutrition,
      serving:{size:servingSize||null,grams:num(food.servingSize),servingsPerContainer:servings,explicitServingsPerContainer:servings!=null},
      packageQuantity:quantity||null,
      source:{name:'USDA FoodData Central via protected Worker',type:'usda_fdc_worker',retrievedAt:new Date().toISOString(),updatedAt:isoDate(first(food.modifiedDate,food.publicationDate,food.availableDate))},
      confidence:'retrieved', completeness:null, verification:'database', fallbackPhotoRefs:[], rulesVersion:RULE_VERSION,
      raw:{fdcId:food.fdcId||null,dataType:food.dataType||null}
    };
  }

  function completeness(record){
    const missing=[];
    if(!clean(record&&record.ingredientsText))missing.push('ingredients');
    if(!record||!record.serving||!clean(record.serving.size))missing.push('serving size');
    const n=record&&record.nutrition||{};
    const anyNutrition=Object.values(n).some(v=>v&&(v.serving!=null||v.per100g!=null));
    if(!anyNutrition)missing.push('nutrition facts');
    const state=missing.length===0?'complete':missing.length<=1?'partial':'incomplete';
    return {state,missing,essentialMissing:missing.filter(x=>x==='ingredients'||x==='serving size')};
  }

  function ingredientSegments(text){
    const s=clean(text); if(!s)return [];
    const out=[]; let buf='',depth=0;
    for(const ch of s){
      if(ch==='('||ch==='['){depth++;buf+=ch;continue;}
      if(ch===')'||ch===']'){depth=Math.max(0,depth-1);buf+=ch;continue;}
      if((ch===','||ch===';')&&depth===0){if(buf.trim())out.push(buf.trim());buf='';continue;}
      buf+=ch;
    }
    if(buf.trim())out.push(buf.trim());
    return out;
  }

  function falsePositiveBlocks(rules,text,familyId){
    return (rules.falsePositiveRules||[]).some(rule=>containsAlias(text,rule.term)&&(rule.mustNotTrigger||[]).includes(familyId));
  }

  function detectIngredientFamilies(record,rules){
    const text=clean(record.ingredientsText); const segments=ingredientSegments(text); const hits=[];
    for(const family of (rules.ingredientFamilies||[])){
      if(falsePositiveBlocks(rules,text,family.id))continue;
      let bestIndex=Infinity,bestAlias='';
      for(const alias of (family.aliases||[])){
        const idx=segments.findIndex(seg=>containsAlias(seg,alias));
        if(idx>=0&&idx<bestIndex){bestIndex=idx;bestAlias=alias;}
      }
      if(bestIndex!==Infinity){
        hits.push({id:family.id,label:family.label||family.id,severity:family.severity||'medium',normal:family.normal,flare:family.flare,reason:family.reason||'',alias:bestAlias,ingredientIndex:bestIndex,role:bestIndex<=1?'primary':bestIndex<=4?'secondary':'minor'});
      }
    }
    return hits.sort((a,b)=>a.ingredientIndex-b.ingredientIndex);
  }

  function detectPreparation(record,rules){
    const hay=[record.productName,record.category,record.ingredientsText].join(' '); const hits=[];
    for(const rule of (rules.preparationRules||[])){
      if(!(rule.terms||[]).length)continue;
      const term=(rule.terms||[]).find(t=>containsAlias(hay,t));
      if(term)hits.push({id:rule.id,label:rule.label||rule.id,effect:rule.effect||'neutral',normal:rule.normal,flare:rule.flare,reason:rule.reason||'',term});
    }
    return hits;
  }

  function identifyMainFood(record,rules){
    const hay=[record.productName,record.category].join(' ');
    const hits=(rules.dominantFoodRules||[]).filter(r=>(r.aliases||[]).some(a=>containsAlias(hay,a))).sort((a,b)=>(b.priority||0)-(a.priority||0));
    if(hits[0])return {id:hits[0].id,label:hits[0].label||hits[0].id,reason:hits[0].reason||'',normal:hits[0].normal,flare:hits[0].flare,source:'dominant rule'};
    const categories=(rules.foodCategories||[]).filter(r=>(r.terms||[]).some(a=>containsAlias(hay,a))).sort((a,b)=>(b.priority||0)-(a.priority||0));
    if(categories[0])return {id:categories[0].id,label:categories[0].label||categories[0].id,reason:categories[0].reason||'',normal:categories[0].normal,flare:categories[0].flare,source:'food category'};
    return {id:'product',label:clean(record.productName)||'packaged food',reason:'The product identity comes from the database record.',normal:'caution',flare:'caution',source:'product name'};
  }

  function statusToLabel(status){
    if(status==='likely_rough')return 'ugly';
    if(status==='usually_gentle')return 'good';
    return 'hold';
  }
  function isStructuralFamily(h){return ['whole_corn','whole_seeds','whole_nuts','legumes','coconut_rough'].includes(h.id)||(h.severity==='high'&&['roughage','hull','skin','seed'].some(w=>lower(h.label).includes(w)));}
  function isStrongPreparation(p){return ['skin_on','fried_greasy_prep'].includes(p.id)||(p.effect==='risk'&&p.id==='raw_crisp'&&lower(p.label).includes('skin'));}
  function isOnionPieces(h){return h.id==='whole_onion'&&(/dehydrated|piece|chopped|diced|sliced|raw/.test(lower(h.alias)));}
  function isMinorSeasoning(h){return h.role==='minor'&&['onion_powder','garlic_family','mild_spices'].includes(h.id);}
  function isClearUglyMain(main){return ['fried_greasy_food','roughage_hulls_seeds','legume_dish'].includes(main.id);}

  function nutritionNotes(record,mode,rules){
    const notes=[]; const n=record.nutrition||{};
    for(const rule of (rules.nutritionRules||[])){
      const keyMap={fat:'fat',fiber:'fiber',sugar:'sugars',sodium:'sodium',protein:'protein'};
      const item=n[keyMap[rule.field]||rule.field]; if(!item)continue;
      const value=item.serving!=null?item.serving:item.per100g; if(value==null)continue;
      const matches=(rule.min==null||value>=rule.min)&&(rule.max==null||value<=rule.max);
      if(matches)notes.push({id:rule.id,label:statusToLabel(mode==='Flare'?rule.flare:rule.normal),reason:rule.reason||'',value,unit:item.unit||''});
    }
    return notes;
  }

  function evaluate(record,rules,options){
    options=options||{}; const mode=options.mode==='Flare'?'Flare':'normal'; const personal=options.personal||null;
    if(!rules||rules.version!==RULE_VERSION)throw new Error('Authoritative rules version '+RULE_VERSION+' required.');
    record.rulesVersion=rules.version; record.completeness=completeness(record);
    const families=detectIngredientFamilies(record,rules); record.ingredientFamilies=families.map(h=>h.id);
    record.ingredientForms=families.map(h=>({family:h.id,form:h.alias,role:h.role}));
    const prep=detectPreparation(record,rules); const main=identifyMainFood(record,rules); const evidence=[];
    let general='hold'; let reason='Mixed, conditional, or incomplete information requires a closer look.';

    const structural=families.find(isStructuralFamily);
    const onionPieces=families.find(isOnionPieces);
    const strongPrep=prep.find(isStrongPreparation);
    const mainStatus=statusToLabel(mode==='Flare'?main.flare:main.normal);
    const peeled=prep.some(p=>p.id==='peeled_skinless');
    const soft=prep.some(p=>p.id==='soft_cooked'||p.id==='pureed_blended');
    const preparedPotato=main.id==='potato_skin_starch'&&peeled&&soft;

    if(structural){general='ugly';reason='A clear structural Don’t was found: '+structural.label+'.';evidence.push({kind:'physical structure',label:structural.label,reason:structural.reason});}
    else if(strongPrep){general='ugly';reason='The preparation creates a clear Don’t condition: '+strongPrep.label+'.';evidence.push({kind:'preparation',label:strongPrep.label,reason:strongPrep.reason});}
    else if(onionPieces){general='ugly';reason='Visible or dehydrated onion pieces create a stronger physical/ingredient-form warning.';evidence.push({kind:'ingredient form',label:onionPieces.label,reason:onionPieces.reason});}
    else if(record.completeness.essentialMissing.length){general='hold';reason='Essential product facts are missing: '+record.completeness.essentialMissing.join(' and ')+'.';evidence.push({kind:'incomplete data',label:'missing '+record.completeness.essentialMissing.join(', '),reason:'The app will not invent certainty when essential label facts are absent.'});}
    else if(record.completeness.missing.length){general='hold';reason='Product facts are incomplete: '+record.completeness.missing.join(', ')+'.';evidence.push({kind:'incomplete data',label:'missing '+record.completeness.missing.join(', '),reason:'Incomplete product facts remain Hold On rather than being treated as clear permission.'});}
    else if(preparedPotato){general='good';reason='The potato is explicitly peeled and soft/pureed, removing the structural skin warning and establishing the gentler preparation.';evidence.push({kind:'preparation',label:'peeled + soft potato',reason:'Preparation is established rather than assumed.'});}
    else if(mainStatus==='ugly'&&isClearUglyMain(main)){general='ugly';reason='The main food or construction matches a clear structural/preparation Don’t pattern: '+main.label+'.';evidence.push({kind:'main food',label:main.label,reason:main.reason});}
    else if(mainStatus==='good'){general='good';reason='The main food matches a clear Do pattern and no structural Don’t was identified.';evidence.push({kind:'main food',label:main.label,reason:main.reason});}
    else if(mainStatus==='ugly'){general='hold';reason='The main food has a stronger caution in the rules, but it is not being treated as a structural hard stop without the required form/preparation evidence.';evidence.push({kind:'main food',label:main.label,reason:main.reason});}

    const conditional=families.filter(h=>!isStructuralFamily(h)&&!isOnionPieces(h)&&!(preparedPotato&&h.id==='potato_skin_starch'));
    const strongerConditional=conditional.find(h=>statusToLabel(mode==='Flare'?h.flare:h.normal)==='ugly');
    const holdConditional=conditional.find(h=>statusToLabel(mode==='Flare'?h.flare:h.normal)==='hold');
    if(general!=='ugly'&&strongerConditional){general='hold';reason='A non-structural ingredient concern ('+strongerConditional.label+') makes this conditional, not an automatic structural Ugly.';evidence.push({kind:'ingredient concern',label:strongerConditional.label,reason:strongerConditional.reason});}
    else if(general==='good'&&holdConditional){general='hold';reason='The main food is favorable, but '+holdConditional.label+' makes this conditional rather than clearly Good.';evidence.push({kind:'ingredient form',label:holdConditional.label,reason:holdConditional.reason});}
    else if(general==='good'&&conditional.some(isMinorSeasoning)){
      const hit=conditional.find(isMinorSeasoning);general='hold';reason='The main food is favorable, but a minor seasoning ('+hit.label+') is a personal/dose-sensitive question, not an automatic Ugly.';evidence.push({kind:'minor seasoning',label:hit.label,reason:hit.reason});
    }

    const nNotes=nutritionNotes(record,mode,rules);
    for(const n of nNotes)evidence.push({kind:'nutrition',label:n.id,reason:n.reason});
    if(general==='good'&&nNotes.some(n=>n.label==='hold'||n.label==='ugly')){general='hold';reason='The food/form is favorable, but a dose-sensitive nutrition factor makes this conditional.';}

    let finalLabel=general; let personalApplied=false;
    if(personal&&personal.status==='not_for_me'){finalLabel='ugly';personalApplied=true;reason='Personal hard stop: you previously marked this Not for Me.';evidence.unshift({kind:'personal history',label:'Not for me',reason:personal.reason||'Previously marked Not for Me.'});}
    else if(personal&&personal.status==='hold_on'&&general==='good'){finalLabel='hold';personalApplied=true;reason='General guidance is Good, but your personal status is Hold On.';evidence.unshift({kind:'personal history',label:'Hold On',reason:personal.reason||'Personal decision overrides clear permission.'});}
    else if(personal&&personal.status==='works_for_me'){evidence.unshift({kind:'personal history',label:'Works for me',reason:personal.reason||'Previously marked Works for Me; structural/general guidance remains visible separately.'});}

    return {
      label:LABELS[finalLabel],key:finalLabel,generalLabel:LABELS[general],generalKey:general,personalApplied,
      mainFood:main,evidence,reason,mode,missing:record.completeness.missing,source:record.source,rulesVersion:rules.version,
      product:record
    };
  }

  function makeDecision(record,status,options){
    options=options||{};
    if(!['works_for_me','hold_on','not_for_me'].includes(status))throw new Error('Invalid personal status');
    return {barcode:record.barcode,productName:record.productName,brand:record.brand,status,date:new Date().toISOString(),mode:options.mode==='Flare'?'Flare':'normal',reason:clean(options.reason)||null,timing:options.timing==='after_reaction'?'after_reaction':'before_eating',ingredientFlag:options.ingredientFlag||null};
  }

  return {RULE_VERSION,LABELS,normalizeOFF,normalizeUSDA,completeness,ingredientSegments,detectIngredientFamilies,detectPreparation,identifyMainFood,evaluate,makeDecision,containsAlias};
});
