// Full-stack acceptance via the same-origin Next.js -> Java -> MySQL path.
// Credentials and cookies exist only in the disposable acceptance_state volume.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { deflateSync } from "node:zlib";
const base = process.env.API_BASE_URL ?? "http://frontend:3000";
const stages = ["MATERIAL_CHECK", "SIMULATE_GENERATION", "FINALIZE_RESULT"];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
function png() {
  const chunk = (name, data) => {
    const body = Buffer.concat([Buffer.from(name), data]); let crc = 0xffffffff;
    for (const byte of body) { crc ^= byte; for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
    const size = Buffer.alloc(4); size.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4); sum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, body, sum]);
  };
  const header = Buffer.alloc(13); header.writeUInt32BE(2); header.writeUInt32BE(2, 4); header[8] = 8; header[9] = 2;
  return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.from([0, 80, 150, 70, 100, 170, 90, 0, 130, 190, 120, 160, 210, 140]))), chunk("IEND", Buffer.alloc(0))]);
}
class Client {
  constructor(saved = {}) { this.email = saved.email ?? `${randomUUID()}@acceptance.example.test`; this.password = saved.password ?? `Test-${randomUUID()}`; this.cookies = new Map(saved.cookies ?? []); }
  async call(path, expected = 200, options = {}) {
    const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(20000), headers: { ...options.headers, Cookie: [...this.cookies].map(([k,v]) => `${k}=${v}`).join("; ") } });
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";", 1)[0]; const at = pair.indexOf("="); this.cookies.set(pair.slice(0, at), pair.slice(at + 1)); }
    assert.equal(response.status, expected, `${options.method ?? "GET"} ${path}: ${await response.clone().text()}`);
    return response;
  }
  async json(path) { return (await this.call(path)).json(); }
  async mutate(path, payload, expected = 200, method = "POST") {
    const csrf = await this.json("/api/auth/csrf");
    return (await this.call(path, expected, { method, headers: { [csrf.headerName]: csrf.token, ...(payload instanceof FormData ? {} : { "Content-Type": "application/json" }) }, body: payload instanceof FormData ? payload : JSON.stringify(payload) })).json();
  }
  register() { return this.mutate("/api/auth/register", { email: this.email, password: this.password }, 201); }
  login() { return this.mutate("/api/auth/login", { email: this.email, password: this.password }); }
  async upload(template, slot = 1) {
    const current = (await this.json(`/api/templates/${template}/materials`)).items.find(item => item.slot === slot);
    const body = new FormData(); body.set("expectedRevision", current.revision); body.set("file", new Blob([png()], { type: "image/png" }), "acceptance.png");
    return this.mutate(`/api/templates/${template}/materials/${slot}`, body, 200, "PUT");
  }
  async submit(template, simulation) {
    const { items } = await this.json(`/api/templates/${template}/materials`);
    return this.mutate("/api/tasks", { templateId: template, inputs: items.map(item => ({ slot: item.slot, materialId: item.material.id, revision: item.revision })), simulation }, 202);
  }
  async until(id, predicate) {
    for (let i = 0; i < 300; i++) { const task = await this.json(`/api/tasks/${id}`); if (predicate(task)) return task; await sleep(100); }
    throw new Error(`Task ${id} did not reach the expected state in 30 seconds`);
  }
  save() { return { email: this.email, password: this.password, cookies: [...this.cookies] }; }
}
const terminal = task => ["SUCCEEDED", "FAILED"].includes(task.status);
function checkBoundaries(task, failedAt) {
  assert.deepEqual(task.stages.map(s => s.name), stages);
  const stop = failedAt ? stages.indexOf(failedAt) : 3;
  task.stages.forEach((s, i) => {
    assert.equal(s.status, i < stop ? "SUCCEEDED" : i === stop ? "FAILED" : "SKIPPED");
    if (i <= stop) { assert.ok(s.startedAt && s.finishedAt); assert.ok(Date.parse(s.finishedAt) >= Date.parse(s.startedAt)); if (i > 0) assert.ok(Date.parse(s.startedAt) >= Date.parse(task.stages[i-1].finishedAt)); }
    else { assert.equal(s.startedAt, null); assert.equal(s.finishedAt, null); }
  });
}
async function seed() {
  const owner = new Client(), other = new Client();
  assert.equal((await owner.json("/api/health")).database, "UP");
  assert.equal((await owner.json("/api/template-categories")).items.length, 3);
  assert.equal((await owner.json("/api/templates")).items.length, 6);
  await owner.register(); await other.register();
  assert.deepEqual((await owner.json("/api/tasks")).items, []);
  const material = await owner.upload("paper-postcard");
  await owner.upload("travel-duo", 1); await owner.upload("travel-duo", 2);
  // Four requests are accepted before the first finishes; no polling is required for execution.
  const delay = { checkDelayMs: 250, generateDelayMs: 250, finalizeDelayMs: 250 };
  const jobs = [];
  for (const failStage of [null, ...stages]) jobs.push(await owner.submit("paper-postcard", { ...delay, ...(failStage ? { failStage } : {}) }));
  assert.equal(new Set(jobs.map(t => t.id)).size, 4);
  const duo = await owner.submit("travel-duo", delay);
  assert.equal(duo.inputs.length, 2);
  // A fresh login recovers unfinished history from Java, not browser memory.
  const fresh = new Client({ email: owner.email, password: owner.password }); await fresh.login();
  assert.equal((await fresh.json("/api/tasks")).items.length, 5);
  const results = [];
  for (let i = 0; i < jobs.length; i++) { const t = await fresh.until(jobs[i].id, terminal); checkBoundaries(t, i ? stages[i-1] : null); assert.equal(t.status, i ? "FAILED" : "SUCCEEDED"); results.push(t); }
  assert.equal((await fresh.until(duo.id, terminal)).status, "SUCCEEDED");
  assert.equal((await fresh.json("/api/tasks?templateId=travel-duo")).items.length, 1);
  const result = results[0];
  assert.match(await (await owner.call(result.resultUrl)).text(), /SIMULATED RESULT/);
  await owner.call(result.inputs[0].contentUrl);
  assert.deepEqual(await owner.json(`/api/tasks/${result.id}`), result); // stable terminal snapshot
  assert.deepEqual((await other.json("/api/tasks")).items, []);
  for (const path of [`/api/tasks/${result.id}`, result.resultUrl, result.inputs[0].contentUrl, material.material.contentUrl]) await other.call(path, 404);
  await new Client().call("/api/tasks", 401);
  const long = await owner.submit("paper-postcard", { checkDelayMs: 60000, generateDelayMs: 0, finalizeDelayMs: 0 });
  await owner.until(long.id, t => t.status === "RUNNING");
  const queued = await owner.submit("paper-postcard", delay);
  assert.equal(queued.status, "QUEUED");
  await writeFile("/state/acceptance.json", JSON.stringify({ owner: owner.save(), success: result, material: material.material, interrupted: [long.id, queued.id], count: 7 }));
  console.log("PASS: clean initialization; registration/login; real PNG and two-input upload; 202/multiple tasks; ordered success; three exact failure boundaries; fresh-session history; terminal stability; cross-user/API/file isolation.");
}
async function verify() {
  const saved = JSON.parse(await readFile("/state/acceptance.json", "utf8")); const owner = new Client(saved.owner);
  assert.equal((await owner.json("/api/auth/me")).email, owner.email); // JDBC session survived recreation
  assert.equal((await owner.json("/api/tasks")).items.length, saved.count);
  assert.deepEqual(await owner.json(`/api/tasks/${saved.success.id}`), saved.success);
  assert.match(await (await owner.call(saved.success.resultUrl)).text(), /SIMULATED RESULT/);
  assert.deepEqual(Buffer.from(await (await owner.call(saved.success.inputs[0].contentUrl)).arrayBuffer()), png());
  assert.deepEqual(Buffer.from(await (await owner.call(saved.material.contentUrl)).arrayBuffer()), png());
  for (const id of saved.interrupted) { const task = await owner.json(`/api/tasks/${id}`); assert.equal(task.status, "FAILED"); assert.equal(task.errorCode, "WORKER_INTERRUPTED"); }
  console.log("PASS: down/up preserves MySQL history, JDBC session, original material, independent task input and preset result; queued/running work becomes WORKER_INTERRUPTED; terminal success is unchanged.");
}
try { if (process.argv[2] === "seed") await seed(); else if (process.argv[2] === "verify") await verify(); else throw new Error("Usage: acceptance.mjs seed|verify"); }
catch (error) { console.error(error.message); process.exitCode = 1; }
