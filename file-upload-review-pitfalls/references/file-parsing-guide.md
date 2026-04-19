# 文件解析完整指南（前端解析方案）

## 核心原则：PaaS 环境用前端解析 + 纯文本 POST，不要用 multipart

生产环境（PaaS）的反向代理可能对 POST 请求 body size 有严格限制，**无论 multipart 还是 base64+JSON 都可能触发 HTTP 413**。最安全的方案是在浏览器端解析文件，只发送纯文本。

## 前端解析实现（推荐方案）

```typescript
// pdf.js worker 配置（在文件顶部或模块级别执行一次）
// 注意：worker 文件需复制到 public/ 目录
// 构建脚本: cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/

async function readFileContents(file: File): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';

  if (ext === 'pdf') {
    // PDF → pdf.js 前端解析
    const arrayBuffer = await file.arrayBuffer();
    const pdfjsLib = await import('pdfjs-dist');

    // 配置 worker（绝对路径，放在 public/ 目录）
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    }

    // 添加超时保护
    const pdfPromise = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
    const pdf = await Promise.race([
      pdfPromise,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('PDF 解析超时')), 30000)
      )
    ]);

    const textParts: string[] = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      textParts.push(pageText);
    }
    return textParts.join('\n\n') || '[PDF解析结果为空]';

  } else if (['doc', 'docx'].includes(ext)) {
    // Word → JSZip 前端解析
    const JSZip = (await import('jszip')).default;
    const arrayBuffer = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docXml = zip.file('word/document.xml');
    if (docXml) {
      const xml = await docXml.async('string');
      const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      return text || '[Word解析结果为空]';
    }
    return '[Word文档结构异常]';

  } else if (file.type.startsWith('image/')) {
    // 图片 → base64
    const base64 = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(file);
    });
    return `[图片: ${file.name}]\ndata:${file.type};base64,${base64}`;

  } else {
    // 纯文本
    return await file.text();
  }
}
```

## 发送审核请求（纯文本 JSON POST）

```typescript
async function submitReview(file: File, reviewType: string, token: string) {
  // 1. 前端解析文件
  let content = await readFileContents(file);

  // 2. 截断保护（50000字符 ≈ 150KB，避免代理限制）
  const MAX_CHARS = 50000;
  if (content.length > MAX_CHARS) {
    const headLen = Math.floor(MAX_CHARS * 0.8);
    const tailLen = MAX_CHARS - headLen;
    content = content.substring(0, headLen)
      + '\n\n[... 中间内容因长度限制已省略 ...]\n\n'
      + content.substring(content.length - tailLen);
  }

  // 3. JSON POST 发送纯文本
  const response = await fetch('/api/review', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      fileName: file.name,
      fileContent: content,
      reviewType: reviewType,
      reviewMode: 'quick',
      userRole: 'general'
    })
  });

  return await response.json();
}
```

## 后端接口（仅接收纯文本）

```typescript
// 后端不需要任何文件解析依赖！
// express.json() 设置合理 limit
app.use(express.json({ limit: '50mb' }));

router.post('/api/review', requireAuth, async (req, res) => {
  const { fileName, fileContent, reviewType, reviewMode, userRole } = req.body;

  if (!fileName || !fileContent || !reviewType) {
    return res.status(400).json({ error: '参数不完整' });
  }

  // 后端进一步截断（发给 LLM 的内容不需要太长）
  const maxContentLength = reviewMode === 'detailed' ? 30000 : 15000;
  let contentToSend = fileContent;
  if (fileContent.length > maxContentLength) {
    const headLen = Math.floor(maxContentLength * 0.8);
    const tailLen = maxContentLength - headLen;
    contentToSend = fileContent.substring(0, headLen)
      + '\n\n[... 中间内容省略 ...]\n\n'
      + fileContent.substring(fileContent.length - tailLen);
  }

  // 直接用 contentToSend 调用 LLM...
});
```

## 构建脚本配置

```bash
#!/bin/bash
set -Eeuo pipefail

# 安装依赖
pnpm install --loglevel warn

# 复制 pdf.js worker 到 public/
mkdir -p public
cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/

# 构建前端
pnpm vite build

# 构建后端
pnpm tsup server/server.ts --format cjs --platform node --target node20 \
  --outDir dist-server --no-splitting --no-minify \
  --external vite --external jszip
```

## .gitignore 配置

```
# 大文件
assets/*.pdf
assets/*.png
assets/*.jpg

# pdf.js worker（构建时从 node_modules 复制）
public/pdf.worker.min.mjs
```

## 关键注意事项

1. **不要用** `new URL('pdfjs-dist/...', import.meta.url)` 配置 worker，Vite 无法解析 bare module specifier
2. **worker 文件必须**放在 `public/` 目录，用绝对路径 `/pdf.worker.min.mjs` 引用
3. **base64 方案也可能触发 HTTP 413**（膨胀 33%），前端解析纯文本更安全
4. **pdf.js 需要超时保护**，worker 加载失败时 `getDocument()` 会永久挂起
5. **前端截断 50000 字符**，后端进一步截断到 15000/30000 字符
