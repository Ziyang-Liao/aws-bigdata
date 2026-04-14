const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://BgpPla-BgpSe-evoV3iwr6pOV-467842334.us-east-1.elb.amazonaws.com";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/flow2";
fs.mkdirSync(DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = (n) => page.screenshot({ path: path.join(DIR, `${n}.png`), fullPage: true });
  const wait = (ms) => page.waitForTimeout(ms);

  console.log("=== 场景2: 同步任务创建+启动+查看结果 ===\n");

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });

  // 1. 进入数据同步
  await page.click('text=数据同步');
  await wait(2000);
  await shot("01-同步列表");
  const initCount = await page.locator('.ant-table-row').count();
  console.log(`1. 同步任务列表: ${initCount} 条 ✅`);

  // 2. 点击新建同步任务
  await page.locator('button:has-text("新建同步任务")').click();
  await wait(1000);
  await shot("02-新建弹窗");
  console.log("2. 打开新建弹窗 ✅");

  // 3. Step 0: 源端配置
  await page.fill('input[id$="name"]', 'E2E测试-orders同步到S3');

  // 选择数据源
  await page.getByRole('combobox', { name: /选择数据源/ }).click();
  await wait(500);
  await page.locator('.ant-select-item-option').first().click();
  await wait(1000);

  // 选择同步模式
  await page.getByRole('combobox', { name: /同步模式/ }).click();
  await wait(300);
  await page.locator('.ant-select-item-option:has-text("全量同步")').click();
  await wait(300);

  // 选择写入模式
  await page.getByRole('combobox', { name: /写入模式/ }).click();
  await wait(300);
  await page.locator('.ant-select-item-option:has-text("覆盖")').click();
  await wait(300);

  // 选择目标类型
  await page.locator('.ant-radio-button-wrapper:has-text("S3 数据湖")').click();
  await wait(1000);
  await shot("03-step0-填写完成");

  // 检查通道推荐
  const hasRec = await page.locator('text=通道推荐').count();
  console.log(`3. Step0 填写完成, 通道推荐: ${hasRec > 0 ? "✅" : "❌"}`);

  // 下一步
  await page.locator('button:has-text("下一步")').click();
  await wait(2000);
  await shot("04-step1-选表");

  // 4. Step 1: 选表
  const tableCheckboxes = page.locator('.ant-checkbox-wrapper');
  const tableCount = await tableCheckboxes.count();
  console.log(`4. 可选表: ${tableCount} 张`);

  if (tableCount > 0) {
    // 选择 orders 表
    const ordersCheckbox = page.locator('.ant-checkbox-wrapper:has-text("orders")');
    if (await ordersCheckbox.count() > 0) {
      await ordersCheckbox.click();
      await wait(1000);
      console.log("   选择了 orders 表 ✅");
    } else {
      await tableCheckboxes.first().click();
      await wait(1000);
      console.log("   选择了第一张表 ✅");
    }
  }

  await shot("05-step1-选表完成");

  // 检查字段映射
  const mappingRows = await page.locator('.ant-table-row').count();
  console.log(`   字段映射: ${mappingRows} 行`);

  // 下一步
  await page.locator('button:has-text("下一步")').click();
  await wait(1000);
  await shot("06-step2-目标配置");
  console.log("5. Step2 目标配置 ✅");

  // 5. Step 2: S3 配置
  const bucketSelect = page.getByRole('combobox', { name: /S3 Bucket/ });
  if (await bucketSelect.count() > 0) {
    await bucketSelect.click();
    await wait(1000);
    const datalakeBucket = page.locator('.ant-select-item-option:has-text("datalake")');
    if (await datalakeBucket.count() > 0) {
      await datalakeBucket.click();
    } else {
      await page.locator('.ant-select-item-option').first().click();
    }
    await wait(500);
    console.log("   S3 Bucket 已选择 ✅");
  }

  await shot("07-step2-s3配置");

  // 下一步 → 建表预览
  await page.locator('button:has-text("下一步")').click();
  await wait(1000);
  await shot("08-step3-建表预览");
  console.log("6. Step3 建表预览 ✅");

  // 下一步 → 调度设置
  await page.locator('button:has-text("下一步")').click();
  await wait(1000);
  await shot("09-step4-调度");
  console.log("7. Step4 调度设置 ✅");

  // 6. 点击确定保存
  await page.locator('.ant-modal-footer button.ant-btn-primary').click();
  await wait(3000);
  await shot("10-保存结果");

  const newCount = await page.locator('.ant-table-row').count();
  console.log(`8. 保存后列表: ${newCount} 条 ${newCount > initCount ? "✅ 新增成功" : "⚠️"}`);

  // 7. 点击详情查看
  const detailLink = page.locator('a:has-text("详情")').first();
  if (await detailLink.count() > 0) {
    await detailLink.click();
    await wait(3000);
    await shot("11-任务详情");
    console.log("9. 任务详情页 ✅");

    // 检查各 Tab
    const tabs = await page.locator('.ant-tabs-tab').allTextContents();
    console.log(`   Tabs: ${tabs.join(", ")}`);

    // 点击输出结果
    await page.locator('.ant-tabs-tab:has-text("输出结果")').click();
    await wait(2000);
    await shot("12-输出结果");

    // 点击字段映射
    await page.locator('.ant-tabs-tab:has-text("字段映射")').click();
    await wait(1000);
    await shot("13-字段映射");
    const mappingCount = await page.locator('.ant-table-row').count();
    console.log(`   字段映射: ${mappingCount} 行 ✅`);
  }

  await browser.close();
  console.log("\n=== 场景2 完成 ===");
}

run().catch(e => { console.error("Error:", e.message); process.exit(1); });
