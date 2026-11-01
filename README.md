# 素材工坊（Material Studio）

一个可以通过 Docker Compose 独立运行的素材制作网站。用户浏览模板、上传图片并提交任务，Java 后台依次执行“素材检查 → 模拟生成 → 结果整理”，用户可以离开页面、连续提交任务，随后查看个人历史及结果。

**生成过程使用可控制耗时和失败阶段的模拟器。上传、文件保存、任务受理、阶段状态、账号隔离和历史记录均为真实实现；成功结果为带 DEMO 标记的预置 SVG，未对用户图片进行真实排版或 AI 合成。**

已完成模板浏览、真实上传、后台模拟制作、多任务跟踪与个人历史，并通过本地容器验收。运行、接口、模拟验证、测试与交付边界均在本 README 中说明。

## 1. 技术版本与职责

- 前端：Next.js **16.4.3**（App Router）、React **19.3.1**、TypeScript **5.9.3**、Tailwind CSS **4.3.3**、TanStack Query **5.105.0**；Node.js **24**，使用 npm 和 `package-lock.json`。
- 后端：Java **21**、Spring Boot **3.5.16**、MyBatis Spring Boot Starter **3.0.5**、Flyway **11.20.3**、Maven **3.9**；MySQL **8.4**。其余后端依赖由 Spring Boot BOM 管理，Testcontainers 单独锁定版本。
- 测试：Vitest **5.0.5**、Testing Library React **16.3.3** / DOM **10.4.2**、MSW **3.0.3**、jsdom **30.1.3**；Java 使用 Spring Boot Test、JUnit、Mockito 与 Testcontainers **2.0.5**。
- 工程：Dockerfile 多阶段构建、Docker Compose、GitHub Actions。基础镜像使用 Node 24 Alpine、Maven 3.9 / Temurin 21、Temurin 21 JRE Alpine、MySQL 8.4 系列标签，具体补丁可能随镜像更新。

连接路径：浏览器请求 Next.js 的同源 `/api/*`，Next.js 转发到容器网络中的 `http://backend:8080`，Java 使用 MyBatis 访问 `mysql:3306`。**模板、素材、任务和个人记录业务均由 Java 提供，MySQL 保存状态，Next.js 不执行后台制作或数据库业务。**

Java 使用数据库持久队列和一个工作线程，不依赖 Redis、消息队列或付费服务；前端通过 TanStack Query 轮询跟踪未完成任务。

## 2. 项目结构

以下为交付包根目录结构：

```text
.
├── README.md                          # 完整交付说明
├── .github/workflows/ci.yml            # push / pull request 容器检查
└── source/
    ├── README.md                      # 源码目录的快速启动入口
    ├── .env.example                   # 非敏感的本地配置示例
    ├── compose.yaml                   # 前端、Java、MySQL 与检查工具
    ├── compose.dev.yaml               # 可选源码挂载与开发模式
    ├── compose.acceptance.yaml        # 独立整站验收服务
    ├── frontend/
    │   ├── Dockerfile
    │   ├── package.json / package-lock.json
    │   └── src/
    │       ├── app/                   # 模板、账号、任务与历史页面
    │       ├── components/            # 表单、上传、任务及历史交互
    │       └── lib/                   # API、上传状态、缓存及查询测试
    ├── backend/
    │   ├── Dockerfile / pom.xml / settings.xml
    │   └── src/
    │       ├── main/java/com/materialstudio/
    │       │   ├── auth/              # 注册登录、会话及当前用户
    │       │   ├── catalog/           # 模板分类与详情
    │       │   ├── material/          # 图片校验、存储、归属与版本冲突
    │       │   ├── task/              # 受理、队列、三阶段处理及查询
    │       │   ├── health/            # MyBatis 数据库健康检查
    │       │   └── common/            # JSON 错误响应
    │       ├── main/resources/
    │       │   ├── db/migration/      # V1—V5 结构、索引和初始化数据
    │       │   └── static/api/catalog-assets/ # 六张本地模板 SVG
    │       └── test/                  # Java 单元及真实 MySQL 集成测试
    └── scripts/                       # 模拟命令、整站验收、源码打包
```

托管或交付时保留外层目录，使 `.github/workflows/ci.yml` 位于仓库根目录。开发笔记、题目参考图和验收截图仅在本地保留，不属于仓库交付内容。

## 3. 快速启动与停止

需要 Docker Engine 和支持 `--wait` 的 Docker Compose；本地推荐 Docker Desktop。首次构建需要访问镜像仓库、npm 和 Maven Central。宿主机无需安装项目依赖、Node.js、Java 或 MySQL。

从交付包根目录执行：

```bash
cd source
# 已有配置时不覆盖
test -f .env || cp .env.example .env
# 同时构建前后端，初始化数据库并等待健康检查
docker compose up --build -d --wait --wait-timeout 180
```

后续命令除明确说明外，均在 **source/** 目录执行。

- 网站：[http://localhost:3000](http://localhost:3000)。没有预置网站账号或默认登录密码，请自行注册。
- 全链路检查页：[http://localhost:3000/status](http://localhost:3000/status)。Java 健康接口执行真实数据库查询。
- Java 直连接口：[http://localhost:8080/api/health](http://localhost:8080/api/health)。

```bash
docker compose ps
docker compose logs -f frontend backend mysql
# 验证浏览器同源转发链路
curl --fail http://localhost:3000/api/health
# 停止并移除容器，保留数据库与图片
docker compose down
# 再次启动；修改代码后使用上面的 --build 命令
docker compose up -d --wait --wait-timeout 180
```

前端和 Java 默认仅绑定宿主机回环地址 3000/8080。**业务 MySQL 不映射宿主机端口**，不覆盖本机 MySQL。普通 `down` 保留数据；`down --volumes` 会删除项目数据卷，不用于日常停止或版本更新。

只构建运行镜像可执行 `docker compose build frontend backend`。镜像构建时 Java 使用 `-DskipTests package`，完整测试需执行第 10 节命令。

## 4. 配置、初始化与数据保存

`source/.env.example` 内均为本地示例值，不含真实凭据：

```dotenv
COMPOSE_PROJECT_NAME=material-studio
FRONTEND_PORT=3000
BACKEND_PORT=8080
MYSQL_DATABASE=material_studio
MYSQL_USER=material_app
MYSQL_PASSWORD=local_app_password
MYSQL_ROOT_PASSWORD=local_root_password
SESSION_COOKIE_SECURE=false
TASK_SIMULATION_CONTROLS_ENABLED=true
TASK_CHECK_DELAY_MS=1500
TASK_GENERATE_DELAY_MS=3500
TASK_FINALIZE_DELAY_MS=1500
```

- `COMPOSE_PROJECT_NAME` 决定容器、网络及命名数据卷归属；已有环境更新时保持不变。
- `FRONTEND_PORT` / `BACKEND_PORT` 修改宿主机访问端口；端口冲突时在 `.env` 调整后重新创建容器。
- `MYSQL_*` 仅在 MySQL 首次创建空卷时初始化库和用户。修改变量不会自动修改已有数据库的密码，不能通过删卷“修复”已有数据。
- `SESSION_COOKIE_SECURE=false` 用于本机 HTTP；HTTPS 部署设为 `true`。
- `TASK_SIMULATION_CONTROLS_ENABLED=true` 允许每次提交指定失败及耗时；部署时应设为 `false`。Java 独立配置默认关闭，Compose 本地示例明确开启。
- 三个 `TASK_*_DELAY_MS` 分别控制新任务三个阶段的默认耗时，单位毫秒，范围 0—60000。修改后执行 `docker compose up -d --force-recreate backend`，仅 `restart` 不会加载新环境变量。

Compose 注入 Java 的 `DB_URL`、`DB_USER`、`DB_PASSWORD`，默认 JDBC 连接目标是 `mysql:3306/material_studio`。`MATERIAL_DIRECTORY=/data/materials` 指向素材卷。`JAVA_API_ORIGIN` 在前端构建阶段设为 `http://backend:8080`，若更换代理目标，需修改对应构建配置并重新构建前端。

Java 启动时 Flyway 自动执行 `backend/src/main/resources/db/migration/`：V1 初始化元数据，V2 账号及 JDBC 会话，V3 模板分类和种子数据，V4 上传位，V5 任务、阶段与输入快照。已有卷只追加未应用迁移；不要修改已应用 SQL，结构变更应新增迁移。

数据分别保存在命名卷 `mysql_data`（MySQL）和 `materials_data`（原图、任务输入及结果）。任务受理时复制独立输入，因此后来替换或移除上传草稿不会破坏已受理任务。

可在容器中查看表，密码使用 `.env` 中的应用用户密码，以下用户名和库名对应默认值：

```bash
docker compose exec mysql mysql -u material_app -p material_studio
```

```sql
SHOW TABLES;
SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;
SELECT id, title, required_image_count FROM templates ORDER BY sort_order;
SELECT id, status, current_stage, error_message FROM task_jobs ORDER BY sequence DESC;
```

## 5. 模板、素材及主要页面

首次启动自动生成三个分类、六个模板：创意图片（山海明信片、城市拼贴）、人像写真（午后画报、霓虹侧影）、双人记忆（一起去远方、拍立得日记）。单图和双图模板各三个。

- `/`：模板库；`/?category=creative`、`portrait`、`duo` 按分类筛选，URL 支持刷新恢复。
- `/templates/paper-postcard`：单图示例；`/templates/travel-duo`：双图示例。
- `/register`、`/login`、`/account`：注册、登录及账号。
- `/tasks/{id}`：单任务阶段、输入、失败原因或结果预览。
- `/history`：当前账号全部记录，模板详情中另有按模板筛选的历史。

六张封面是本地 SVG，不依赖远程图片或字体。用户可选择自己的合法 JPEG/PNG 测试图片，单张不超过 **5 MiB（5242880 字节）**；SVG 封面不能作为上传输入。无需提前手工插入数据库记录；自动验收脚本会在容器内生成合法 PNG。

图片支持选择、预览、替换、移除和失败重试。前后端校验数量、类型与大小；Java 还校验真实编码及可解码性，限制最长边 12000、总像素 2500 万。Servlet 解析上限单文件 6 MiB、请求 7 MiB，业务规则仍为单张 5 MiB。

草稿保存在后端；前端 Blob URL 仅用于临时预览。每个上传位使用 revision 处理并发覆盖，旧版本请求返回 409；前端取消并忽略旧响应。页面分别提供加载、空状态、404、上传/提交失败与查询恢复反馈，上传按钮有可读标签，小屏可操作。

## 6. 身份与个人记录

使用邮箱/密码注册登录。邮箱去空格并转小写后唯一；密码 8—72 个字符且 UTF-8 不超过 72 字节，数据库只存 BCrypt cost 12 哈希。注册成功自动登录，不提供默认账号、邮箱验证或找回密码。

Spring Security + Spring Session JDBC 管理会话，Cookie 名称 `MATERIAL_SESSION`，HttpOnly、SameSite=Lax，空闲超时 30 分钟。修改请求要求 CSRF 令牌，身份由服务器安全上下文确定，不接收客户端指定的 owner。任务、草稿、原图、输入副本和结果均校验归属，访问其他账号资源返回 404。

前端查询键包含当前账号；退出或切换身份时取消私人请求并清理缓存，跨标签页广播身份变化。同一浏览器的同一主机名会共用 Cookie，Cookie **不按端口隔离**。演示 A/B 独立账号可使用不同浏览器配置或无痕窗口。

验证方式：用 A 注册并上传、提交，刷新恢复其记录；退出后用 B 注册，B 历史应为空，访问 A 的任务/素材地址应被拒绝；退出再登录 A，原历史仍在。

## 7. 后台状态与前端查询

任务状态：`QUEUED`（排队）→ `RUNNING`（处理）→ `SUCCEEDED`（成功）或 `FAILED`（失败）。三个阶段固定按以下顺序执行：

```text
MATERIAL_CHECK       素材检查
    ↓
SIMULATE_GENERATION  模拟生成
    ↓
FINALIZE_RESULT      结果整理
```

每阶段保存 `PENDING`、`RUNNING`、`SUCCEEDED`、`FAILED` 或 `SKIPPED`，以及开始/结束时间和错误。一步失败时后续阶段不执行，标记 SKIPPED，其起止时间为空。成功后记录可预览的 `resultUrl` 和 `resultKind=SIMULATED_PRESET`。

Java 在检查参数、复制输入、事务保存任务后返回 **HTTP 202 + 任务 ID + Location**，不等待三个阶段完成。单个后台线程约每 300 ms 扫描持久队列，按受理顺序取任务；每步独立记录执行边界，耗时等待发生在事务外。关闭网页或退出登录不会停止后台任务，GET 查询只读，不驱动阶段推进。

前端受理成功后结束“提交中”，可继续制作。每条 QUEUED/RUNNING 每秒独立查询，终态停止；没有待处理任务时不定时请求，默认页面隐藏时暂停浏览器轮询。刷新从 Java 历史恢复未完成任务。离页、切换模板或账号时取消相关请求并隔离迟到响应，旧快照不能让终态或阶段倒退。

**查询异常与任务失败分别处理**：网络/HTTP 故障保留已有业务状态，暂停该条自动查询并显示“恢复查询”；列表故障显示“刷新记录/重试读取记录”，不伪装为空记录或后台 FAILED。其他标签页或工具新建的任务需手动刷新历史列表发现，之后自动跟踪。

## 8. 成功、失败、多任务与刷新演示

以下命令在运行中的项目、`source/` 目录执行。先在网页注册测试账号，在 **travel-duo** 模板上传并保存两张图片。工具交互输入该账号邮箱和隐藏的密码，使用独立会话，结束后退出自己的会话。

```bash
# 成功，每阶段 2 秒；首次运行构建工具镜像
docker compose --profile tools run --build --rm task-demo --template travel-duo --stage-delay-ms 2000

# 素材检查失败：后两步未执行
docker compose --profile tools run --build --rm task-demo --template travel-duo --fail-stage MATERIAL_CHECK --stage-delay-ms 3000

# 模拟生成失败：第一步完成、第三步未执行
docker compose --profile tools run --build --rm task-demo --template travel-duo --fail-stage SIMULATE_GENERATION --stage-delay-ms 3000

# 结果整理失败：前两步完成
docker compose --profile tools run --build --rm task-demo --template travel-duo --fail-stage FINALIZE_RESULT --stage-delay-ms 3000

# 仅提交，每步 5 秒；重复执行或在网页连续制作，观察独立排队
docker compose --profile tools run --build --rm task-demo --template travel-duo --stage-delay-ms 5000 --no-wait

# 查询某一条任务；将占位文字换为前面返回的 UUID
docker compose --profile tools run --build --rm task-demo --task-id 实际任务UUID
```

命令退出码：0 成功，2 为预期模拟任务失败，1 为工具调用异常。耗时范围每阶段 0—60000 ms，无随机失败；模拟覆盖参数需开启 `TASK_SIMULATION_CONTROLS_ENABLED`。单图演示可改用 paper-postcard，并先给它上传一张图片。

网页进入“制作记录”点击“刷新记录”，确认各任务分别显示阶段、失败原因或演示结果。执行期间刷新页面或先离开再返回，未完成任务应恢复跟踪；终态应保持不变并停止自动更新。指定失败点之后的步骤应显示“未执行”，失败任务没有成功预览。

验证查询异常可在本地测试任务执行时，用另一个终端暂停 Java 容器：

```bash
docker compose pause backend
# 网页在约 12 秒请求超时后应保留上次任务状态，显示查询异常和恢复入口
# 完成观察后必须恢复容器
docker compose unpause backend
```

点击“恢复查询”后重新读取实际后台状态。这里暂停的是整个 Java 进程，暂停期间后台也停；此操作只用于请求异常演示，不等同于“某阶段模拟失败”。

## 9. 主要接口与字段

除公共目录/健康接口外均需登录；POST、PUT、DELETE 需先 GET `/api/auth/csrf`，将响应 `token` 放入 `headerName` 指定的请求头。使用同源 Cookie，注册/登录后重新获取令牌。以下 URL 均可通过前端同源路径访问。

### 9.1 健康与目录

- `GET /health`：Next.js 自身探活，不代表数据库健康。
- `GET /api/health`：Java 真实 MyBatis 查询；响应 `status`、`application`、`database`、`schemaVersion`、`timestamp`，故障 503。`schemaVersion="1"` 是 V1 元数据，最新迁移应查 Flyway 表，当前为 V5。
- `GET /api/template-categories`：`{items:[{id,name,description,templateCount}]}`。
- `GET /api/templates?category=creative`：`{items:[Template]}`；省略分类返回全部，合法但不存在的分类返回空数组。
- `GET /api/templates/{id}`：Template，字段 `id`、`categoryId`、`categoryName`、`title`、`description`、`coverUrl`、`requiredImageCount`、`acceptedMimeTypes`、`maxFileSizeBytes`。
- `GET /api/catalog-assets/{id}.svg`：公开本地示例封面。

### 9.2 账号

- `GET /api/auth/csrf`：`{token,headerName}`，无需登录。
- `POST /api/auth/register`：JSON `{email,password}`，201 返回 User 并登录。
- `POST /api/auth/login`：同样请求，200 返回 User。
- `GET /api/auth/me`：User，即 `{id,email,createdAt}`；未登录 401。
- `POST /api/auth/logout`：204，无响应体，失效当前会话。

### 9.3 上传

- `GET /api/templates/{templateId}/materials`：`{items:[{slot,revision,material}]}`，空位 material=null。
- `PUT /api/templates/{templateId}/materials/{slot}`：multipart，一个 `file` 与 `expectedRevision`；返回更新后的上传位。
- `DELETE /api/templates/{templateId}/materials/{slot}?expectedRevision=1`：返回新版本的空位，防止迟到上传复活旧素材。
- `GET /api/materials/{id}/content`：当前账号原图，禁止缓存。

material 字段：`id`、`originalName`、`mimeType`、`sizeBytes`、`width`、`height`、`contentUrl`、`updatedAt`。slot 从 1 开始，提交时使用服务器返回的 material.id/revision。

### 9.4 制作与历史

- `POST /api/tasks`：202 返回完整 Task，并设置 `Location: /api/tasks/{id}`。
- `GET /api/tasks/{id}`：当前账号的 Task。
- `GET /api/tasks?templateId=travel-duo`：`{items:[Task]}`，按受理序号从新到旧，可省略模板筛选。
- `GET /api/tasks/{id}/inputs/{slot}`：受保护的任务输入副本。
- `GET /api/tasks/{id}/result`：成功 SVG；未成功时 409，跨账号或不存在 404。

请求示意，素材 ID 和版本必须替换为该账号实际上传返回值；`simulation` 可省略：

```json
{
  "templateId": "paper-postcard",
  "inputs": [
    { "slot": 1, "materialId": "实际上传返回的UUID", "revision": 1 }
  ],
  "simulation": {
    "checkDelayMs": 1500,
    "generateDelayMs": 3500,
    "finalizeDelayMs": 1500,
    "failStage": "SIMULATE_GENERATION"
  }
}
```

Task 返回字段：`id`、`templateId`、`templateTitle`、`status`、`currentStage`、`createdAt`、`startedAt`、`finishedAt`、`errorCode`、`errorMessage`、`resultUrl`、`resultKind`、`stages`、`inputs`。未开始的时间、没有结果的链接等为 null。

- stages 每项：`index`、`name`、`label`、`status`、`startedAt`、`finishedAt`、`errorMessage`。
- inputs 每项：`slot`、`materialId`、`revision`、`originalName`、`mimeType`、`sizeBytes`、`width`、`height`、`contentUrl`。

JSON 错误统一为 `{code,message,fields}`。常见状态：400 参数/文件无效，401 未登录或凭据错误，403 CSRF，404 不存在或无权访问，409 邮箱/身份/版本/结果状态冲突，413 文件过大，503 数据库或存储不可用。校验具体错误码和字段见对应 Java 控制器及测试，不向客户端返回数据库内部错误。

## 10. 构建、测试与 CI

以下安装、编译、应用执行和断言均在容器中进行；宿主机脚本只编排 Docker。

```bash
# ESLint、路由类型生成、TypeScript、Vitest、Next.js 生产构建
docker compose --profile tools run --build --rm frontend-check

# 首选：Testcontainers 全新 MySQL、全部 Java 测试、Maven verify 打包
docker compose --profile tools run --build --rm backend-container-check

# 可选：不挂 Docker socket，使用 Compose 中独立的真实测试 MySQL
docker compose --profile tools run --build --rm backend-check
# 仅停止可选的测试数据库
docker compose --profile tools stop mysql-test

# 干净数据卷下的完整业务与重建持久化验收
sh scripts/acceptance.sh
```

最近一次完整验收为 **2026-11-01**：前端 8 个测试文件、**41 项**全部通过，lint/类型/构建通过；Java **46 项**全部通过，0 失败/错误/跳过，打包通过。

前端覆盖请求、身份缓存、上传竞态、多任务独立查询、终态停轮询、取消/迟到响应及查询故障与任务失败的区分；组件测试实际渲染认证/QueryClient/历史卡片，通过 MSW 注入 HTTP 503 并点击恢复按钮。Java 覆盖真实 HTTP/Cookie/CSRF、MySQL、图片解码与大小边界、跨账号、202、步骤顺序、三个阶段失败中断、终态稳定、只读查询、并发认领和重启中断。

Testcontainers 服务仅在测试时挂载 Docker socket，创建一次性 MySQL 并由 Ryuk 回收；应用不挂载 socket。临时测试库使用随机映射端口及 host.docker.internal，Linux 配置 host-gateway；Docker 不可用会失败，不静默跳过。备用测试库是 mysql-test/material_studio_test，独立于业务库。

`acceptance.sh` 使用 `.env.example`、唯一项目名、全新数据库/素材/状态卷及默认 **3107/8107**，不读取实际 `.env`。覆盖三分类六模板、单/双图上传、成功与三个失败、多任务、新会话恢复、跨账号拒绝，以及 down/up 后历史、图片、副本、结果和 JDBC 会话保留；QUEUED/RUNNING 按约定变为中断失败。成功及失败退出均自动清理本次测试环境。

端口可覆盖：`ACCEPTANCE_FRONTEND_PORT=3207 ACCEPTANCE_BACKEND_PORT=8207 sh scripts/acceptance.sh`。成功后需要保留页面时使用 `ACCEPTANCE_KEEP=1`，脚本打印精确清理命令。浏览器使用 127.0.0.1:3107，避免与 localhost 的普通项目共用 Cookie。测试凭据随机生成，仅存在临时状态卷，不打印或交付。

GitHub Actions 在 **push / pull_request** 触发三个 job：frontend 检查前端，backend 通过 Testcontainers 测试并打包，acceptance 执行全栈脚本。2026-11-01 已确认源码验收版本的三个远程 job 均为 **success**，详见 [已通过的 CI 运行](https://github.com/Hxinya/material-studio/actions/runs/41286208684)。后续提交的结果以 [Actions 列表](https://github.com/Hxinya/material-studio/actions) 为准。桌面及 375 像素小屏交互已在本地验证，仓库不包含开发过程截图。

### 干净克隆与源码验收版本

源码验收 commit：[`18cdf36ce59062a0ada56e07afe8a2309aa5a418`](https://github.com/Hxinya/material-studio/commit/18cdf36ce59062a0ada56e07afe8a2309aa5a418)。2026-11-01 从 GitHub 重新克隆到新的临时目录，确认只包含 127 个仓库文件，没有本机 .env、运行数据、node_modules、参考图或开发文档；随后执行 README 中的 `sh scripts/acceptance.sh`，退出码为 0。

验收使用独立项目及全新 MySQL/素材卷，通过初始化、单/双图上传、202 多任务受理、成功与三个指定失败点、新会话恢复、跨用户隔离，以及 down/up 后数据库、原图、输入副本、结果和 JDBC 会话持久化。未完成任务按约定标记中断失败；环境最终自动清理，原项目数据未受影响。构建利用 Docker 缓存，但源码与数据来自新克隆及全新数据卷，未做完全断网或无镜像缓存验收。

本次结果记录之后只更新 README，业务源码保持上述验收版本；含说明更新的最终交付 commit 以提交说明中的完整 SHA 为准。

## 11. 可选开发模式

```bash
docker compose -f compose.yaml -f compose.dev.yaml up --build -d --wait --wait-timeout 180
# 前端保存后热更新；Java 修改后重启并重新编译
docker compose -f compose.yaml -f compose.dev.yaml restart backend
# 退出开发模式后，重新启动普通模式
docker compose -f compose.yaml -f compose.dev.yaml down
docker compose up --build -d --wait --wait-timeout 180
```

开发容器使用独立 node_modules、Next 缓存和 npm 缓存卷。修改前端依赖需同步锁文件并重新构建，启动时容器执行 npm ci；Maven settings 使用 Maven Central，不含私有凭据。

## 12. 部署、备份与回滚

本项目提供本机 Compose 部署，不要求公网部署。新环境准备配置后执行第 3 节命令；HTTPS 环境需配置反向代理/证书、正式数据库密码、`SESSION_COOKIE_SECURE=true`、`TASK_SIMULATION_CONTROLS_ENABLED=false`，并确认代理转发和访问权限。运行模式限定单 Java 实例。

发布前保留已验收的源码 ZIP/摘要、原环境配置与数据库/素材一致备份。以下为备份操作示例，**没有对当前用户数据执行过这些操作**：

```bash
mkdir -p ../backups
docker compose stop frontend backend
docker compose exec -T mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqldump --single-transaction --no-tablespaces -uroot "$MYSQL_DATABASE"' > ../backups/database.sql
docker compose cp backend:/data/materials ../backups/materials
docker compose up -d --wait --wait-timeout 180
```

停止 Java 会中断未完成任务，备份/升级应在无制作任务时安排。停止应用写入可使 SQL 与图片备份对应；备份和真实 `.env` 含私人信息，应保存在交付包外。

回滚步骤：先备份当前状态，切换到上一份已验收源码，沿用**相同 Compose 项目名、原 `.env` 和数据卷**，重新执行 `docker compose up --build -d --wait --wait-timeout 180`，检查健康、登录、历史和结果。前提是迁移向后兼容；不要编辑旧迁移或删卷。

如果结构不兼容，应停机，在新隔离项目中同时恢复同一备份时点的 SQL 和素材，验证后再切换入口；不能只回滚 Java 或只恢复 SQL。公网部署、正式 HTTPS、旧版回滚和备份恢复尚未实操；已验证的是容器重建后的数据持久化，不声称提供自动灾备。

## 13. 完成范围、取舍与已知限制

已完成 R-01—R-14 对应的业务、页面、关键测试及容器交付：模板、真实上传、异步三步模拟、可控失败、多任务、刷新恢复、个人历史、身份隔离、桌面与小屏，以及 CI 配置和说明。

- 生成结果为预置 SVG；真实 AI、图片排版、支付、会员、复杂模板后台不属于本题实现范围。
- **不实现服务重启后断点续跑**。启动时遗留 QUEUED/RUNNING 标记 WORKER_INTERRUPTED；关闭网页不会中断，停止 Java 会中断。已完成任务保留。
- 单实例/单工作线程；不支持任务取消、自动重试、提交幂等、多实例协调。POST 不自动重放，请求超时后再次提交可能创建第二条任务。
- 数据库故障可能阻止失败落库，恢复后可重启统一收尾。进程异常退出可能遗留无引用文件，未做配额或自动回收。
- 历史一次读取账号全部任务，无分页、搜索或删除；适合本题演示规模。新任务跨标签页通知未实现，列表手动刷新发现，身份变化会广播。
- 没有完整屏幕阅读器审计、压测和生产监控；注册未做邮箱验证/找回密码。
- 2026-11-01 npm 审计：生产依赖 0 条；含开发工具时 minimatch/ESLint 链 16 条 moderate、0 high/critical。未强制降级工具链，正式使用前需重新审计；该结果不代表以后始终为 0。

## 14. 实际投入与 AI 工作流

使用 **Codex 辅助开发**。流程为：读取原始题目与参考图 → 按七个模块拆分范围 → 根据真实源码/数据契约生成或修改代码 → 容器构建与关键测试 → 浏览器联调并注入异常 → 根据实际失败修正 → 整理验收证据与交付材料。用户逐模块体验并反馈，例如注册登录确认、上传图标应触发选择文件等。

具体例子：多任务历史可能收到迟到的旧列表/详情快照，导致成功任务短暂回到处理中。实现中使用包含 owner/taskId 的查询键、AbortSignal 与单调阶段比较，统一合并详情缓存；再用 QueryObserver 测试覆盖迟到响应、退出清缓存、终态停止，并用 MSW 组件测试确认查询 503 仍显示原业务状态、点击恢复后继续更新。通过后才记录完成，没有用前端定时文案代替后端阶段。

投入包含开发、下载/构建、验证和文档整理，分多轮会话完成。历史记录中各业务开发轮次约 15—30 分钟，统一验收另有约 6 分钟的可核对操作窗口及未单独计时的准备。已核对这些记录的性质：上述数字是 AI 辅助会话估算，实际人工投入未统一计时，无法准确补录，不能还原为可靠的人工总工时；不包含本机环境安装和各轮之间的暂停。

## 15. 来源、交付与源码校验

工程按题目组织，没有复制现成素材制作业务项目；Next.js/React/Tailwind 用于路由、界面和构建，Spring Boot/Security/Session 用于后端与认证，MyBatis/Flyway 用于 SQL 访问和迁移，TanStack Query 管理服务器状态，测试框架用于验证。具体版本/来源依赖坐标见 package-lock.json、pom.xml 与 Maven settings。

页面布局参考题目示例，题目图片不随仓库交付。六张业务 SVG 封面、演示标记和自动验收 PNG 为本项目构造，不复用题目截图作为输出，不依赖内部或付费素材。用户手工测试图片由用户自行准备。容器测试参考 [Testcontainers 官方文档](https://java.testcontainers.org/supported_docker_environment/continuous_integration/dind_patterns/)，HTTP 模拟参考 [MSW Node 文档](https://mswjs.io/guides/integrations/node)。

源码仓库：[Hxinya/material-studio](https://github.com/Hxinya/material-studio)。交付包含 Git 仓库及备用源码 ZIP；验收 commit 以最终提交说明中的完整 SHA 为准。包内包含前后端、依赖版本/锁文件、五个迁移及种子、本地素材、CI 和 README。根目录 delivery/ 存放生成的 ZIP 与整包 SHA-256；打包命令在 source/ 执行：

```bash
mkdir -p ../delivery
docker run --rm -v "$PWD/..:/workspace:ro" -v "$PWD/../delivery:/output" python:3.13-alpine python /workspace/source/scripts/package-source.py
```

打包白名单排除题目参考图、分模块开发文档及验收截图、真实 .env、用户上传/数据库数据、node_modules、.next、target、日志、缓存和旧 ZIP。ZIP 内含逐文件 MANIFEST.sha256，脚本会读回校验压缩完整性与每项摘要；ZIP 旁的 .zip.sha256 用于整包校验。解压后进入 material-studio/source，即可按快速启动运行。
