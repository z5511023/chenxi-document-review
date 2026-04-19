---
name: file-upload-review-pitfalls
description: 用于在开发涉及文件上传、文件解析、LLM审核类的 Web 应用时，自动避坑和检查常见问题；当用户构建文件审核系统、文档解析服务、或任何需要上传文件并交给 AI 处理的应用时使用。
---

## 何时使用

- 用户要构建文件上传 + AI 审核/分析类应用
- 用户要处理 PDF/Word/Excel 等非纯文本文件
- 用户要集成 multer 文件上传中间件
- 用户要在 Vite + Express 项目中实现文件解析
- 用户遇到文件上传后 AI 输出内容完全无关（幻觉问题）

## 核心避坑规则

### 规则 1：永远不要用 readAsText 读取非纯文本文件

PDF、Word、Excel 是二进制格式，`FileReader.readAsText()` 会产出乱码。LLM 基于乱码输入会产生完全无关的幻觉结果。

**正确做法**：前端通过 FormData 上传原始文件，后端用专业库解析。

```javascript
// ❌ 错误
const reader = new FileReader();
reader.readAsText(pdfFile);  // 乱码！

// ✅ 正确
const formData = new FormData();
formData.append('files', file);
fetch('/api/parse-file', { method: 'POST', body: formData });
```

详见 `references/file-parsing-guide.md`。

### 规则 2：在 PaaS 环境不要用 multipart/form-data 上传文件

生产环境的反向代理（nginx）可能对 multipart 请求有 body size 限制，导致 HTTP 413 错误，即使文件很小也会被拒绝。用 base64 + JSON 替代。

```
✅ readAsDataURL → base64 → JSON POST（绕过代理 multipart 限制）
❌ FormData + multipart/form-data（触发 HTTP 413）
❌ multer / formidable（都是 multipart 方案，同样触发 413）
```

**前端：**
```javascript
const reader = new FileReader();
reader.onload = () => {
  const base64 = reader.result.split(',')[1];
  fetch('/api/parse-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: [{ name: file.name, data: base64, type: file.type }] })
  });
};
reader.readAsDataURL(file);
```

**后端：**
```typescript
const { files } = req.body; // express.json() 已解析
const buffer = Buffer.from(file.data, 'base64');
```

### 规则 3：PDF 解析要有降级方案

Python PyMuPDF 解析质量最高，但生产环境可能没有 Python。必须准备 Node.js pdf-parse 作为降级。

```typescript
// 检测 Python 可用性（缓存结果，不重复检测）
let pythonOk: boolean | null = null;
async function isPythonAvailable(): Promise<boolean> {
  if (pythonOk !== null) return pythonOk;
  try {
    const { stdout } = await execFileAsync('python3', ['-c', 'import fitz; print("ok")'], { timeout: 5000 });
    pythonOk = stdout.trim() === 'ok';
  } catch { pythonOk = false; }
  return pythonOk;
}
```

### 规则 4：工程类 PDF 必须智能跳过审批表和目录

大型工程 PDF 前面通常有审批表和目录（10-20页），简单截取前 N 字符只拿到目录。必须自动检测并跳过。

详见 `references/pdf-smart-skip.py`。

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
```

### 规则 6：tsup 打包必须排除有副作用的 npm 包

pdf-parse 内含测试 PDF 文件，被 tsup 打包后会导致运行时错误。formidable、jszip 也应排除，运行时从 node_modules 加载。

```bash
# ❌ 只排除 vite
pnpm tsup server/server.ts --external vite

# ✅ 排除所有有副作用的包
pnpm tsup server/server.ts --external vite --external pdf-parse --external formidable --external jszip
```

### 规则 7：构建脚本必须容错

```bash
# ❌ 任何失败都中断
set -Eeuo pipefail
pnpm install --prefer-frozen-lockfile

# ✅ 非关键步骤容错
pip3 install PyMuPDF 2>/dev/null || echo "PyMuPDF not available, using fallback"
pnpm install --loglevel warn
```

### 规则 8：不要对二进制数据使用贪婪正则

PDF 二进制流中用 `/stream[\s\S]*?endstream/g` 匹配可能导致回溯爆炸，进程卡死。只能用专业解析库。

## 操作步骤

1. 检查项目是否有文件上传需求，如有则按上述规则审查
2. 确认 multer 版本为 v1 LTS
3. 确认文件解析走 FormData → 后端解析路径
4. 确认 PDF 解析有降级方案
5. 确认 .gitignore 排除大文件
6. 确认构建脚本容错
7. 检查是否存在 readAsText 读取非文本文件的代码

## 资源索引

- `references/file-parsing-guide.md`: 当需要实现文件上传解析接口时读取，包含 PDF/Word/Excel/图片的完整解析代码
- `references/pdf-smart-skip.py`: 当需要解析大型工程 PDF 时读取，Python 脚本自动跳过审批表和目录
- `references/dependency-versions.md`: 当需要确认依赖版本时读取，包含所有已知避坑的版本对照表

### 规则 9：前后端都要加超时保护

文件上传和 AI 审核都是耗时操作，必须加超时，否则用户会看到无限转圈。

```typescript
// 前端：fetch + AbortController
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), 60000);
await fetch(url, { signal: controller.signal });

// 后端：设置请求超时
req.setTimeout(60000);
res.setTimeout(60000);
```

- pdf-parse 必须作为正式依赖写在 package.json 中，不能用动态 import（tsup 打包后不可靠）
- Python 脚本路径在 tsup 打包后会变，优先用 `COZE_WORKSPACE_PATH` 环境变量定位
- 沙箱环境有进程数限制，不要在一次会话中反复重启服务和编译
