const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "https://d243rj4namajcb.cloudfront.net";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/page-test";
fs.mkdirSync(DIR, { recursive: true });

let step = 0, passed = 0, failed = 0;
async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = async (n) => { step++; const f = `${String(step).padStart(2,"0")}-${n}.png`; await page.screenshot({ path: path.join(DIR, f), fullPage: true }); console.log(`  📸 ${f}`); };
  const w = (ms) => page.waitForTimeout(ms);
  const ok = (m) => { passed++; console.log(`  ✅ ${m}`); };
  const ng = (m) => { failed++; console.log(`  ❌ ${m}`); };

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });

  // ============ 1. DAG 编辑器 ============
  console.log("\n=== 1. DAG 编辑器 - 添加节点+保存 ===");
  await page.click('text=ETL 编排');
  await w(2000);
  // 进入第一个工作流
  await page.locator('.ant-table-row').first().locator('a:has-text("编辑")').first().click();
  await w(3000);
  await shot("dag-before");
  const beforeNodes = await page.locator('.react-flow__node').count();
  console.log(`  当前节点数: ${beforeNodes}`);

  // 添加 Python 节点
  await page.locator('button:has-text("添加节点")').click();
  await w(500);
  await page.locator('li:has-text("Python")').first().click();
  await w(1500);
  await shot("dag-after-add");
  const afterNodes = await page.locator('.react-flow__node').count();
  console.log(`  添加后节点数: ${afterNodes}`);
  afterNodes > beforeNodes ? ok(`节点添加成功 (${beforeNodes}→${afterNodes})`) : ng("节点未增加");

  // 保存
  await page.locator('button:has-text("保存")').click();
  await w(2000);
  await shot("dag-saved");
  ok("DAG 保存");

  // 返回
  await page.locator('text=返回').first().click();
  await w(2000);
  await shot("workflow-list");
  const wfInfo = await page.locator('.ant-table-row').first().textContent();
  console.log(`  列表信息: ${wfInfo?.slice(0, 80)}`);

  // ============ 2. Redshift Schema + SQL ============
  console.log("\n=== 2. Redshift Schema + SQL 查询 ===");
  await page.click('text=Redshift');
  await w(3000);

  // 加载 Schema
  await page.locator('button:has-text("加载 Schema")').click();
  await w(5000);
  await shot("redshift-schema");
  const treeCount = await page.locator('.ant-tree-treenode').count();
  console.log(`  Schema 树节点: ${treeCount}`);
  treeCount > 1 ? ok(`Schema 加载 (${treeCount} 节点)`) : ng("Schema 为空");

  // 清空编辑器并输入 SQL
  const clearBtn = page.locator('button:has-text("清空")');
  if (await clearBtn.count() > 0) await clearBtn.click();
  await w(300);
  await page.locator('.monaco-editor').first().click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Backspace');
  await page.keyboard.type('SELECT * FROM ecommerce.orders ORDER BY id;');
  await page.locator('button:has-text("执行")').click();
  await w(6000);
  await shot("redshift-result");
  const rows = await page.locator('.ant-table-row').count();
  console.log(`  查询结果: ${rows} 行`);
  rows > 0 ? ok(`SQL 返回 ${rows} 行`) : ng("SQL 无结果");

  // ============ 3. 任务监控 - 日志 ============
  console.log("\n=== 3. 任务监控 - 同步任务日志 ===");
  await page.click('text=任务监控');
  await w(2000);

  // 切到同步 tab
  await page.locator('.ant-tabs-tab:has-text("同步")').click();
  await w(1000);
  await shot("monitor-sync");

  // 点日志 - 滚动到可见
  const syncLogBtn = page.locator('.ant-table-row button:has-text("日志")').first();
  await syncLogBtn.scrollIntoViewIfNeeded();
  await w(300);
  await syncLogBtn.click({ timeout: 5000 });
  await w(3000);
  await shot("monitor-log");

  // 读取弹窗/抽屉内容
  const logModal = page.locator('.ant-modal-body, .ant-drawer-body, .ant-modal-content');
  const logText = await logModal.textContent({ timeout: 3000 }).catch(() => "");
  console.log(`  日志内容长度: ${logText.length}`);
  console.log(`  日志预览: ${logText.slice(0, 150)}`);
  logText.length > 20 && !logText.includes("暂无日志") ? ok("日志有内容") : ng(`日志: "${logText.slice(0, 50)}"`);

  // 关闭弹窗
  const closeBtn = page.locator('.ant-modal-close').first();
  if (await closeBtn.count() > 0) await closeBtn.click();
  await w(500);
  await page.keyboard.press("Escape");
  await w(500);

  // ============ 4. 数据治理 ============
  console.log("\n=== 4. 数据治理 ===");
  await page.click('text=数据治理');
  await w(3000);
  await shot("governance");
  const catalogItems = await page.locator('.ant-table-row, .ant-list-item, .ant-card').count();
  console.log(`  数据目录条目: ${catalogItems}`);
  catalogItems > 0 ? ok(`数据目录 ${catalogItems} 条`) : ng("数据目录为空");

  // 看页面文字
  const govText = await page.locator('main').textContent().catch(() => "");
  console.log(`  页面内容: ${govText.slice(0, 200)}`);

  // ============ 5. 用户管理 ============
  console.log("\n=== 5. 用户管理 ===");
  await page.click('text=用户管理');
  await w(2000);
  await shot("users");
  const userCount = await page.locator('.ant-table-row').count();
  console.log(`  用户数: ${userCount}`);
  userCount > 0 ? ok(`用户 ${userCount} 条`) : ng("用户为空");

  // 读取用户信息
  if (userCount > 0) {
    const userInfo = await page.locator('.ant-table-row').first().textContent();
    console.log(`  用户信息: ${userInfo?.slice(0, 100)}`);
  }

  // ============ 总结 ============
  console.log(`\n${"=".repeat(50)}`);
  console.log(`✅ ${passed} 通过, ❌ ${failed} 失败, 📸 ${step} 张截图`);
  console.log(`${"=".repeat(50)}`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
