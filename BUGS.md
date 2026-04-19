# 辰溪工程文件审核助手 - BUG 与问题记录

> 本文档记录了项目开发过程中遇到的所有 BUG、踩坑点和解决方案，供后续开发和新项目参考。

---

## 一、致命级 BUG（导致功能完全不可用）

### BUG-001：PDF 文件 readAsText 乱码导致 LLM 幻觉

| 项目 | 内容 |
|------|------|
| **严重级别** | 🔴 致命 |
| **发现时间** | V5.0 部署后用户实际测试 |
| **现象** | 上传 PDF 技术方案文件，审核结果却显示"特种作业操作证审核报告"，内容完全无关 |
| **根因** | 前端使用 `FileReader.readAsText()` 读取 PDF 二进制文件，产出乱码文本；LLM 基于乱码输入产生完全无关的幻觉结果 |
| **修复** | 改用 pdf.js 在前端解析 PDF 提取文本，不再使用 readAsText |
| **教训** | **永远不要用 readAsText 读取非纯文本文件（PDF/Word/Excel/图片）**，必须使用专业的文件解析库 |

---

### BUG-002：HTTP 413 - 生产环境反向代理拒绝文件上传

| 项目 | 内容 |
|------|------|
| **严重级别** | 🔴 致命 |
| **发现时间** | 生产环境部署后 |
| **现象** | 上传任何文件（即使 10KB）都返回 HTTP 413 (Request Entity Too Large)，进度条无限转圈 |
| **根因** | 生产环境有反向代理（nginx），默认对 POST 请求 body size 有限制。无论是 multipart/form-data 还是 base64+JSON，代理层都会拒绝 |
| **最终修复** | **完全弃用后端文件上传**，改为前端浏览器内解析文件：PDF 用 pdf.js、Word 用 JSZip、文本用 File.text()，提取纯文本后通过 JSON POST 发送到后端审核接口。文本内容限制 50000 字符（约 150KB），避免触发代理限制 |
| **教训** | **在受限的 PaaS 环境中，反向代理可能限制所有大 body POST 请求，不仅是 multipart。最安全的方案是在前端解析文件，只发送纯文本** |

**尝试过的方案及失败原因：**
1. ~~FormData + multer~~ → HTTP 413
2. ~~FormData + formidable~~ → HTTP 413
3. ~~base64 + JSON POST~~ → HTTP 413（base64 膨胀 33%，仍超代理限制）
4. ✅ **前端 pdf.js + JSZip 解析** → 只发纯文本，body 小，代理放行

---

### BUG-003：pdf.js worker 在 Vite 中加载失败导致无限等待

| 项目 | 内容 |
|------|------|
| **严重级别** | 🔴 致命 |
| **发现时间** | BUG-002 修复后，前端解析方案上线测试 |
| **现象** | 上传 PDF 后进度条无限转圈，无错误提示 |
| **根因** | `new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` 在 Vite 中无法正确解析 worker 路径，导致 worker 加载失败，`pdfjsLib.getDocument()` 永久挂起 |
| **修复** | 将 pdf.worker.min.mjs 复制到 `public/` 目录，使用绝对路径 `/pdf.worker.min.mjs` 引用；同时添加 30 秒超时保护 |
| **教训** | **Vite 中 `new URL(bareModuleSpecifier, import.meta.url)` 不能解析 node_modules 中的文件。应该用 `?url` import 或复制到 public/ 目录** |

**正确配置：**
```typescript
// ✅ 正确：worker 放在 public/，Vite 自动服务
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// ❌ 错误：bare module specifier 不能被 Vite 解析
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();
```

---

### BUG-004：部署版本选择为空（构建失败）

| 项目 | 内容 |
|------|------|
| **严重级别** | 🔴 致命 |
| **发现时间** | 尝试部署时 |
| **现象** | 部署页面"请选择版本"下拉框为空，无法部署；或无限读条 |
| **根因** | 多个因素叠加：1) 17MB PDF 文件提交到 git 导致构建超时；2) pnpm-lock.yaml 与 package.json 不一致导致 install 失败（`--prefer-frozen-lockfile` 硬报错）；3) 构建脚本 `set -Eeuo pipefail` 使任何非零退出码都终止构建 |
| **修复** | 1) 从 git 移除大文件，.gitignore 添加 `assets/*.pdf` `assets/*.png`；2) 构建脚本去掉 `--prefer-frozen-lockfile`，改用 `pnpm install --loglevel warn` |
| **教训** | **不要把大型二进制文件提交到 git**；构建脚本要容错，不要因为非关键步骤失败就中断整个构建 |

---

## 二、严重级 BUG（功能异常但可绕过）

### BUG-005：tsup 打包 pdf-parse 导致运行时失败

| 项目 | 内容 |
|------|------|
| **严重级别** | 🟠 严重 |
| **现象** | 生产环境 PDF 解析失败，parse-file 接口无响应 |
| **根因** | pdf-parse 内含测试 PDF 文件，tsup 打包时将此文件打入 bundle，导致运行时异常 |
| **修复** | 已移除 pdf-parse，改用前端 pdf.js 解析（彻底解决） |

---

### BUG-006：大型 PDF 前 14 页是审批表和目录

| 项目 | 内容 |
|------|------|
| **严重级别** | 🟠 严重 |
| **现象** | 大型工程 PDF 前面有审批表和目录，简单截取前 N 字符只拿到目录内容，正文被丢弃 |
| **修复** | 后端智能截取 head(80%) + tail(20%)；前端限制 50000 字符 |
| **教训** | **工程类 PDF 普遍有审批表+目录**，解析时必须智能跳过 |

---

### BUG-007：沙箱资源耗尽（fork: Resource temporarily unavailable）

| 项目 | 内容 |
|------|------|
| **严重级别** | 🟠 严重 |
| **现象** | 反复执行 pnpm install / build / python 解析后，沙箱无法 fork 新进程 |
| **根因** | 沙箱有进程数限制，多次编译 + 服务重启耗尽进程配额 |
| **修复** | 避免在单次会话中反复重启服务和编译；调试时不要循环执行命令 |
| **教训** | **不要在沙箱中反复执行重命令**；调试应先看日志再定点修复 |

---

## 三、一般级问题

### BUG-008：登录页显示管理员密码

| 项目 | 内容 |
|------|------|
| **严重级别** | 🟡 一般（安全隐患） |
| **现象** | 登录页显示 admin/123456 提示 |
| **修复** | 移除密码提示，添加注册入口 |

### BUG-009：审核类型和模式缺少说明

| 项目 | 内容 |
|------|------|
| **严重级别** | 🟡 一般（体验问题） |
| **现象** | 用户不知道快速审核和详细审核的区别 |
| **修复** | 添加问号图标，点击展开说明面板 |

---

## 四、当前架构（前端解析方案）

### 文件处理流程

```
用户上传文件
    ↓
前端浏览器内解析（无需网络请求）
    ├─ PDF → pdf.js（worker 在 public/ 目录）
    ├─ Word (.docx) → JSZip 解压读 word/document.xml
    ├─ 图片 → base64 编码
    └─ 文本 → File.text() 直接读取
    ↓
提取的纯文本（限制 50000 字符）
    ↓
JSON POST → /api/review（仅发送纯文本）
    ↓
后端组装提示词 + 知识库检索 + 联网搜索 + LLM 审核
    ↓
返回审核结果（含标注内容 + 错别字标注 + 知识来源）
```

### 依赖版本避坑表

| 包名 | ❌ 不要用 | ✅ 推荐版本 | 原因 |
|------|----------|-----------|------|
| multer | 任何版本 | 不要用 | PaaS 代理拦截 multipart |
| formidable | - | 不要用 | 同上，代理拦截大 body |
| pdf-parse | - | 不要用 | 内含测试 PDF，打包后出错 |
| pdfjs-dist | - | ^4.4.168 | 前端解析 PDF，worker 放 public/ |
| jszip | - | ^3.10.1 | 前端解析 Word (.docx) |

### tsup 打包排除列表

```bash
pnpm tsup server/server.ts --external vite --external jszip
```

### 生产环境部署检查清单

- [x] `.gitignore` 排除大文件（PDF/图片/视频）和 worker 文件
- [x] `pnpm-lock.yaml` 与 `package.json` 一致
- [x] 构建脚本容错：非关键步骤失败不中断
- [x] pdf.js worker 复制到 public/（构建脚本自动执行）
- [x] 前端内容截断保护（50000 字符限制）
- [x] 所有 npm 包版本锁定

---

## 五、调试方法论

### 沙箱调试原则

1. **先看日志再改代码**：`tail -n 50 /app/work/logs/bypass/app.log`
2. **不要循环重试命令**：fork 失败说明资源耗尽，等一会儿再试
3. **最小化命令**：能读文件就不要用 cat，能 grep 就不要遍历
4. **端口检测用 `ss -tuln`**：不要用 `lsof -i`（沙箱 IPv6 误检）
5. **杀进程用 PID**：`ss -lptn 'sport = :5000'` 找到 PID 再 kill

### 文件上传问题排查

1. **确认请求是否到达后端**：检查 app.log 是否有 POST 请求日志
2. **检查 HTTP 状态码**：413 = 代理限制 body 大小；502 = 后端未启动
3. **检查 Content-Type**：`application/json` 比 `multipart/form-data` 更不容易被代理拦截
4. **检查 body 大小**：纯文本 < 150KB 一般没问题，base64 可能膨胀 33%
5. **前端解析 vs 后端解析**：如果代理限制严格，优先前端解析方案

---

*文档最后更新：2026-04-19*
