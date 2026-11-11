import { chromium } from 'playwright';
import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';

const BACKEND_PORT = 8001;
const FRONTEND_PORT = 3001;
const EVIDENCE_DIR = path.resolve('evidence');

if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok || res.status === 404 || res.status === 200) {
        return true;
      }
    } catch (e) {
      // wait and retry
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server at ${url} did not respond within ${timeoutMs}ms`);
}

function killProc(proc) {
  if (!proc || !proc.pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${proc.pid} /T /F`, { stdio: 'ignore' });
    } else {
      proc.kill('SIGKILL');
    }
  } catch {}
}

async function run() {
  console.log('[*] Phase 2 Frontend E2E Acceptance Test Starting...');

  // 1. Start FastAPI backend on 8001
  console.log(`[*] Starting Backend on http://127.0.0.1:${BACKEND_PORT}...`);
  const pythonPath = 'C:\\Users\\admin\\miniconda3\\envs\\ocr\\python.exe';
  const backendProc = spawn(pythonPath, [
    '-m', 'uvicorn', 'app.main:app',
    '--host', '127.0.0.1',
    '--port', String(BACKEND_PORT),
    '--app-dir', 'backend'
  ], {
    cwd: path.resolve('.'),
    env: { ...process.env, DATABASE_URL: 'sqlite:///./ocrplatform.db' }
  });

  // 2. Start Vite frontend on 3001
  console.log(`[*] Starting Vite Frontend on http://localhost:${FRONTEND_PORT}...`);
  const frontendProc = spawn('npx.cmd', [
    'vite', '--port', String(FRONTEND_PORT)
  ], {
    cwd: path.resolve('.'),
    shell: true,
    env: {
      ...process.env,
      PORT: String(FRONTEND_PORT),
      BACKEND_PORT: String(BACKEND_PORT)
    }
  });

  try {
    await waitForServer(`http://127.0.0.1:${BACKEND_PORT}/api/v1/ocr-services`);
    console.log('[+] Backend is online and responsive!');

    await waitForServer(`http://localhost:${FRONTEND_PORT}/`);
    console.log('[+] Frontend is online and responsive!');

    // 3. Launch Playwright
    console.log('[*] Launching Chromium browser...');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      ignoreHTTPSErrors: true,
    });
    const page = await context.newPage();

    const testEmail = `e2e_customer_${Date.now()}@testcorp.io`;
    const testPassword = 'SecurePassword@2026';
    const testFullName = 'Alexander Pierce';

    // --- STEP 1: Registration ---
    console.log('[1/8] Testing Registration Page...');
    await page.goto(`http://localhost:${FRONTEND_PORT}/register`);
    await page.waitForSelector('form');

    await page.fill('input[type="text"][placeholder*="John"]', testFullName);
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.fill('input[placeholder*="Acme"]', 'Pierce Automation Group');
    await page.fill('input[type="tel"]', '+1 (555) 777-9922');

    await page.click('button[type="submit"]');

    // Wait for redirect to dashboard
    await page.waitForURL(`**/app/dashboard`, { timeout: 10000 });
    console.log('[+] Registration succeeded, redirected to /app/dashboard');
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'step1_registered_dashboard.png') });

    // --- STEP 2: Browse Marketplace ---
    console.log('[2/8] Testing OCR Marketplace...');
    await page.goto(`http://localhost:${FRONTEND_PORT}/app/marketplace`);
    await page.waitForSelector('h1:has-text("OCR Service Marketplace")');
    await page.waitForTimeout(1000);
    console.log('[+] Marketplace services loaded successfully');
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'step2_marketplace.png') });

    // --- STEP 3: Select Service & Package ---
    console.log('[3/8] Testing Service Details & Package Selection...');
    const exploreBtn = await page.waitForSelector('button:has-text("View Details")');
    await exploreBtn.click();

    await page.waitForSelector('h1');
    await page.waitForTimeout(800);
    console.log('[+] Service detail page opened');
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'step3_service_detail.png') });

    // Switch to Pricing & Packages tab
    const pricingTab = await page.$('button:has-text("Pricing & Packages")');
    if (pricingTab) {
      await pricingTab.click();
      await page.waitForTimeout(500);
    }

    // --- STEP 4: Checkout ---
    console.log('[4/8] Testing Checkout & Payment Simulation...');
    const subscribeBtn = await page.waitForSelector('button:has-text("Subscribe & Activate")');
    await subscribeBtn.click();

    // Verify Checkout Modal
    await page.waitForSelector('div:has-text("Confirm Package Subscription")');
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'step4_checkout_modal.png') });

    // Confirm Checkout
    const completeBtn = await page.waitForSelector('button:has-text("Complete Order")');
    await completeBtn.click();

    // Wait for checkout result
    await page.waitForSelector('div:has-text("Subscription Activated!"), div:has-text("Welcome to")');
    console.log('[+] Checkout succeeded, automatic license provisioned!');
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'step5_checkout_success.png') });

    // --- STEP 5: My Licenses ---
    console.log('[5/8] Navigating to My Licenses...');
    const myLicensesBtn = await page.$('button:has-text("Go to My Licenses")');
    if (myLicensesBtn) {
      await myLicensesBtn.click();
    } else {
      await page.goto(`http://localhost:${FRONTEND_PORT}/app/licenses`);
    }

    await page.waitForURL(`**/app/licenses`, { timeout: 10000 });
    await page.waitForSelector('h1:has-text("API Licenses & Keys")');
    await page.waitForTimeout(1000);
    console.log('[+] My Licenses view loaded');
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'step6_my_licenses.png') });

    // --- STEP 6: API Credential Generation ---
    console.log('[6/8] Testing API Credential Generation on Issued License...');
    // Click "Details" button on the first license row
    const detailsBtn = await page.waitForSelector('button:has-text("Details")');
    await detailsBtn.click();

    // In modal, click "API Credentials" tab
    const credsTab = await page.waitForSelector('button:has-text("API Credentials")');
    await credsTab.click();
    await page.waitForTimeout(500);

    // Fill credential name
    await page.fill('input[placeholder*="Credential Name"]', 'Production Cluster Alpha');
    await page.click('button:has-text("Generate API Key")');

    // Wait for generated key callout
    await page.waitForSelector('div:has-text("New API Secret Generated Successfully!")');
    console.log('[+] API Credential generated successfully with single-exposure secret!');
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'step7_api_credential_generated.png') });

    // --- STEP 7: Revoke API Credential ---
    console.log('[7/8] Testing API Credential Revocation...');
    const revokeBtn = await page.waitForSelector('button:has-text("Revoke")');
    await revokeBtn.click();
    await page.waitForTimeout(800);

    // Verify revoked badge
    await page.waitForSelector('span:has-text("Revoked")');
    console.log('[+] API Credential revocation verified');
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'step8_api_credential_revoked.png') });

    // Close modal
    await page.click('button:has-text("Close")');
    await page.waitForTimeout(400);

    // --- STEP 8: My Subscriptions ---
    console.log('[8/8] Testing My Subscriptions View...');
    await page.goto(`http://localhost:${FRONTEND_PORT}/app/subscriptions`);
    await page.waitForSelector('h1:has-text("My Subscriptions"), h1:has-text("Active Subscriptions")');
    await page.waitForTimeout(1000);
    console.log('[+] My Subscriptions view verified');
    await page.screenshot({ path: path.join(EVIDENCE_DIR, 'step9_my_subscriptions.png') });

    await browser.close();

    console.log('\n======================================================');
    console.log('✅ ALL FRONTEND PLAYWRIGHT E2E ACCEPTANCE TESTS PASSED!');
    console.log(`📸 Screenshots saved to: ${EVIDENCE_DIR}`);
    console.log('======================================================\n');
  } finally {
    console.log('[*] Tearing down test servers...');
    killProc(backendProc);
    killProc(frontendProc);
  }
}

run().then(() => {
  process.exit(0);
}).catch((e) => {
  console.error('❌ E2E Acceptance Test Failed:', e);
  process.exit(1);
});
