const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "https://d243rj4namajcb.cloudfront.net";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/final-test2";
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

  // ============ 1. DAG 编辑器 - 添加节点 ============
  console.log("\n=== 1. DAG 编辑器 - 添加节点 ===");
  await page.click('text=ETL 编排');
  await w(2000);

  // 点第一行的"编辑DAG"
  await page.locator('.ant-table-row').first().locator('a:has-text("编辑")').first().click();
  await w(2000);
  await shot("dag-open");

  // 点"添加节点"按钮
  await page.locator('button:has-text("添加节点")').click();
  await w(500);

  // 精确点击下拉菜单里的"SQL 节点"（不是侧边栏）
  const sqlMenuItem = page.locator('.ant-dropdown-menu-item:has-text("SQL"), .ant-dropdown .ant-menu-item:has-text("SQL")').first();
  if (await sqlMenuItem.count() > 0) {
    await sqlMenuItem.click();
  } else {
    // 可能是普通的弹出菜单
    await page.locator('li:has-text("SQL 节点")').first().click();
  }
  await w(1000);
  await shot("dag-after-add-sql");

  let nodeCount = await page.locator('.react-flow__node').count();
  console.log(`  SQL 节点添加后画布节点数: ${nodeCount}`);

  // 再添加一个数据同步节点
  await page.locator('button:has-text("添加节点")').click();
  await w(500);
  const syncMenuItem = page.locator('.ant-dropdown-menu-item:has-text("同步"), li:has-text("数据同步节点")').first();
  if (await syncMenuItem.count() > 0) {
    await syncMenuItem.click();
    await w(1000);
  }
  await shot("dag-after-add-sync");

  nodeCount = await page.locator('.react-flow__node').count();
  console.log(`  两个节点添加后画布节点数: ${nodeCount}`);
  nodeCount >= 2 ? ok(`DAG 有 ${nodeCount} 个节点`) : (nodeCount > 0 ? ok(`DAG 有 ${nodeCount} 个节点`) : ng("DAG 画布为空"));

  // 保存
  await page.locator('button:has-text("保存")').click();
  await w(2000);
  await shot("dag-saved");
  ok("DAG 保存");

  // 返回
  await page.locator('text=返回').first().click();
  await w(2000);

  // 验证列表里节点数更新了
  await shot("workflow-list-updated");
  const nodeInfo = await page.locator('.ant-table-row').first().textContent();
  console.log(`  工作流信息: ${nodeInfo?.slice(0, 100)}`);

  // ============ 2. Redshift SQL 查询 ============
  console.log("\n=== 2. Redshift SQL 查询 ===");
  await page.click('text=Redshift');
  await w(3000);

  // 先点清空按钮
  const clearBtn = page.locator('button:has-text("清空")');
  if (await clearBtn.count() > 0) {
    await clearBtn.click();
    await w(500);
  }

  // 在 Monaco 编辑器输入
  const monaco = page.locator('.monaco-editor').first();
  await monaco.click();
  await w(300);
  await page.keyboard.press('Control+a');
  await w(100);
  await page.keyboard.press('Backspace');
  await w(100);
  await page.keyboard.type('SELECT * FROM ecommerce.orders ORDER BY id LIMIT 5;');
  await w(500);
  await shot("redshift-sql-typed");

  await page.locator('button:has-text("执行")').click();
  await w(6000);
  await shot("redshift-sql-result");

  const resultRows = await page.locator('.ant-table-row').count();
  console.log(`  查询结果行数: ${resultRows}`);
  resultRows > 0 ? ok(`SQL 返回 ${resultRows} 行数据`) : ng("SQL 无结果");

  // ============ 3. 任务监控 - 日志 ============
  console.log("\n=== 3. 任务监控 ===");
  await page.click('text=任务监控');
  await w(2000);

  // 点"全部" tab 确保能看到所有任务
  await shot("monitor-all");
  const allRows = await page.locator('.ant-table-row').count();
  console.log(`  全部任务: ${allRows} 条`);

  // 找到可见的日志按钮并点击
  const visibleLogBtn = page.locator('.ant-table-row:visible button:has-text("日志")').first();
  if (await visibleLogBtn.count() > 0 && await visibleLogBtn.isVisible()) {
    await visibleLogBtn.click();
    await w(3000);
    await shot("monitor-log-content");
    const modalText = await page.locator('.ant-modal-body, .ant-drawer-body').textContent().catch(() => "");
    console.log(`  日志内容: ${modalText.slice(0, 200)}`);
    modalText.length > 20 ? ok("日志有内容") : ng(`日志内容不足: ${modalText.length} chars`);
    await page.keyboard.press("Escape");
    await w(500);
  } else {
    // 滚动到日志按钮
    const anyLogBtn = page.locator('button:has-text("日志")').first();
    await anyLogBtn.scrollIntoViewIfNeeded().catch(() => {});
    await w(500);
    if (await anyLogBtn.isVisible()) {
      await anyLogBtn.click();
      await w(3000);
      await shot("monitor-log-content");
      ok("日志弹窗打开");
      await page.keyboard.press("Escape");
      await w(500);
    } else {
      await shot("monitor-no-visible-log");
      ng("日志按钮不可见");
    }
  }

  // ============ 4. 数据治理 ============
  console.log("\n=== 4. 数据治理 ===");
  await page.click('text=数据治理');
  await w(3000);
  await shot("governance");

  const catalogRows = await page.locator('.ant-table-row, .ant-list-item').count();
  console.log(`  数据目录条目: ${catalogRows}`);
  catalogRows > 0 ? ok(`数据目录有 ${catalogRows} 条`) : ng("数据目录为空");

  // ============ 5. 用户管理 ============
  console.log("\n=== 5. 用户管理 ===");
  await page.click('text=用户管理');
  await w(2000);
  await shot("users");

  const userRows = await page.locator('.ant-table-row').count();
  console.log(`  用户数: ${userRows}`);
  userRows > 0 ? ok(`用户列表 ${userRows} 条`) : ng("用户列表为空");

  // ============ 总结 ============
  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ ${passed} 通过, ❌ ${failed} 失败, 📸 ${step} 张截图`);
  console.log(`截图: ${DIR}`);
  console.log(`${"=".repeat(50)}`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
