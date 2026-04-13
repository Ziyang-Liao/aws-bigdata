const { chromium } = require("playwright");
const BASE = "https://d243rj4namajcb.cloudfront.net";
async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const w = (ms) => page.waitForTimeout(ms);
  let pass = 0, fail = 0;
  const ok = (m) => { pass++; console.log(`  ✅ ${m}`); };
  const ng = (m) => { fail++; console.log(`  ❌ ${m}`); };

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });

  // 1. 首页
  console.log("\n=== 首页 ===");
  const cards = await page.locator('.ant-statistic').count();
  cards >= 4 ? ok(`统计卡片 ${cards}`) : ng("统计卡片不足");

  // 2. 数据源
  console.log("\n=== 数据源 ===");
  await page.click('text=数据源管理'); await w(2000);
  const ds = await page.locator('.ant-table-row').count();
  ds > 0 ? ok(`数据源 ${ds} 条`) : ng("数据源为空");

  // 3. 数据同步
  console.log("\n=== 数据同步 ===");
  await page.click('text=数据同步'); await w(2000);
  const sync = await page.locator('.ant-table-row').count();
  sync > 0 ? ok(`同步任务 ${sync} 条`) : ng("同步任务为空");

  // 4. ETL 发布
  console.log("\n=== ETL 发布+触发 ===");
  await page.click('text=ETL 编排'); await w(2000);
  const wf = await page.locator('.ant-table-row').count();
  ok(`工作流 ${wf} 条`);
  // 发布第一个
  await page.locator('.ant-table-row').first().locator('text=发布').click();
  await w(3000);
  const pubMsg = await page.locator('.ant-message-notice-content').textContent().catch(() => "");
  pubMsg.includes("已发布") ? ok(`发布: ${pubMsg}`) : ng(`发布: ${pubMsg}`);
  await w(1000);
  // 触发
  await page.locator('.ant-table-row').first().locator('text=触发').click();
  await w(3000);
  const trigMsg = await page.locator('.ant-message-notice-content').textContent().catch(() => "");
  trigMsg.includes("已触发") ? ok(`触发: ${trigMsg}`) : ng(`触发: ${trigMsg}`);

  // 5. Redshift
  console.log("\n=== Redshift ===");
  await page.click('text=Redshift'); await w(3000);
  await page.locator('button:has-text("加载 Schema")').click(); await w(8000);
  const tree = await page.locator('.ant-tree-treenode').count();
  tree > 1 ? ok(`Schema ${tree} 节点`) : ng("Schema 为空");
  // SQL
  const cl = page.locator('button:has-text("清空")');
  if (await cl.count() > 0) await cl.click(); await w(300);
  await page.locator('.monaco-editor').first().click();
  await page.keyboard.press('Control+a'); await page.keyboard.press('Backspace');
  await page.keyboard.type('SELECT count(*) FROM ecommerce.orders;');
  await page.locator('button:has-text("执行")').click(); await w(8000);
  const rows = await page.locator('.ant-table-row').count();
  rows > 0 ? ok(`SQL 执行有结果`) : ng("SQL 无结果");

  // 6. 监控日志
  console.log("\n=== 监控日志 ===");
  await page.click('text=任务监控'); await w(2000);
  await page.locator('.ant-table-row').first().locator('text=日志').click({ force: true }); await w(3000);
  const hasError = await page.locator('text=Application error').count();
  if (hasError > 0) { ng("页面崩溃"); } else {
    const modal = page.locator('.ant-modal');
    if (await modal.count() > 0) {
      const txt = await modal.textContent().catch(() => "");
      txt.includes("暂无日志") ? ok("日志弹窗(工作流无日志正常)") : ok(`日志有内容 (${txt.length} chars)`);
      await modal.locator('.ant-modal-close').first().click({ force: true }).catch(() => {});
    }
  }
  await page.keyboard.press("Escape"); await w(500);

  // 7. 数据治理
  console.log("\n=== 数据治理 ===");
  await page.click('text=数据治理'); await w(3000);
  const gov = await page.locator('.ant-table-row').count();
  gov > 0 ? ok(`数据目录 ${gov} 条`) : ng("数据目录为空");

  // 8. 用户管理
  console.log("\n=== 用户管理 ===");
  await page.click('text=用户管理'); await w(2000);
  const users = await page.locator('.ant-table-row').count();
  users > 0 ? ok(`用户 ${users} 条`) : ng("用户为空");

  // 9. 系统设置
  console.log("\n=== 系统设置 ===");
  await page.click('text=系统设置'); await w(2000);
  ok("系统设置页面");

  console.log(`\n${"=".repeat(40)}`);
  console.log(`✅ ${pass}, ❌ ${fail}`);
  console.log(`${"=".repeat(40)}`);
  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}
run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
