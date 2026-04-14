const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "https://d243rj4namajcb.cloudfront.net";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/page-test2";
fs.mkdirSync(DIR, { recursive: true });

let step = 0, passed = 0, failed = 0;
async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = async (n) => { step++; await page.screenshot({ path: path.join(DIR, `${String(step).padStart(2,"0")}-${n}.png`), fullPage: true }); };
  const w = (ms) => page.waitForTimeout(ms);
  const ok = (m) => { passed++; console.log(`  ✅ ${m}`); };
  const ng = (m) => { failed++; console.log(`  ❌ ${m}`); };

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });

  // ============ 1. 监控日志 ============
  console.log("\n=== 1. 任务监控 - 同步日志 ===");
  await page.click('text=任务监控');
  await w(2000);
  await page.locator('.ant-tabs-tab:has-text("同步")').click();
  await w(1000);

  // 直接点击日志 - force click 因为可能被遮挡
  await page.locator('.ant-table-row').first().locator('text=日志').click({ force: true, timeout: 5000 });
  await w(3000);
  await shot("monitor-log-popup");

  const logContent = await page.locator('.ant-modal-body, .ant-modal-content').textContent({ timeout: 3000 }).catch(() => "");
  console.log(`  日志长度: ${logContent.length}`);
  console.log(`  日志预览: ${logContent.slice(0, 200)}`);
  logContent.length > 30 && !logContent.includes("暂无日志") ? ok("同步日志有内容") : ng(`日志: "${logContent.slice(0, 60)}"`);

  // 关闭
  await page.locator('.ant-modal-close').first().click().catch(() => page.keyboard.press("Escape"));
  await w(500);

  // ============ 2. 数据治理 ============
  console.log("\n=== 2. 数据治理 ===");
  await page.click('text=数据治理');
  await w(3000);
  await shot("governance");

  const govRows = await page.locator('.ant-table-row').count();
  const govText = await page.locator('main').textContent().catch(() => "");
  console.log(`  表格行数: ${govRows}`);
  console.log(`  页面内容: ${govText.slice(0, 200)}`);
  govRows > 0 ? ok(`数据目录 ${govRows} 条`) : ng("数据目录为空");

  // ============ 3. 用户管理 ============
  console.log("\n=== 3. 用户管理 ===");
  await page.click('text=用户管理');
  await w(2000);
  await shot("users");

  const userRows = await page.locator('.ant-table-row').count();
  console.log(`  用户数: ${userRows}`);
  if (userRows > 0) {
    const info = await page.locator('.ant-table-row').first().textContent();
    console.log(`  用户: ${info?.slice(0, 80)}`);
    ok(`用户列表 ${userRows} 条`);
  } else {
    ng("用户列表为空");
  }

  // ============ 总结 ============
  console.log(`\n${"=".repeat(40)}`);
  console.log(`✅ ${passed}, ❌ ${failed}, 📸 ${step}`);
  console.log(`${"=".repeat(40)}`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
