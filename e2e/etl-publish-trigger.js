const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const BASE = "https://d243rj4namajcb.cloudfront.net";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/etl-publish";
fs.mkdirSync(DIR, { recursive: true });
let s = 0;
async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = async (n) => { s++; await page.screenshot({ path: path.join(DIR, `${String(s).padStart(2,"0")}-${n}.png`), fullPage: true }); };
  const w = (ms) => page.waitForTimeout(ms);

  // 监听 console 错误
  const errors = [];
  page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });

  // 进入 ETL 编排
  console.log("\n=== ETL 发布 + 触发 ===");
  await page.click('text=ETL 编排');
  await w(2000);
  await shot("etl-list");

  // 找第一个有节点的工作流，点"发布"
  const firstRow = page.locator('.ant-table-row').first();
  const rowText = await firstRow.textContent();
  console.log(`  工作流: ${rowText?.slice(0, 60)}`);

  // 点发布链接
  await firstRow.locator('text=发布').click();
  await w(3000);
  await shot("etl-publish-result");

  // 检查是否有成功/失败提示
  const msgSuccess = await page.locator('.ant-message-success').count();
  const msgError = await page.locator('.ant-message-error').count();
  const msgText = await page.locator('.ant-message-notice-content').textContent().catch(() => "");
  console.log(`  发布结果: ${msgText || '无提示'}`);
  console.log(`  成功提示: ${msgSuccess}, 错误提示: ${msgError}`);
  msgSuccess > 0 ? console.log("  ✅ 发布成功") : (msgError > 0 ? console.log(`  ❌ 发布失败: ${msgText}`) : console.log("  ⚠️ 无明确提示"));

  await w(2000);

  // 点触发
  await firstRow.locator('text=触发').click();
  await w(3000);
  await shot("etl-trigger-result");

  const trigMsgSuccess = await page.locator('.ant-message-success').count();
  const trigMsgError = await page.locator('.ant-message-error').count();
  const trigMsgText = await page.locator('.ant-message-notice-content').textContent().catch(() => "");
  console.log(`  触发结果: ${trigMsgText || '无提示'}`);
  trigMsgSuccess > 0 ? console.log("  ✅ 触发成功") : (trigMsgError > 0 ? console.log(`  ❌ 触发失败: ${trigMsgText}`) : console.log("  ⚠️ 无明确提示"));

  // 也从 DAG 编辑器里测试发布和触发
  console.log("\n=== DAG 编辑器内发布 + 触发 ===");
  await firstRow.locator('a:has-text("编辑")').first().click();
  await w(3000);
  await shot("dag-editor");

  // 点发布按钮
  await page.locator('button:has-text("发布")').click();
  await w(3000);
  await shot("dag-publish");
  const pubMsg = await page.locator('.ant-message-notice-content').textContent().catch(() => "");
  console.log(`  DAG发布: ${pubMsg}`);
  pubMsg.includes("已发布") ? console.log("  ✅ DAG 发布成功") : console.log(`  ⚠️ ${pubMsg}`);

  await w(1000);

  // 点触发运行按钮
  await page.locator('button:has-text("触发运行")').click();
  await w(3000);
  await shot("dag-trigger");
  const trigMsg = await page.locator('.ant-message-notice-content').textContent().catch(() => "");
  console.log(`  DAG触发: ${trigMsg}`);
  trigMsg.includes("已触发") ? console.log("  ✅ DAG 触发成功") : console.log(`  ⚠️ ${trigMsg}`);

  // 切到运行历史 tab 看看
  await page.locator('.ant-tabs-tab:has-text("运行历史")').click();
  await w(2000);
  await shot("dag-run-history");
  const runRows = await page.locator('.ant-table-row').count();
  console.log(`  运行历史: ${runRows} 条`);

  // 检查 console 错误
  if (errors.length > 0) {
    console.log(`\n  ⚠️ 浏览器 console 错误:`);
    errors.slice(0, 5).forEach(e => console.log(`    ${e.slice(0, 150)}`));
  }

  console.log(`\n完成, ${s} 张截图`);
  await browser.close();
}
run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
