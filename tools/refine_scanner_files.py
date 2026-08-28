from pathlib import Path
import json

root = Path('.')


def replace_once(path, old, new, marker=None):
    p = root / path
    text = p.read_text(encoding='utf-8')
    if marker and marker in text:
        print(f'{path}: refinement already present')
        return False
    if old not in text:
        raise SystemExit(f'{path}: expected source text not found')
    p.write_text(text.replace(old, new, 1), encoding='utf-8')
    print(f'{path}: refined')
    return True

# Open Food Facts sodium fields are grams; canonical display uses mg.
p = root / 'bbb-scanner-engine.js'
text = p.read_text(encoding='utf-8')
if "if(out==='sodium')" not in text:
    old = "for(const [out,key] of Object.entries(fields)){per100g[out]=num(n[`${key}_100g`]);perServing[out]=num(n[`${key}_serving`]);}"
    new = "for(const [out,key] of Object.entries(fields)){per100g[out]=num(n[`${key}_100g`]);perServing[out]=num(n[`${key}_serving`]);if(out==='sodium'){if(per100g[out]!=null)per100g[out]*=1000;if(perServing[out]!=null)perServing[out]*=1000;}}"
    if old not in text:
        raise SystemExit('engine: OFF nutrient normalization target not found')
    text = text.replace(old, new, 1)

# USDA householdServingFullText is a serving description, not servings/container.
if 'function normalizeUSDAServing(food)' not in text:
    anchor = "  function normalizeUSDA(food,barcode){\n"
    helper = "  function normalizeUSDAServing(food){\n    const metric=clean([food.servingSize,food.servingSizeUnit].filter(v=>v!=null&&v!=='').join(' '));\n    const household=clean(food.householdServingFullText);\n    const size=household&&metric?`${household} (${metric})`:(household||metric);\n    const servingsPerContainer=food.numberOfServings!=null?clean(food.numberOfServings):'';\n    return {size,servingsPerContainer};\n  }\n\n"
    if anchor not in text:
        raise SystemExit('engine: normalizeUSDA anchor not found')
    text = text.replace(anchor, helper + anchor, 1)
    old = "serving:{size:clean([food.servingSize,food.servingSizeUnit].filter(v=>v!=null&&v!=='').join(' ')),servingsPerContainer:clean(food.householdServingFullText||food.numberOfServings)}"
    new = "serving:normalizeUSDAServing(food)"
    if old not in text:
        raise SystemExit('engine: USDA serving target not found')
    text = text.replace(old, new, 1)

p.write_text(text, encoding='utf-8')
print('bbb-scanner-engine.js: refined')

# Expand structural whole-nut and visible-onion terms without matching nut butters/powders.
rules_path = root / 'bbb-rules-v1.5.2.json'
rules = json.loads(rules_path.read_text(encoding='utf-8'))
whole_nut_terms = ['peanuts','almonds','walnuts','pecans','cashews','pistachios','hazelnuts']
for entry in rules.get('structuralDont', []):
    if entry.get('id') == 'whole_nuts':
        entry['terms'] = list(dict.fromkeys(entry.get('terms', []) + whole_nut_terms))
for family in rules.get('formFamilies', []):
    if family.get('id') == 'nut_forms':
        for form in family.get('forms', []):
            if form.get('name') == 'whole':
                form['terms'] = list(dict.fromkeys(form.get('terms', []) + whole_nut_terms))
    if family.get('id') == 'onion_forms':
        for form in family.get('forms', []):
            if form.get('name') == 'whole_visible':
                form['terms'] = list(dict.fromkeys(form.get('terms', []) + ['onions']))
rules_path.write_text(json.dumps(rules, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')
print('bbb-rules-v1.5.2.json: refined')

# Keep internal CSS key "ehh" for compatibility, but eliminate visible Ehh verdict wording.
adapter = root / 'bbb-v2-scanner-adapter.js'
text = adapter.read_text(encoding='utf-8')
if 'BBB HOLD ON DISPLAY OVERRIDES' not in text:
    marker = "function install(){\n"
    override = "function installHoldOnDisplayOverrides(){\n  /* BBB HOLD ON DISPLAY OVERRIDES: retain legacy CSS key `ehh`, never show Ehh as a food verdict. */\n  if(typeof getRatingLabel==='function') getRatingLabel=function(rating){if(rating==='Green')return 'good';if(rating==='Red')return 'ugly';return 'hold on';};\n  if(typeof ratingPill==='function') ratingPill=function(value){const key=getRatingKey(value);const label=key==='good'?'good':key==='ugly'?'ugly':'hold on';return `<button class=\"rating-pill rating-${key}\" data-action=\"rating-info\" data-rating=\"${key}\" type=\"button\" aria-label=\"${label} rating explanation\">${label}</button>`;};\n  if(typeof foodPanel==='function') foodPanel=function(icon,title,foods){const visible=title==='ehh'?'hold on':title;return `<article class=\"food-panel food-panel-${e(title)}\"><div class=\"food-panel-title\"><span class=\"icon\">${icon}</span><h3>${e(visible)}</h3></div><ul>${foods.map(food=>`<li>${e(food)}</li>`).join('')}</ul></article>`;};\n  if(typeof infoToast==='function'){const original=infoToast;infoToast=function(){if(state.infoTopic==='rating-ehh')return `<div class=\"info-toast\" role=\"status\"><button data-action=\"close-info\" type=\"button\" aria-label=\"Close explanation\">×</button><strong>hold on</strong><p>Hold On is a decision state for mixed, conditional, incomplete, or uncertain information. It is not a medium numeric risk score and does not mean a small portion is automatically safe.</p></div>`;return original();};}\n}\n\n"
    if marker not in text:
        raise SystemExit('adapter: install anchor not found')
    text = text.replace(marker, override + marker, 1)
    old = "  const originalScanScreen=scanScreen;scanScreen=function(){return resultView()||originalScanScreen();};"
    new = "  installHoldOnDisplayOverrides();\n  const originalScanScreen=scanScreen;scanScreen=function(){return resultView()||originalScanScreen();};"
    if old not in text:
        raise SystemExit('adapter: install body target not found')
    text = text.replace(old, new, 1)
adapter.write_text(text, encoding='utf-8')
print('bbb-v2-scanner-adapter.js: refined')

# Extend locked regression cases.
test = root / 'tests/scanner-engine-smoke.test.js'
text = test.read_text(encoding='utf-8')
if "Almond Snack" not in text:
    insertion = "assert.equal(verdict(rec('Almond Snack', 'almonds, salt')), 'UGLY');\nassert.equal(verdict(rec('Onion Roll', 'wheat flour, onions, salt')), 'UGLY');\n"
    target = "assert.equal(verdict(rec('Jasmine Rice', 'jasmine rice'), 'normal', { status: 'not_for_me', date: '2026-08-01T00:00:00Z', reason: 'reaction' }), 'UGLY');\n"
    if target not in text:
        raise SystemExit('rules test insertion target not found')
    text = text.replace(target, target + insertion, 1)
    text = text.replace("PASS: 15 locked scanner/rules regression tests", "PASS: 17 locked scanner/rules regression tests")
test.write_text(text, encoding='utf-8')
print('tests/scanner-engine-smoke.test.js: refined')

# Add explicit sodium/unit and USDA serving assertions.
test = root / 'tests/product-retrieval-smoke.test.js'
text = test.read_text(encoding='utf-8')
text = text.replace("assert.equal(r.serving.size,'100 g');assert.equal(r.sources.length,2);assert.equal(r.completeness.essentialComplete,true);", "assert.equal(r.serving.size,'1 serving (100 g)');assert.equal(r.serving.servingsPerContainer,'');assert.equal(r.sources.length,2);assert.equal(r.completeness.essentialComplete,true);")
if "offSodium" not in text:
    target = "assert.equal(r.sources[0].name,'Open Food Facts');assert.equal(r.retrieval.attempts.length,1);assert.equal(calls.length,1);\n"
    replacement = target + "    const offSodium=E.normalizeOFF({code:'salt',product_name:'Salt Test',ingredients_text:'salt',serving_size:'1 g',nutriments:{'sodium_100g':1}},'salt');assert.equal(offSodium.nutrition.per100g.sodium,1000);\n"
    if target not in text:
        raise SystemExit('retrieval sodium test target not found')
    text = text.replace(target, replacement, 1)
test.write_text(text, encoding='utf-8')
print('tests/product-retrieval-smoke.test.js: refined')
