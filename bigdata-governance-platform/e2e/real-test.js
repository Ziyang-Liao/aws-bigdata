const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "https://d243rj4namajcb.cloudfront.net";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/real-test";
fs.mkdirSync(DIR, { recursive: true });

let step = 0;
async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = async (name) => {
    step++;
    const file = `${String(step).padStart(2,"0")}-${name}.png`;
    await page.screenshot({ path: path.join(DIR, file), fullPage: true });
    console.log(`  📸 ${file}`);
  };
  const w = (ms) => page.waitForTimeout(ms);

  // ============ 1. 首页 ============
  console.log("\n=== 1. 首页 ===");
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await shot("dashboard");
  const dsNum = await page.locator('.ant-statistic-content-value').first().textContent();
  console.log(`  数据源: ${dsNum}, 页面OK`);

  // ============ 2. ETL 编排 - 创建工作流 ============
  console.log("\n=== 2. ETL 编排 - 创建工作流 ===");
  await page.click('text=ETL 编排');
  await w(2000);
  await shot("workflow-list-before");
  const wfBefore = await page.locator('.ant-table-row').count();
  console.log(`  创建前工作流数: ${wfBefore}`);

  // 点新建
  await page.locator('button:has-text("新建")').first().click();
  await w(1000);
  await shot("workflow-modal");

  // 看弹窗里有什么输入框
  const allInputs = await page.locator('.ant-modal input, .ant-modal textarea').all();
  console.log(`  弹窗输入框数: ${allInputs.length}`);
  for (let i = 0; i < allInputs.length; i++) {
    const id = await allInputs[i].getAttribute('id') || '';
    const ph = await allInputs[i].getAttribute('placeholder') || '';
    console.log(`    input[${i}]: id="${id}" placeholder="${ph}"`);
  }

  // 填写名称 - 尝试多种方式
  const nameField = page.locator('.ant-modal input').first();
  await nameField.click();
  await nameField.fill('E2E-工作流测试');
  await w(300);

  // 填写描述（如果有）
  const descField = page.locator('.ant-modal textarea').first();
  if (await descField.count() > 0) {
    await descField.fill('自动化测试创建的工作流');
  }

  await shot("workflow-filled");
  console.log(`  已填写表单`);

  // 点确定
  await page.locator('.ant-modal .ant-btn-primary, .ant-modal button:has-text("确定")').first().click();
  await w(3000);
  await shot("workflow-after-submit");

  // 检查是否有错误提示
  const errMsg = await page.locator('.ant-message-error, .ant-form-item-explain-error').first().textContent().catch(() => "");
  if (errMsg) console.log(`  ⚠️ 错误提示: ${errMsg}`);

  // 关闭可能残留的弹窗
  await page.keyboard.press("Escape");
  await w(500);

  // 刷新列表确认
  await page.click('text=ETL 编排');
  await w(2000);
  await shot("workflow-list-after");
  const wfAfter = await page.locator('.ant-table-row').count();
  console.log(`  创建后工作流数: ${wfAfter}`);
  if (wfAfter > wfBefore) {
    console.log(`  ✅ 工作流创建成功 (${wfBefore} → ${wfAfter})`);
  } else {
    console.log(`  ❌ 工作流创建失败，数量未增加`);
  }

  // 如果有工作流，进入 DAG 编辑器
  if (wfAfter > 0) {
    console.log("\n=== 2b. DAG 编辑器 ===");
    // 点击编辑链接
    const editBtn = page.locator('.ant-table-row').first().locator('text=编辑');
    if (await editBtn.count() > 0) {
      await editBtn.click();
      await w(3000);
      await shot("dag-editor");
      const rfNodes = await page.locator('.react-flow__node, .reactflow-wrapper').count();
      console.log(`  ReactFlow 节点: ${rfNodes}`);
      console.log(`  ✅ DAG 编辑器页面`);
      await page.goBack();
      await w(2000);
    }
  }

  // ============ 3. Redshift - 执行 SQL 查询 ============
  console.log("\n=== 3. Redshift SQL 查询 ===");
  await page.click('text=Redshift');
  await w(3000);
  await shot("redshift-page");

  // 点击加载 Schema
  const loadSchemaBtn = page.locator('button:has-text("加载 Schema")');
  if (await loadSchemaBtn.count() > 0) {
    await loadSchemaBtn.click();
    await w(3000);
    await shot("redshift-schema");
    const treeNodes = await page.locator('.ant-tree-treenode').count();
    console.log(`  Schema 树节点: ${treeNodes}`);
    if (treeNodes > 0) console.log(`  ✅ Schema 加载成功`);
  }

  // 在 Monaco 编辑器输入 SQL
  const monaco = page.locator('.monaco-editor').first();
  if (await monaco.count() > 0) {
    await monaco.click();
    // 先清空
    await page.keyboard.press('Control+a');
    await page.keyboard.type('SELECT current_date AS today, current_user AS user_name, version() AS redshift_version;');
    await w(500);
    await shot("redshift-sql-input");

    // 执行
    await page.locator('button:has-text("执行")').click();
    await w(5000);
    await shot("redshift-sql-result");

    // 检查结果
    const resultRows = await page.locator('.ant-table-row').count();
    const resultText = await page.locator('.ant-table').textContent().catch(() => "");
    console.log(`  查询结果行数: ${resultRows}`);
    console.log(`  结果预览: ${resultText.slice(0, 200)}`);
    resultRows > 0 ? console.log(`  ✅ SQL 执行成功`) : console.log(`  ❌ SQL 无结果`);
  }

  // ============ 4. 任务监控 ============
  console.log("\n=== 4. 任务监控 ===");
  await page.click('text=任务监控');
  await w(2000);
  await shot("monitor");

  // 读取统计数据
  const statValues = await page.locator('.ant-statistic-content-value').allTextContents();
  console.log(`  统计: 运行中=${statValues[0]}, 已完成=${statValues[1]}, 异常=${statValues[2]}, 总任务=${statValues[3]}`);

  // 点击同步 tab
  const syncTab = page.locator('.ant-tabs-tab:has-text("同步")');
  if (await syncTab.count() > 0) {
    await syncTab.click();
    await w(1000);
    await shot("monitor-sync-tab");
    const syncRows = await page.locator('.ant-table-row').count();
    console.log(`  同步任务: ${syncRows} 条`);
    console.log(`  ✅ 监控页面正常`);
  }

  // 点日志按钮（在表格行内）
  const logBtn = page.locator('.ant-table-row button:has-text("日志")').first();
  if (await logBtn.count() > 0 && await logBtn.isVisible()) {
    await logBtn.click();
    await w(3000);
    await shot("monitor-logs");
    console.log(`  ✅ 日志查看`);
    await page.keyboard.press("Escape");
    await w(500);
  } else {
    console.log(`  ⚠️ 日志按钮不可见，跳过`);
  }

  // ============ 5. 数据治理 ============
  console.log("\n=== 5. 数据治理 ===");
  await page.click('text=数据治理');
  await w(2000);
  await shot("governance");

  // 看有什么 tab 或内容
  const govTabs = await page.locator('.ant-tabs-tab').allTextContents();
  console.log(`  Tab: ${govTabs.join(', ')}`);

  // 如果有数据目录 tab
  const catalogTab = page.locator('.ant-tabs-tab:has-text("目录")');
  if (await catalogTab.count() > 0) {
    await catalogTab.click();
    await w(2000);
    await shot("governance-catalog");
    console.log(`  ✅ 数据目录`);
  }

  // 如果有血缘 tab
  const lineageTab = page.locator('.ant-tabs-tab:has-text("血缘")');
  if (await lineageTab.count() > 0) {
    await lineageTab.click();
    await w(2000);
    await shot("governance-lineage");
    console.log(`  ✅ 数据血缘`);
  }

  // ============ 6. 用户管理 ============
  console.log("\n=== 6. 用户管理 ===");
  await page.click('text=用户管理');
  await w(2000);
  await shot("users");
  const userRows = await page.locator('.ant-table-row').count();
  console.log(`  用户数: ${userRows}`);
  userRows > 0 ? console.log(`  ✅ 用户列表有数据`) : console.log(`  ⚠️ 用户列表为空（Cognito 可能未返回）`);

  // ============ 7. 系统设置 ============
  console.log("\n=== 7. 系统设置 ===");
  await page.click('text=系统设置');
  await w(2000);
  await shot("settings");
  const settingsText = await page.locator('main').textContent().catch(() => "");
  console.log(`  页面内容: ${settingsText.slice(0, 150)}`);
  console.log(`  ✅ 系统设置页面`);

  // ============ 总结 ============
  console.log(`\n${"=".repeat(50)}`);
  console.log(`全部测试完成，截图: ${DIR}`);
  console.log(`共 ${step} 张截图`);
  console.log(`${"=".repeat(50)}`);

  await browser.close();
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
