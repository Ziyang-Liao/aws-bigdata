const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "https://d243rj4namajcb.cloudfront.net";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/final-test";
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

  // ============ 1. ETL 编排 - 添加节点到 DAG ============
  console.log("\n=== 1. ETL 编排 - DAG 编辑器添加节点 ===");
  await page.click('text=ETL 编排');
  await w(2000);

  // 进入第一个工作流的编辑 DAG
  const dagLink = page.locator('text=编辑DAG').first();
  if (await dagLink.count() > 0) {
    await dagLink.click();
  } else {
    await page.locator('.ant-table-row a').first().click();
  }
  await w(2000);
  await shot("dag-editor-open");

  // 点击"添加节点"
  const addNodeBtn = page.locator('button:has-text("添加节点")');
  if (await addNodeBtn.count() > 0) {
    await addNodeBtn.click();
    await w(1000);
    await shot("dag-add-node-menu");

    // 看看弹出了什么选项
    const menuItems = await page.locator('.ant-dropdown-menu-item, .ant-menu-item, .ant-modal .ant-radio-wrapper, .ant-select-item').allTextContents();
    console.log(`  节点类型选项: ${menuItems.join(', ')}`);

    // 选择 SQL 节点
    const sqlOption = page.locator('text=SQL').first();
    if (await sqlOption.count() > 0) {
      await sqlOption.click();
      await w(1000);
      await shot("dag-sql-node-added");
      ok("添加 SQL 节点");
    } else {
      // 可能是下拉菜单
      const anyOption = page.locator('.ant-dropdown-menu-item, .ant-menu-item').first();
      if (await anyOption.count() > 0) {
        await anyOption.click();
        await w(1000);
        await shot("dag-node-added");
        ok("添加节点");
      } else {
        await shot("dag-no-options");
        ng("没有节点类型选项");
      }
    }
  } else {
    ng("没有'添加节点'按钮");
  }

  // 检查画布上是否有节点了
  const nodeCount = await page.locator('.react-flow__node').count();
  console.log(`  画布节点数: ${nodeCount}`);
  nodeCount > 0 ? ok(`DAG 画布有 ${nodeCount} 个节点`) : ng("DAG 画布仍然为空");

  // 点保存
  const saveBtn = page.locator('button:has-text("保存")');
  if (await saveBtn.count() > 0 && nodeCount > 0) {
    await saveBtn.click();
    await w(2000);
    await shot("dag-saved");
    ok("DAG 保存");
  }

  // 返回列表
  const backBtn = page.locator('text=返回');
  if (await backBtn.count() > 0) {
    await backBtn.click();
    await w(2000);
  } else {
    await page.click('text=ETL 编排');
    await w(2000);
  }

  // ============ 2. Redshift - 加载 Schema + 执行 SQL ============
  console.log("\n=== 2. Redshift - Schema 浏览 + SQL 执行 ===");
  await page.click('text=Redshift');
  await w(3000);

  // 点击加载 Schema
  await page.locator('button:has-text("加载 Schema")').click();
  await w(5000);
  await shot("redshift-schema-loaded");

  // 检查左侧树
  const treeNodes = await page.locator('.ant-tree-treenode').count();
  console.log(`  Schema 树节点数: ${treeNodes}`);
  treeNodes > 1 ? ok(`Schema 加载成功 (${treeNodes} 节点)`) : ng(`Schema 树节点不足: ${treeNodes}`);

  // 在 Monaco 编辑器执行查询
  const monaco = page.locator('.monaco-editor').first();
  if (await monaco.count() > 0) {
    await monaco.click();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('SELECT * FROM ecommerce.orders LIMIT 5;');
    await w(500);

    await page.locator('button:has-text("执行")').click();
    await w(5000);
    await shot("redshift-query-result");

    const resultRows = await page.locator('.ant-table-row').count();
    console.log(`  查询结果行数: ${resultRows}`);
    resultRows > 0 ? ok(`SQL 查询返回 ${resultRows} 行`) : ng("SQL 查询无结果");
  }

  // ============ 3. 任务监控 - 查看日志 ============
  console.log("\n=== 3. 任务监控 - 日志查看 ===");
  await page.click('text=任务监控');
  await w(2000);
  await shot("monitor-overview");

  // 点同步 tab
  const syncTab = page.locator('.ant-tabs-tab:has-text("同步")');
  if (await syncTab.count() > 0) {
    await syncTab.click();
    await w(1000);
  }

  // 点日志按钮
  const logBtns = page.locator('button:has-text("日志")');
  const logBtnCount = await logBtns.count();
  console.log(`  日志按钮数: ${logBtnCount}`);
  if (logBtnCount > 0) {
    await logBtns.first().click();
    await w(3000);
    await shot("monitor-log-detail");

    // 检查日志内容
    const logContent = await page.locator('.ant-modal, .ant-drawer').textContent().catch(() => "");
    console.log(`  日志内容长度: ${logContent.length}`);
    logContent.length > 50 ? ok("日志有内容") : ng(`日志为空或很短 (${logContent.length} chars)`);

    await page.keyboard.press("Escape");
    await w(500);
  } else {
    ng("没有日志按钮");
  }

  // ============ 4. 数据治理 - 目录 + 血缘 ============
  console.log("\n=== 4. 数据治理 ===");
  await page.click('text=数据治理');
  await w(3000);
  await shot("governance-page");

  // 检查页面内容
  const govText = await page.locator('main').textContent().catch(() => "");
  console.log(`  页面内容预览: ${govText.slice(0, 200)}`);

  // 检查是否有数据目录表格
  const catalogRows = await page.locator('.ant-table-row').count();
  console.log(`  数据目录条目: ${catalogRows}`);
  catalogRows > 0 ? ok(`数据目录有 ${catalogRows} 条`) : ng("数据目录为空");

  // 检查血缘 tab
  const lineageTab = page.locator('.ant-tabs-tab:has-text("血缘")');
  if (await lineageTab.count() > 0) {
    await lineageTab.click();
    await w(2000);
    await shot("governance-lineage");
    ok("血缘页面");
  }

  // ============ 5. 用户管理 ============
  console.log("\n=== 5. 用户管理 ===");
  await page.click('text=用户管理');
  await w(2000);
  await shot("users-list");

  const userRows = await page.locator('.ant-table-row').count();
  console.log(`  用户数: ${userRows}`);
  userRows > 0 ? ok(`用户列表有 ${userRows} 条`) : ng("用户列表为空");

  // 如果有用户，检查内容
  if (userRows > 0) {
    const firstUser = await page.locator('.ant-table-row').first().textContent();
    console.log(`  第一个用户: ${firstUser?.slice(0, 100)}`);
  }

  // ============ 6. 系统设置 ============
  console.log("\n=== 6. 系统设置 ===");
  await page.click('text=系统设置');
  await w(2000);
  await shot("settings");
  const settingsText = await page.locator('main').textContent().catch(() => "");
  console.log(`  配置项: ${settingsText.slice(0, 200)}`);
  ok("系统设置页面");

  // ============ 总结 ============
  console.log(`\n${"=".repeat(50)}`);
  console.log(`测试完成: ✅ ${passed} 通过, ❌ ${failed} 失败`);
  console.log(`截图: ${DIR} (${step} 张)`);
  console.log(`${"=".repeat(50)}`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
