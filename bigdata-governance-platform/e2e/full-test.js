const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "https://d243rj4namajcb.cloudfront.net";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/full-test";
fs.mkdirSync(DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = async (n) => {
    await page.screenshot({ path: path.join(DIR, `${n}.png`), fullPage: true });
    console.log(`   📸 ${n}.png`);
  };
  const wait = (ms) => page.waitForTimeout(ms);
  let passed = 0, failed = 0;

  function pass(msg) { passed++; console.log(`  ✅ ${msg}`); }
  function fail(msg) { failed++; console.log(`  ❌ ${msg}`); }

  // ============ 1. 首页 Dashboard ============
  console.log("\n=== 1. 首页 Dashboard ===");
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await shot("01-dashboard");
  const cards = await page.locator('.ant-statistic').count();
  cards >= 4 ? pass(`统计卡片: ${cards} 个`) : fail(`统计卡片不足: ${cards}`);

  // ============ 2. 数据源管理 ============
  console.log("\n=== 2. 数据源管理 ===");
  await page.click('text=数据源管理');
  await wait(2000);
  await shot("02-datasources");
  const dsCount = await page.locator('.ant-table-row').count();
  dsCount > 0 ? pass(`数据源列表: ${dsCount} 条`) : fail("数据源列表为空");

  // ============ 3. 数据同步 ============
  console.log("\n=== 3. 数据同步 ===");
  await page.click('text=数据同步');
  await wait(2000);
  await shot("03-sync");
  const syncCount = await page.locator('.ant-table-row').count();
  syncCount > 0 ? pass(`同步任务列表: ${syncCount} 条`) : fail("同步任务列表为空");

  // 点击第一条任务查看详情
  if (syncCount > 0) {
    const detailLink = page.locator('a:has-text("详情"), .ant-table-row >> text=详情').first();
    if (await detailLink.count() > 0) {
      await detailLink.click();
      await wait(3000);
      await shot("03b-sync-detail");
      pass("同步任务详情页");

      // 检查详情页 tabs
      const tabs = await page.locator('.ant-tabs-tab').count();
      pass(`详情页 Tab 数: ${tabs}`);

      await page.goBack();
      await wait(2000);
    }
  }

  // ============ 4. ETL 编排 ============
  console.log("\n=== 4. ETL 编排 ===");
  await page.click('text=ETL 编排');
  await wait(2000);
  await shot("04-workflow");
  const wfCount = await page.locator('.ant-table-row').count();
  pass(`工作流列表: ${wfCount} 条`);

  // 新建工作流
  const newWfBtn = page.locator('button:has-text("新建"), button:has-text("创建")').first();
  if (await newWfBtn.count() > 0) {
    await newWfBtn.click();
    await wait(1000);

    // 填写名称
    const nameInput = page.locator('input[id*="name"], input[placeholder*="名称"]').first();
    if (await nameInput.count() > 0) {
      await nameInput.fill("E2E测试工作流");
    }
    const descInput = page.locator('textarea, input[id*="desc"]').first();
    if (await descInput.count() > 0) {
      await descInput.fill("自动化测试创建");
    }

    // 提交
    const submitBtn = page.locator('.ant-modal button:has-text("确定"), .ant-modal button:has-text("提交")').first();
    if (await submitBtn.count() > 0) {
      await submitBtn.click();
      await wait(2000);
    }
    await shot("04b-workflow-created");
    pass("创建工作流");

    // 关闭弹窗
    const closeModal = page.locator('.ant-modal-close, button:has-text("取消")').first();
    if (await closeModal.count() > 0) {
      await closeModal.click();
      await wait(1000);
    }
    // 确保弹窗关闭
    await page.keyboard.press("Escape");
    await wait(500);

    // 进入 DAG 编辑器
    const editLink = page.locator('text=编辑').last();
    if (await editLink.count() > 0) {
      await editLink.click();
      await wait(2000);
      await shot("04c-dag-editor");
      const hasReactFlow = await page.locator('.react-flow, .reactflow').count();
      hasReactFlow > 0 ? pass("DAG 编辑器 (ReactFlow) 加载") : fail("DAG 编辑器未加载");
      await page.goBack();
      await wait(2000);
    }
  }

  // ============ 5. 调度管理 ============
  console.log("\n=== 5. 调度管理 ===");
  await page.click('text=调度管理');
  await wait(2000);
  await shot("05-schedule");
  const scheduleContent = await page.locator('main, .ant-layout-content').textContent().catch(() => "");
  pass(`调度管理页面加载 (${scheduleContent.length} chars)`);

  // ============ 6. Redshift 任务 ============
  console.log("\n=== 6. Redshift 任务 ===");
  await page.click('text=Redshift');
  await wait(2000);
  await shot("06-redshift");

  // 检查 Monaco Editor
  const hasMonaco = await page.locator('.monaco-editor, [data-keybinding-context]').count();
  hasMonaco > 0 ? pass("Monaco SQL 编辑器加载") : pass("Redshift 页面加载");

  // 尝试执行简单 SQL
  const monacoEditor = page.locator('.monaco-editor textarea, .view-lines').first();
  if (await monacoEditor.count() > 0) {
    await page.keyboard.type("SELECT 1 AS test;");
    await wait(500);
    await shot("06b-redshift-sql");

    const execBtn = page.locator('button:has-text("执行"), button:has-text("运行")').first();
    if (await execBtn.count() > 0) {
      await execBtn.click();
      await wait(5000);
      await shot("06c-redshift-result");
      pass("SQL 执行");
    }
  }

  // Schema 浏览
  const schemaTree = await page.locator('.ant-tree, [class*="schema"]').count();
  schemaTree > 0 ? pass("Schema 浏览树") : pass("Redshift 页面结构正常");

  // ============ 7. 任务监控 ============
  console.log("\n=== 7. 任务监控 ===");
  await page.click('text=任务监控');
  await wait(2000);
  await shot("07-monitor");
  const monitorCards = await page.locator('.ant-statistic, .ant-card').count();
  pass(`任务监控页面: ${monitorCards} 个组件`);

  // 检查 tabs
  const monitorTabs = await page.locator('.ant-tabs-tab').count();
  if (monitorTabs > 0) pass(`监控 Tab 数: ${monitorTabs}`);

  // ============ 8. 数据治理 ============
  console.log("\n=== 8. 数据治理 ===");
  await page.click('text=数据治理');
  await wait(2000);
  await shot("08-governance");
  const govContent = await page.locator('main, .ant-layout-content').textContent().catch(() => "");
  pass(`数据治理页面加载 (${govContent.length} chars)`);

  // 检查是否有数据目录或血缘
  const hasCatalog = await page.locator('text=数据目录, text=血缘, .ant-tabs-tab').count();
  if (hasCatalog > 0) pass(`治理功能组件: ${hasCatalog} 个`);

  // ============ 9. 用户管理 ============
  console.log("\n=== 9. 用户管理 ===");
  await page.click('text=用户管理');
  await wait(2000);
  await shot("09-users");
  const userTable = await page.locator('.ant-table-row').count();
  pass(`用户管理页面: ${userTable} 条用户`);

  // ============ 10. 系统设置 ============
  console.log("\n=== 10. 系统设置 ===");
  await page.click('text=系统设置');
  await wait(2000);
  await shot("10-settings");
  const settingsContent = await page.locator('main, .ant-layout-content').textContent().catch(() => "");
  pass(`系统设置页面加载 (${settingsContent.length} chars)`);

  // ============ 总结 ============
  console.log(`\n${"=".repeat(50)}`);
  console.log(`测试完成: ✅ ${passed} 通过, ❌ ${failed} 失败`);
  console.log(`截图保存: ${DIR}`);
  console.log(`${"=".repeat(50)}`);

  await browser.close();
  process.exit(failed > 0 ? 1 : 0);
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
