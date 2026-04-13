const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const BASE = "http://BgpPla-BgpSe-evoV3iwr6pOV-467842334.us-east-1.elb.amazonaws.com";
const SCREENSHOT_DIR = "/data/bigdata-governance-platform/e2e/screenshots";

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

let issues = [];
let passed = 0;
let failed = 0;

function log(msg) { console.log(msg); }
function pass(name) { passed++; log(`  ✅ ${name}`); }
function fail(name, reason) { failed++; issues.push({ name, reason }); log(`  ❌ ${name}: ${reason}`); }

async function screenshot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, `${name}.png`), fullPage: true });
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // ============ 1. 首页 Dashboard ============
  log("\n=== 1. 首页 Dashboard ===");
  await page.goto(BASE, { waitUntil: "networkidle", timeout: 30000 });
  await screenshot(page, "01-dashboard");

  const title = await page.title();
  title.includes("大数据") ? pass("页面标题") : fail("页面标题", `实际: ${title}`);

  const sidebar = await page.locator(".ant-layout-sider").count();
  sidebar > 0 ? pass("侧边栏存在") : fail("侧边栏", "未找到侧边栏");

  const statCards = await page.locator(".ant-statistic").count();
  statCards >= 3 ? pass(`统计卡片 (${statCards}个)`) : fail("统计卡片", `只有 ${statCards} 个`);

  // ============ 2. 数据源管理 ============
  log("\n=== 2. 数据源管理 ===");
  await page.click('text=数据源管理');
  await page.waitForTimeout(2000);
  await screenshot(page, "02-datasources");

  const dsTable = await page.locator(".ant-table-row").count();
  dsTable > 0 ? pass(`数据源列表 (${dsTable}条)`) : fail("数据源列表", "无数据");

  // 检查列是否完整
  const dsHeaders = await page.locator(".ant-table-thead th").allTextContents();
  log(`  列头: ${dsHeaders.join(" | ")}`);
  dsHeaders.some(h => h.includes("连接信息")) ? pass("连接信息列") : fail("连接信息列", "缺失");
  dsHeaders.some(h => h.includes("Glue")) ? pass("Glue Connection列") : fail("Glue列", "缺失");
  dsHeaders.some(h => h.includes("密码")) ? pass("密码存储列") : fail("密码存储列", "缺失");

  // 点击新建按钮
  await page.click('text=新建数据源');
  await page.waitForTimeout(1000);
  await screenshot(page, "02b-datasource-create");
  const modal = await page.locator(".ant-modal").count();
  modal > 0 ? pass("新建弹窗打开") : fail("新建弹窗", "未打开");

  // 检查表单字段
  const formLabels = await page.locator(".ant-form-item-label").allTextContents();
  log(`  表单字段: ${formLabels.join(", ")}`);
  formLabels.some(l => l.includes("数据源名称")) ? pass("名称字段") : fail("名称字段", "缺失");
  formLabels.some(l => l.includes("数据库类型")) ? pass("类型字段") : fail("类型字段", "缺失");

  await page.keyboard.press("Escape"); // 关闭弹窗

  // 浏览表按钮
  const browseBtn = await page.locator('text=浏览表').first();
  if (await browseBtn.count() > 0) {
    await browseBtn.click();
    await page.waitForTimeout(2000);
    await screenshot(page, "02c-metadata-browse");
    const drawer = await page.locator(".ant-drawer").count();
    drawer > 0 ? pass("元数据浏览Drawer") : fail("元数据Drawer", "未打开");
    await page.locator(".ant-drawer-close").click().catch(() => {});
  } else {
    fail("浏览表按钮", "未找到");
  }

  // ============ 3. 数据同步 ============
  log("\n=== 3. 数据同步 ===");
  await page.click('text=数据同步');
  await page.waitForTimeout(2000);
  await screenshot(page, "03-sync");

  const syncTable = await page.locator(".ant-table-row").count();
  syncTable > 0 ? pass(`同步任务列表 (${syncTable}条)`) : fail("同步任务列表", "无数据");

  // 检查操作按钮
  const hasStart = await page.locator('text=启动').count();
  const hasDetail = await page.locator('text=详情').count();
  hasStart > 0 ? pass("启动按钮") : fail("启动按钮", "缺失");
  hasDetail > 0 ? pass("详情链接") : fail("详情链接", "缺失");

  // 点击详情进入任务详情页
  if (hasDetail > 0) {
    await page.locator('text=详情').first().click();
    await page.waitForTimeout(3000);
    await screenshot(page, "03b-sync-detail");

    const detailUrl = page.url();
    detailUrl.includes("/sync/") ? pass("详情页路由") : fail("详情页路由", detailUrl);

    // 检查详情页内容
    const tabs = await page.locator(".ant-tabs-tab").allTextContents();
    log(`  详情页Tab: ${tabs.join(", ")}`);
    tabs.some(t => t.includes("运行日志")) ? pass("运行日志Tab") : fail("运行日志Tab", "缺失");
    tabs.some(t => t.includes("输出结果")) ? pass("输出结果Tab") : fail("输出结果Tab", "缺失");
    tabs.some(t => t.includes("运行历史")) ? pass("运行历史Tab") : fail("运行历史Tab", "缺失");
    tabs.some(t => t.includes("字段映射")) ? pass("字段映射Tab") : fail("字段映射Tab", "缺失");

    // 检查 Glue 状态卡片
    const hasGlueStatus = await page.locator('text=最近运行').count();
    hasGlueStatus > 0 ? pass("Glue运行状态卡片") : fail("Glue状态卡片", "缺失");

    // 点击输出结果Tab
    await page.locator('text=输出结果').click();
    await page.waitForTimeout(2000);
    await screenshot(page, "03c-sync-output");
    const s3Files = await page.locator(".ant-table-row").count();
    s3Files > 0 ? pass(`S3输出文件 (${s3Files}个)`) : fail("S3输出文件", "无文件");

    // 点击运行历史Tab
    await page.locator('.ant-tabs-tab:has-text("运行历史")').click();
    await page.waitForTimeout(1000);
    await screenshot(page, "03d-sync-runs");

    await page.click('text=返回');
    await page.waitForTimeout(1000);
  }

  // 新建同步任务弹窗
  await page.click('text=新建同步任务');
  await page.waitForTimeout(1000);
  await screenshot(page, "03e-sync-create-step0");
  const syncModal = await page.locator(".ant-modal").count();
  syncModal > 0 ? pass("新建同步弹窗") : fail("新建同步弹窗", "未打开");

  // 检查步骤
  const steps = await page.locator(".ant-steps-item").count();
  steps === 5 ? pass(`5步向导 (${steps}步)`) : fail("步骤数", `实际 ${steps} 步`);

  await page.keyboard.press("Escape");

  // ============ 4. ETL 编排 ============
  log("\n=== 4. ETL 编排 ===");
  await page.click('text=ETL 编排');
  await page.waitForTimeout(2000);
  await screenshot(page, "04-workflow");

  const wfTable = await page.locator(".ant-table-row").count();
  wfTable > 0 ? pass(`工作流列表 (${wfTable}条)`) : fail("工作流列表", "无数据");

  const hasPublish = await page.locator('text=发布').count();
  const hasTrigger = await page.locator('text=触发').count();
  hasPublish > 0 ? pass("发布按钮") : fail("发布按钮", "缺失");
  hasTrigger > 0 ? pass("触发按钮") : fail("触发按钮", "缺失");

  // ============ 5. 调度管理 ============
  log("\n=== 5. 调度管理 ===");
  await page.click('text=调度管理');
  await page.waitForTimeout(2000);
  await screenshot(page, "05-schedule");

  const schedTable = await page.locator(".ant-table-row").count();
  schedTable > 0 ? pass(`调度列表 (${schedTable}条)`) : fail("调度列表", "无数据");

  const hasCronTag = await page.locator(".ant-tag").count();
  hasCronTag > 0 ? pass("Cron标签显示") : fail("Cron标签", "缺失");

  // ============ 6. Redshift 任务 ============
  log("\n=== 6. Redshift 任务 ===");
  await page.click('text=Redshift 任务');
  await page.waitForTimeout(3000);
  await screenshot(page, "06-redshift");

  const hasConnConfig = await page.locator('text=连接配置').count();
  hasConnConfig > 0 ? pass("连接配置栏") : fail("连接配置栏", "缺失");

  const hasSchemaBtn = await page.locator('text=加载 Schema').count();
  hasSchemaBtn > 0 ? pass("加载Schema按钮") : fail("加载Schema按钮", "缺失");

  // 点击加载Schema
  if (hasSchemaBtn > 0) {
    await page.getByRole('button', { name: /加载 Schema/ }).click();
    await page.waitForTimeout(8000);
    await screenshot(page, "06b-redshift-schema");
    const treeNodes = await page.locator(".ant-tree-treenode").count();
    treeNodes > 0 ? pass(`Schema树 (${treeNodes}节点)`) : fail("Schema树", "无节点");
  }

  // ============ 7. 任务监控 ============
  log("\n=== 7. 任务监控 ===");
  await page.click('text=任务监控');
  await page.waitForTimeout(2000);
  await screenshot(page, "07-monitor");

  const monitorStats = await page.locator(".ant-statistic").count();
  monitorStats >= 3 ? pass(`监控统计 (${monitorStats}个)`) : fail("监控统计", `只有 ${monitorStats} 个`);

  const hasRefreshSelect = await page.locator('text=手动刷新').count() + await page.locator('text=秒自动').count();
  hasRefreshSelect > 0 ? pass("刷新间隔选择") : fail("刷新间隔", "缺失");

  const hasAlertBtn = await page.locator('text=告警规则').count();
  hasAlertBtn > 0 ? pass("告警规则按钮") : fail("告警规则按钮", "缺失");

  // ============ 8. 数据治理 ============
  log("\n=== 8. 数据治理 ===");
  await page.goto(`${BASE}/governance`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(3000);
  await screenshot(page, "08-governance");

  const govTabs = await page.locator(".ant-tabs-tab").allTextContents();
  log(`  Tab: ${govTabs.join(", ")}`);
  govTabs.some(t => t.includes("数据目录")) ? pass("数据目录Tab") : fail("数据目录Tab", "缺失");
  govTabs.some(t => t.includes("血缘")) ? pass("数据血缘Tab") : fail("数据血缘Tab", "缺失");

  // 搜索数据目录
  const catalogTable = await page.locator(".ant-table-row").count();
  catalogTable > 0 ? pass(`数据目录 (${catalogTable}条)`) : log("  ⚠️ 数据目录为空(需要搜索)");

  // ============ 9. 用户管理 ============
  log("\n=== 9. 用户管理 ===");
  await page.goto(`${BASE}/admin/users`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(2000);
  await screenshot(page, "09-users");

  const userTable = await page.locator(".ant-table-row").count();
  userTable > 0 ? pass(`用户列表 (${userTable}条)`) : log("  ⚠️ 用户列表为空");

  const hasCreateUser = await page.locator('text=创建用户').count();
  hasCreateUser > 0 ? pass("创建用户按钮") : fail("创建用户按钮", "缺失");

  // ============ 10. 系统设置 ============
  log("\n=== 10. 系统设置 ===");
  await page.goto(`${BASE}/settings`, { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(3000);
  await screenshot(page, "10-settings");

  const hasConfig = await page.locator('text=平台配置').count();
  hasConfig > 0 ? pass("平台配置卡片") : fail("平台配置", "缺失");

  const hasHealthCheck = await page.locator('text=服务状态').count();
  hasHealthCheck > 0 ? pass("服务状态卡片") : fail("服务状态", "缺失");

  await screenshot(page, "10b-settings-health");

  // ============ 11. 登录页 ============
  log("\n=== 11. 登录页 ===");
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await screenshot(page, "11-login");

  const hasLoginForm = await page.locator('text=大数据治理平台').count();
  hasLoginForm > 0 ? pass("登录页标题") : fail("登录页", "缺失");

  const hasUsernameInput = await page.locator('input[placeholder*="用户名"]').count();
  const hasPasswordInput = await page.locator('input[type="password"]').count();
  hasUsernameInput > 0 ? pass("用户名输入框") : fail("用户名输入框", "缺失");
  hasPasswordInput > 0 ? pass("密码输入框") : fail("密码输入框", "缺失");

  // ============ 总结 ============
  await browser.close();

  log("\n============================================");
  log(`  验证完成: ✅ ${passed} 通过 | ❌ ${failed} 失败`);
  log("============================================");

  if (issues.length > 0) {
    log("\n问题清单:");
    issues.forEach((i, idx) => log(`  ${idx + 1}. ${i.name}: ${i.reason}`));
  }

  log(`\n截图保存在: ${SCREENSHOT_DIR}/`);
  fs.readdirSync(SCREENSHOT_DIR).forEach(f => log(`  📸 ${f}`));

  // 写入报告
  const report = { timestamp: new Date().toISOString(), passed, failed, issues, screenshots: fs.readdirSync(SCREENSHOT_DIR) };
  fs.writeFileSync(path.join(SCREENSHOT_DIR, "report.json"), JSON.stringify(report, null, 2));
}

run().catch(e => { console.error("Fatal:", e.message); process.exit(1); });
