const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { chromium, devices } = require('playwright');
const calculate = require('../public/quote.js');

const [url, prefix = ''] = process.argv.slice(2);
const money = value => new Intl.NumberFormat('en-ZA', {style:'currency', currency:'ZAR'}).format(value);
const normalized = text => text.replace(/\s/g, '');

async function verify(browser, name, options) {
  const context = await browser.newContext({ ...options, reducedMotion:'reduce' });
  try {
    const page = await context.newPage();
    if (url.startsWith('http:')) {
      await page.route('**/api/enquiries', route => route.fulfill({json:{available:false}}));
    }
    const errors = [];
    const failed = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
    const response = await page.goto(url);
    assert.equal(response.status(), 200);
    if (url.startsWith('https:')) {
      const headers = response.headers();
      assert.match(headers['content-security-policy'], /frame-ancestors 'none'/);
      assert.equal(headers['x-content-type-options'], 'nosniff');
    }
    assert.match(await page.locator('h1').innerText(), /INTELLIGENT MOVEMENT/);
    assert.equal(await page.locator('a[href*="hatchable"]').count(), 0);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator(':focus').innerText(), 'Skip to content');

    const destination = page.getByLabel('Delivery city');
    await destination.selectOption('Bethlehem');
    assert.equal(await destination.evaluate(element => element.validity.customError), true);
    await destination.selectOption('Durban');
    assert.equal(await destination.evaluate(element => element.validity.valid), true);
    assert.match(await page.locator('#directions').getAttribute('href'), /destination=Durban/);
    assert.equal(await page.locator('#markers circle').count(), 2);
    await page.getByLabel('Road distance (km)').fill('248');
    await page.getByLabel('Gross cargo mass (kg)').fill('29000');
    await page.getByLabel('Standard pallets', {exact:false}).fill('28');
    await page.getByRole('button', {name:'Calculate estimate'}).click();
    const estimate = await page.locator('#result').innerText();
    assert.ok(normalized(estimate).includes(normalized(money(15737.75))));
    assert.match(await page.locator('#load-note').innerText(), /Superlink.*3.?000 kg under/);
    assert.equal(await page.locator('#load .filled').count(), 28);
    await page.getByLabel('Gross cargo mass (kg)').fill('35000');
    assert.equal(await page.locator('#result-card').isHidden(), true);
    await page.getByRole('button', {name:'Calculate estimate'}).click();
    assert.match(await page.locator('#load-note').innerText(), /Example limits exceeded/);
    await page.getByLabel('Gross cargo mass (kg)').fill('29000');
    await page.getByRole('button', {name:'Calculate estimate'}).click();
    await page.locator('#trailer').selectOption('reefer');
    assert.match(await page.locator('#trailer-name').innerText(), /Refrigerated/);
    await page.locator('#trailer-enquiry').click();
    await page.getByLabel('Enquiry type').selectOption('Backhaul enquiry');
    await page.getByLabel('Company', {exact:true}).fill('Browser test company');
    await page.getByLabel('Collection and delivery addresses', {exact:false}).fill('Illustrative cargo only');
    if (url.startsWith('https:')) {
      const request = context.request;
      const intake = new URL('api/enquiries',url).href;
      const relay = await request.get(new URL('api/enquiry-relay',url).href);
      assert.equal(relay.status(), 401);
      assert.equal((await request.post(intake,{data:{}})).status(), 403);
      assert.equal((await request.post(intake,{headers:{Origin:new URL(url).origin},data:{}})).status(), 400);
      await page.getByRole('button',{name:'Send enquiry'}).waitFor();
      if (/nexus-(commercial-integration|infinity)/.test(url) && name === 'desktop') {
        await page.getByLabel('Reply email').fill('enquiry-test@example.invalid');
        await page.getByLabel('I agree that Mimelchlo Logistics', {exact:false}).check();
        await page.getByRole('button',{name:'Send enquiry'}).click();
        await page.waitForFunction(() => document.querySelector('#brief-status').textContent.startsWith('Enquiry received.'));
        const receipt = await page.locator('#brief-status').innerText();
        await page.getByRole('button',{name:'Send enquiry'}).click();
        await page.waitForFunction(text => document.querySelector('#brief-status').textContent === text, receipt);
        await page.getByLabel('Reply email').clear();
        await page.getByLabel('I agree that Mimelchlo Logistics', {exact:false}).uncheck();
      }
    }
    const downloadEvent = page.waitForEvent('download');
    await page.getByRole('button', {name:'Download enquiry draft'}).click();
    const download = await downloadEvent;
    const draft = await readFile(await download.path(), 'utf8');
    assert.match(draft, /Backhaul enquiry/);
    assert.match(draft, /Requested configuration · Refrigerated trailer/);
    assert.match(draft, /Bethlehem → Durban/);
    await page.getByLabel('What do you need help with?').selectOption('docs');
    assert.match(await page.locator('#guidance').innerText(), /packing list/);
    if (url.startsWith('https:')) {
      for (const path of ['routing','concierge','account?status=1']) {
        const provider = await context.request.get(new URL('api/'+path,url).href);
        assert.equal(provider.status(),200);
        assert.equal(typeof (await provider.json()).available,'boolean');
        const rejected = await context.request.post(new URL('api/'+path,url).href,{data:{}});
        assert.equal(rejected.status(),403);
      }
    }
    if (url.startsWith('https:')) {
      const availability = await context.request.get(new URL('api/account?status=1',url).href);
      if (!(await availability.json()).available) {
        const portal = await context.newPage();
        await portal.goto(new URL('account/?lang=af',url).href);
        await portal.getByText(/Aanlyn rekeningtoegang is tans nie beskikbaar nie/).waitFor();
        assert.equal(await portal.locator('html').getAttribute('lang'),'af-ZA');
        await portal.close();
      }
    }
    const lowData = page.getByRole('button', {name:'Low data'});
    await lowData.click();
    assert.equal(await lowData.getAttribute('aria-pressed'), 'true');
    await lowData.click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({path:'evidence/' + prefix + name + '.png', fullPage:true});
    await page.getByRole('link', {name:'Afrikaans'}).click();
    assert.equal(await page.locator('html').getAttribute('lang'), 'af-ZA');
    assert.match(await page.locator('h1').innerText(), /SLIM VERVOER/);
    await page.locator('#trailer option').first().waitFor({state:'attached'});
    await page.getByLabel('Vragsoort').selectOption('temperature');
    assert.match(await page.locator('#guidance').innerText(), /Lys bruto massa/);
    assert.match(await page.locator('#trailer-name').innerText(), /Gordynsleepwa/);
    assert.equal(await page.locator('#brief [name=kind]').inputValue(), 'Spot quotation');
    await page.getByLabel('Padroeteafstand (km)').fill('248');
    await page.getByLabel('Bruto vragmassa (kg)').fill('20000');
    await page.getByRole('button', {name:'Bereken raming'}).click();
    assert.match(await page.locator('#result').innerText(), /Beraamde totaal/);
    await page.goto(url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload({waitUntil:'domcontentloaded'});
    assert.equal(await page.locator('#trailer option').count(), 6);
    assert.deepEqual(errors, []);
    assert.deepEqual(failed, []);
    console.log(name + ' browser workflow passed for ' + url);
  } finally {
    await context.close();
  }
}

async function run() {
  assert.deepEqual(calculate(248,45,1840,685), {base:1116000, subtotal:1368500, vat:205275, total:1573775});
  const browser = await chromium.launch();
  try {
    await verify(browser, 'desktop', {viewport:{width:1440,height:1000}});
    await verify(browser, 'mobile', devices['Pixel 7']);
  } finally {
    await browser.close();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
