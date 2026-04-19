# 辰溪工程文件审核助手 - 项目规范

## 项目概述

**产品名称**: 辰溪工程文件审核助手
**所属项目**: 辰溪抽水蓄能电站数字化管控平台
**版本**: V6.0
**技术栈**: Vite + TypeScript + Tailwind CSS + Express + Supabase + LLM(SSE) + Knowledge + Web Search + pdf.js + JSZip

## 技术架构

```
用户浏览器
   ↓ 登录（admin/普通用户/游客）
   ↓ 上传文件 → 前端解析（pdf.js/JSZip/File.text）→ 提取纯文本（含【第N页】页码标记）
   ↓ JSON POST 纯文本到 /api/review → SSE 流式响应（避免 FaaS 杀后台任务）
Express 后端 (5000端口)
   ↓ ① 按审核类型检索对应模块知识库（人员/企业/技术/安全/公文）
   ↓ ② 知识库不足时 → 联网搜索补全最新法规
   ↓ ③ 组装模块专用提示词 → 模块标准 + 分类审核(格式/错别字/过期规范/参数不合规/缺失) + 联网资料 + 文件内容
   ↓ ④ 调用 LLM (doubao-seed-2-0-pro) → 生成审核结果（含 annotatedContent + 分类标注 + 页码定位）
   ↓ ⑤ SSE 推送进度事件(started/progress/segment/completed/error)
   ↓ ⑥ 存入 Supabase 数据库 → 审核记录关联用户持久化
   ↓ 返回 SSE completed 事件（含完整审核结果）
用户浏览器
```

## 核心服务

| 服务 | 提供方 | 用途 |
|------|--------|------|
| 数据库 | Coze Supabase | 审核记录 + 用户账号持久化存储 |
| 知识库 | Coze Knowledge | 模块化工程法规标准检索（6个独立数据集） |
| 联网搜索 | Coze Web Search | 知识库不足时补全最新法规 |
| AI 审核引擎 | doubao-seed-2-0-pro-260215 | 旗舰级智能文件审核 + 分类标注 + 过期规范检测 |

## 目录结构

```
├── public/                  # 静态资源（pdf.js worker 等）
│   └── pdf.worker.min.mjs  # pdf.js Web Worker（构建时从 node_modules 复制）
├── server/                  # 后端服务
│   ├── routes/index.ts     # API 路由（含认证、用户管理、审核、知识库）
│   ├── src/storage/database/
│   │   ├── supabase-client.ts  # Supabase 客户端
│   │   └── _load_env.py       # 环境变量加载脚本
│   ├── vite.ts             # Vite 中间件
│   └── server.ts           # Express 入口
├── src/                     # 前端源码
│   ├── index.css           # 全局样式
│   ├── index.ts            # 入口文件
│   └── main.ts             # 主应用逻辑（含登录界面、权限控制）
├── src/storage/database/shared/
│   └── schema.ts           # 数据库表结构定义
├── index.html               # HTML 入口
├── vite.config.ts          # Vite 配置
├── tailwind.config.js      # Tailwind 配置
└── package.json            # 依赖管理
```

## API 接口

### 认证接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | /api/auth/login | 登录（支持空用户名密码=游客） | 公开 |
| GET | /api/auth/me | 获取当前用户信息 | 需登录 |
| PUT | /api/auth/password | 修改密码 | 需登录 |

### 用户管理接口（仅admin）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/users | 获取用户列表 | admin |
| POST | /api/users | 创建用户 | admin |
| PUT | /api/users/:id | 修改用户 | admin |
| DELETE | /api/users/:id | 删除用户 | admin |

### 审核接口

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | /api/review | 提交审核（SSE流式响应：前端解析纯文本 → LLM+知识库+联网搜索+分类审核） | 需登录 |
| GET | /api/reviews | 获取审核历史（普通用户仅自己，admin看全部） | 需登录 |
| GET | /api/reviews/:id | 获取审核详情 | 需登录 |
| DELETE | /api/reviews/:id | 删除审核记录 | 需登录 |

**POST /api/review SSE 事件格式：**
- `started`: `{ id: recordId }` - 审核已启动
- `progress`: `{ stage, message, segment?, totalSegments? }` - 进度更新
- `segment`: `{ segment, totalSegments, score? }` - 段落审核完成
- `completed`: `{ id, result }` - 审核完成（含完整结果）
- `error`: `{ error }` - 审核失败

### 知识库接口（仅admin）

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| POST | /api/knowledge/import | 导入知识库文档（支持指定模块） | admin |
| POST | /api/knowledge/search | 知识库搜索（支持按模块限定范围） | admin |
| GET | /api/knowledge/datasets | 获取知识库模块列表 | admin |
| POST | /api/web-search | 联网搜索 | admin |

### 其他

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | /api/health | 健康检查 | 公开 |

## 数据库表

### users（用户表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid (PK) | 用户ID |
| username | varchar(50) UNIQUE | 用户名 |
| password_hash | text | 密码（明文存储，待升级bcrypt） |
| role | varchar(20) | 角色：admin/user |
| display_name | varchar(100) | 显示名称 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

默认账号：admin / 123456 (role=admin, display_name=系统管理员)

### review_records（审核记录表）

| 字段 | 类型 | 说明 |
|------|------|------|
| id | uuid (PK) | 记录ID |
| file_name | text | 文件名 |
| review_type | varchar(20) | 审核类型 |
| review_mode | varchar(20) | 审核模式 |
| user_role | varchar(20) | 用户角色 |
| user_id | varchar | 关联用户ID |
| status | varchar(20) | 状态 |
| result | jsonb | 审核结果 |
| created_at | timestamp | 创建时间 |
| updated_at | timestamp | 更新时间 |

## 权限控制

| 功能 | admin | 普通用户 | 游客 |
|------|-------|---------|------|
| 文件审核 | ✅ | ✅ | ✅ |
| 历史记录 | 查看全部 | 仅自己 | 无 |
| 知识库管理 | ✅ | 不可见 | 不可见 |
| 用户管理 | ✅ | 不可见 | 不可见 |
| 修改密码 | ✅ | ✅ | - |

## 错别字与分类标注检测

所有审核类型的提示词均附加分类标注指令：
- **过期规范标注**：`【❌过期规范：应改为"现行规范编号"，实施日期YYYY.MM.DD】`
- **参数不合规标注**：`【❌参数不合规：依据XX标准，正确值为XXX】`
- **错别字标注**：`【🔴错别字：应改为"正确字"】`
- **问题标注**：`【❌问题：问题描述】`
- **提醒标注**：`【⚠️提醒：提醒内容】`

issues 分类（category 字段）：
- `format` - 格式错误（图表规范、标点符号、公式上下标、编号连续性）
- `typo` - 错别字（同音字、形近字、的/地/得混用等）
- `outdated_standard` - 过期规范（引用标准已被更新版本替代）
- `non_compliant` - 参数不合规（技术指标不符合现行标准）
- `missing` - 内容缺失（缺少必要章节、条款、签字等）
- `other` - 其他问题

## 知识库内容

已导入以下法规标准：
- 《建设工程安全生产管理条例》关键条款
- 《水利水电工程施工安全管理导则》关键条款
- 《抽水蓄能电站工程施工安全规范》关键条款

6个独立数据集：
- personnel_qualification（人员资质）
- enterprise_qualification（企业资质）
- technical_document（技术文件）
- safety_inspection（安全检查）
- document_review（公文审核）
- coze_doc_knowledge（通用法规）

## 环境变量

通过 Python Workload Identity 自动获取，无需手动配置：
- COZE_SUPABASE_URL
- COZE_SUPABASE_ANON_KEY
- COZE_SUPABASE_SERVICE_ROLE_KEY

## 开发命令

```bash
pnpm install     # 安装依赖
pnpm dev         # 启动开发服务器（自动复制 pdf.js worker）
pnpm build       # 构建生产版本（自动复制 pdf.js worker）
```

## 端口规范

- Web 服务: 5000
- HMR WebSocket: 6000

## 关键注意事项

### SSE 流式审核架构（重要）

**生产环境 FaaS 不支持 `setImmediate()` 后台任务**，HTTP 响应返回后进程可能被回收。
当前方案：POST /api/review 使用 SSE（Server-Sent Events）流式响应：
- 后端先返回 `Content-Type: text/event-stream`，保持 HTTP 连接
- 审核过程中通过 SSE 事件推送进度（started → progress → segment → completed）
- FaaS 在 HTTP 连接活跃期间不会杀进程，确保审核任务完整执行
- 前端通过 `fetch` + `ReadableStream` 读取 SSE 事件，实时更新进度
- 连接中断时，前端自动降级到 `GET /api/reviews/:id` 轮询获取结果

### 文件上传架构（重要）

**生产环境反向代理对 POST body 有大小限制**，以下方案均不可用：
- ❌ `multipart/form-data` + multer/formidable → HTTP 413
- ❌ `base64 + JSON POST` → HTTP 413（base64 膨胀 33%）

**当前方案：前端浏览器内解析文件，只发送纯文本**
- PDF → `pdfjs-dist`（worker 在 `public/pdf.worker.min.mjs`）
- Word (.docx) → `JSZip` 解压读 `word/document.xml`
- 图片 → base64 编码
- 纯文本 → `File.text()` 直接读取
- 前端截断保护：100000 字符限制，后端分段审核保证全文覆盖
- 后端分段审核：跳过报审单/目录 → 按章节拆分(每段≤40000/60000字符) → 逐段LLM审核 → 合并结果

### pdf.js Worker 配置

Worker 文件通过构建脚本自动从 `node_modules` 复制到 `public/` 目录：
- 开发环境：`scripts/dev.sh` 中 `cp -n node_modules/... public/`
- 生产构建：`scripts/build.sh` 中 `cp node_modules/... public/`
- Vite 构建时自动将 `public/` 内容复制到 `dist/`
- 代码中引用路径：`/pdf.worker.min.mjs`（绝对路径）

**不要使用** `new URL('pdfjs-dist/...', import.meta.url)` 方式配置 worker，Vite 无法正确解析 bare module specifier。
