const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = "https://d243rj4namajcb.cloudfront.net";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/quick-verify";
fs.mkdirSync(DIR, { recursive: true });
let s = 0;
async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = async (n) => { s++; await page.screenshot({ path: path.join(DIR, `${String(s).padStart(2,"0")}-${n}.png`), fullPage: true }); };
  const w = (ms) => page.waitForTimeout(ms);
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });

  // 1. Redshift Schema
  console.log("\n=== Redshift ===");
  await page.click('text=Redshift');
  await w(3000);
  await page.locator('button:has-text("加载 Schema")').click();
  await w(8000); // 多等一会
  await shot("redshift-schema");
  const tree = await page.locator('.ant-tree-treenode').count();
  console.log(`  Schema 节点: ${tree} ${tree > 1 ? '✅' : '❌'}`);

  // SQL 查询
  const cl = page.locator('button:has-text("清空")');
  if (await cl.count() > 0) await cl.click();
  await w(300);
  await page.locator('.monaco-editor').first().click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('SELECT * FROM ecommerce.orders ORDER BY id;');
  await page.locator('button:has-text("执行")').click();
  await w(8000);
  await shot("redshift-result");
  const rows = await page.locator('.ant-table-row').count();
  console.log(`  查询结果: ${rows} 行 ${rows > 0 ? '✅' : '❌'}`);

  // 2. 监控日志
  console.log("\n=== 监控日志 ===");
  await page.click('text=任务监控');
  await w(2000);
  // 在全部 tab 里找同步任务的日志
  await shot("monitor-all");
  // 直接点第一行的日志（force）
  const firstRow = page.locator('.ant-table-row').first();
  await firstRow.locator('text=日志').click({ force: true });
  await w(3000);
  await shot("monitor-log");
  const modal = page.locator('.ant-modal');
  if (await modal.count() > 0) {
    const txt = await modal.textContent().catch(() => "");
    console.log(`  弹窗内容: ${txt.slice(0, 150)}`);
    console.log(`  日志有效: ${txt.length > 50 && !txt.includes("暂无日志") ? '✅' : '❌'}`);
    await modal.locator('.ant-modal-close, button:has-text("关闭")').first().click({ force: true }).catch(() => {});
  }
  await page.keyboard.press("Escape");
  await w(500);

  // 3. 数据治理
  console.log("\n=== 数据治理 ===");
  await page.click('text=数据治理');
  await w(3000);
  await shot("governance");
  const govRows = await page.locator('.ant-table-row').count();
  const govText = await page.locator('main').textContent().catch(() => "");
  console.log(`  目录条目: ${govRows} ${govRows > 0 ? '✅' : '❌'}`);
  console.log(`  内容: ${govText.slice(0, 150)}`);

  // 4. 用户管理
  console.log("\n=== 用户管理 ===");
  await page.click('text=用户管理');
  await w(2000);
  await shot("users");
  const users = await page.locator('.ant-table-row').count();
  console.log(`  用户: ${users} ${users > 0 ? '✅' : '❌'}`);

  console.log(`\n完成, ${s} 张截图`);
  await browser.close();
}
run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
