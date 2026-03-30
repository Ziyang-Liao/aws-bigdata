const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://BgpPla-BgpSe-evoV3iwr6pOV-467842334.us-east-1.elb.amazonaws.com";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/flow1";
fs.mkdirSync(DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = (n) => page.screenshot({ path: path.join(DIR, `${n}.png`), fullPage: true });
  const wait = (ms) => page.waitForTimeout(ms);

  console.log("=== 场景1: 创建数据源（完整流程）===\n");

  // 1. 打开首页
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await shot("01-首页");
  console.log("1. 打开首页 ✅");

  // 2. 点击侧边栏"数据源管理"
  await page.click('text=数据源管理');
  await wait(2000);
  await shot("02-数据源列表");
  console.log("2. 进入数据源管理 ✅");

  // 3. 点击"新建数据源"
  await page.click('text=新建数据源');
  await wait(1000);
  await shot("03-新建弹窗-step1");
  console.log("3. 打开新建弹窗 ✅");

  // 4. Step1: 填写基本信息
  await page.fill('input[id$="name"]', '测试数据源-自动化验证');
  // 选择数据库类型
  await page.getByRole('combobox', { name: /数据库类型/ }).click();
  await wait(500);
  await page.getByTitle('MySQL').or(page.locator('.ant-select-item-option').filter({ hasText: 'MySQL' })).first().click();
  await wait(500);
  // 选择环境
  const prodBtn = page.locator('.ant-radio-button-wrapper').filter({ hasText: '生产' });
  if (await prodBtn.count() > 0) await prodBtn.click();
  await wait(300);
  await shot("04-step1-填写完成");
  console.log("4. Step1 填写基本信息 ✅");

  // 5. 点击"下一步"
  await page.click('text=下一步');
  await wait(1000);
  await shot("05-step2-连接配置");
  console.log("5. 进入 Step2 连接配置 ✅");

  // 6. Step2: 填写连接信息
  // 先试试"从 RDS 选择"
  const rdsBtn = page.locator('text=从 RDS 选择');
  if (await rdsBtn.count() > 0) {
    await rdsBtn.click();
    await wait(3000);
    await shot("06-rds发现");
    console.log("6. RDS 实例发现 ✅");

    // 如果有 RDS 实例，点击选择
    const rdsItem = page.getByText('bgp-source-mysql', { exact: true });
    if (await rdsItem.count() > 0) {
      await rdsItem.click();
      await wait(500);
      console.log("   选择了 bgp-source-mysql ✅");
    }
  }

  // 填写剩余字段
  const hostInput = page.locator('input[id$="host"]');
  const currentHost = await hostInput.inputValue();
  if (!currentHost) {
    await hostInput.fill('bgp-source-mysql.cmjyssc8ul2m.us-east-1.rds.amazonaws.com');
  }

  const portInput = page.locator('input[id$="port"]');
  const currentPort = await portInput.inputValue();
  if (!currentPort || currentPort === '0') {
    await portInput.fill('3306');
  }

  await page.fill('input[id$="database"]', 'ecommerce');
  await page.fill('input[id$="username"]', 'admin');
  await page.fill('input[type="password"]', 'BgpSource2026!');
  await wait(300);
  await shot("07-step2-填写完成");
  console.log("7. Step2 连接信息填写完成 ✅");

  // 7. 点击"测试连接"
  const testBtn = page.locator('text=测试连接');
  if (await testBtn.count() > 0) {
    console.log("8. 点击测试连接...");
    await testBtn.click();
    await wait(15000); // 测试连接需要时间
    await shot("08-测试连接结果");
    
    const alertSuccess = await page.locator('.ant-alert-success').count();
    const alertError = await page.locator('.ant-alert-error').count();
    if (alertSuccess > 0) console.log("   测试连接成功 ✅");
    else if (alertError > 0) {
      const errMsg = await page.locator('.ant-alert-error').textContent();
      console.log(`   测试连接失败 ❌: ${errMsg?.slice(0, 100)}`);
    } else {
      console.log("   测试连接结果未知 ⚠️");
    }
  }

  // 8. 点击"创建数据源"保存
  console.log("9. 点击创建数据源...");
  await page.locator('.ant-modal-footer button.ant-btn-primary').last().click();
  await wait(15000);
  await shot("09-创建结果");

  // 检查是否进入 Step3 确认页
  const successResult = await page.locator('.ant-result-success').count();
  const step3Visible = await page.locator('text=数据源创建成功').count();
  if (successResult > 0 || step3Visible > 0) {
    console.log("   数据源创建成功 ✅");
    await shot("09b-创建成功");
    await page.click('text=完成');
    await wait(1000);
  } else {
    // 检查是否有错误提示
    const errMsg = await page.locator('.ant-message-error').textContent().catch(() => "");
    const stillStep2 = await page.locator('text=测试连接').count();
    if (stillStep2 > 0) {
      console.log("   还在 Step2，可能正在创建中... 再等 20 秒");
      await wait(20000);
      await shot("09c-再次检查");
      const success2 = await page.locator('.ant-result-success').count();
      if (success2 > 0) {
        console.log("   数据源创建成功（延迟）✅");
        await page.click('text=完成');
        await wait(1000);
      } else {
        console.log(`   创建结果不确定 ⚠️ ${errMsg}`);
        await page.keyboard.press("Escape");
      }
    } else {
      console.log(`   创建结果: ${errMsg || "检查截图"} ⚠️`);
      await page.keyboard.press("Escape");
    }
    await wait(500);
  }

  // 9. 验证列表中是否出现新数据源
  await wait(2000);
  await shot("10-创建后列表");
  const rows = await page.locator('.ant-table-row').count();
  console.log(`10. 数据源列表: ${rows} 条记录`);

  // 10. 点击"浏览表"查看元数据
  const browseBtn = page.locator('text=浏览表').first();
  if (await browseBtn.count() > 0) {
    await browseBtn.click();
    await wait(3000);
    await shot("11-元数据浏览");
    console.log("11. 元数据浏览 ✅");

    // 展开第一个表
    const collapseItem = page.locator('.ant-collapse-item').first();
    if (await collapseItem.count() > 0) {
      await collapseItem.click();
      await wait(1000);
      await shot("12-表字段详情");
      console.log("12. 表字段详情 ✅");
    }

    // 关闭 Drawer
    await page.locator('.ant-drawer-close').click();
    await wait(500);
  }

  await browser.close();
  console.log("\n=== 场景1 完成 ===");
  console.log(`截图: ${DIR}/`);
}

run().catch(e => { console.error("Error:", e.message); process.exit(1); });
