const { chromium } = require("playwright");
const BASE = "https://d3ij8mfefb4usj.cloudfront.net";
const DIR = "/data/bigdata-governance-platform/e2e/screenshots/airflow-test";
const fs = require("fs"); const path = require("path");
fs.mkdirSync(DIR, { recursive: true });
let s = 0;
async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = async (n) => { s++; await page.screenshot({ path: path.join(DIR, `${String(s).padStart(2,"0")}-${n}.png`), fullPage: true }); };
  const w = (ms) => page.waitForTimeout(ms);

  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });

  // 进入第一个工作流
  await page.click('text=ETL 编排'); await w(2000);
  await page.locator('.ant-table-row').first().locator('a:has-text("编辑")').first().click();
  await w(3000);
  await shot("dag-editor");

  // 检查 Airflow 控制台按钮
  const airflowBtn = page.locator('button:has-text("Airflow 控制台")');
  const hasBtn = await airflowBtn.count() > 0;
  console.log(`Airflow 控制台按钮: ${hasBtn ? '✅' : '❌'}`);

  // 切到运行历史
  await page.locator('.ant-tabs-tab:has-text("运行历史")').click();
  await w(2000);
  await shot("run-history");
  const runRows = await page.locator('.ant-table-row').count();
  console.log(`运行历史: ${runRows} 条`);

  // 检查日志按钮
  if (runRows > 0) {
    const logBtn = page.locator('.ant-table-row').first().locator('button:has-text("日志")');
    console.log(`日志按钮: ${await logBtn.count() > 0 ? '✅' : '❌'}`);

    if (await logBtn.count() > 0) {
      await logBtn.click();
      await w(3000);
      await shot("run-log");
      const logContent = await page.locator('.ant-modal-body').textContent().catch(() => "");
      console.log(`日志内容: ${logContent.length} chars`);
      console.log(`日志预览: ${logContent.slice(0, 100)}`);
      await page.locator('.ant-modal-close').first().click({ force: true }).catch(() => {});
      await w(500);
    }

    // 检查列信息
    const headers = await page.locator('.ant-table-thead th').allTextContents();
    console.log(`表格列: ${headers.join(' | ')}`);
  }

  // 检查 Airflow 控制台链接
  if (hasBtn) {
    // 不实际点击（会打开新窗口），验证 API
    const res = await page.evaluate(async () => {
      const r = await fetch('/api/workflow/airflow?dagId=test');
      return r.json();
    });
    console.log(`Airflow API: ${res.success ? '✅' : '❌'} ${res.data?.webServerHostname || res.error?.message || ''}`);
  }

  console.log(`\n完成, ${s} 张截图`);
  await browser.close();
}
run().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
