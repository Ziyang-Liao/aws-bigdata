const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://BgpPla-BgpSe-evoV3iwr6pOV-467842334.us-east-1.elb.amazonaws.com";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/flow4";
fs.mkdirSync(DIR, { recursive: true });

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = (n) => page.screenshot({ path: path.join(DIR, `${n}.png`), fullPage: true });
  const wait = (ms) => page.waitForTimeout(ms);

  console.log("=== 场景4: S3 Tables 同步任务（真人操作）===\n");

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });

  // 1. 进入数据同步
  await page.click('text=数据同步');
  await wait(2000);
  console.log("1. 进入数据同步页面 ✅");

  // 2. 点击第一个任务的详情
  const detailLink = page.locator('a:has-text("详情")').first();
  if (await detailLink.count() === 0) { console.log("❌ 没有任务"); await browser.close(); return; }
  await detailLink.click();
  await wait(3000);
  await shot("01-详情页");
  console.log("2. 进入任务详情页 ✅");

  // 3. 点击启动
  const startBtn = page.locator('button:has-text("启动")');
  if (await startBtn.count() > 0) {
    console.log("3. 点击启动按钮...");
    await startBtn.click();
    await wait(3000);
    await shot("02-启动后");

    // 检查错误
    const errMsg = await page.locator('.ant-message-error').textContent().catch(() => "");
    if (errMsg) { console.log(`   ❌ 启动失败: ${errMsg}`); }
    else { console.log("   启动请求已发送 ✅"); }
  } else {
    console.log("3. 没有启动按钮（可能正在运行）");
  }

  // 4. 等待 Glue Job 完成 — 每 15 秒点刷新
  console.log("\n4. 等待任务完成...");
  let finalStatus = "";
  for (let i = 0; i < 15; i++) {
    await wait(15000);
    // 点击刷新按钮
    const refreshBtn = page.locator('button:has-text("刷新")').first();
    if (await refreshBtn.count() > 0) await refreshBtn.click();
    await wait(3000);

    // 读取 Glue 状态
    const succeeded = await page.locator('text=SUCCEEDED').count();
    const failed = await page.locator('text=FAILED').count();
    const running = await page.locator('text=RUNNING').count();
    const status = succeeded > 0 ? "SUCCEEDED" : failed > 0 ? "FAILED" : running > 0 ? "RUNNING" : "UNKNOWN";
    console.log(`   [${(i+1)*15}s] ${status}`);

    if (status === "SUCCEEDED" || status === "FAILED") {
      finalStatus = status;
      await shot(`03-完成-${status}`);
      break;
    }
  }
  console.log(`   最终状态: ${finalStatus}`);

  // 5. 查看运行日志 Tab
  console.log("\n5. 查看运行日志...");
  const logTab = page.locator('.ant-tabs-tab:has-text("运行日志")');
  if (await logTab.count() > 0) {
    await logTab.click();
    await wait(2000);
    // 点击刷新日志
    const refreshLogBtn = page.locator('button:has-text("刷新日志")');
    if (await refreshLogBtn.count() > 0) {
      await refreshLogBtn.click();
      await wait(5000);
    }
    await shot("04-运行日志");

    // 读取日志关键内容
    const logArea = page.locator('[style*="monospace"]');
    if (await logArea.count() > 0) {
      const logText = await logArea.textContent();
      const hasS3Tables = logText.includes("S3 Tables") || logText.includes("s3tablescatalog");
      const hasSuccess = logText.includes("Written to S3 Tables") || logText.includes("SYNC RESULTS");
      const hasError = logText.includes("S3 Tables write error");
      console.log(`   日志包含 S3 Tables: ${hasS3Tables ? "✅" : "❌"}`);
      console.log(`   写入成功: ${hasSuccess ? "✅" : "❌"}`);
      console.log(`   有错误: ${hasError ? "⚠️" : "✅ 无错误"}`);

      // 打印关键行
      const lines = logText.split('\n').filter(l => l.includes("Read ") || l.includes("Written") || l.includes("SYNC RESULTS") || l.includes("S3 Tables") || l.includes("OVERWRITE") || l.includes("CREATE"));
      lines.slice(0, 5).forEach(l => console.log(`   📋 ${l.trim().slice(0, 120)}`));
    }
  }

  // 6. 查看运行历史 Tab
  console.log("\n6. 查看运行历史...");
  const historyTab = page.locator('.ant-tabs-tab:has-text("运行历史")');
  if (await historyTab.count() > 0) {
    await historyTab.click();
    await wait(2000);
    await shot("05-运行历史");

    const historyRows = await page.locator('.ant-table-row').count();
    console.log(`   运行记录: ${historyRows} 条`);

    // 点击第一条的日志按钮
    const logBtn = page.locator('button:has-text("查看")').first();
    if (await logBtn.count() > 0) {
      await logBtn.click();
      await wait(5000);
      await shot("06-运行日志弹窗");

      const modal = await page.locator('.ant-modal').count();
      console.log(`   日志弹窗: ${modal > 0 ? "✅ 打开" : "❌ 未打开"}`);

      if (modal > 0) {
        const modalLog = await page.locator('.ant-modal [style*="monospace"]').textContent().catch(() => "");
        console.log(`   弹窗日志长度: ${modalLog.length} 字符`);
        // 关闭弹窗
        await page.locator('.ant-modal-close').click().catch(() => {});
        await wait(500);
      }
    }
  }

  // 7. 查看输出结果 Tab
  console.log("\n7. 查看输出结果...");
  const outputTab = page.locator('.ant-tabs-tab:has-text("输出结果")');
  if (await outputTab.count() > 0) {
    await outputTab.click();
    await wait(3000);
    await shot("07-输出结果");

    const outputRows = await page.locator('.ant-table-row').count();
    console.log(`   输出文件: ${outputRows} 个`);
  }

  // 总结
  const allGood = finalStatus === "SUCCEEDED";
  console.log(`\n=== 场景4 ${allGood ? "通过 ✅" : "失败 ❌"} ===`);

  await browser.close();
}

run().catch(e => { console.error("Error:", e.message); process.exit(1); });
