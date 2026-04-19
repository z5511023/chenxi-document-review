# 文件上传解析完整指南

## 后端接口实现（Express + multer）

```typescript
import multer from 'multer';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import pdfParse from 'pdf-parse';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

router.post('/api/parse-file', upload.array('files', 10), async (req, res) => {
  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) {
    return res.status(400).json({ error: '未上传文件' });
  }

  const results: { name: string; content: string; pages?: number }[] = [];
  const tmpFiles: string[] = [];

  try {
    for (const file of files) {
      const ext = file.originalname.split('.').pop()?.toLowerCase() || '';

      if (ext === 'pdf' || file.mimetype === 'application/pdf') {
        // PDF 解析
        let parsedText = '';
        let pageCount = 0;

        const usePython = await isPythonAvailable();
        if (usePython) {
          const tmpPath = path.join('/tmp', `pdf_${Date.now()}.pdf`);
          tmpFiles.push(tmpPath);
          await writeFile(tmpPath, file.buffer);
          try {
            const { stdout } = await execFileAsync('python3', [PDF_PARSER_SCRIPT, tmpPath, '0', '0'], {
              maxBuffer: 50 * 1024 * 1024, timeout: 30000,
            });
            const parseResult = JSON.parse(stdout);
            if (!parseResult.error) {
              parsedText = parseResult.text || '';
              pageCount = parseResult.pages || 0;
            }
          } catch { /* Python 解析失败，降级 */ }
        }

        // 降级：Node.js pdf-parse
        if (!parsedText) {
          const data = await pdfParse(file.buffer);
          parsedText = data.text || '';
          pageCount = data.numpages || 0;
        }

        results.push({
          name: file.originalname,
          content: parsedText || '[PDF解析结果为空]',
          pages: pageCount,
        });

      } else if (['doc', 'docx'].includes(ext)) {
        // Word 文件
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file.buffer);
        const docXml = zip.file('word/document.xml');
        if (docXml) {
          const xml = await docXml.async('string');
          const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
          results.push({ name: file.originalname, content: text || '[Word解析结果为空]' });
        }

      } else if (file.mimetype.startsWith('image/')) {
        // 图片 base64
        const base64 = file.buffer.toString('base64');
        results.push({ name: file.originalname, content: `data:${file.mimetype};base64,${base64}` });

      } else {
        // 纯文本
        results.push({ name: file.originalname, content: file.buffer.toString('utf-8') });
      }
    }
  } finally {
    for (const tmp of tmpFiles) {
      try { await unlink(tmp); } catch { /* ignore */ }
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
