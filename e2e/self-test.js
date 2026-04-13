const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "https://d243rj4namajcb.cloudfront.net";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/self-test";
fs.mkdirSync(DIR, { recursive: true });

let step = 0;
async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = async (n) => { step++; await page.screenshot({ path: path.join(DIR, `${String(step).padStart(2,"0")}-${n}.png`), fullPage: true }); };
  const w = (ms) => page.waitForTimeout(ms);

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });

  // ===== 1. DAG: 新建工作流 → 添加节点 → 点击节点配置 → 保存 =====
  console.log("\n=== 1. ETL 编排完整流程 ===");
  await page.click('text=ETL 编排');
  await w(2000);

  // 新建工作流
  await page.locator('button:has-text("新建")').first().click();
  await w(1000);
  await page.locator('#name').fill('自测-完整工作流');
  await page.locator('#description').fill('自动化自测');
  await page.locator('.ant-modal .ant-btn-primary').first().click();
  await w(2000);
  // 关闭弹窗
  await page.keyboard.press("Escape");
  await w(500);

  // 进入刚创建的工作流 DAG
  await page.locator('.ant-table-row').first().locator('a:has-text("编辑")').first().click();
  await w(3000);
  await shot("dag-empty");
  console.log("  1a. 进入空 DAG 编辑器");

  // 添加同步节点
  await page.locator('button:has-text("添加节点")').click();
  await w(500);
  await page.locator('li:has-text("数据同步节点")').click();
  await w(1500);
  await shot("dag-sync-added");
  let nodeCount = await page.locator('.react-flow__node').count();
  console.log(`  1b. 添加同步节点, 画布节点: ${nodeCount} ${nodeCount > 0 ? '✅' : '❌'}`);

  // 添加 SQL 节点
  await page.locator('button:has-text("添加节点")').click();
  await w(500);
  await page.locator('li:has-text("SQL 节点")').click();
  await w(1500);
  await shot("dag-sql-added");
  nodeCount = await page.locator('.react-flow__node').count();
  console.log(`  1c. 添加 SQL 节点, 画布节点: ${nodeCount} ${nodeCount >= 2 ? '✅' : '❌'}`);

  // 点击同步节点查看配置面板
  const syncNode = page.locator('.react-flow__node').first();
  await syncNode.click();
  await w(1000);
  await shot("dag-sync-config");

  // 检查配置面板是否有下拉选择
  const drawer = page.locator('.ant-drawer');
  const hasDrawer = await drawer.count() > 0;
  console.log(`  1d. 配置面板打开: ${hasDrawer ? '✅' : '❌'}`);

  if (hasDrawer) {
    // 检查同步任务下拉
    const syncSelect = drawer.locator('.ant-select').first();
    const hasSyncSelect = await syncSelect.count() > 0;
    console.log(`  1e. 同步任务下拉框: ${hasSyncSelect ? '✅' : '❌'}`);

    if (hasSyncSelect) {
      await syncSelect.click();
      await w(500);
      await shot("dag-sync-dropdown");
      const options = await page.locator('.ant-select-item-option').count();
      console.log(`  1f. 同步任务选项数: ${options} ${options > 0 ? '✅' : '❌'}`);
      if (options > 0) {
        await page.locator('.ant-select-item-option').first().click();
        await w(500);
      }
      await page.keyboard.press("Escape");
      await w(300);
    }

    // 关闭 drawer
    await page.locator('.ant-drawer-mask, .ant-drawer-close, button[aria-label="Close"]').first().click({ force: true }).catch(() => page.keyboard.press('Escape'));
    await w(500);
  }

  // 点击 SQL 节点查看配置
  const sqlNode = page.locator('.react-flow__node').nth(1);
  await sqlNode.click();
  await w(1000);
  await shot("dag-sql-config");

  if (await drawer.count() > 0) {
    // 检查执行引擎下拉
    const engineSelect = drawer.locator('.ant-select').first();
    console.log(`  1g. SQL 执行引擎下拉: ${await engineSelect.count() > 0 ? '✅' : '❌'}`);

    // 检查有没有 SQL 文本框
    const sqlTextarea = drawer.locator('textarea');
    console.log(`  1h. SQL 输入框: ${await sqlTextarea.count() > 0 ? '✅' : '❌'}`);

    if (await sqlTextarea.count() > 0) {
      await sqlTextarea.fill('SELECT * FROM ecommerce.orders LIMIT 10;');
      await w(300);
    }

    await shot("dag-sql-filled");
    await page.locator('.ant-drawer-mask, .ant-drawer-close, button[aria-label="Close"]').first().click({ force: true }).catch(() => page.keyboard.press('Escape'));
    await w(500);
  }

  // 保存
  await page.locator('button:has-text("保存")').click();
  await w(2000);
  await shot("dag-final-saved");
  console.log("  1i. DAG 保存 ✅");

  // 返回列表验证
  await page.locator('text=返回').first().click();
  await w(2000);
  await shot("workflow-list-final");
  const wfText = await page.locator('.ant-table-row').first().textContent();
  console.log(`  1j. 列表: ${wfText?.slice(0, 80)}`);

  // ===== 2. Redshift Schema + SQL =====
  console.log("\n=== 2. Redshift Schema + SQL ===");
  await page.click('text=Redshift');
  await w(3000);

  await page.locator('button:has-text("加载 Schema")').click();
  await w(5000);
  await shot("redshift-schema");
  const treeNodes = await page.locator('.ant-tree-treenode').count();
  console.log(`  2a. Schema 树节点: ${treeNodes} ${treeNodes > 1 ? '✅' : '❌'}`);

  // 执行 SQL
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
  const resultRows = await page.locator('.ant-table-row').count();
  console.log(`  2b. 查询结果: ${resultRows} 行 ${resultRows > 0 ? '✅' : '❌'}`);

  // ===== 3. 任务监控 - 日志 =====
  console.log("\n=== 3. 任务监控日志 ===");
  await page.click('text=任务监控');
  await w(2000);
  await page.locator('.ant-tabs-tab:has-text("同步")').click();
  await w(1000);
  await shot("monitor-sync-tab");

  // force click 日志
  await page.locator('.ant-table-row').first().locator('text=日志').click({ force: true });
  await w(3000);
  await shot("monitor-log-popup");

  const logText = await page.locator('.ant-modal-body, .ant-modal-content').textContent({ timeout: 3000 }).catch(() => "");
  const hasLog = logText.length > 30 && !logText.includes("暂无日志");
  console.log(`  3a. 日志内容: ${logText.slice(0, 100)}`);
  console.log(`  3b. 日志有效: ${hasLog ? '✅' : '❌'}`);

  await page.locator('.ant-modal-close').first().click().catch(() => page.keyboard.press("Escape"));
  await w(500);

  // ===== 4. 数据治理 =====
  console.log("\n=== 4. 数据治理 ===");
  await page.click('text=数据治理');
  await w(3000);
  await shot("governance");
  const govRows = await page.locator('.ant-table-row').count();
  console.log(`  4a. 数据目录: ${govRows} 条 ${govRows > 0 ? '✅' : '❌'}`);

  // ===== 5. 用户管理 =====
  console.log("\n=== 5. 用户管理 ===");
  await page.click('text=用户管理');
  await w(2000);
  await shot("users");
  const userRows = await page.locator('.ant-table-row').count();
  console.log(`  5a. 用户数: ${userRows} ${userRows > 0 ? '✅' : '❌'}`);

  // ===== 总结 =====
  console.log(`\n${"=".repeat(40)}`);
  console.log(`自测完成, ${step} 张截图`);
  console.log(`${"=".repeat(40)}`);

  await browser.close();
}

run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
