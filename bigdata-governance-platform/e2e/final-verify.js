const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = "https://d243rj4namajcb.cloudfront.net";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/final-verify";
fs.mkdirSync(DIR, { recursive: true });
let s = 0, pass = 0, fail = 0;
async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = async (n) => { s++; await page.screenshot({ path: path.join(DIR, `${String(s).padStart(2,"0")}-${n}.png`), fullPage: true }); };
  const w = (ms) => page.waitForTimeout(ms);
  const ok = (m) => { pass++; console.log(`  ✅ ${m}`); };
  const ng = (m) => { fail++; console.log(`  ❌ ${m}`); };

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });

  // 1. 监控 - 点日志
  console.log("\n=== 1. 任务监控日志 ===");
  await page.click('text=任务监控');
  await w(2000);
  await shot("monitor");
  // 点第一行(test同步任务)的日志
  await page.locator('.ant-table-row').first().locator('text=日志').click({ force: true });
  await w(3000);
  await shot("monitor-log");
  // 检查页面没崩溃
  const hasError = await page.locator('text=Application error').count();
  if (hasError > 0) {
    ng("页面崩溃 Application error");
  } else {
    const modal = page.locator('.ant-modal');
    if (await modal.count() > 0) {
      const txt = await modal.textContent().catch(() => "");
      console.log(`  日志预览: ${txt.slice(0, 120)}`);
      txt.includes("暂无日志") ? ng("日志为空") : ok(`日志弹窗正常 (${txt.length} chars)`);
      await modal.locator('.ant-modal-close').first().click({ force: true }).catch(() => {});
    } else {
      ng("日志弹窗未打开");
    }
  }
  await page.keyboard.press("Escape");
  await w(500);

  // 2. 数据治理
  console.log("\n=== 2. 数据治理 ===");
  await page.click('text=数据治理');
  await w(3000);
  await shot("governance");
  const govRows = await page.locator('.ant-table-row').count();
  console.log(`  目录条目: ${govRows}`);
  govRows > 0 ? ok(`数据目录 ${govRows} 条`) : ng("数据目录为空");

  // 3. 用户管理
  console.log("\n=== 3. 用户管理 ===");
  await page.click('text=用户管理');
  await w(2000);
  await shot("users");
  const users = await page.locator('.ant-table-row').count();
  console.log(`  用户: ${users}`);
  users > 0 ? ok(`用户 ${users} 条`) : ng("用户为空");

  // 4. Redshift
  console.log("\n=== 4. Redshift ===");
  await page.click('text=Redshift');
  await w(3000);
  await page.locator('button:has-text("加载 Schema")').click();
  await w(8000);
  await shot("redshift-schema");
  const tree = await page.locator('.ant-tree-treenode').count();
  tree > 1 ? ok(`Schema ${tree} 节点`) : ng(`Schema ${tree} 节点`);

  // SQL
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
  rows > 0 ? ok(`SQL ${rows} 行`) : ng("SQL 无结果");

  console.log(`\n${"=".repeat(40)}`);
  console.log(`✅ ${pass}, ❌ ${fail}, 📸 ${s}`);
  console.log(`${"=".repeat(40)}`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}
run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
