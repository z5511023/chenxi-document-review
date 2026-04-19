import { Router } from 'express';
import { LLMClient, Config as LLMConfig, HeaderUtils, KnowledgeClient, DataSourceType, SearchClient } from 'coze-coding-dev-sdk';
import type { KnowledgeDocument } from 'coze-coding-dev-sdk';
import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import { getSupabaseClient } from '../src/storage/database/supabase-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const router = Router();
const execFileAsync = promisify(execFile);

// multer 内存存储，用于文件上传解析
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Python PDF 解析脚本路径
const PDF_PARSER_SCRIPT = process.env.COZE_WORKSPACE_PATH
  ? path.join(process.env.COZE_WORKSPACE_PATH, 'server', 'src', 'pdf-parser.py')
  : path.join(__dirname, '..', 'src', 'pdf-parser.py');

// 检查 Python + PyMuPDF 是否可用
let pythonAvailable: boolean | null = null;
async function isPythonAvailable(): Promise<boolean> {
  if (pythonAvailable !== null) return pythonAvailable;
  try {
    const { stdout } = await execFileAsync('python3', ['-c', 'import fitz; print("ok")'], { timeout: 5000 });
    pythonAvailable = stdout.trim() === 'ok';
  } catch {
    pythonAvailable = false;
  }
  console.log('Python PyMuPDF available:', pythonAvailable);
  return pythonAvailable;
}

// Node.js 降级 PDF 解析（运行时动态加载，无需打包时依赖）
async function parsePdfWithNode(buffer: Buffer): Promise<string> {
  try {
    // 尝试动态 import pdf-parse
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    return data.text || '';
  } catch {
    // pdf-parse 不可用时，尝试从 buffer 中提取可见文本
    try {
      const text = buffer.toString('utf-8', 0, Math.min(buffer.length, 500000));
      // 提取 PDF stream 中的文本片段
      const textParts: string[] = [];
      const streamRegex = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
      let match;
      while ((match = streamRegex.exec(text)) !== null) {
        const content = match[1];
        // 提取括号内的文本 (PDF text objects)
        const textRegex = /\(([^)]*)\)/g;
        let textMatch;
        while ((textMatch = textRegex.exec(content)) !== null) {
          if (textMatch[1].length > 1 && /[\u4e00-\u9fff]/.test(textMatch[1])) {
            textParts.push(textMatch[1]);
          }
        }
      }
      if (textParts.length > 0) {
        return textParts.join('\n');
      }
    } catch {
      // ignore
    }
    return '';
  }
}

// ==================== 审核类型 → 知识库数据集映射 ====================
const DATASET_MAP: Record<string, string[]> = {
  personnel: ['personnel_qualification'],
  enterprise: ['enterprise_qualification'],
  technical: ['technical_document'],
  safety: ['safety_inspection'],
  document: ['document_review'],
  comprehensive: [
    'personnel_qualification',
    'enterprise_qualification',
    'technical_document',
    'safety_inspection',
    'document_review',
    'coze_doc_knowledge',
  ],
};

// ==================== 错别字检测通用指令（附加到所有审核提示词） ====================
const TYPO_CHECK_INSTRUCTION = `

【重要 - 错别字检测】
除审核内容合规性外，你必须逐字检查文件中的错别字、用词错误、语法错误，并在annotatedContent中用【🔴错别字：应改为"正确字"】标注每一个错别字。
常见错别字示例：
- "的/地/得"混用
- "做/作"混用
- "即/既"混用
- "帐/账"混用
- "象/像"混用
- "再/在"混用
- "长/常"混用
- 其他同音字、形近字错误
如果发现错别字，在issues中也要列出，level为"low"，标题以"错别字："开头。`;

// ==================== 审核类型专用提示词 ====================
const REVIEW_PROMPTS: Record<string, string> = {
  personnel: `你是辰溪抽水蓄能电站的工程文件审核专家，专门审核【人员资质】文件。

⚠️ 审核范围：仅审核人员资质类文件（身份证、特种作业操作证、安全考核合格证、建造师注册证书、安全生产考核合格证A/B/C证等）。

审核要点：
1. 证件有效期检查（是否过期或即将过期3个月内）
2. 信息完整性检查（姓名、证件号、有效期、发证机关等是否齐全）
3. 信息一致性检查（不同证件之间姓名、身份证号是否一致）
4. 合规性检查（特种作业人员必须持证上岗，证件类别是否匹配岗位要求）
5. 证件真伪初步判断（格式是否规范、印章是否清晰）

请严格根据知识库中的人员资质标准进行审核，以JSON格式返回：
{
  "conclusion": "pass/fail/warning",
  "score": 0-100,
  "issues": [{"level":"high/medium/low","title":"问题标题","description":"问题描述","suggestion":"整改建议","location":"问题位置"}],
  "suggestions": ["建议1","建议2"],
  "details": "详细分析说明",
  "annotatedContent": "将文件原文内容返回，错别字用【🔴错别字：应改为"正确字"】标注，问题处用【❌问题：xxx】标注，需注意处用【⚠️提醒：xxx】标注",
  "references": [{"source":"knowledge/web","title":"参考标题","snippet":"参考内容摘要"}]
}`,

  enterprise: `你是辰溪抽水蓄能电站的工程文件审核专家，专门审核【企业资质】文件。

⚠️ 审核范围：仅审核企业资质类文件（营业执照、安全生产许可证、资质等级证书等）。

审核要点：
1. 营业执照有效期检查
2. 安全生产许可证检查（有效期3年）
3. 资质等级与工程要求匹配检查
4. 经营范围的合规性检查
5. 企业名称一致性检查

请严格根据知识库中的企业资质标准进行审核，以JSON格式返回，包含annotatedContent字段。`,

  technical: `你是辰溪抽水蓄能电站的工程文件审核专家，专门审核【技术文件】。

⚠️ 审核范围：仅审核技术文件类文件（施工组织设计、施工方案、技术交底记录等）。依据国家标准和技术规范审核。

审核要点：
1. 技术方案的完整性和可行性
2. 施工工艺的合理性
3. 质量控制措施是否到位
4. 安全技术措施是否完善
5. 技术标准引用的准确性（现行有效）
6. 审批签字流程的合规性（编制→审核→批准三级审批）

请严格根据知识库中的技术文件标准进行审核，以JSON格式返回，包含annotatedContent字段。`,

  safety: `你是辰溪抽水蓄能电站的工程文件审核专家，专门审核【安全检查】文件。

⚠️ 审核范围：仅审核安全检查类文件（安全检查表、风险评估报告、应急预案等）。

审核要点：
1. 安全检查表是否完整
2. 风险辨识是否准确
3. 整改措施是否有效（是否闭环）
4. 应急预案是否可行
5. 安全责任落实情况

请严格根据知识库中的安全检查标准进行审核，以JSON格式返回，包含annotatedContent字段。`,

  document: `你是辰溪抽水蓄能电站的工程文件审核专家，专门审核【公文】文件的格式规范。

⚠️ 审核范围：仅审核公文格式规范，包括纸张规格、页边距、字体字号、标题格式、正文格式、发文字号、签发人、印章、成文日期等。不审核公文内容，只审核格式。

审核要点（严格对照格式标准）：
1. 纸张规格：A4（210mm×297mm）
2. 页边距：上37mm、下35mm、左28mm、右26mm
3. 标题：二号小标宋体，居中
4. 正文：三号仿宋体，行距28磅
5. 发文机关标志：上边缘至版心上边缘35mm，红色小标宋体
6. 发文字号：三号仿宋体，居中
7. 签发人：三号仿宋体
8. 成文日期：右空四字，阿拉伯数字
9. 印章：端正、居中下压成文日期
10. 附件格式：正文下空一行左空二字

请严格根据知识库中的公文格式标准逐项审核，以JSON格式返回，包含annotatedContent字段（格式错误用【❌格式错误：应xxx，实际xxx】标注）。`,

  comprehensive: `你是辰溪抽水蓄能电站的工程文件审核专家，请对上传的文件进行全面审核。
综合运用所有知识库的标准，从格式、内容、合规性等多维度审核。
以JSON格式返回审核结果，包含annotatedContent字段。`,
};

// 给所有提示词加上错别字检测指令
Object.keys(REVIEW_PROMPTS).forEach((key) => {
  REVIEW_PROMPTS[key] += TYPO_CHECK_INSTRUCTION;
});

// ==================== 用户认证辅助 ====================
interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'user' | 'guest';
  displayName: string;
}

function getSessionUser(req: Request): AuthUser | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) return null;
  try {
    const token = authHeader.replace('Bearer ', '');
    const decoded = JSON.parse(Buffer.from(token, 'base64').toString('utf-8'));
    return decoded as AuthUser;
  } catch {
    return null;
  }
}

function createSessionToken(user: AuthUser): string {
  return Buffer.from(JSON.stringify(user)).toString('base64');
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: '请先登录' });
    return;
  }
  (req as Request & { user?: AuthUser }).user = user;
  next();
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const user = getSessionUser(req);
  if (!user || user.role !== 'admin') {
    res.status(403).json({ error: '需要管理员权限' });
    return;
  }
  (req as Request & { user?: AuthUser }).user = user;
  next();
}

// ==================== 知识库检索 ====================
async function searchKnowledge(
  reviewType: string, query: string, headers: Record<string, string>
): Promise<{ context: string; used: boolean; chunks: number; datasets: string[] }> {
  try {
    const config = new LLMConfig();
    const knowledgeClient = new KnowledgeClient(config, headers);
    const datasets = DATASET_MAP[reviewType] || DATASET_MAP.comprehensive;

    const searchQueries: Record<string, string> = {
      personnel: `${query} 人员资质 特种作业证 安全考核证`,
      enterprise: `${query} 企业资质 营业执照 安全生产许可证`,
      technical: `${query} 施工方案 技术交底 质量控制 技术标准`,
      safety: `${query} 安全检查 风险评估 应急预案`,
      document: `${query} 公文格式 字体字号 页边距 签章规范`,
      comprehensive: query,
    };

    const response = await knowledgeClient.search(searchQueries[reviewType] || query, datasets, 5, 0.3);

    if (response.code === 0 && response.chunks && response.chunks.length > 0) {
      const filtered = response.chunks.filter((chunk: { score: number }) => chunk.score > 0.3);
      if (filtered.length > 0) {
        const context = filtered.map((chunk: { score: number; content: string; document_name?: string }) => {
          const label = chunk.document_name ? `[数据集: ${chunk.document_name}]` : '';
          return `[知识库法规片段，相似度: ${(chunk.score * 100).toFixed(0)}%] ${label}\n${chunk.content}`;
        }).join('\n\n');
        return { context, used: true, chunks: filtered.length, datasets };
      }
    }
    return { context: '', used: false, chunks: 0, datasets };
  } catch (error) {
    console.error('Knowledge search error:', error);
    return { context: '', used: false, chunks: 0, datasets: [] };
  }
}

// ==================== 联网搜索 ====================
async function searchWeb(
  reviewType: string, query: string, headers: Record<string, string>
): Promise<{ context: string; used: boolean; results: number }> {
  try {
    const config = new LLMConfig();
    const searchClient = new SearchClient(config, headers);

    const searchQueries: Record<string, string> = {
      personnel: `${query} 人员资质审核 特种作业证规定 安全考核要求`,
      enterprise: `${query} 企业资质审核 营业执照 安全生产许可证`,
      technical: `${query} 施工方案审核 技术交底规范 工程技术标准`,
      safety: `${query} 安全检查规范 风险评估标准 应急预案要求`,
      document: `${query} 公文格式规范 GB/T9704 党政机关公文格式`,
      comprehensive: `${query} 工程文件审核规范标准`,
    };

    const response = await searchClient.webSearch(searchQueries[reviewType] || query, 5, true);

    if (response.web_items && response.web_items.length > 0) {
      const webContext = response.web_items.map((item, idx) => {
        let part = `[联网搜索结果 ${idx + 1}]\n标题: ${item.title}`;
        if (item.snippet) part += `\n摘要: ${item.snippet}`;
        if (item.summary) part += `\nAI总结: ${item.summary}`;
        if (item.url) part += `\n来源: ${item.url}`;
        return part;
      }).join('\n\n');

      const summarySection = response.summary ? `\n\n[联网搜索AI综合总结]\n${response.summary}` : '';
      return { context: webContext + summarySection, used: true, results: response.web_items.length };
    }
    return { context: '', used: false, results: 0 };
  } catch (error) {
    console.error('Web search error:', error);
    return { context: '', used: false, results: 0 };
  }
}

// ==================== 文件上传解析 ====================
router.post('/api/parse-file', upload.array('files', 10), async (req: Request, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: '未上传文件' });
      return;
    }

    const results: { name: string; content: string; pages?: number }[] = [];
    const tmpFiles: string[] = [];

    try {
      for (const file of files) {
        const ext = file.originalname.split('.').pop()?.toLowerCase() || '';

        if (ext === 'pdf' || file.mimetype === 'application/pdf') {
          // PDF 解析：优先 Python PyMuPDF，降级 Node.js pdf-parse
          let parsedText = '';
          let pageCount = 0;

          const usePython = await isPythonAvailable();
          if (usePython) {
            // Python PyMuPDF 解析（支持智能跳过目录）
            const tmpPath = path.join('/tmp', `pdf_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);
            tmpFiles.push(tmpPath);
            await writeFile(tmpPath, file.buffer);
            try {
              const maxPages = file.size > 5 * 1024 * 1024 ? 50 : 0;
              const { stdout, stderr } = await execFileAsync('python3', [PDF_PARSER_SCRIPT, tmpPath, String(maxPages), '0'], {
                maxBuffer: 50 * 1024 * 1024,
                timeout: 60000,
              });
              if (stderr) console.error('PDF parser stderr:', stderr.substring(0, 500));
              const parseResult = JSON.parse(stdout);
              if (!parseResult.error) {
                parsedText = parseResult.text || '';
                pageCount = parseResult.pages || 0;
              }
            } catch (parseErr) {
              console.error('Python PDF parse failed:', parseErr instanceof Error ? parseErr.message : String(parseErr));
            }
          }

          // 降级：使用 Node.js pdf-parse
          if (!parsedText) {
            console.log('Falling back to Node.js pdf-parse');
            parsedText = await parsePdfWithNode(file.buffer);
          }

          if (parsedText) {
            results.push({ name: file.originalname, content: parsedText, pages: pageCount });
          } else {
            results.push({ name: file.originalname, content: '[PDF解析结果为空，可能为扫描件，请尝试上传文字版PDF或直接粘贴文本内容]' });
          }
        } else if (['doc', 'docx'].includes(ext) || file.mimetype.includes('word') || file.mimetype.includes('document')) {
          // Word 文件：读取 zip 中的 word/document.xml
          try {
            const JSZip = await import('jszip');
            const zip = await JSZip.default.loadAsync(file.buffer);
            const docXml = zip.file('word/document.xml');
            if (docXml) {
              const xmlContent = await docXml.async('string');
              const text = xmlContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
              results.push({ name: file.originalname, content: text || '[Word文档解析结果为空]' });
            } else {
              results.push({ name: file.originalname, content: '[Word文档结构异常，未找到正文内容]' });
            }
          } catch {
            results.push({ name: file.originalname, content: '[Word文档解析失败，请尝试导出为PDF后上传或直接粘贴文本]' });
          }
        } else if (['xls', 'xlsx'].includes(ext) || file.mimetype.includes('sheet') || file.mimetype.includes('excel')) {
          results.push({ name: file.originalname, content: '[Excel文件暂不支持直接解析，请导出为PDF后上传或直接粘贴关键数据]' });
        } else if (file.mimetype.startsWith('image/')) {
          // 图片转 base64（供多模态模型使用）
          const base64 = file.buffer.toString('base64');
          results.push({ name: file.originalname, content: `[图片: ${file.originalname}]\ndata:${file.mimetype};base64,${base64}` });
        } else {
          // 其他文本文件直接读取
          const text = file.buffer.toString('utf-8');
          results.push({ name: file.originalname, content: text });
        }
      }
    } finally {
      // 清理临时文件
      for (const tmp of tmpFiles) {
        try { await unlink(tmp); } catch { /* ignore */ }
      }
    }

    res.json({ success: true, files: results });
  } catch (error) {
    console.error('File parse error:', error);
    res.status(500).json({ error: '文件解析失败' });
  }
});

// ==================== 健康检查 ====================
router.get('/api/health', async (_req: Request, res: Response) => {
  let dbStatus = 'unknown';
  try {
    const supabase: AnyClient = await getSupabaseClient();
    const { error } = await supabase.from('review_records').select('id').limit(1);
    dbStatus = error ? 'error' : 'ok';
  } catch { dbStatus = 'error'; }

  res.json({ status: 'ok', database: dbStatus, knowledge: 'ok', webSearch: 'ok', timestamp: new Date().toISOString() });
});

// ==================== 登录 ====================
router.post('/api/auth/login', async (req: Request, res: Response) => {
  try {
    const { username, password } = req.body;

    // 允许空用户名/密码（游客模式）
    if (!username || !password) {
      const guestUser: AuthUser = {
        id: 'guest',
        username: username || 'guest',
        role: 'guest',
        displayName: username || '游客',
      };
      const token = createSessionToken(guestUser);
      res.json({ success: true, token, user: guestUser });
      return;
    }

    const supabase: AnyClient = await getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('id, username, password_hash, role, display_name')
      .eq('username', username)
      .maybeSingle();

    if (error || !data) {
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }

    // 简单密码比对（后续可升级为bcrypt）
    if (data.password_hash !== password) {
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }

    const authUser: AuthUser = {
      id: data.id as string,
      username: data.username as string,
      role: data.role as 'admin' | 'user',
      displayName: (data.display_name || data.username) as string,
    };
    const token = createSessionToken(authUser);
    res.json({ success: true, token, user: authUser });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: '登录失败' });
  }
});

// ==================== 注册 ====================
router.post('/api/auth/register', async (req: Request, res: Response) => {
  try {
    const { username, password, displayName } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: '用户名和密码不能为空' });
      return;
    }
    if (username.length > 50) {
      res.status(400).json({ error: '用户名过长' });
      return;
    }

    const supabase: AnyClient = await getSupabaseClient();

    // 检查用户名是否已存在
    const { data: existing } = await supabase.from('users').select('id').eq('username', username).maybeSingle();
    if (existing) {
      res.status(400).json({ error: '该用户名已被注册' });
      return;
    }

    const { data, error } = await supabase
      .from('users')
      .insert({
        username,
        password_hash: password,
        role: 'user',
        display_name: displayName || username,
      })
      .select('id, username, role, display_name')
      .single();

    if (error) {
      res.status(500).json({ error: '注册失败，请稍后重试' });
      return;
    }

    // 注册成功后自动登录
    const authUser: AuthUser = {
      id: data.id as string,
      username: data.username as string,
      role: 'user',
      displayName: (data.display_name || data.username) as string,
    };
    const token = createSessionToken(authUser);
    res.json({ success: true, token, user: authUser });
  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ error: '注册失败' });
  }
});

// ==================== 获取当前用户信息 ====================
router.get('/api/auth/me', (req: Request, res: Response) => {
  const user = getSessionUser(req);
  if (!user) {
    res.status(401).json({ error: '未登录' });
    return;
  }
  res.json({ success: true, user });
});

// ==================== 修改密码 ====================
router.put('/api/auth/password', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as Request & { user?: AuthUser };
    const { oldPassword, newPassword } = req.body;
    if (!newPassword) {
      res.status(400).json({ error: '新密码不能为空' });
      return;
    }

    const supabase: AnyClient = await getSupabaseClient();
    const { data } = await supabase.from('users').select('password_hash').eq('id', authReq.user!.id).maybeSingle();
    if (!data || data.password_hash !== oldPassword) {
      res.status(400).json({ error: '原密码错误' });
      return;
    }

    await supabase.from('users').update({ password_hash: newPassword, updated_at: new Date().toISOString() }).eq('id', authReq.user!.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: '修改密码失败' });
  }
});

// ==================== Admin: 获取用户列表 ====================
router.get('/api/users', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const supabase: AnyClient = await getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('id, username, role, display_name, created_at, updated_at')
      .order('created_at', { ascending: true });

    if (error) {
      res.status(500).json({ error: '查询用户列表失败' });
      return;
    }
    res.json({ success: true, users: data || [] });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

// ==================== Admin: 创建用户 ====================
router.post('/api/users', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { username, password, role, displayName } = req.body;
    if (!username) {
      res.status(400).json({ error: '用户名不能为空' });
      return;
    }

    const supabase: AnyClient = await getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .insert({
        username,
        password_hash: password || '123456',
        role: role || 'user',
        display_name: displayName || username,
      })
      .select('id, username, role, display_name, created_at')
      .single();

    if (error) {
      if (error.code === '23505') {
        res.status(400).json({ error: '用户名已存在' });
      } else {
        res.status(500).json({ error: '创建用户失败' });
      }
      return;
    }
    res.json({ success: true, user: data });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: '创建用户失败' });
  }
});

// ==================== Admin: 修改用户 ====================
router.put('/api/users/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { username, password, role, displayName } = req.body;
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (username) updateData.username = username;
    if (password) updateData.password_hash = password;
    if (role) updateData.role = role;
    if (displayName !== undefined) updateData.display_name = displayName;

    const supabase: AnyClient = await getSupabaseClient();
    const { error } = await supabase.from('users').update(updateData).eq('id', req.params.id);

    if (error) {
      res.status(500).json({ error: '修改用户失败' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: '修改失败' });
  }
});

// ==================== Admin: 删除用户 ====================
router.delete('/api/users/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase: AnyClient = await getSupabaseClient();
    // 不允许删除admin自己
    const authReq = req as Request & { user?: AuthUser };
    if (authReq.user?.id === req.params.id) {
      res.status(400).json({ error: '不能删除当前登录的管理员账号' });
      return;
    }
    const { error } = await supabase.from('users').delete().eq('id', req.params.id);
    if (error) {
      res.status(500).json({ error: '删除用户失败' });
      return;
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

// ==================== 提交审核 ====================
router.post('/api/review', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as Request & { user?: AuthUser };
    const { fileName, fileContent, reviewType, reviewMode, userRole } = req.body;

    if (!fileName || !fileContent || !reviewType) {
      res.status(400).json({ error: '缺少必要参数' });
      return;
    }

    const validTypes = ['personnel', 'enterprise', 'technical', 'safety', 'document', 'comprehensive'];
    if (!validTypes.includes(reviewType)) {
      res.status(400).json({ error: '无效的审核类型' });
      return;
    }

    const supabase: AnyClient = await getSupabaseClient();
    const { data: record, error: dbError } = await supabase
      .from('review_records')
      .insert({
        file_name: fileName,
        review_type: reviewType,
        review_mode: reviewMode || 'quick',
        user_role: userRole || 'general',
        user_id: authReq.user!.id,
        status: 'processing',
      })
      .select('id')
      .single();

    if (dbError) {
      console.error('DB insert error:', dbError);
      res.status(500).json({ error: '创建审核记录失败' });
      return;
    }

    const recordId = record.id;
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as unknown as Headers);

    const knowledgeResult = await searchKnowledge(reviewType, fileName, customHeaders);

    let webSearchResult = { context: '', used: false, results: 0 };
    if (!knowledgeResult.used || knowledgeResult.chunks < 2) {
      webSearchResult = await searchWeb(reviewType, fileName, customHeaders);
    }

    let contextSection = '';
    if (knowledgeResult.used) {
      contextSection += `\n\n=== 知识库检索结果（模块：${knowledgeResult.datasets.join(', ')}） ===\n${knowledgeResult.context}`;
    }
    if (webSearchResult.used) {
      contextSection += `\n\n=== 联网搜索结果 ===\n${webSearchResult.context}`;
    }
    if (!knowledgeResult.used && !webSearchResult.used) {
      contextSection += '\n\n注意：知识库和联网搜索均未找到直接相关标准，请基于专业知识审核。';
    }

    let systemPrompt = REVIEW_PROMPTS[reviewType] || REVIEW_PROMPTS.comprehensive;
    systemPrompt += reviewMode === 'quick'
      ? '\n\n快速审核模式，重点检查关键问题和错别字，必须包含annotatedContent。'
      : '\n\n详细审核模式，全面深入审核，必须包含annotatedContent。';
    systemPrompt += contextSection;

    // 智能截取：PDF已自动跳过审批表/目录，这里只需截断
    const maxContentLength = reviewMode === 'detailed' ? 30000 : 15000;
    let contentToSend = fileContent;

    if (fileContent.length > maxContentLength) {
      // 取前部核心内容 + 尾部结论部分
      const headLen = Math.floor(maxContentLength * 0.8);
      const tailLen = maxContentLength - headLen;
      contentToSend = fileContent.substring(0, headLen)
        + '\n\n[... 中间内容省略 ...]\n\n'
        + fileContent.substring(fileContent.length - tailLen);
    }

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: `请审核以下文件：\n\n文件名：${fileName}\n审核类型：${reviewType}\n审核模式：${reviewMode}\n用户角色：${userRole || 'general'}\n文件总长度：${fileContent.length}字（${fileContent.length > maxContentLength ? '已截取核心部分' : '完整内容'}）\n\n文件内容：\n${contentToSend}` },
    ];

    let fullContent = '';
    try {
      const config = new LLMConfig();
      const client = new LLMClient(config, customHeaders);
      const stream = client.stream(messages, {
        model: 'doubao-seed-1-6-lite-251015',
        temperature: reviewMode === 'detailed' ? 0.2 : 0.3,
      });
      for await (const chunk of stream) {
        if (chunk.content) fullContent += chunk.content.toString();
      }
    } catch (llmError) {
      console.error('LLM call failed:', llmError);
      await supabase.from('review_records').update({ status: 'failed', updated_at: new Date().toISOString() }).eq('id', recordId);
      res.status(500).json({ error: 'AI 审核服务暂时不可用' });
      return;
    }

    let result: Record<string, unknown>;
    try {
      const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
      result = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        conclusion: 'warning', score: 70, issues: [], suggestions: ['建议人工复核'], details: fullContent, annotatedContent: fileContent.substring(0, 3000),
      };
    } catch {
      result = { conclusion: 'warning', score: 70, issues: [], suggestions: ['建议人工复核'], details: fullContent, annotatedContent: fileContent.substring(0, 3000) };
    }

    if (!result.annotatedContent) result.annotatedContent = fileContent.substring(0, 3000);

    await supabase.from('review_records').update({ status: 'completed', result, updated_at: new Date().toISOString() }).eq('id', recordId);

    res.json({
      success: true, id: recordId, result, fileName, reviewType, reviewMode,
      knowledgeUsed: knowledgeResult.used, knowledgeChunks: knowledgeResult.chunks,
      knowledgeDatasets: knowledgeResult.datasets,
      webSearchUsed: webSearchResult.used, webSearchResults: webSearchResult.results,
    });
  } catch (error) {
    console.error('Review API error:', error);
    res.status(500).json({ error: '审核服务异常' });
  }
});

// ==================== 获取审核历史列表（仅返回当前用户的） ====================
router.get('/api/reviews', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as Request & { user?: AuthUser };
    const supabase: AnyClient = await getSupabaseClient();
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const offset = parseInt(req.query.offset as string) || 0;

    // admin可以看到所有记录，普通用户只看自己的，游客看不到
    let query = supabase
      .from('review_records')
      .select('id, file_name, review_type, review_mode, user_role, status, result, created_at, user_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (authReq.user!.role !== 'admin') {
      query = query.eq('user_id', authReq.user!.id);
    }

    const { data, error, count } = await query;

    if (error) {
      res.status(500).json({ error: '查询审核记录失败' });
      return;
    }
    res.json({ success: true, data: data || [], total: count || 0, limit, offset });
  } catch (error) {
    console.error('Get reviews error:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

// ==================== 获取审核详情 ====================
router.get('/api/reviews/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as Request & { user?: AuthUser };
    const supabase: AnyClient = await getSupabaseClient();
    const { data, error } = await supabase.from('review_records').select('*').eq('id', req.params.id).maybeSingle();

    if (error || !data) {
      res.status(error ? 500 : 404).json({ error: error ? '查询失败' : '记录不存在' });
      return;
    }

    // 非admin只能看自己的记录
    if (authReq.user!.role !== 'admin' && data.user_id !== authReq.user!.id) {
      res.status(403).json({ error: '无权查看此记录' });
      return;
    }

    res.json({ success: true, data });
  } catch (error) {
    console.error('Get review detail error:', error);
    res.status(500).json({ error: '查询失败' });
  }
});

// ==================== 删除审核记录 ====================
router.delete('/api/reviews/:id', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as Request & { user?: AuthUser };
    const supabase: AnyClient = await getSupabaseClient();

    // 非admin只能删自己的
    if (authReq.user!.role !== 'admin') {
      const { data } = await supabase.from('review_records').select('user_id').eq('id', req.params.id).maybeSingle();
      if (data && data.user_id !== authReq.user!.id) {
        res.status(403).json({ error: '无权删除此记录' });
        return;
      }
    }

    await supabase.from('review_records').delete().eq('id', req.params.id);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete review error:', error);
    res.status(500).json({ error: '删除失败' });
  }
});

// ==================== 知识库导入（仅admin） ====================
router.post('/api/knowledge/import', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { documents, dataset, reviewType } = req.body;
    if (!documents || !Array.isArray(documents) || documents.length === 0) {
      res.status(400).json({ error: '缺少文档数据' });
      return;
    }

    let targetDatasets: string[];
    if (dataset) targetDatasets = [dataset];
    else if (reviewType && DATASET_MAP[reviewType]) targetDatasets = DATASET_MAP[reviewType];
    else targetDatasets = ['coze_doc_knowledge'];

    const config = new LLMConfig();
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as unknown as Headers);
    const knowledgeClient = new KnowledgeClient(config, customHeaders);

    const knowledgeDocs: KnowledgeDocument[] = documents.map((doc: { type: string; content?: string; url?: string }) => ({
      source: doc.type === 'url' ? DataSourceType.URL : DataSourceType.TEXT,
      raw_data: doc.type === 'url' ? undefined : doc.content,
      url: doc.type === 'url' ? doc.url : undefined,
    }));

    const results: { dataset: string; docIds?: string[]; error?: string }[] = [];
    for (const ds of targetDatasets) {
      try {
        const response = await knowledgeClient.addDocuments(knowledgeDocs, ds);
        results.push(response.code === 0 ? { dataset: ds, docIds: response.doc_ids } : { dataset: ds, error: response.msg || '导入失败' });
      } catch (err) {
        results.push({ dataset: ds, error: err instanceof Error ? err.message : '导入异常' });
      }
    }

    const successCount = results.filter((r) => !r.error).length;
    res.json({ success: successCount > 0, message: `成功导入到 ${successCount}/${targetDatasets.length} 个数据集`, results, datasets: targetDatasets });
  } catch (error) {
    console.error('Knowledge import error:', error);
    res.status(500).json({ error: '知识库导入失败' });
  }
});

// ==================== 知识库搜索（仅admin） ====================
router.post('/api/knowledge/search', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { query, topK, reviewType, dataset } = req.body;
    if (!query) { res.status(400).json({ error: '缺少查询参数' }); return; }

    const config = new LLMConfig();
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as unknown as Headers);
    const knowledgeClient = new KnowledgeClient(config, customHeaders);

    let tableNames: string[] | undefined;
    if (dataset) tableNames = [dataset];
    else if (reviewType && DATASET_MAP[reviewType]) tableNames = DATASET_MAP[reviewType];

    const response = await knowledgeClient.search(query, tableNames, topK || 5, 0.3);

    if (response.code === 0) {
      const results = (response.chunks || []).map((chunk: { content: string; score: number; document_name?: string }) => ({
        content: chunk.content, score: chunk.score, documentName: chunk.document_name || '',
      }));
      res.json({ success: true, results, total: results.length, searchedDatasets: tableNames });
    } else {
      res.json({ success: true, results: [], total: 0 });
    }
  } catch (error) {
    console.error('Knowledge search API error:', error);
    res.status(500).json({ error: '知识库搜索失败' });
  }
});

// ==================== 联网搜索（仅admin） ====================
router.post('/api/web-search', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { query, count } = req.body;
    if (!query) { res.status(400).json({ error: '缺少查询参数' }); return; }

    const config = new LLMConfig();
    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as unknown as Headers);
    const searchClient = new SearchClient(config, customHeaders);

    const response = await searchClient.webSearch(query, count || 5, true);
    const results = (response.web_items || []).map((item) => ({
      title: item.title, snippet: item.snippet, summary: item.summary, url: item.url, siteName: item.site_name,
    }));
    res.json({ success: true, results, aiSummary: response.summary || '', total: results.length });
  } catch (error) {
    console.error('Web search API error:', error);
    res.status(500).json({ error: '联网搜索失败' });
  }
});

// ==================== 获取知识库模块列表（仅admin） ====================
router.get('/api/knowledge/datasets', requireAdmin, (_req: Request, res: Response) => {
  const datasets = [
    { id: 'personnel_qualification', name: '人员资质', reviewType: 'personnel', icon: '👤', description: '身份证、特种作业证、安全考核证等标准' },
    { id: 'enterprise_qualification', name: '企业资质', reviewType: 'enterprise', icon: '🏢', description: '营业执照、安全生产许可证等标准' },
    { id: 'technical_document', name: '技术文件', reviewType: 'technical', icon: '📐', description: '施工方案、技术交底等国家技术标准' },
    { id: 'safety_inspection', name: '安全检查', reviewType: 'safety', icon: '🔒', description: '安全检查表、风险评估等标准' },
    { id: 'document_review', name: '公文审核', reviewType: 'document', icon: '📄', description: '公文格式规范（字体、边距、签章等）' },
    { id: 'coze_doc_knowledge', name: '通用法规', reviewType: 'comprehensive', icon: '📚', description: '建设工程安全生产管理条例等通用法规' },
  ];
  res.json({ success: true, datasets });
});

export default router;
