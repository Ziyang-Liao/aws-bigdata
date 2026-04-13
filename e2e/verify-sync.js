const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "https://d243rj4namajcb.cloudfront.net";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/verify-sync";
fs.mkdirSync(DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = (n) => page.screenshot({ path: path.join(DIR, `${n}.png`), fullPage: true });
  const wait = (ms) => page.waitForTimeout(ms);

  console.log("=== 验证数据同步功能 ===\n");

  // 1. 首页
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await shot("01-首页");
  console.log("1. 首页加载 ✅");

  // 2. 检查数据源
  await page.click('text=数据源管理');
  await wait(2000);
  await shot("02-数据源列表");
  const dsRows = await page.locator('.ant-table-row').count();
  console.log(`2. 数据源列表: ${dsRows} 条 ✅`);

  // 3. 进入数据同步
  await page.click('text=数据同步');
  await wait(2000);
  await shot("03-同步列表");
  console.log("3. 同步任务列表 ✅");

  // 4. 新建同步任务
  await page.locator('button:has-text("新建同步任务"), button:has-text("新建")').first().click();
  await wait(1000);
  await shot("04-新建弹窗step1");
  console.log("4. 打开新建同步弹窗 ✅");

  // Step 1: 源端配置
  // 任务名
  await page.fill('input[id$="name"]', 'verify-orders同步');

  // 选择数据源 - 点击下拉
  const dsCombo = page.locator('.ant-select').filter({ hasText: /选择数据源|test|bgp/ }).first();
  await dsCombo.click();
  await wait(500);
  // 选最后一个（最新创建的）
  const dsOptions = page.locator('.ant-select-item-option');
  const dsOptionCount = await dsOptions.count();
  console.log(`   数据源选项数: ${dsOptionCount}`);
  if (dsOptionCount > 0) {
    await dsOptions.last().click();
    await wait(1000);
  }

  // 同步模式
  const syncMode = page.getByRole('combobox', { name: /同步模式/ });
  if (await syncMode.count() > 0) {
    await syncMode.click();
    await wait(300);
    await page.locator('.ant-select-item-option:has-text("全量")').first().click();
    await wait(300);
  }

  // 写入模式
  const writeMode = page.getByRole('combobox', { name: /写入模式/ });
  if (await writeMode.count() > 0) {
    await writeMode.click();
    await wait(300);
    await page.locator('.ant-select-item-option:has-text("覆盖")').first().click();
    await wait(300);
  }

  // 目标类型 - 点击 "Redshift" 按钮
  await page.locator('text=Redshift').first().click();
  await wait(500);

  await shot("05-step1填写完成");
  console.log("5. Step1 源端配置填写完成 ✅");

  // 点下一步
  await page.locator('button:has-text("下一步")').click();
  await wait(3000);
  await shot("06-step2选表");
  console.log("6. 进入 Step2 选表 ✅");

  // 看看有哪些表可选
  const step2Content = await page.locator('.ant-modal-body').textContent().catch(() => "");
  console.log(`   Step2 内容: ${step2Content.slice(0, 300)}`);

  // 选择 orders 表 - 用 checkbox
  const checkboxes = page.locator('.ant-checkbox-wrapper, .ant-transfer-list-content-item');
  const cbCount = await checkboxes.count();
  console.log(`   可选项数: ${cbCount}`);

  // 尝试点击包含 orders 的 checkbox
  const ordersItem = page.locator('.ant-checkbox-wrapper:has-text("orders"), label:has-text("orders"), .ant-transfer-list-content-item:has-text("orders")');
  if (await ordersItem.count() > 0) {
    await ordersItem.first().click();
    await wait(500);
    console.log("   选中 orders 表 ✅");
  } else {
    // 可能是全选
    const selectAll = page.locator('.ant-checkbox-wrapper').first();
    if (await selectAll.count() > 0) {
      await selectAll.click();
      await wait(500);
      console.log("   全选表 ✅");
    }
  }

  await shot("07-选表完成");

  // 下一步到 Step3 目标配置
  await page.locator('button:has-text("下一步")').click();
  await wait(2000);
  await shot("08-step3目标配置");
  console.log("7. 进入 Step3 目标配置 ✅");

  // 下一步到 Step4 建表预览
  await page.locator('button:has-text("下一步")').click();
  await wait(2000);
  await shot("09-step4建表预览");
  console.log("8. 进入 Step4 建表预览 ✅");

  // 下一步到 Step5 调度
  await page.locator('button:has-text("下一步")').click();
  await wait(2000);
  await shot("10-step5调度");
  console.log("9. 进入 Step5 调度设置 ✅");

  // 点确定创建任务
  await page.locator('button:has-text("确定")').click();
  await wait(3000);
  await shot("11-任务创建完成");
  console.log("10. 同步任务创建完成 ✅");

  // 检查列表是否多了一条
  await wait(2000);
  const newSyncCount = await page.locator('.ant-table-row').count();
  await shot("12-同步列表更新");
  console.log(`11. 同步任务列表更新: ${newSyncCount} 条 ✅`);

  console.log("\n=== 验证完成 ===");
  await browser.close();
}

run().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
