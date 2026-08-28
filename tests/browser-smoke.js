const { chromium }=require('playwright');
const assert=require('assert');

const BASE='http://127.0.0.1:4173/';
const CODE='012345678905';
const completeOFF={status:1,product:{code:CODE,product_name:'Plain Chicken Breast',brands:'Fixture Foods',categories:'lean protein',ingredients_text:'chicken breast',serving_size:'100 g',serving_quantity:100,quantity:'200 g',product_quantity:200,last_modified_t:1787900000,nutriments:{'energy-kcal_serving':120,'energy-kcal_100g':120,fat_serving:2,fat_100g:2,fat_unit:'g',proteins_serving:24,proteins_100g:24,proteins_unit:'g',sodium_serving:.08,sodium_100g:.08,sodium_unit:'g'}}};
const incompleteOFF={status:1,product:{code:'000111222333',product_name:'Peeled Soft Cooked Potatoes',brands:'Fixture Foods',categories:'potatoes',ingredients_text:'potatoes',serving_size:'100 g',serving_quantity:100,nutriments:{}}};
const usdaComplete={ok:true,foods:[{gtinUpc:'000111222333',description:'PEELED SOFT COOKED POTATOES',brandName:'USDA Fixture',ingredients:'POTATOES',servingSize:100,servingSizeUnit:'g',householdServingFullText:'100 g',foodNutrients:[{nutrient:{name:'Energy',unitName:'kcal'},amount:80},{nutrient:{name:'Total lipid (fat)',unitName:'g'},amount:.2},{nutrient:{name:'Protein',unitName:'g'},amount:2}]}]};

async function openApp(browser,viewport){
  const context=await browser.newContext({viewport,permissions:['camera']});
  const page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(BASE,{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.bottom-nav');
  return {context,page,errors};
}
async function goScan(page){await page.locator('[data-tab="scan"]').click();await page.waitForSelector('.bbb-scanner-panel');}
async function lookup(page,code){await page.locator('#bbbBarcodeInput').fill(code);await page.locator('[data-bbb-scan="lookup"]').click();await page.waitForSelector('.bbb-live-result');}

(async()=>{
  const browser=await chromium.launch({headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  try{
    // Mobile baseline + OFF success + persistence/cache.
    {
      const {context,page,errors}=await openApp(browser,{width:390,height:844});
      let offCalls=0,usdaCalls=0;
      await page.route('https://world.openfoodfacts.org/**',route=>{offCalls++;route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(completeOFF)});});
      await page.route('https://bad-belly-usda.phshbone.workers.dev/**',route=>{usdaCalls++;route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,foods:[]})});});
      await goScan(page);
      assert.strictEqual(await page.locator('.bbb-rule-pill').innerText(),'rules v1.5.1');
      await lookup(page,CODE);
      assert.strictEqual(await page.locator('.bbb-label').innerText(),'GOOD');
      assert.ok((await page.locator('.bbb-scanner-panel').innerText()).includes('Product facts retrieved from Open Food Facts.'),'visible status must identify Open Food Facts');
      assert.strictEqual(offCalls,1);assert.strictEqual(usdaCalls,0);
      await page.locator('[data-bbb-scan="decision"][data-status="not_for_me"]').click();
      await page.waitForFunction(()=>document.querySelector('.bbb-label')?.textContent==='UGLY');
      await page.reload({waitUntil:'domcontentloaded'});await goScan(page);
      offCalls=0;usdaCalls=0;await lookup(page,CODE);
      assert.strictEqual(await page.locator('.bbb-label').innerText(),'UGLY','personal Not for Me must survive reload');
      assert.strictEqual(offCalls,0,'repeat scan should use local cache before OFF');assert.strictEqual(usdaCalls,0,'repeat scan should not hit USDA');
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);
      assert.ok(overflow<=1,'mobile page must not horizontally overflow');
      assert.deepStrictEqual(errors,[],'mobile page errors: '+errors.join('; '));
      await context.close();
    }

    // OFF incomplete -> USDA fallback, merged facts, preparation Good.
    {
      const {context,page,errors}=await openApp(browser,{width:390,height:844});
      await page.route('https://world.openfoodfacts.org/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(incompleteOFF)}));
      await page.route('https://bad-belly-usda.phshbone.workers.dev/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(usdaComplete)}));
      await goScan(page);await lookup(page,'000111222333');
      const panelText=await page.locator('.bbb-scanner-panel').innerText();
      assert.ok(panelText.includes('Product facts retrieved from Open Food Facts + USDA fallback.'),'combined source must be honest and visible');
      assert.strictEqual(await page.locator('.bbb-label').innerText(),'GOOD');
      assert.deepStrictEqual(errors,[]);
      await context.close();
    }

    // Incomplete nutrition -> Hold On.
    {
      const {context,page}=await openApp(browser,{width:390,height:844});
      const p={status:1,product:{code:'333333333333',product_name:'Plain Chicken Breast',brands:'Fixture',categories:'lean protein',ingredients_text:'chicken breast',serving_size:'100 g',serving_quantity:100,nutriments:{}}};
      await page.route('https://world.openfoodfacts.org/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(p)}));
      await page.route('https://bad-belly-usda.phshbone.workers.dev/**',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,foods:[]})}));
      await goScan(page);await lookup(page,'333333333333');
      assert.strictEqual(await page.locator('.bbb-label').innerText(),'HOLD ON');
      assert.ok((await page.locator('.bbb-live-result').innerText()).includes('nutrition facts'));
      await context.close();
    }

    // Missing product + network failure must not show false success.
    {
      const {context,page}=await openApp(browser,{width:390,height:844});
      await page.route('https://world.openfoodfacts.org/**',route=>route.abort());
      await page.route('https://bad-belly-usda.phshbone.workers.dev/**',route=>route.abort());
      await goScan(page);await lookup(page,'999999999999');
      assert.strictEqual(await page.locator('.bbb-label').innerText(),'HOLD ON');
      assert.ok(/failed|missing|no product/i.test(await page.locator('.bbb-scanner-panel').innerText()));
      await context.close();
    }

    // Camera permission/overlay path: stub decoder but exercise actual getUserMedia-facing UI path.
    {
      const {context,page}=await openApp(browser,{width:390,height:844});
      await page.route('https://unpkg.com/@zxing/browser@latest',route=>route.fulfill({status:200,contentType:'application/javascript',body:`window.ZXingBrowser={BrowserMultiFormatReader:class{async decodeFromConstraints(c,v,cb){const s=await navigator.mediaDevices.getUserMedia(c);v.srcObject=s;return {stop(){s.getTracks().forEach(t=>t.stop())}}}}};`}));
      await goScan(page);await page.locator('[data-bbb-scan="camera"]').click();
      await page.waitForFunction(()=>document.getElementById('bbbBarcodeOverlay')?.classList.contains('active'));
      assert.ok(/hold the barcode|opening/i.test(await page.locator('#bbbBarcodeCameraStatus').innerText()));
      await page.locator('[data-bbb-scan="close-camera"]').click();
      await context.close();
    }

    // Desktop regression: navigation, Flare, scan surface, overflow.
    {
      const {context,page,errors}=await openApp(browser,{width:1280,height:800});
      await page.locator('[data-tab="flare"]').click();
      const flareButton=page.locator('[data-mode="Flare"]');if(await flareButton.count())await flareButton.click();
      await goScan(page);
      assert.ok(await page.locator('.bbb-scanner-panel').isVisible());
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-window.innerWidth);assert.ok(overflow<=1,'desktop must not horizontally overflow');
      assert.deepStrictEqual(errors,[]);
      await context.close();
    }

    console.log('browser smoke tests passed');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
