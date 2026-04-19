---
name: file-upload-review-pitfalls
description: 用于在开发涉及文件上传、文件解析、LLM审核类的 Web 应用时，自动避坑和检查常见问题；当用户构建文件审核系统、文档解析服务、或任何需要上传文件并交给 AI 处理的应用时使用。
---

## 何时使用

- 用户要构建文件上传 + AI 审核/分析类应用
- 用户要处理 PDF/Word/Excel 等非纯文本文件
- 用户要在 Vite + Express 项目中实现文件解析
- 用户遇到文件上传后 AI 输出内容完全无关（幻觉问题）
- 用户遇到文件上传 HTTP 413 或进度条卡死问题

## 核心避坑规则

### 规则 1：永远不要用 readAsText 读取非纯文本文件

PDF、Word、Excel 是二进制格式，`FileReader.readAsText()` 会产出乱码。LLM 基于乱码输入会产生完全无关的幻觉结果。

**正确做法**：使用专业库在浏览器端解析文件，或上传原始文件由后端解析。

```javascript
// ❌ 错误
const reader = new FileReader();
reader.readAsText(pdfFile);  // 乱码！

// ✅ 正确：前端 pdf.js 解析 PDF
const pdfjsLib = await import('pdfjs-dist');
const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

// ✅ 正确：前端 JSZip 解析 Word
const JSZip = (await import('jszip')).default;
const zip = await JSZip.loadAsync(arrayBuffer);
const xml = await zip.file('word/document.xml')?.async('string');

// ✅ 正确：纯文本直接读取
const text = await file.text();
```

详见 `references/file-parsing-guide.md`。

### 规则 2：在 PaaS 环境优先使用前端解析方案

生产环境的反向代理（nginx）可能对 POST 请求 body size 有严格限制，**无论是 multipart 还是 base64+JSON，都可能触发 HTTP 413**。最安全的方案是在浏览器端解析文件，只发送纯文本。

```
✅ 前端解析（pdf.js/JSZip）→ 纯文本 JSON POST（body 最小）
❌ FormData + multipart/form-data（触发 HTTP 413）
❌ base64 + JSON POST（base64 膨胀 33%，仍可能触发 413）
❌ multer / formidable（都是 multipart 方案，同样触发 413）
```

**前端解析后发送纯文本：**
```javascript
// 1. 浏览器内解析文件
const text = await readFileContents(file);  // pdf.js / JSZip / File.text()

// 2. 截断保护（避免 body 过大）
const MAX_CHARS = 50000;
const content = text.length > MAX_CHARS
  ? text.substring(0, MAX_CHARS * 0.8) + '\n[...省略...]\n' + text.substring(text.length - MAX_CHARS * 0.2)
  : text;

// 3. JSON POST 发送纯文本
fetch('/api/review', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
  body: JSON.stringify({ fileName: file.name, fileContent: content, reviewType: 'document' })
});
```

**后端只接收纯文本：**
```typescript
router.post('/api/review', requireAuth, async (req, res) => {
  const { fileName, fileContent, reviewType, reviewMode, userRole } = req.body;
  // 直接用 fileContent 调用 LLM，无需任何文件解析
});
```

### 规则 3：pdf.js Worker 在 Vite 中的正确配置

`new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url)` 在 Vite 中**不能正确解析** bare module specifier，导致 worker 加载失败，`getDocument()` 永久挂起。

**正确做法**：将 worker 文件复制到 `public/` 目录，使用绝对路径引用。

```typescript
// ✅ 正确：worker 放在 public/，Vite 自动服务
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

// ❌ 错误：bare module specifier 不能被 Vite 解析
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();
```

**构建脚本中自动复制：**
```bash
# 在 pnpm install 之后
mkdir -p public
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/
```

**.gitignore 中排除 worker 文件（从 node_modules 复制，不需要提交）：**
```
public/pdf.worker.min.mjs
```

**添加超时保护**（防止 worker 加载失败导致无限等待）：
```typescript
const pdfPromise = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
const pdf = await Promise.race([
  pdfPromise,
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('PDF 解析超时')), 30000)
  )
]);
```

### 规则 4：工程类 PDF 必须智能跳过审批表和目录

大型工程 PDF 前面通常有审批表和目录（10-20页），简单截取前 N 字符只拿到目录。必须自动检测并跳过，或使用 head(80%) + tail(20%) 截取策略。

### 规则 5：不要把大型二进制文件提交到 git

PDF、图片、视频等大文件会导致：
- 部署构建超时
- 版本选择为空
- 仓库体积膨胀

必须在 `.gitignore` 中排除：
```
assets/*.pdf
assets/*.png
assets/*.jpg
public/pdf.worker.min.mjs
```

### 规则 6：tsup 打包必须排除有副作用的 npm 包

pdf-parse 内含测试 PDF 文件，被 tsup 打包后会导致运行时错误。如果后端使用 JSZip 等包，也应排除。

```bash
pnpm tsup server/server.ts --external vite --external jszip
```

注意：如果采用前端解析方案，后端不需要 pdf-parse、multer、formidable 等文件处理依赖。

### 规则 7：构建脚本必须容错

```bash
# ❌ 任何失败都中断
set -Eeuo pipefail
pnpm install --prefer-frozen-lockfile

# ✅ 非关键步骤容错
pnpm install --loglevel warn
```

### 规则 8：不要对二进制数据使用贪婪正则

PDF 二进制流中用 `/stream[\s\S]*?endstream/g` 匹配可能导致回溯爆炸，进程卡死。只能用专业解析库。

### 规则 9：前后端都要加超时保护

文件上传和 AI 审核都是耗时操作，必须加超时，否则用户会看到无限转圈。

```typescript
// 前端：fetch + AbortController
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 120000);
await fetch(url, { ...options, signal: controller.signal });

// 前端：pdf.js 解析超时
const pdf = await Promise.race([
  pdfjsLib.getDocument({ data }).promise,
  new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PDF 解析超时')), 30000))
]);
```

### 规则 10：前端内容截断保护

生产环境代理对 POST body 大小有限制，前端应在发送前截断过长的文本内容。推荐限制 50000 字符（约 150KB UTF-8），后端会进一步截取核心部分发给 LLM。

## 操作步骤

1. 检查项目是否有文件上传需求，如有则按上述规则审查
2. 优先考虑前端解析方案（pdf.js + JSZip），避免后端文件上传
3. 确认 pdf.js worker 配置正确（`/pdf.worker.min.mjs` 绝对路径）
4. 确认前端内容截断保护（50000 字符限制）
5. 确认 .gitignore 排除大文件和 worker 文件
6. 确认构建脚本容错 + 自动复制 pdf.js worker
7. 检查是否存在 readAsText 读取非文本文件的代码
8. 检查是否有 multipart/form-data 上传代码（应移除）

## 资源索引

- `references/file-parsing-guide.md`: 当需要实现文件解析时读取，包含 PDF/Word/图片的前端解析代码
- `references/dependency-versions.md`: 当需要确认依赖版本时读取，包含所有已知避坑的版本对照表
