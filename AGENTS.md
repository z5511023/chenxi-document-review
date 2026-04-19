# 辰溪工程文件审核助手 - 项目规范

## 项目概述

**产品名称**: 辰溪工程文件审核助手
**所属项目**: 辰溪抽水蓄能电站数字化管控平台
**版本**: V5.1
**技术栈**: Vite + TypeScript + Tailwind CSS + Express + Supabase + LLM + Knowledge + Web Search + pdf.js + JSZip

## 技术架构

```
用户浏览器
   ↓ 登录（admin/普通用户/游客）
   ↓ 上传文件 → 前端解析（pdf.js/JSZip/File.text）→ 提取纯文本
   ↓ JSON POST 纯文本到 /api/review（不传文件，避免 HTTP 413）
Express 后端 (5000端口)
   ↓ ① 按审核类型检索对应模块知识库（人员/企业/技术/安全/公文）
   ↓ ② 知识库不足时 → 联网搜索补全最新法规
   ↓ ③ 组装模块专用提示词 → 模块标准 + 错别字检测 + 联网资料 + 文件内容
   ↓ ④ 调用 LLM → 生成审核结果（含标注内容 annotatedContent + 错别字红色标注）
   ↓ ⑤ 存入 Supabase 数据库 → 审核记录关联用户持久化
   ↓ 返回审核结果（含对比标注 + 错别字标注 + 知识来源标注）
用户浏览器
```

## 核心服务

| 服务 | 提供方 | 用途 |
|------|--------|------|
| 数据库 | Coze Supabase | 审核记录 + 用户账号持久化存储 |
| 知识库 | Coze Knowledge | 模块化工程法规标准检索（6个独立数据集） |
| 联网搜索 | Coze Web Search | 知识库不足时补全最新法规 |
| AI 审核引擎 | doubao-seed-1-6-lite | 智能文件审核 + 错别字检测（高性价比） |

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
| POST | /api/review | 提交审核（前端解析纯文本 → LLM+知识库+联网搜索+错别字检测） | 需登录 |
| GET | /api/reviews | 获取审核历史（普通用户仅自己，admin看全部） | 需登录 |
| GET | /api/reviews/:id | 获取审核详情 | 需登录 |
| DELETE | /api/reviews/:id | 删除审核记录 | 需登录 |

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

## 错别字检测

所有审核类型的提示词均附加错别字检测指令：
- 在 `annotatedContent` 中用 `【🔴错别字：应改为"正确字"】` 标注
- 在 `issues` 中以 level=low, 标题以"错别字："开头列出
- 常见错别字：的/地/得混用、做/作混用、即/既混用、帐/账混用等

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

### 文件上传架构（重要）

**生产环境反向代理对 POST body 有大小限制**，以下方案均不可用：
- ❌ `multipart/form-data` + multer/formidable → HTTP 413
- ❌ `base64 + JSON POST` → HTTP 413（base64 膨胀 33%）

**当前方案：前端浏览器内解析文件，只发送纯文本**
- PDF → `pdfjs-dist`（worker 在 `public/pdf.worker.min.mjs`）
- Word (.docx) → `JSZip` 解压读 `word/document.xml`
- 图片 → base64 编码
- 纯文本 → `File.text()` 直接读取
- 前端截断保护：50000 字符限制
- 后端进一步截断：快速模式 15000 / 详细模式 30000 字符

### pdf.js Worker 配置

Worker 文件通过构建脚本自动从 `node_modules` 复制到 `public/` 目录：
- 开发环境：`scripts/dev.sh` 中 `cp -n node_modules/... public/`
- 生产构建：`scripts/build.sh` 中 `cp node_modules/... public/`
- Vite 构建时自动将 `public/` 内容复制到 `dist/`
- 代码中引用路径：`/pdf.worker.min.mjs`（绝对路径）

**不要使用** `new URL('pdfjs-dist/...', import.meta.url)` 方式配置 worker，Vite 无法正确解析 bare module specifier。
