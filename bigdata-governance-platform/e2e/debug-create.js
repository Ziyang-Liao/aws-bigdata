const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://BgpPla-BgpSe-evoV3iwr6pOV-467842334.us-east-1.elb.amazonaws.com";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/debug";
fs.mkdirSync(DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // 监听所有网络请求
  const requests = [];
  page.on("response", async (response) => {
    const url = response.url();
    if (url.includes("/api/datasources") && !url.includes("discover") && !url.includes("tables") && !url.includes("test")) {
      const status = response.status();
      let body = "";
      try { body = await response.text(); } catch {}
      requests.push({ url, status, body: body.slice(0, 500) });
      console.log(`  [API] ${response.request().method()} ${url.split("/api/")[1]} → ${status}`);
    }
  });

  // 监听控制台错误
  page.on("console", (msg) => {
    if (msg.type() === "error") console.log(`  [Console Error] ${msg.text().slice(0, 200)}`);
  });

  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.click('text=数据源管理');
  await page.waitForTimeout(2000);

  // 打开新建弹窗
  await page.click('text=新建数据源');
  await page.waitForTimeout(1000);

  // Step 1
  await page.fill('input[id$="name"]', '调试数据源');
  await page.getByRole('combobox', { name: /数据库类型/ }).click();
  await page.waitForTimeout(500);
  await page.getByTitle('MySQL').or(page.locator('.ant-select-item-option').filter({ hasText: 'MySQL' })).first().click();
  await page.waitForTimeout(500);

  // 下一步
  await page.click('text=下一步');
  await page.waitForTimeout(1000);

  // Step 2: 填写连接信息
  await page.fill('input[id$="host"]', 'bgp-source-mysql.cmjyssc8ul2m.us-east-1.rds.amazonaws.com');
  await page.fill('input[id$="port"]', '3306');
  await page.fill('input[id$="database"]', 'ecommerce');
  await page.fill('input[id$="username"]', 'admin');
  await page.fill('input[type="password"]', 'Test123!');

  console.log("\n=== 点击创建数据源 ===");
  // 精确点击 Modal footer 中的"创建数据源"按钮
  await page.locator('.ant-modal-footer button.ant-btn-primary').last().click();

  // 等待并观察
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(3000);
    const step3 = await page.locator('.ant-result-success').count();
    const step2 = await page.locator('text=测试连接').count();
    const saving = await page.locator('.ant-btn-loading').count();
    console.log(`  [${i*3}s] step3=${step3} step2=${step2} saving=${saving}`);
    if (step3 > 0) { console.log("  → Step 3 出现了！"); break; }
  }

  await page.screenshot({ path: path.join(DIR, "result.png"), fullPage: true });

  console.log("\n=== API 请求记录 ===");
  requests.forEach((r) => console.log(`  ${r.url.split("/api/")[1]} → ${r.status}: ${r.body.slice(0, 200)}`));

  await browser.close();
}

run().catch(e => console.error("Error:", e.message));
