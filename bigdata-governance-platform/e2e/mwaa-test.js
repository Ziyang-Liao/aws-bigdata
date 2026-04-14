const { chromium } = require("playwright");
const BASE = "https://d3ij8mfefb4usj.cloudfront.net";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/mwaa-test";
const fs = require("fs"); const path = require("path");
fs.mkdirSync(DIR, { recursive: true });
let s = 0;
async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = async (n) => { s++; await page.screenshot({ path: path.join(DIR, `${String(s).padStart(2,"0")}-${n}.png`), fullPage: true }); };
  const w = (ms) => page.waitForTimeout(ms);

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  console.log("首页加载 ✅");

  // ETL 编排
  console.log("\n=== ETL 发布 + 触发 ===");
  await page.click('text=ETL 编排'); await w(2000);
  await shot("etl-list");
  const wfCount = await page.locator('.ant-table-row').count();
  console.log(`  工作流: ${wfCount} 条`);

  if (wfCount > 0) {
    // 发布
    await page.locator('.ant-table-row').first().locator('text=发布').click();
    await w(3000);
    await shot("publish-result");
    const pubMsg = await page.locator('.ant-message-notice-content').textContent().catch(() => "");
    console.log(`  发布: ${pubMsg}`);

    await w(2000);

    // 触发
    await page.locator('.ant-table-row').first().locator('text=触发').click();
    await w(5000);
    await shot("trigger-result");
    const trigMsg = await page.locator('.ant-message-notice-content').textContent().catch(() => "");
    console.log(`  触发: ${trigMsg}`);

    // 进入 DAG 编辑器看运行历史
    await page.locator('.ant-table-row').first().locator('a:has-text("编辑")').first().click();
    await w(3000);
    await page.locator('.ant-tabs-tab:has-text("运行历史")').click();
    await w(3000);
    await shot("run-history");
    const runRows = await page.locator('.ant-table-row').count();
    console.log(`  运行历史: ${runRows} 条`);
  }

  console.log(`\n完成, ${s} 张截图`);
  await browser.close();
}
run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
