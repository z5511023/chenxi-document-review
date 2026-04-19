# 文件上传解析完整指南

## 后端接口实现（Express + formidable）

> ⚠️ 不要用 multer！multer v1/v2 在生产环境都有兼容性问题，会导致上传请求挂起。用 formidable 替代。

```typescript
import formidable from 'formidable';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import path from 'path';

const execFileAsync = promisify(execFile);

const FORM_OPTIONS: formidable.Options = {
  maxFileSize: 20 * 1024 * 1024,
  multiples: true,
  keepExtensions: true,
};

router.post('/api/parse-file', async (req, res) => {
  req.setTimeout(60000);
  res.setTimeout(60000);

  try {
    const form = formidable(FORM_OPTIONS);
    const [, files] = await form.parse(req);
    const uploadedFiles = files.files; // 前端 FormData 用 'files' 字段名

    if (!uploadedFiles || uploadedFiles.length === 0) {
      return res.status(400).json({ error: '未上传文件' });
    }

    const results: { name: string; content: string; pages?: number }[] = [];

    for (const file of uploadedFiles) {
      const ext = file.originalFilename?.split('.').pop()?.toLowerCase() || '';
      const fileBuffer = await readFile(file.filepath);

      if (ext === 'pdf' || file.mimetype === 'application/pdf') {
        let parsedText = '';
        let pageCount = 0;

        // 优先 Python PyMuPDF
        const usePython = await isPythonAvailable();
        if (usePython) {
          try {
            const { stdout } = await execFileAsync('python3', [PDF_PARSER_SCRIPT, file.filepath, '0', '0'], {
              maxBuffer: 50 * 1024 * 1024, timeout: 30000,
            });
            const parseResult = JSON.parse(stdout);
            if (!parseResult.error) {
              parsedText = parseResult.text || '';
              pageCount = parseResult.pages || 0;
            }
          } catch { /* Python 失败，降级 */ }
        }

        // 降级：pdf-parse
        if (!parsedText) {
          const pdfParse = (await import('pdf-parse')).default;
          const data = await pdfParse(fileBuffer);
          parsedText = data.text || '';
          pageCount = data.numpages || 0;
        }

        results.push({
          name: file.originalFilename || 'unknown.pdf',
          content: parsedText || '[PDF解析结果为空]',
          pages: pageCount,
        });

      } else if (['doc', 'docx'].includes(ext)) {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(fileBuffer);
        const docXml = zip.file('word/document.xml');
        if (docXml) {
          const xml = await docXml.async('string');
          const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          results.push({ name: file.originalFilename || 'unknown.docx', content: text || '[Word解析结果为空]' });
        }

      } else if (file.mimetype?.startsWith('image/')) {
        const base64 = fileBuffer.toString('base64');
        results.push({ name: file.originalFilename || 'unknown.png', content: `data:${file.mimetype};base64,${base64}` });

      } else {
        results.push({ name: file.originalFilename || 'unknown.txt', content: fileBuffer.toString('utf-8') });
      }

      // 清理 formidable 临时文件
      try { await unlink(file.filepath); } catch { /* ignore */ }
    }

    res.json({ success: true, files: results });
  } catch (error) {
    console.error('File parse error:', error);
    if (!res.headersSent) res.status(500).json({ error: '文件解析失败' });
  }
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
