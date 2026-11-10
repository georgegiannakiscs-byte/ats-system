const { chromium } = require('playwright');
const FIX = require('path').join(__dirname, 'fixtures'); const SHOTS = process.env.SHOTS;
(async () => {
  const B = process.env.B ?? 'http://localhost:3000'; const R = Math.random().toString(36).slice(2,7);
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('console', m => { if (m.type() === 'error' && !/404|403|401/.test(m.text())) errors.push('CONSOLE ' + m.text().slice(0, 200)); });
  const log = (...a) => console.log(...a);
  const shot = (n) => (SHOTS ? page.screenshot({ path: `${SHOTS}/${n}.png` }) : Promise.resolve());

  // 1. Sign up
  await page.goto(B + '/signup');
  await page.fill('#name', 'Giorgos Giannakis'); await page.fill('#email', `giorgos-${R}@deceler.test`); await page.fill('#password', 'a-strong-password-1');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL(/\/app$/); await page.waitForTimeout(500);
  log('1 signup ->', page.url(), '|', await page.getByText('Set up your first company').count());
  await shot('j1-empty');

  // 2. Super admin panel
  await page.goto(B + '/admin'); await page.waitForTimeout(800);
  log('2 admin overview:', await page.locator('h1').first().innerText());

  // 3. Company A onboarding
  const createCompany = async (name, logo, full) => {
    await page.goto(B + '/app/new'); await page.waitForTimeout(400);
    await page.getByLabel('Company name').fill(name + ' ' + R);
    await page.getByRole('button', { name: 'Create workspace' }).click();
    await page.getByRole('heading', { name: 'Company information' }).waitFor();
    if (full) {
      await page.getByLabel('Headquarters').fill('Athens, Greece');
      await page.getByLabel('About the company').fill(`${name} builds data products for retailers across Europe.`);
      await page.getByRole('button', { name: 'Save and continue' }).click();
    } else await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('heading', { name: 'Upload logo' }).waitFor();
    await page.setInputFiles('input[aria-label="Logo file"]', `${FIX}/${logo}`);
    await page.getByRole('img', { name: 'Company logo' }).waitFor();
    if (!full) return;
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('heading', { name: 'Branding' }).waitFor();
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await page.getByRole('heading', { name: 'Careers page' }).waitFor();
    await page.getByLabel('Introduction').fill('Small team, big impact. We value curiosity and clear thinking.');
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await page.getByRole('heading', { name: 'Invite your team' }).waitFor();
    await page.getByRole('button', { name: 'Skip' }).click();
    await page.getByRole('heading', { name: 'Recruitment pipeline' }).waitFor();
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await page.getByRole('heading', { name: 'First job' }).waitFor();
    await page.getByLabel('Job title').fill('Data Analyst');
    await page.getByLabel('Location').fill('Athens');
    await page.getByLabel('Short description').fill('Turn retail data into decisions. You will work with SQL, Python and GA4.');
    await page.getByRole('button', { name: 'Create job' }).click();
    await page.getByRole('heading', { name: 'Publish' }).waitFor();
    await page.getByRole('button', { name: 'Publish now' }).click();
    await page.getByText('Live on your careers page').waitFor();
    await shot('j3-published');
    await page.getByRole('button', { name: 'Go to dashboard' }).click();
    await page.waitForURL(/dashboard/);
  };
  await createCompany('Aegean Analytics', 'logo-a.png', true);
  await page.waitForTimeout(800);
  log('3 company A dashboard:', page.url());
  await shot('j3-dashboard-a');

  // 4. Company B with a different logo (minimal onboarding)
  await createCompany('Olive Studio', 'logo-b.png', false);
  await page.goto(B + '/app/olive-studio-' + R + '/dashboard'); await page.waitForTimeout(800);
  log('4 company B dashboard:', page.url(), '| jobs in B:', (await page.goto(B + '/app/olive-studio-' + R + '/jobs'), await page.waitForTimeout(600), await page.locator('tbody tr').count()));

  // 5. Switch to A through the switcher
  await page.getByRole('button', { name: 'Switch company' }).click();
  await page.waitForTimeout(300);
  await shot('j5-switcher');
  await page.getByRole('button', { name: /Aegean Analytics/ }).click();
  await page.waitForURL(/aegean-analytics-[a-z0-9]+\/dashboard/); await page.waitForTimeout(800);
  await page.goto(B + '/app/aegean-analytics-' + R + '/jobs'); await page.waitForTimeout(700);
  log('5 jobs in A:', await page.locator('tbody tr').count());

  // 6. Public careers page + 3-field application
  const cand = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const cp = await cand.newPage();
  await cp.goto(B + '/careers/aegean-analytics-' + R + '?utm_source=linkedin'); await cp.waitForTimeout(500);
  SHOTS && await cp.screenshot({ path: `${SHOTS}/j6-careers-mobile.png` });
  await cp.getByRole('link', { name: /Data Analyst/ }).click(); await cp.waitForURL(/data-analyst/); await cp.waitForTimeout(500);
  const jobUrl = cp.url();
  await cp.goto(jobUrl.includes('utm_source') ? jobUrl : jobUrl + '&utm_source=linkedin'); await cp.waitForTimeout(500);
  await cp.locator('#apply').scrollIntoViewIfNeeded();
  await cp.getByRole('button', { name: 'Submit application' }).click();
  log('6 empty submit errors:', await cp.locator('[role=alert]').allInnerTexts());
  await cp.fill('#f-fullName', 'Eleni Georgiou'); await cp.fill('#f-email', 'eleni@example.com');
  await cp.setInputFiles('#f-cv', `${FIX}/cv.pdf`);
  SHOTS && await cp.screenshot({ path: `${SHOTS}/j6-form-mobile.png` });
  await cp.getByRole('button', { name: 'Submit application' }).click();
  await cp.getByText('Application received').waitFor({ timeout: 15000 });
  SHOTS && await cp.screenshot({ path: `${SHOTS}/j6-success-mobile.png` });
  log('6 application:', await cp.getByText('Reference').innerText());

  // 7. Recruiter reviews candidate in A
  await page.goto(B + '/app/aegean-analytics-' + R + '/candidates'); await page.waitForTimeout(900);
  log('7 candidates in A:', await page.locator('tbody tr').count(), '|', await page.locator('tbody tr').first().innerText().catch(() => ''));
  await page.locator('tbody tr').first().getByRole('button').first().click(); await page.waitForTimeout(700);
  await page.getByRole('tab', { name: /CV/ }).click(); await page.waitForTimeout(1500);
  log('7 CV iframe:', await page.locator('iframe[title^="CV"]').count());
  await shot('j7-cv');
  await page.getByRole('tab', { name: 'Overview' }).click();
  await page.getByRole('button', { name: 'Edit phone' }).click();
  await page.getByLabel('phone').fill('+30 210 000 0000'); await page.keyboard.press('Enter'); await page.waitForTimeout(800);
  await page.keyboard.press('Escape');

  // 8. Pipeline move via keyboard drag and persistence
  await page.goto(B + '/app/aegean-analytics-' + R + '/jobs'); await page.waitForTimeout(600);
  await page.locator('tbody tr').first().click(); await page.waitForTimeout(1000);
  const card = page.locator('[aria-roledescription="Draggable candidate"]').first();
  await card.focus(); await page.keyboard.press('Space'); await page.waitForTimeout(200);
  for (let i = 0; i < 2; i++) { await page.keyboard.press('ArrowRight'); await page.waitForTimeout(250); }
  await page.keyboard.press('Space'); await page.waitForTimeout(1200);
  await page.reload(); await page.waitForTimeout(1200);
  log('8 HR Interview after reload:', await page.locator('section[aria-label^="HR Interview"]').getAttribute('aria-label'));
  await shot('j8-pipeline');

  // phone persisted?
  await page.goto(B + '/app/aegean-analytics-' + R + '/candidates'); await page.waitForTimeout(800);
  await page.locator('tbody tr').first().getByRole('button').first().click(); await page.waitForTimeout(700);
  log('7b phone persisted:', await page.getByText('+30 210 000 0000').count());

  log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
