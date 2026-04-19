# 文件上传解析完整指南

## 核心原则：PaaS 环境用 base64 + JSON，不要用 multipart

生产环境（PaaS）的反向代理可能对 multipart/form-data 请求有 body size 限制，导致 HTTP 413。必须用 `readAsDataURL` + JSON POST 绕过。

## 前端上传实现

```typescript
async function uploadAndParseFiles(files: File[]): Promise<{ name: string; content: string }[]> {
  // 将文件读取为 base64，通过 JSON 发送
  const fileData = [];
  for (const f of files) {
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]); // 去掉 data:mime;base64, 前缀
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });
    fileData.push({ name: f.name, data: base64, type: f.type });
  }

  const response = await fetch('/api/parse-file', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ files: fileData }),
  });
  const data = await response.json();
  if (data.success && data.files) return data.files;
  throw new Error(data.error || '文件解析失败');
}
```

## 后端接口实现（Express + JSON body）

```typescript
// express.json() 必须设置足够大的 limit
app.use(express.json({ limit: '50mb' }));

router.post('/api/parse-file', async (req, res) => {
  const { files } = req.body as { files: { name: string; data: string; type: string }[] };

  if (!files || files.length === 0) {
    return res.status(400).json({ error: '未上传文件' });
  }

  const results = [];

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const fileBuffer = Buffer.from(file.data, 'base64'); // base64 → Buffer

    if (ext === 'pdf') {
      let parsedText = '';
      // 优先 Python PyMuPDF（需要写临时文件）
      if (await isPythonAvailable()) {
        const tmpPath = `/tmp/pdf_${Date.now()}.pdf`;
        await writeFile(tmpPath, fileBuffer);
        try {
          const { stdout } = await execFileAsync('python3', [PDF_PARSER_SCRIPT, tmpPath, '0', '0'], {
            maxBuffer: 50 * 1024 * 1024, timeout: 30000,
          });
          const parseResult = JSON.parse(stdout);
          if (!parseResult.error) parsedText = parseResult.text || '';
        } catch { /* Python 失败，降级 */ }
        try { await unlink(tmpPath); } catch { /* ignore */ }
      }

      // 降级：pdf-parse
      if (!parsedText) {
        const pdfParse = (await import('pdf-parse')).default;
        const data = await pdfParse(fileBuffer);
        parsedText = data.text || '';
      }

      results.push({ name: file.name, content: parsedText || '[PDF解析结果为空]' });

    } else if (['doc', 'docx'].includes(ext)) {
      const JSZip = (await import('jszip')).default;
      const zip = await JSZip.loadAsync(fileBuffer);
      const docXml = zip.file('word/document.xml');
      if (docXml) {
        const xml = await docXml.async('string');
        const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        results.push({ name: file.name, content: text || '[Word解析结果为空]' });
      }

    } else if (file.type?.startsWith('image/')) {
      results.push({ name: file.name, content: `[图片: ${file.name}]\ndata:${file.type};base64,${file.data}` });

    } else {
      results.push({ name: file.name, content: fileBuffer.toString('utf-8') });
    }
  }

  res.json({ success: true, files: results });
});
```

## 前端上传实现

```typescript
async function uploadAndParseFiles(files: FileItem[]): Promise<{ name: string; content: string }[]> {
  const formData = new FormData();
  for (const f of files) {
    formData.append('files', f.file, f.name);
  }
  const response = await fetch('/api/parse-file', { method: 'POST', body: formData });
  const data = await response.json();
  if (data.success && data.files) return data.files;
  throw new Error(data.error || '文件解析失败');
}
```

## 智能内容截取

当文件内容超过 LLM 上下文限制时，采用 head + tail 策略：

```typescript
function smartTruncate(content: string, maxLength: number): string {
  if (content.length <= maxLength) return content;
  const headLen = Math.floor(maxLength * 0.8);
  const tailLen = maxLength - headLen;
  return content.substring(0, headLen)
    + '\n\n[... 中间内容省略 ...]\n\n'
    + content.substring(content.length - tailLen);
}
```
