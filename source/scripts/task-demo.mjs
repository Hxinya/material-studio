// 仅用于本地演示。运行于 Compose 的 Node 工具容器，不依赖宿主机工具链。
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

const args = process.argv.slice(2);
const options = new Map();
for (let i = 0; i < args.length; i++) {
  const key = args[i];
  if (!["--template", "--fail-stage", "--stage-delay-ms", "--task-id", "--no-wait"].includes(key)) throw new Error(`未知选项：${key}`);
  if (key === "--no-wait") options.set(key, true);
  else { const value = args[++i]; if (!value || value.startsWith("--")) throw new Error(`${key} 需要参数`); options.set(key, value); }
}
const base = process.env.API_BASE_URL ?? "http://backend:8080";
const publicUrl = process.env.PUBLIC_APP_URL ?? "http://localhost:3000";
const cookies = new Map();

async function api(path, init = {}) {
  const response = await fetch(base + path, { ...init, signal: AbortSignal.timeout(15000),
    headers: { ...init.headers, Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") } });
  for (const cookie of response.headers.getSetCookie()) {
    const pair = cookie.split(";", 1)[0]; const separator = pair.indexOf("=");
    cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
  if (!response.ok) { const error = await response.json().catch(() => null); throw new Error(`${response.status} ${error?.message ?? "请求失败"}`); }
  return response.status === 204 ? null : response.json();
}
async function post(path, body) {
  const csrf = await api("/api/auth/csrf");
  return api(path, { method: "POST", headers: { "Content-Type": "application/json", [csrf.headerName]: csrf.token }, body: JSON.stringify(body) });
}
async function credentials() {
  if (process.env.DEMO_EMAIL && process.env.DEMO_PASSWORD) return { email: process.env.DEMO_EMAIL, password: process.env.DEMO_PASSWORD };
  let muted = false;
  const output = new Writable({ write(chunk, _encoding, done) { if (!muted) process.stdout.write(chunk); done(); } });
  const terminal = createInterface({ input: process.stdin, output, terminal: process.stdin.isTTY === true });
  try {
    const email = await terminal.question("已注册的测试邮箱：");
    process.stdout.write("密码（输入隐藏）："); muted = true;
    const password = await terminal.question("");
    muted = false; process.stdout.write("\n");
    return { email, password };
  } finally { terminal.close(); }
}

let loggedIn = false;
try {
  const login = await credentials();
  await post("/api/auth/login", login); loggedIn = true;
  let id = options.get("--task-id");
  if (!id) {
    const templateId = options.get("--template") ?? "travel-duo";
    const { items } = await api(`/api/templates/${encodeURIComponent(templateId)}/materials`);
    if (items.some(item => !item.material)) throw new Error("请先在网页中，为该模板全部上传位上传并保存图片。");
    const simulation = {};
    if (options.has("--stage-delay-ms")) {
      const delay = Number(options.get("--stage-delay-ms"));
      if (!Number.isInteger(delay) || delay < 0 || delay > 60000) throw new Error("阶段耗时需为 0—60000 毫秒整数");
      Object.assign(simulation, { checkDelayMs: delay, generateDelayMs: delay, finalizeDelayMs: delay });
    }
    if (options.has("--fail-stage")) {
      const stage = options.get("--fail-stage");
      if (!["MATERIAL_CHECK", "SIMULATE_GENERATION", "FINALIZE_RESULT"].includes(stage)) throw new Error("失败阶段需为 MATERIAL_CHECK、SIMULATE_GENERATION 或 FINALIZE_RESULT");
      simulation.failStage = stage;
    }
    const task = await post("/api/tasks", { templateId,
      inputs: items.map(item => ({ slot: item.slot, materialId: item.material.id, revision: item.revision })),
      ...(Object.keys(simulation).length ? { simulation } : {}) });
    id = task.id;
    console.log(`任务已受理：${id}（${task.status}）`);
  }
  console.log(`任务详情：${publicUrl}/tasks/${id}`);
  if (!options.has("--no-wait")) {
    const deadline = Date.now() + 600000;
    let last = "";
    while (Date.now() < deadline) {
      const task = await api(`/api/tasks/${encodeURIComponent(id)}`);
      const summary = `${task.status} | ${task.stages.map(stage => `${stage.label}:${stage.status}`).join(" → ")}`;
      if (summary !== last) { console.log(summary); last = summary; }
      if (task.status === "SUCCEEDED") { console.log(`预置演示结果：${publicUrl}${task.resultUrl}`); break; }
      if (task.status === "FAILED") { console.log(`失败原因：${task.errorMessage}`); process.exitCode = 2; break; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    if (Date.now() >= deadline) throw new Error("等待已超时，任务仍由后台执行，可通过任务详情或 --task-id 再查询。");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "演示请求失败"); process.exitCode = 1;
} finally {
  if (loggedIn) { try { await post("/api/auth/logout", {}); } catch { console.error("测试会话未成功退出，将按服务端空闲时间过期。"); } }
}
