const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://BgpPla-BgpSe-evoV3iwr6pOV-467842334.us-east-1.elb.amazonaws.com";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/flow3";
fs.mkdirSync(DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = (n) => page.screenshot({ path: path.join(DIR, `${n}.png`), fullPage: true });
  const wait = (ms) => page.waitForTimeout(ms);

  console.log("=== 场景3: 启动同步任务 + 等待完成 + 验证日志和输出 ===\n");

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });

  // 1. 进入数据同步
  await page.click('text=数据同步');
  await wait(2000);
  await shot("01-同步列表");

  // 找到"订单表同步到S3数据湖"任务，点击详情
  const targetRow = page.locator('.ant-table-row:has-text("订单表同步到S3数据湖")');
  if (await targetRow.count() === 0) {
    console.log("❌ 未找到'订单表同步到S3数据湖'任务");
    await browser.close();
    return;
  }

  await targetRow.locator('a:has-text("详情")').click();
  await wait(3000);
  await shot("02-详情页-启动前");
  console.log("1. 进入任务详情页 ✅");

  // 记录启动前状态
  const statusBefore = await page.locator('.ant-badge-status-text').first().textContent().catch(() => "");
  console.log(`   启动前状态: ${statusBefore}`);

  // 2. 点击启动按钮
  console.log("\n2. 点击启动...");
  await page.locator('button:has-text("启动")').click();
  await wait(3000);
  await shot("03-启动后");

  // 检查是否有错误提示
  const errMsg = await page.locator('.ant-message-error').textContent().catch(() => "");
  if (errMsg) {
    console.log(`   ❌ 启动失败: ${errMsg}`);
    await browser.close();
    return;
  }

  const successMsg = await page.locator('.ant-message-success').textContent().catch(() => "");
  console.log(`   启动消息: ${successMsg || "无提示"}`);

  // 3. 等待 Glue Job 完成，每 15 秒刷新页面检查状态
  console.log("\n3. 等待 Glue Job 完成...");
  let finalStatus = "";
  for (let i = 0; i < 20; i++) {
    await wait(15000);
    await page.locator('button:has-text("刷新")').first().click();
    await wait(3000);

    // 读取 Glue 状态
    const glueStatus = await page.locator('text=SUCCEEDED').count() > 0 ? "SUCCEEDED" :
                        await page.locator('text=FAILED').count() > 0 ? "FAILED" :
                        await page.locator('text=RUNNING').count() > 0 ? "RUNNING" : "UNKNOWN";
    console.log(`   [${(i+1)*15}s] Glue: ${glueStatus}`);
    await shot(`04-等待-${(i+1)*15}s`);

    if (glueStatus === "SUCCEEDED" || glueStatus === "FAILED") {
      finalStatus = glueStatus;
      break;
    }
  }

  console.log(`\n4. 最终状态: ${finalStatus}`);
  await shot("05-最终状态");

  // 4. 检查运行日志
  console.log("\n5. 检查运行日志...");
  await page.locator('.ant-tabs-tab:has-text("运行日志")').click();
  await wait(3000);
  // 点击刷新日志
  const refreshLogBtn = page.locator('button:has-text("刷新日志")');
  if (await refreshLogBtn.count() > 0) {
    await refreshLogBtn.click();
    await wait(5000);
  }
  await shot("06-运行日志");

  // 读取日志内容
  const logContent = await page.locator('[style*="monospace"]').textContent().catch(() => "");
  const logLines = logContent.split('\n').filter(l => l.trim());
  console.log(`   日志行数: ${logLines.length}`);
  if (logLines.length > 0) {
    // 检查关键日志
    const hasSync = logLines.some(l => l.includes("Syncing") || l.includes("Read") || l.includes("Written"));
    const hasError = logLines.some(l => l.includes("ERROR") || l.includes("error") || l.includes("Exception"));
    const hasResult = logLines.some(l => l.includes("SYNC RESULTS") || l.includes("completed"));
    console.log(`   包含同步信息: ${hasSync ? "✅" : "❌"}`);
    console.log(`   包含错误: ${hasError ? "⚠️ 有错误" : "✅ 无错误"}`);
    console.log(`   包含完成信息: ${hasResult ? "✅" : "❌"}`);
    // 打印最后几行
    console.log("   --- 日志尾部 ---");
    logLines.slice(-5).forEach(l => console.log(`   ${l.slice(0, 120)}`));
  } else {
    console.log("   ⚠️ 日志为空");
  }

  // 5. 检查输出结果
  console.log("\n6. 检查输出结果...");
  await page.locator('.ant-tabs-tab:has-text("输出结果")').click();
  await wait(3000);
  await shot("07-输出结果");

  const outputRows = await page.locator('.ant-table-row').count();
  console.log(`   S3 输出文件: ${outputRows} 个`);

  if (outputRows > 0) {
    // 读取文件列表
    const files = await page.locator('.ant-table-row').allTextContents();
    files.slice(0, 5).forEach(f => console.log(`   📁 ${f.slice(0, 100)}`));
    console.log("   输出文件验证 ✅");
  } else {
    console.log("   ⚠️ 无输出文件");
  }

  // 6. 检查运行历史
  console.log("\n7. 检查运行历史...");
  await page.locator('.ant-tabs-tab:has-text("运行历史")').click();
  await wait(2000);
  await shot("08-运行历史");

  const historyRows = await page.locator('.ant-table-row').count();
  console.log(`   运行记录: ${historyRows} 条`);

  if (historyRows > 0) {
    const historyContent = await page.locator('.ant-table-row').first().textContent().catch(() => "");
    console.log(`   最新记录: ${historyContent?.slice(0, 100)}`);
    console.log("   运行历史验证 ✅");
  }

  // 7. 验证状态一致性
  console.log("\n8. 状态一致性验证:");
  console.log(`   Glue 状态: ${finalStatus}`);
  console.log(`   日志有内容: ${logLines.length > 0 ? "✅" : "❌"}`);
  console.log(`   输出文件: ${outputRows > 0 ? "✅" : "❌"}`);
  console.log(`   运行历史: ${historyRows > 0 ? "✅" : "❌"}`);

  const allGood = finalStatus === "SUCCEEDED" && outputRows > 0 && historyRows > 0;
  console.log(`\n=== 场景3 ${allGood ? "全部通过 ✅" : "部分失败 ⚠️"} ===`);

  await browser.close();
}

run().catch(e => { console.error("Error:", e.message); process.exit(1); });
