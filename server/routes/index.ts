import { Router } from 'express';
import { LLMClient, Config as LLMConfig, HeaderUtils, KnowledgeClient, DataSourceType, SearchClient } from 'coze-coding-dev-sdk';
import type { KnowledgeDocument } from 'coze-coding-dev-sdk';
import type { Request, Response, NextFunction } from 'express';
import { getSupabaseClient } from '../src/storage/database/supabase-client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = any;

const router = Router();

// ==================== 审核类型 → 知识库数据集映射 ====================
// 公共数据集（GB文件、通用法规，所有单位共享）
const PUBLIC_DATASETS: Record<string, string[]> = {
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

// 各单位私有数据集（按 company_type 区分）
const COMPANY_DATASETS: Record<string, Record<string, string[]>> = {
  general: { // 总包单位
    personnel: ['general_personnel'],
    enterprise: ['general_enterprise'],
    technical: ['general_technical'],
    safety: ['general_safety'],
    document: ['general_document'],
    comprehensive: ['general_personnel', 'general_enterprise', 'general_technical', 'general_safety', 'general_document'],
  },
  supervisor: { // 监理单位
    personnel: ['supervisor_personnel'],
    enterprise: ['supervisor_enterprise'],
    technical: ['supervisor_technical'],
    safety: ['supervisor_safety'],
    document: ['supervisor_document'],
    comprehensive: ['supervisor_personnel', 'supervisor_enterprise', 'supervisor_technical', 'supervisor_safety', 'supervisor_document'],
  },
  construction: { // 施工单位
    personnel: ['construction_personnel'],
    enterprise: ['construction_enterprise'],
    technical: ['construction_technical'],
    safety: ['construction_safety'],
    document: ['construction_document'],
    comprehensive: ['construction_personnel', 'construction_enterprise', 'construction_technical', 'construction_safety', 'construction_document'],
  },
};

// 旧版兼容映射（无 company_type 时使用）
const DATASET_MAP: Record<string, string[]> = PUBLIC_DATASETS;

// 获取某单位某审核类型的完整数据集列表（公共 + 单位私有）
function getDatasetsForCompany(reviewType: string, companyType?: string): string[] {
  const publicDs = PUBLIC_DATASETS[reviewType] || PUBLIC_DATASETS.comprehensive;
  if (!companyType || companyType === 'guest') return publicDs;
  const companyDs = COMPANY_DATASETS[companyType]?.[reviewType] || [];
  // 去重合并
  return [...new Set([...publicDs, ...companyDs])];
}

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
  "issues": [{"level":"high/medium/low","title":"问题标题","description":"问题描述","suggestion":"整改建议","location":"问题位置（标注页码如第X页）"}],
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

  comprehensive: `你是辰溪抽水蓄能电站的工程文件审核专家，专门对工程文件进行全面深入审核。

审核维度（按重要性排序）：
一、格式规范性审核
1. 图表规范性：图例、标注、编号是否按工程制图标准绘制；表格列对齐、单元格合并是否正确
2. 标点符号：全角/半角混用（如全角顿号､应统一为半角、）；括号、逗号全半角混用
3. 公式与单位：上标/下标是否正确（m³→不应写为m3、mm²→不应写为mm2）；运算符前后空格统一
4. 编号体系：章节编号是否连续无重复、无跳号；附件序号是否连续
5. 页面排版：表格列宽、行间距是否规范

二、错别字与表述错误
1. 同音字/形近字错误（箱杆→锚杆、领析→锚杆、东立能→架立筋等）
2. 的/地/得混用、做/作混用、即/既混用
3. 语句不通顺或逻辑错误（"是"误写为"时"、"围岩"误写为"围堰"等）

三、不符合现行国家标准/规范
1. 规范引用过期：逐一检查引用的标准号是否已被更新版本替代，标注过期规范编号和现行替代规范编号及实施日期
2. 技术参数不符合规范：对照现行标准检查技术指标（如半孔率、振动速度控制值等），标注具体条款和正确参数
3. 安全与管理要求缺失：检查是否遗漏强制性安全要求

四、内容完整性
1. 签字审批流程是否完整（编制→审核→批准）
2. 应急预案是否包含必要内容
3. 专项施工方案是否覆盖关键工序

请严格根据知识库标准及联网搜索的最新法规进行审核，以JSON格式返回结果。`,
};

// 给所有提示词加上错别字检测指令 + annotatedContent强化指令
const ANNOTATED_CONTENT_INSTRUCTION = `

【关键 - annotatedContent 标注要求】
annotatedContent 是最重要的输出字段，必须严格按要求生成：
1. 将原文完整返回（不要省略任何内容）
2. 在原文中找到每个问题/错别字的位置，用以下标记插入原文：
   - 错别字标注：【🔴错别字：应改为"正确字"】（紧跟在错别字后面）
   - 严重问题标注：【❌问题：问题描述】（紧跟在问题文字后面）
   - 过期规范标注：【❌过期规范：应改为"现行规范编号"，实施日期YYYY.MM.DD】（紧跟在过期规范编号后面）
   - 技术参数不合规：【❌参数不合规：依据XX标准，正确值为XXX】（紧跟在错误参数后面）
   - 格式错误标注：【❌格式错误：应xxx，实际xxx】（紧跟在格式错误后面）
   - 提醒注意标注：【⚠️提醒：提醒内容】（紧跟在需注意的文字后面）
3. 绝对不能只返回原始文本而不加任何标注！
4. 绝对不能省略原文内容！
5. 每个issue都必须在annotatedContent中有对应的标注
6. 示例：原文"依据DL/T 5099-2011"→ annotatedContent:"依据DL/T 5099-2011【❌过期规范：应改为DL/T 5099-2021，实施日期2022.03.01】"

【严禁 - 标注中不得包含思考/推理过程】
7. 标注内容必须是确定的最终结论，严禁包含推理过程！
   错误示例：【❌过期规范：应改为"GB50003-2011(2012年版)"? 不对, 最新是GB50003-2023, 实施...】
   正确示例：【❌过期规范：应改为"GB50003-2023"，实施日期2024.06.01】
8. 标注文字要简洁明确，禁止出现问号、犹豫、自我纠正等思考痕迹
9. 如果不确定现行规范版本，通过联网搜索确认后再标注，不要在标注中表达不确定

【关键 - annotatedContent 与 issues 必须完全对应】
10. 每一个在annotatedContent中插入的标注，都必须在issues数组中有对应的条目
11. 反过来，issues中的每一个问题，也必须在annotatedContent中有对应的标注
12. 不允许出现"标注了但issues没有"或"issues有但标注遗漏"的情况
13. 提醒类标注(⚠️)也必须有对应的issue条目（category为other）

【关键 - issues 输出规范（必须严格遵守）】
issues 是审查结果的核心输出，必须按以下格式严格填写：

1. issues 必须分类，category 字段取值：
   - format(格式错误)：图表规范、标点符号、公式上下标、编号连续性、表格排版等
   - typo(错别字)：同音字、形近字、的/地/得混用等
   - outdated_standard(过期规范)：引用标准已被更新版本替代
   - non_compliant(参数不合规)：技术指标不符合现行标准
   - missing(内容缺失)：缺少必要章节、条款、签字等
   - other(其他问题)

2. 每个issue必须包含以下字段，缺一不可：
   - level: 严重程度 high/medium/low
   - category: 分类（上述6种）
   - title: 简明标题
   - description: 详细描述（必须包含错误内容和正确内容的对比）
   - location: 页码（格式为"第X页"或"第X-Y页"）
   - suggestion: 改进建议

3. description 格式要求（必须明确对比错误与正确内容）：
   - 格式错误类："页码XX，错误位置：XXX，错误描述：YYY"
   - 错别字类："错误内容：XX，正确内容：YY"  
   - 过期规范类："过期规范：《名称》编号-YYYY，现行替代规范：《名称》编号-YYYY，实施时间：YYYY.MM.DD"
   - 参数不合规类："错误：XXX，正确：依据XX标准，正确值为YYY"
   - 内容缺失类："缺失：XXX，要求：依据XX标准应包含YYY"

4. title 格式要求：
   - 格式错误：简述错误类型，如"表格列错位"、"编号重复"、"公式上下标缺失"
   - 错别字：格式为"XX→YY"，如"箱杆→锚杆"、"围岩→围堰"
   - 过期规范：格式为"过期规范：编号-YYYY"，如"过期规范：DL/T 5099-2011"
   - 参数不合规：简述参数问题，如"半孔率标准过低"、"振动速度未分龄期"
   - 内容缺失：格式为"缺失：XXX"，如"缺失：收敛计校准周期"

5. location 页码标注要求：
   文件文本中包含【第N页】格式的页码标记，location字段必须标注页码，格式为"第X页"或"第X-Y页"。
   这对审查人在上百页文档中快速定位问题至关重要，必须标注！
   
6. 【严禁编造页码】location字段只能基于文本中实际存在的【第N页】标记来确定页码！
   - 如果问题附近的页码标记是【第5页】，则location写"第5页"
   - 绝对不能凭印象、推测或编造页码！如果不确定在哪一页，宁可不填location，也不能填错误页码
   - 错误示例：文本中只有【第1页】【第3页】【第5页】的标记，但location写了"第4页"（这是编造的）
   - 正确示例：问题出现在【第3页】和【第5页】标记之间，则location写"第3页"`;

Object.keys(REVIEW_PROMPTS).forEach((key) => {
  REVIEW_PROMPTS[key] += TYPO_CHECK_INSTRUCTION;
  REVIEW_PROMPTS[key] += ANNOTATED_CONTENT_INSTRUCTION;
});


// ==================== 分段审核辅助函数 ====================

/**
 * 归一化文本中的 CJK 字符间空格
 * PDF 提取的文本常有 "方 案 报 审 表" → "方案报审表"
 */
function normalizeCJKSpaces(text: string): string {
  const CJK = '[\\u4e00-\\u9fff\\u3400-\\u4dbf\\uf900-\\ufaff]';
  let prev = '';
  let result = text;
  let rounds = 0;
  while (prev !== result && rounds < 5) {
    prev = result;
    result = result.replace(new RegExp(`(${CJK})\\s+(${CJK})`, 'g'), '$1$2');
    rounds++;
  }
  return result;
}

/**
 * 智能跳过报审单和目录，保留全部正文
 * 工程文件通常结构：报审单 → 目录 → 正文（第1章、第2章...）
 * 只跳过报审单和目录，正文必须完整保留
 */
function skipApprovalAndTOC(content: string): { skipped: string; body: string } {
  // 报审单的典型关键词
  const approvalKeywords = ['方案报审表', '报审表', '报审单', '施工报审', '审批表'];
  // 目录的典型关键词
  const tocKeywords = ['目  录', '目　录', '目录', 'CONTENTS', 'Contents'];

  // 按"==="分割（前端多文件上传时的分隔符）
  const fileSections = content.split('\n\n---\n\n');

  const skippedParts: string[] = [];
  const bodyParts: string[] = [];

  for (const section of fileSections) {
    // 按 === filename === 分割出文件名和内容
    const fileMatch = section.match(/^=== (.+?) ===\n([\s\S]*)$/);
    const fileName = fileMatch ? fileMatch[1] : '';
    const fileContent = fileMatch ? fileMatch[2] : section;

    // 归一化空格后的内容，用于关键词匹配（PDF 常有 "方 案 报 审 表" 这种字间空格）
    const normalizedContent = normalizeCJKSpaces(fileContent.substring(0, 500));

    // 如果整个 section 是报审单（文件名包含报审，或归一化后的内容以报审开头）
    if (approvalKeywords.some(kw => fileName.includes(kw) || normalizedContent.includes(kw))) {
      // 尝试只跳过报审单部分，保留后续正文
      const lines = fileContent.split('\n');
      let approvalEnd = 0;
      let foundApproval = false;
      for (let i = 0; i < Math.min(lines.length, 80); i++) {
        const normalizedLine = normalizeCJKSpaces(lines[i]);
        if (approvalKeywords.some(kw => normalizedLine.includes(kw))) foundApproval = true;
        // 报审单通常在第一个章节标题之前结束（如 "一、" "1." "第一章" 等）
        // 同时支持 PDF 提取的带空格版本："1.  工程概况" "第 一 章" 等
        if (foundApproval && /^(第[一二三四五六七八九十]+[章节]|[一二三四五六七八九十]+[、.]\s|第?\d+[\.、]\s|\d+\.\d+\s|\d+\s+[^\d.])/i.test(normalizedLine.trim())) {
          approvalEnd = i;
          break;
        }
      }
      if (approvalEnd > 0) {
        skippedParts.push(lines.slice(0, approvalEnd).join('\n'));
        bodyParts.push(`=== ${fileName} ===\n${lines.slice(approvalEnd).join('\n')}`);
      } else {
        // 无法分离报审单，保留全部
        bodyParts.push(section);
      }
      continue;
    }

    // 处理目录：在内容中找目录段落并跳过
    const lines = fileContent.split('\n');
    let tocStart = -1;
    let tocEnd = -1;

    for (let i = 0; i < Math.min(lines.length, 100); i++) {
      const normalizedLine = normalizeCJKSpaces(lines[i].trim());
      if (tocKeywords.some(kw => normalizedLine === kw || normalizedLine.startsWith(kw))) {
        tocStart = i;
      }
      if (tocStart >= 0 && tocEnd < 0) {
        // 目录结束：遇到第一个章节标题（如"1 xxx" "一、xxx" "第一章 xxx"）
        if (i > tocStart && /^(第[一二三四五六七八九十]+[章节]|[一二三四五六七八九十]+[、.]\s*[^、.]|\d+\s+[^\d.])/i.test(normalizedLine)) {
          // 确认这不是目录行（目录行通常有页码或"......"）
          if (!normalizedLine.includes('...') && !/\d+\s*$/.test(normalizedLine.replace(/\s+/g, ' '))) {
            tocEnd = i;
            break;
          }
        }
      }
    }

    if (tocStart >= 0 && tocEnd > tocStart) {
      skippedParts.push(lines.slice(tocStart, tocEnd).join('\n'));
      const remaining = [...lines.slice(0, tocStart), ...lines.slice(tocEnd)].join('\n');
      bodyParts.push(`=== ${fileName} ===\n${remaining}`);
    } else {
      bodyParts.push(section);
    }
  }

  return {
    skipped: skippedParts.join('\n'),
    body: bodyParts.join('\n\n---\n\n'),
  };
}

interface ContentChunk {
  title: string;
  content: string;
}

/**
 * 按章节拆分正文，每段不超过 maxChars
 * 优先按章节标题拆分，章节过长时按段落拆分
 */
function splitByChapter(body: string, maxChars: number): ContentChunk[] {
  if (body.length <= maxChars) {
    return [{ title: '全文', content: body }];
  }

  // 章节标题正则：匹配 "第X章" "1." "1.1" "一、" 等
  const chapterRegex = /^(第[一二三四五六七八九十百]+[章节篇]|[一二三四五六七八九十]+[、．.]\s|第?\d+[\.、．]\s*\S|\d+\.\d+\s+\S)/gm;

  const lines = body.split('\n');
  const sections: Array<{ title: string; startLine: number }> = [];

  // 找到所有章节分割点
  for (let i = 0; i < lines.length; i++) {
    if (chapterRegex.test(lines[i])) {
      chapterRegex.lastIndex = 0;
      if (sections.length === 0 && i > 0) {
        // 第一个章节之前的内容作为前言
        sections.push({ title: '前言', startLine: 0 });
      }
      const title = lines[i].trim().substring(0, 30);
      sections.push({ title, startLine: i });
    }
  }

  // 如果没找到章节结构，按固定长度拆分
  if (sections.length <= 1) {
    return splitByFixedSize(body, maxChars);
  }

  // 按章节组装 chunk，合并小章节
  const chunks: ContentChunk[] = [];
  let currentChunk = '';
  let currentTitle = '';

  for (let i = 0; i < sections.length; i++) {
    const startLine = sections[i].startLine;
    const endLine = i + 1 < sections.length ? sections[i + 1].startLine : lines.length;
    const sectionContent = lines.slice(startLine, endLine).join('\n');

    if (currentChunk.length + sectionContent.length > maxChars && currentChunk.length > 0) {
      // 当前 chunk 已满，保存并开始新 chunk
      chunks.push({ title: currentTitle, content: currentChunk });
      currentChunk = sectionContent;
      currentTitle = sections[i].title;
    } else {
      // 追加到当前 chunk
      currentChunk += (currentChunk ? '\n\n' : '') + sectionContent;
      currentTitle = currentTitle || sections[i].title;
      if (i > 0 && !currentTitle.includes('~')) {
        currentTitle = `${sections[0].title} ~ ${sections[i].title}`;
      }
    }
  }

  if (currentChunk) {
    chunks.push({ title: currentTitle, content: currentChunk });
  }

  return chunks;
}

/** 按固定大小拆分（兜底方案） */
function splitByFixedSize(body: string, maxChars: number): ContentChunk[] {
  const chunks: ContentChunk[] = [];
  const overlap = 500; // 段间重叠，避免断句丢失上下文
  let start = 0;
  let idx = 1;

  while (start < body.length) {
    let end = start + maxChars;
    if (end < body.length) {
      // 在最近的句号/换行处断开
      const breakPoints = [body.lastIndexOf('\n', end), body.lastIndexOf('。', end), body.lastIndexOf('；', end)];
      const breakPoint = Math.max(...breakPoints.filter(bp => bp > start + maxChars * 0.5));
      if (breakPoint > 0) end = breakPoint + 1;
    }

    chunks.push({
      title: `第 ${idx} 段`,
      content: body.substring(start, end),
    });

    start = end - overlap;
    idx++;
  }

  return chunks;
}

/**
 * 合并多段审核结果
 * - 评分：取各段最低分
 * - 问题：合并所有段的问题，标注来自哪段
 * - 标注内容：按顺序拼接
 * - 建议：合并去重
 */
function mergeSegmentResults(
  segments: Array<Record<string, unknown>>,
  originalContent: string,
  skippedContent: string,
): Record<string, unknown> {
  if (segments.length === 1) {
    const r = { ...segments[0] };
    // 清理内部标记字段
    delete r._segment;
    delete r._segmentTitle;
    delete r._failed;
    r._totalSegments = 1;
    return r;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allIssues: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allSuggestions: any[] = [];
  const allAnnotated: string[] = [];
  const allDetails: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allReferences: any[] = [];
  let minScore = 100;
  let worstConclusion = 'pass';

  for (const seg of segments) {
    const segNum = seg._segment as number;
    const segTitle = (seg._segmentTitle as string) || `第${segNum}段`;

    // 评分取最低
    const score = (seg.score as number) || 70;
    if (score < minScore) minScore = score;

    // 结论取最差
    const conclusion = (seg.conclusion as string) || 'warning';
    if (conclusion === 'fail' || (conclusion === 'warning' && worstConclusion === 'pass')) {
      worstConclusion = conclusion;
    }

    // 合并问题，标注来源段（不设置默认页码，由前端从 annotatedContent 提取）
    const issues = (seg.issues as Array<Record<string, unknown>>) || [];
    for (const issue of issues) {
      allIssues.push({
        ...issue,
        title: `[${segTitle}] ${issue.title}`,
      });
    }

    // 合并建议
    const suggestions = (seg.suggestions as string[]) || [];
    for (const s of suggestions) {
      if (!allSuggestions.includes(s)) allSuggestions.push(s);
    }

    // 拼接标注内容
    const annotated = (seg.annotatedContent as string) || '';
    if (annotated) {
      allAnnotated.push(`\n=== ${segTitle} ===\n${annotated}`);
    }

    // 合并详情
    const details = (seg.details as string) || '';
    if (details) allDetails.push(`【${segTitle}】\n${details}`);

    // 合并引用
    const refs = (seg.references as Array<Record<string, unknown>>) || [];
    allReferences.push(...refs);
  }

  // 如果有跳过的报审单/目录，在标注内容开头添加说明
  let fullAnnotated = '';
  if (skippedContent.trim()) {
    fullAnnotated = `[已跳过报审单/目录部分，共 ${skippedContent.length} 字符]\n\n`;
  }
  fullAnnotated += allAnnotated.join('\n\n');

  // 限制标注内容长度（避免数据库字段溢出）
  if (fullAnnotated.length > 200000) {
    fullAnnotated = fullAnnotated.substring(0, 180000) + '\n\n[... 标注内容过长已截断 ...]';
  }

  return {
    conclusion: worstConclusion,
    score: minScore,
    issues: allIssues,
    suggestions: allSuggestions,
    details: allDetails.join('\n\n'),
    annotatedContent: fullAnnotated,
    references: allReferences,
    _totalSegments: segments.length,
    _segmentSummary: segments.map(s => ({
      segment: s._segment,
      title: s._segmentTitle,
      score: s.score,
      issues: ((s.issues as Array<unknown>) || []).length,
      failed: s._failed || false,
    })),
  };
}

// ==================== 用户认证辅助 ====================
interface AuthUser {
  id: string;
  username: string;
  role: 'admin' | 'user' | 'guest';
  displayName: string;
  companyType?: string; // general=总包单位, supervisor=监理单位, construction=施工单位
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
  reviewType: string, query: string, headers: Record<string, string>, companyType?: string
): Promise<{ context: string; used: boolean; chunks: number; datasets: string[]; publicChunks: number; companyChunks: number }> {
  try {
    const config = new LLMConfig();
    const knowledgeClient = new KnowledgeClient(config, headers);

    // 公共数据集（优先检索）
    const publicDatasets = PUBLIC_DATASETS[reviewType] || PUBLIC_DATASETS.comprehensive;

    const searchQueries: Record<string, string> = {
      personnel: `${query} 人员资质 特种作业证 安全考核证`,
      enterprise: `${query} 企业资质 营业执照 安全生产许可证`,
      technical: `${query} 施工方案 技术交底 质量控制 技术标准`,
      safety: `${query} 安全检查 风险评估 应急预案`,
      document: `${query} 公文格式 字体字号 页边距 签章规范`,
      comprehensive: query,
    };

    const searchQuery = searchQueries[reviewType] || query;

    // ① 优先检索公共知识库
    const publicResponse = await knowledgeClient.search(searchQuery, publicDatasets, 5, 0.3);
    let publicContext = '';
    let publicChunks = 0;
    const usedDatasets: string[] = [...publicDatasets];

    if (publicResponse.code === 0 && publicResponse.chunks && publicResponse.chunks.length > 0) {
      const filtered = publicResponse.chunks.filter((chunk: { score: number }) => chunk.score > 0.3);
      if (filtered.length > 0) {
        publicChunks = filtered.length;
        publicContext = filtered.map((chunk: { score: number; content: string; document_name?: string }) => {
          const label = chunk.document_name ? `[数据集: ${chunk.document_name}]` : '';
          return `[公共知识库法规片段，相似度: ${(chunk.score * 100).toFixed(0)}%] ${label}\n${chunk.content}`;
        }).join('\n\n');
      }
    }

    // ② 再检索单位私有知识库
    let companyContext = '';
    let companyChunks = 0;
    if (companyType && COMPANY_DATASETS[companyType]) {
      const companyDatasets = COMPANY_DATASETS[companyType][reviewType] || [];
      if (companyDatasets.length > 0) {
        usedDatasets.push(...companyDatasets);
        const companyResponse = await knowledgeClient.search(searchQuery, companyDatasets, 3, 0.3);
        if (companyResponse.code === 0 && companyResponse.chunks && companyResponse.chunks.length > 0) {
          const filtered = companyResponse.chunks.filter((chunk: { score: number }) => chunk.score > 0.3);
          if (filtered.length > 0) {
            companyChunks = filtered.length;
            const companyNames: Record<string, string> = { general: '总包单位', supervisor: '监理单位', construction: '施工单位' };
            companyContext = filtered.map((chunk: { score: number; content: string; document_name?: string }) => {
              const label = chunk.document_name ? `[数据集: ${chunk.document_name}]` : '';
              return `[${companyNames[companyType] || '单位'}私有知识库片段，相似度: ${(chunk.score * 100).toFixed(0)}%] ${label}\n${chunk.content}`;
            }).join('\n\n');
          }
        }
      }
    }

    // 合并：公共知识库在前（权重高），单位私有在后
    const fullContext = [publicContext, companyContext].filter(Boolean).join('\n\n');
    const totalChunks = publicChunks + companyChunks;

    if (totalChunks > 0) {
      return { context: fullContext, used: true, chunks: totalChunks, datasets: usedDatasets, publicChunks, companyChunks };
    }
    return { context: '', used: false, chunks: 0, datasets: [], publicChunks: 0, companyChunks: 0 };
  } catch (error) {
    console.error('Knowledge search error:', error);
    return { context: '', used: false, chunks: 0, datasets: [], publicChunks: 0, companyChunks: 0 };
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

// ==================== 数据库存储统计（仅管理员） ====================
router.get('/api/db-stats', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const supabase: AnyClient = await getSupabaseClient();

    // 查询各表记录数
    const [usersRes, reviewsRes] = await Promise.all([
      supabase.from('users').select('id', { count: 'exact', head: true }),
      supabase.from('review_records').select('id', { count: 'exact', head: true }),
    ]);

    const tableStats = {
      users: { count: usersRes.count ?? 0 },
      review_records: { count: reviewsRes.count ?? 0 },
    };

    // 尝试通过 RPC 查询数据库大小（需要 Supabase 开启 pg_net 或自定义函数）
    let dbSizeMB: number | null = null;
    try {
      const { data: sizeData } = await supabase.rpc('get_database_size');
      if (sizeData) dbSizeMB = typeof sizeData === 'number' ? sizeData : null;
    } catch {
      // RPC 函数可能不存在，忽略
    }

    // 估算：Supabase 免费版配额 500MB，根据记录数粗略估算已用空间
    // review_records 的 result 字段 (jsonb) 是主要占用空间的来源
    const estimatedReviewSizeKB = (tableStats.review_records.count || 0) * 15; // 平均每条 ~15KB
    const estimatedUserSizeKB = (tableStats.users.count || 0) * 2; // 平均每条 ~2KB
    const estimatedUsedMB = Math.round((estimatedReviewSizeKB + estimatedUserSizeKB) / 1024 * 10) / 10;

    // 如果 RPC 返回了真实数据库大小则优先使用
    const usedMB = dbSizeMB ?? estimatedUsedMB;
    const totalMB = 500; // Supabase 免费版配额
    const remainingMB = Math.max(0, totalMB - usedMB);
    const usagePercent = Math.min(100, Math.round(usedMB / totalMB * 1000) / 10);

    res.json({
      success: true,
      data: {
        dbSizeMB: dbSizeMB,
        usedMB,
        totalMB,
        remainingMB,
        usagePercent,
        tables: tableStats,
        dataSource: dbSizeMB ? 'rpc' : 'estimate',
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

// ==================== 用户使用记录（仅管理员） ====================
router.get('/api/usage-logs', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase: AnyClient = await getSupabaseClient();
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 200);

    // 查询所有用户
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('id, username, display_name, role');
    if (usersError) { res.status(500).json({ success: false, error: '查询用户失败' }); return; }

    // 查询审核记录（仅取文件名、类型、时间、状态、用户ID，不取 result 大字段）
    const { data: records, error: recordsError } = await supabase
      .from('review_records')
      .select('id, file_name, review_type, review_mode, status, created_at, user_id')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (recordsError) { res.status(500).json({ success: false, error: '查询记录失败' }); return; }

    // 按用户维度聚合
    const userMap = new Map<string, { username: string; displayName: string; role: string }>();
    for (const u of (users || [])) {
      userMap.set(u.id, { username: u.username, displayName: u.display_name || u.username, role: u.role });
    }
    // 游客记录
    userMap.set('guest', { username: '游客', displayName: '游客', role: 'guest' });

    // 按用户分组
    const grouped: Record<string, { user: { username: string; displayName: string; role: string }; records: Array<{ id: string; fileName: string; reviewType: string; reviewMode: string; status: string; createdAt: string }> }> = {};
    for (const r of (records || [])) {
      const uid = r.user_id || 'guest';
      if (!grouped[uid]) {
        const u = userMap.get(uid) || { username: '未知用户', displayName: '未知用户', role: 'unknown' };
        grouped[uid] = { user: u, records: [] };
      }
      grouped[uid].records.push({
        id: r.id,
        fileName: r.file_name,
        reviewType: r.review_type,
        reviewMode: r.review_mode,
        status: r.status,
        createdAt: r.created_at,
      });
    }

    // 转为数组并计算统计
    const result = Object.entries(grouped).map(([_uid, g]) => ({
      user: g.user,
      totalCount: g.records.length,
      recentRecords: g.records.slice(0, 20), // 每个用户最多返回最近20条
    }));

    // 按审核数量降序
    result.sort((a, b) => b.totalCount - a.totalCount);

    res.json({ success: true, data: result, totalRecords: (records || []).length });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
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
      .select('id, username, password_hash, role, display_name, company_type')
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
      companyType: (data.company_type as string) || undefined,
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
    const { username, password, displayName, companyType } = req.body;
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

    const validCompanyTypes = ['general', 'supervisor', 'construction'];
    const safeCompanyType = validCompanyTypes.includes(companyType) ? companyType : 'general';

    const { data, error } = await supabase
      .from('users')
      .insert({
        username,
        password_hash: password,
        role: 'user',
        display_name: displayName || username,
        company_type: safeCompanyType,
      })
      .select('id, username, role, display_name, company_type')
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
      companyType: (data.company_type as string) || safeCompanyType,
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

// ==================== 用户更新自己的单位类型 ====================
router.put('/api/auth/company-type', requireAuth, async (req: Request, res: Response) => {
  try {
    const authReq = req as Request & { user?: AuthUser };
    const { companyType } = req.body;
    const validTypes = ['general', 'supervisor', 'construction'];
    if (!companyType || !validTypes.includes(companyType)) {
      res.status(400).json({ error: '无效的单位类型' });
      return;
    }

    const supabase: AnyClient = await getSupabaseClient();
    await supabase.from('users').update({ company_type: companyType, updated_at: new Date().toISOString() }).eq('id', authReq.user!.id);

    // 更新 token 中的 companyType
    const updatedUser: AuthUser = { ...authReq.user!, companyType };
    const token = createSessionToken(updatedUser);
    res.json({ success: true, token, user: updatedUser });
  } catch (error) {
    console.error('Update company type error:', error);
    res.status(500).json({ error: '更新单位类型失败' });
  }
});

// ==================== Admin: 获取用户列表 ====================
router.get('/api/users', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const supabase: AnyClient = await getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .select('id, username, role, display_name, company_type, created_at, updated_at')
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
    const { username, password, role, displayName, companyType } = req.body;
    if (!username) {
      res.status(400).json({ error: '用户名不能为空' });
      return;
    }

    const validCompanyTypes = ['general', 'supervisor', 'construction'];
    const safeCompanyType = validCompanyTypes.includes(companyType) ? companyType : 'general';

    const supabase: AnyClient = await getSupabaseClient();
    const { data, error } = await supabase
      .from('users')
      .insert({
        username,
        password_hash: password || '123456',
        role: role || 'user',
        display_name: displayName || username,
        company_type: safeCompanyType,
      })
      .select('id, username, role, display_name, company_type, created_at')
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
    const { username, password, role, displayName, companyType } = req.body;
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (username) updateData.username = username;
    if (password) updateData.password_hash = password;
    if (role) updateData.role = role;
    if (displayName !== undefined) updateData.display_name = displayName;
    if (companyType) updateData.company_type = companyType;

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

// ==================== 提交审核（SSE 流式响应） ====================
			router.post('/api/review', requireAuth, async (req: Request, res: Response) => {
			  const authReq = req as Request & { user?: AuthUser };
			  const { fileName, fileContent, reviewType, reviewMode, userRole, companyType } = req.body;

			  if (!fileName || !fileContent || !reviewType) {
			    res.status(400).json({ error: '缺少必要参数' });
			    return;
			  }

			  const validTypes = ['personnel', 'enterprise', 'technical', 'safety', 'document', 'comprehensive'];
			  if (!validTypes.includes(reviewType)) {
			    res.status(400).json({ error: '无效的审核类型' });
			    return;
			  }

			  // 单位类型：优先用请求体传入的，否则从用户信息获取
			  const effectiveCompanyType = companyType || authReq.user?.companyType || 'general';

			  // 设置 SSE 响应头
			  res.writeHead(200, {
			    'Content-Type': 'text/event-stream',
			    'Cache-Control': 'no-cache',
			    Connection: 'keep-alive',
			    'X-Accel-Buffering': 'no',
			  });

			  // SSE 辅助函数
			  const sendSSE = (event: string, data: Record<string, unknown>) => {
			    try {
			      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
			    } catch { /* 连接已关闭 */ }
			  };

			  let recordId = '';

			  try {
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
			      sendSSE('error', { error: '创建审核记录失败' });
			      res.end();
			      return;
			    }

			    recordId = record.id;
			    sendSSE('started', { id: recordId });

			    // === 同步执行审核流程（SSE 保持连接活跃，FaaS 不会杀进程） ===
			    const customHeaders = HeaderUtils.extractForwardHeaders(req.headers as unknown as Headers);

			    sendSSE('progress', { stage: 'knowledge', message: '正在检索知识库...' });
			    const knowledgeResult = await searchKnowledge(reviewType, fileName, customHeaders, effectiveCompanyType);

			    let webSearchResult = { context: '', used: false, results: 0 };
			    // 联网搜索条件：公共+单位私有知识库均不足时才联网
			    if (!knowledgeResult.used || knowledgeResult.chunks < 2) {
			      sendSSE('progress', { stage: 'websearch', message: '知识库不足，正在联网搜索最新法规...' });
			      webSearchResult = await searchWeb(reviewType, fileName, customHeaders);
			    }

			    let contextSection = '';
			    if (knowledgeResult.used) {
			      const companyNames: Record<string, string> = { general: '总包单位', supervisor: '监理单位', construction: '施工单位' };
			      const label = effectiveCompanyType !== 'general' ? `（公共${knowledgeResult.publicChunks}条 + ${companyNames[effectiveCompanyType] || '单位'}私有${knowledgeResult.companyChunks}条）` : `（公共知识库${knowledgeResult.publicChunks}条）`;
			      contextSection += `\n\n=== 知识库检索结果${label} ===\n${knowledgeResult.context}`;
			    }
			    if (webSearchResult.used) {
			      contextSection += `\n\n=== 联网搜索结果（权重低于知识库，仅供参考补充） ===\n${webSearchResult.context}`;
			    }
			    if (!knowledgeResult.used && !webSearchResult.used) {
			      contextSection += '\n\n注意：知识库和联网搜索均未找到直接相关标准，请基于专业知识审核。';
			    } else if (knowledgeResult.used && webSearchResult.used) {
			      contextSection += '\n\n【重要 - 审核依据优先级】当知识库内容与联网搜索结果冲突时，以知识库内容为准（知识库权重高于联网搜索）。联网搜索结果仅作为补充参考。';
			    }

			    let baseSystemPrompt = REVIEW_PROMPTS[reviewType] || REVIEW_PROMPTS.comprehensive;
			    baseSystemPrompt += reviewMode === 'quick'
			      ? '\n\n快速审核模式，重点检查关键问题和错别字，必须包含annotatedContent。'
			      : '\n\n详细审核模式，全面深入审核，必须包含annotatedContent。';
			    baseSystemPrompt += contextSection;

			    const CHUNK_SIZE = reviewMode === 'detailed' ? 60000 : 40000;
			    const { skipped, body } = skipApprovalAndTOC(fileContent);

			    const reqBody = req.body as Record<string, unknown>;
			    const constraintMode = reqBody.constraintMode as string | undefined;
			    const constraintContent = reqBody.constraintContent as string | undefined;
			    if (constraintMode === 'rules' && constraintContent) {
			      baseSystemPrompt += `

【审核依据 - 文字约束（PROMPT）】
请严格按照以下约束条件审核文件，对不符合约束的地方进行标注：
${constraintContent}`;
			    }
			    console.log(`[分段审核] 原文 ${fileContent.length} 字符，跳过报审单/目录 ${skipped.length} 字符，正文 ${body.length} 字符`);

			    const chunks = splitByChapter(body, CHUNK_SIZE);
			    console.log(`[分段审核] 拆分为 ${chunks.length} 段，段长: ${chunks.map(c => c.content.length).join(', ')}`);

			    const segmentResults: Array<Record<string, unknown>> = [];
			    for (let i = 0; i < chunks.length; i++) {
			      const chunk = chunks[i];
			      const isMultiChunk = chunks.length > 1;
			      const segmentPrompt = baseSystemPrompt + (isMultiChunk
			        ? `\n\n【分段审核】这是文件的第 ${i + 1}/${chunks.length} 段（${chunk.title || '正文段落'}），共 ${chunk.content.length} 字符。请专注审核本段内容，标注本段的问题和错别字。`
			        : '');

			      const messages = [
			        { role: 'system' as const, content: segmentPrompt },
			        { role: 'user' as const, content: `请审核以下文件：\n\n文件名：${fileName}\n审核类型：${reviewType}\n审核模式：${reviewMode}\n用户角色：${userRole || 'general'}\n${isMultiChunk ? `分段：第 ${i + 1}/${chunks.length} 段\n` : ''}文件内容：\n${chunk.content}` },
			      ];

			      sendSSE('progress', { stage: 'reviewing', message: `AI 审核中... (${i + 1}/${chunks.length})`, segment: i + 1, totalSegments: chunks.length });
			      console.log(`[分段审核] 审核第 ${i + 1}/${chunks.length} 段 (${chunk.content.length} 字符)...`);

			      let fullContent = '';
			      try {
			        const config = new LLMConfig();
			        const client = new LLMClient(config, customHeaders);
			        const stream = client.stream(messages, {
			          model: 'doubao-seed-2-0-pro-260215',
			          temperature: reviewMode === 'detailed' ? 0.2 : 0.3,
			        });
			        for await (const chunk2 of stream) {
			          if (chunk2.content) fullContent += chunk2.content.toString();
			        }
			      } catch (llmError) {
			        console.error(`[分段审核] 第 ${i + 1} 段 LLM 调用失败:`, llmError);
			        segmentResults.push({
			          conclusion: 'warning', score: 70,
			          issues: [{ level: 'medium', title: `第${i + 1}段审核失败`, description: 'AI 服务暂时不可用，请稍后重试' }],
			          suggestions: ['建议对失败段落重新审核'],
			          annotatedContent: chunk.content,
			          _segment: i + 1, _segmentTitle: chunk.title, _failed: true,
			        });
			        continue;
			      }

			      let segResult: Record<string, unknown>;
			      try {
			        const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
			        if (!jsonMatch) {
			          const hasAnnotations = fullContent.includes('\ud83d\udd34') || fullContent.includes('\u274c') || fullContent.includes('\u26a0\ufe0f');
			          segResult = {
			            conclusion: 'warning', score: 70, issues: [], suggestions: ['建议人工复核'],
			            details: fullContent,
			            annotatedContent: hasAnnotations ? fullContent : chunk.content,
			          };
			        } else {
			          segResult = JSON.parse(jsonMatch[0]);
			        }
			      } catch {
			        const hasAnnotations = fullContent.includes('\ud83d\udd34') || fullContent.includes('\u274c') || fullContent.includes('\u26a0\ufe0f');
			        segResult = {
			          conclusion: 'warning', score: 70, issues: [], suggestions: ['建议人工复核'],
			          details: fullContent,
			          annotatedContent: hasAnnotations ? fullContent : chunk.content,
			        };
			      }
			      if (!segResult.annotatedContent) segResult.annotatedContent = chunk.content;
			      segResult._segment = i + 1;
			      segResult._segmentTitle = chunk.title;
			      segmentResults.push(segResult);
			      console.log(`[分段审核] 第 ${i + 1} 段审核完成，评分: ${segResult.score}`);

			      // 发送段完成事件
			      sendSSE('segment', { segment: i + 1, totalSegments: chunks.length, score: segResult.score });
			    }

			    const result = mergeSegmentResults(segmentResults, fileContent, skipped);

			    // 页码验证：确保 LLM 输出的页码与文本中实际的【第N页】标记一致，防止幻觉页码
			    const validPageNumbers = new Set<number>();
			    const pageMarkerRegex = /【第(\d+)页】/g;
			    let pm;
			    while ((pm = pageMarkerRegex.exec(fileContent)) !== null) {
			      validPageNumbers.add(parseInt(pm[1], 10));
			    }
			    const annotatedText = (result.annotatedContent as string) || '';
			    pageMarkerRegex.lastIndex = 0;
			    while ((pm = pageMarkerRegex.exec(annotatedText)) !== null) {
			      validPageNumbers.add(parseInt(pm[1], 10));
			    }
			    const validPagesArr = Array.from(validPageNumbers).sort((a, b) => a - b);
			    console.log(`[页码验证] 文本中存在的页码标记: [${validPagesArr.join(',')}]`);

			    const issues = (result.issues as Array<Record<string, unknown>>) || [];
			    let correctedCount = 0;
			    for (const issue of issues) {
			      const loc = (issue.location as string) || '';
			      const pageNums = [...loc.matchAll(/第(\d+)页/g)].map(m => parseInt(m[1], 10));
			      if (pageNums.length > 0) {
			        const hasInvalid = pageNums.some(p => !validPageNumbers.has(p));
			        if (hasInvalid) {
			          const validNums = pageNums.filter(p => validPageNumbers.has(p));
			          if (validNums.length > 0) {
			            issue.location = validNums.map(p => `第${p}页`).join('-');
			          } else {
			            issue.location = '';
			          }
			          correctedCount++;
			        }
			      }
			    }
			    if (correctedCount > 0) {
			      console.log(`[页码验证] 修正了 ${correctedCount} 个幻觉页码`);
			    }
			    console.log(`[分段审核] 合并完成，最终评分: ${result.score}，问题数: ${(result.issues as Array<unknown>)?.length || 0}`);

			    (result as any)._meta = {
			      knowledgeUsed: knowledgeResult.used, knowledgeChunks: knowledgeResult.chunks,
			      knowledgeDatasets: knowledgeResult.datasets,
			      webSearchUsed: webSearchResult.used, webSearchResults: webSearchResult.results,
			      totalSegments: chunks.length, totalChars: fileContent.length, bodyChars: body.length,
			    };

			    // 存入数据库
			    await supabase.from('review_records').update({ status: 'completed', result, updated_at: new Date().toISOString() }).eq('id', recordId);
			    console.log(`[审核完成] recordId=${recordId}，评分=${result.score}`);

			    // 发送完成事件
			    sendSSE('completed', { id: recordId, result });
			    res.end();
			  } catch (error) {
			    console.error(`[审核失败] recordId=${recordId}:`, error);
			    // 更新数据库状态
			    if (recordId) {
			      try {
			        const supabase: AnyClient = await getSupabaseClient();
			        await supabase.from('review_records').update({
			          status: 'failed',
			          result: { conclusion: 'fail', score: 0, issues: [{ level: 'high', title: '审核失败', description: String(error) }], suggestions: ['请稍后重试'] } as any,
			          updated_at: new Date().toISOString(),
			        }).eq('id', recordId);
			      } catch { /* 忽略数据库更新错误 */ }
			    }
			    sendSSE('error', { error: String(error) });
			    res.end();
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
    const { documents, dataset, reviewType, title, companyType } = req.body;
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

    // 保存文件记录到 knowledge_files 表
    if (successCount > 0) {
      try {
        const supabase: AnyClient = await getSupabaseClient();
        for (const doc of documents) {
          const fileTitle = title || (doc.type === 'url' ? doc.url : doc.content?.substring(0, 50) + '...') || '未命名文档';
          const contentPreview = (doc.content || '').substring(0, 200);
          const docId = results.find(r => r.docIds)?.docIds?.[0]?.toString() || '';
          for (const ds of targetDatasets) {
            await supabase.from('knowledge_files').insert({
              title: fileTitle,
              dataset: ds,
              doc_id: docId,
              content_preview: contentPreview,
              source_type: doc.type || 'text',
            });
          }
        }
      } catch (dbErr) {
        console.error('保存文件记录失败（不影响导入）:', dbErr);
      }
    }

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
    // 公共数据集
    { id: 'personnel_qualification', name: '人员资质（公共）', reviewType: 'personnel', companyType: 'public', icon: '👤', description: '身份证、特种作业证、安全考核证等标准（GB文件等）' },
    { id: 'enterprise_qualification', name: '企业资质（公共）', reviewType: 'enterprise', companyType: 'public', icon: '🏢', description: '营业执照、安全生产许可证等标准' },
    { id: 'technical_document', name: '技术文件（公共）', reviewType: 'technical', companyType: 'public', icon: '📐', description: '施工方案、技术交底等国家技术标准' },
    { id: 'safety_inspection', name: '安全检查（公共）', reviewType: 'safety', companyType: 'public', icon: '🔒', description: '安全检查表、风险评估等标准' },
    { id: 'document_review', name: '公文审核（公共）', reviewType: 'document', companyType: 'public', icon: '📄', description: '公文格式规范（字体、边距、签章等）' },
    { id: 'coze_doc_knowledge', name: '通用法规（公共）', reviewType: 'comprehensive', companyType: 'public', icon: '📚', description: '建设工程安全生产管理条例等通用法规' },
    // 总包单位私有数据集
    { id: 'general_personnel', name: '人员资质（总包）', reviewType: 'personnel', companyType: 'general', icon: '👤', description: '总包单位人员资质审核标准' },
    { id: 'general_enterprise', name: '企业资质（总包）', reviewType: 'enterprise', companyType: 'general', icon: '🏢', description: '总包单位企业资质审核标准' },
    { id: 'general_technical', name: '技术文件（总包）', reviewType: 'technical', companyType: 'general', icon: '📐', description: '总包单位技术文件审核标准' },
    { id: 'general_safety', name: '安全检查（总包）', reviewType: 'safety', companyType: 'general', icon: '🔒', description: '总包单位安全检查审核标准' },
    { id: 'general_document', name: '公文审核（总包）', reviewType: 'document', companyType: 'general', icon: '📄', description: '总包单位公文审核标准' },
    // 监理单位私有数据集
    { id: 'supervisor_personnel', name: '人员资质（监理）', reviewType: 'personnel', companyType: 'supervisor', icon: '👤', description: '监理单位人员资质审核标准' },
    { id: 'supervisor_enterprise', name: '企业资质（监理）', reviewType: 'enterprise', companyType: 'supervisor', icon: '🏢', description: '监理单位企业资质审核标准' },
    { id: 'supervisor_technical', name: '技术文件（监理）', reviewType: 'technical', companyType: 'supervisor', icon: '📐', description: '监理单位技术文件审核标准' },
    { id: 'supervisor_safety', name: '安全检查（监理）', reviewType: 'safety', companyType: 'supervisor', icon: '🔒', description: '监理单位安全检查审核标准' },
    { id: 'supervisor_document', name: '公文审核（监理）', reviewType: 'document', companyType: 'supervisor', icon: '📄', description: '监理单位公文审核标准' },
    // 施工单位私有数据集
    { id: 'construction_personnel', name: '人员资质（施工）', reviewType: 'personnel', companyType: 'construction', icon: '👤', description: '施工单位人员资质审核标准' },
    { id: 'construction_enterprise', name: '企业资质（施工）', reviewType: 'enterprise', companyType: 'construction', icon: '🏢', description: '施工单位企业资质审核标准' },
    { id: 'construction_technical', name: '技术文件（施工）', reviewType: 'technical', companyType: 'construction', icon: '📐', description: '施工单位技术文件审核标准' },
    { id: 'construction_safety', name: '安全检查（施工）', reviewType: 'safety', companyType: 'construction', icon: '🔒', description: '施工单位安全检查审核标准' },
    { id: 'construction_document', name: '公文审核（施工）', reviewType: 'document', companyType: 'construction', icon: '📄', description: '施工单位公文审核标准' },
  ];
  res.json({ success: true, datasets });
});

// ==================== 知识库文件管理（仅管理员） ====================
router.get('/api/knowledge/files', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase: AnyClient = await getSupabaseClient();
    const dataset = req.query.dataset as string | undefined;
    let query = supabase.from('knowledge_files').select('*').order('created_at', { ascending: false });
    if (dataset) query = query.eq('dataset', dataset);
    const { data, error } = await query;
    if (error) { res.status(500).json({ success: false, error: error.message }); return; }
    res.json({ success: true, files: data || [] });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

router.delete('/api/knowledge/files/:id', requireAdmin, async (req: Request, res: Response) => {
  try {
    const supabase: AnyClient = await getSupabaseClient();
    const { id } = req.params;
    const { data: file, error: fetchError } = await supabase.from('knowledge_files').select('*').eq('id', id).single();
    if (fetchError || !file) { res.status(404).json({ success: false, error: '文件记录不存在' }); return; }
    const { error: deleteError } = await supabase.from('knowledge_files').delete().eq('id', id);
    if (deleteError) { res.status(500).json({ success: false, error: deleteError.message }); return; }
    res.json({ success: true, message: `已删除文件记录「${file.title}」` });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

// ==================== 行业标准库（自动补齐用） ====================
interface StandardEntry {
  id: string;
  title: string;
  dataset: string;
  category: 'law' | 'gb' | 'industry'; // 法律法规 | 强制性国标 | 行业标准
  content: string;
}

const INDUSTRY_STANDARDS: StandardEntry[] = [
  // ===== 国家法律法规 =====
  {
    id: 'std_law_safety_regulation',
    title: '《建设工程安全生产管理条例》（国务院令第393号）',
    dataset: 'safety_inspection',
    category: 'law',
    content: `《建设工程安全生产管理条例》（国务院令第393号）关键条款摘要：
第二条 在中华人民共和国境内从事建设工程的新建、扩建、改建和拆除等有关活动及实施对建设工程安全生产的监督管理，必须遵守本条例。
第二十一条 施工单位主要负责人依法对本单位的安全生产工作全面负责。施工单位应当建立健全安全生产责任制度和安全生产教育培训制度，制定安全生产规章制度和操作规程，保证本单位安全生产条件所需资金的投入。
第二十四条 建设工程实行施工总承包的，由总承包单位对施工现场的安全生产负总责。
第二十六条 施工单位应当在施工组织设计中编制安全技术措施和施工现场临时用电方案，对下列达到一定规模的危险性较大的分部分项工程编制专项施工方案：基坑支护与降水工程、土方开挖工程、模板工程、起重吊装工程、脚手架工程、拆除爆破工程等。
第二十八条 施工单位应当在施工现场入口处、施工起重机械、临时用电设施、脚手架、出入通道口、楼梯口、电梯井口、孔洞口、桥梁口、隧道口、基坑边沿、爆破物及有害危险气体和液体存放处等危险部位，设置明显的安全警示标志。
第三十二条 施工单位应当向作业人员提供安全防护用具和安全防护服装，并书面告知危险岗位的操作规程和违章操作的危害。
第三十六条 施工单位的主要负责人、项目负责人、专职安全生产管理人员应当经建设行政主管部门或者其他有关部门考核合格后方可任职。作业人员进入新的岗位或者新的施工现场前，应当接受安全生产教育培训。未经教育培训或者教育培训考核不合格的人员，不得上岗作业。
第六十四条 违反本条例的规定，施工单位有下列行为之一的，责令限期改正；逾期未改正的，责令停业整顿，并处5万元以上10万元以下的罚款：（一）施工前未对有关安全施工的技术要求作出详细说明的；（二）未根据不同施工阶段和周围环境及季节、气候的变化，在施工现场采取相应的安全施工措施的；（三）在尚未竣工的建筑物内设置员工集体宿舍的；（四）施工现场临时搭建的建筑物不符合安全使用要求的；（五）未对因建设工程施工可能造成损害的毗邻建筑物、构筑物和地下管线等采取专项防护措施的。`,
  },
  {
    id: 'std_law_safety_license',
    title: '《安全生产许可证条例》（国务院令第397号，2014年修正）',
    dataset: 'enterprise_qualification',
    category: 'law',
    content: `《安全生产许可证条例》（国务院令第397号，2014年修正）关键条款摘要：
第二条 国家对矿山企业、建筑施工企业和危险化学品、烟花爆竹、民用爆炸物品生产企业实行安全生产许可制度。企业未取得安全生产许可证的，不得从事生产活动。
第六条 企业取得安全生产许可证，应当具备下列安全生产条件：（一）建立、健全安全生产责任制，制定完备的安全生产规章制度和操作规程；（二）安全投入符合安全生产要求；（三）设置安全生产管理机构，配备专职安全生产管理人员；（四）主要负责人和安全生产管理人员经考核合格；（五）特种作业人员经有关业务主管部门考核合格，取得特种作业操作资格证书；（六）从业人员经安全生产教育和培训合格；（七）依法参加工伤保险，为从业人员缴纳保险费。
第九条 安全生产许可证的有效期为3年。安全生产许可证有效期满需要延期的，企业应当于期满前3个月向原安全生产许可证颁发管理机关办理延期手续。
第十四条 企业不得转让、冒用安全生产许可证或者使用伪造的安全生产许可证。`,
  },
  {
    id: 'std_law_special_equipment',
    title: '《中华人民共和国特种设备安全法》（2014年施行）',
    dataset: 'safety_inspection',
    category: 'law',
    content: `《中华人民共和国特种设备安全法》关键条款摘要：
第二条 特种设备的生产（包括设计、制造、安装、改造、修理）、经营、使用、检验、检测和特种设备安全的监督管理，适用本法。本法所称特种设备，是指对人身和财产安全有较大危险性的锅炉、压力容器（含气瓶）、压力管道、电梯、起重机械、客运索道、大型游乐设施、场（厂）内专用机动车辆等。
第十四条 特种设备安全管理人员、检测人员和作业人员应当按照国家有关规定取得相应资格，方可从事相关工作。
第三十三条 特种设备使用单位应当在特种设备投入使用前或者投入使用后三十日内，向负责特种设备安全监督管理的部门办理使用登记，取得使用登记证书。
第三十五条 特种设备使用单位应当建立特种设备安全技术档案。
第四十条 特种设备使用单位应当按照安全技术规范的要求，在检验合格有效期届满前一个月向特种设备检验机构提出定期检验要求。未经定期检验或者检验不合格的特种设备，不得继续使用。`,
  },
  // ===== 强制性国家标准（GB） =====
  {
    id: 'std_gb_50201',
    title: 'GB 50201-2012《防洪标准》',
    dataset: 'technical_document',
    category: 'gb',
    content: `GB 50201-2012《防洪标准》关键条款摘要：
1.0.1 为规范防洪标准的制定，保障防洪安全，制定本标准。
3.0.1 水利水电工程的等别，应根据其工程规模、效益和在国民经济中的重要性确定。水利水电枢纽工程的等别应按表3.0.1确定。
3.0.2 水利水电枢纽工程的水工建筑物级别，应根据其所属工程等别及建筑物在工程中的作用和重要性确定。
4.0.1 水利水电枢纽工程的防洪标准，应根据其工程等别、水工建筑物级别确定。
5.0.1 水库工程水工建筑物的防洪标准，应根据其级别按表5.0.1确定。1级建筑物设计洪水重现期应为500～1000年，校核洪水重现期应为2000～5000年。
6.0.1 堤防工程的防洪标准，应根据防护对象的重要性和防护区人口、耕地面积确定。
水利水电工程（含抽水蓄能电站）防洪设计必须满足本标准强制性要求，任何情况下不得低于标准规定的防洪标准。`,
  },
  {
    id: 'std_gb_50265',
    title: 'GB 50265-2010《泵站设计规范》',
    dataset: 'technical_document',
    category: 'gb',
    content: `GB 50265-2010《泵站设计规范》关键条款摘要：
1.0.1 为规范泵站设计，保证工程质量，制定本规范。
3.0.1 泵站工程等别及建筑物级别应根据工程规模、效益及其在国民经济中的重要性确定。
5.1.1 泵站站址选择应综合考虑地形、地质、水源、电源、交通等因素。
6.1.1 泵站布置应根据站址地形、地质、水文等条件，结合进出水流道、输水管道等布置确定。
7.1.1 泵房设计应满足设备安装、运行管理、检修维护等要求。
8.1.1 泵站进水池设计应保证水流平稳，避免产生旋涡和回流。
9.1.1 泵站出水池设计应保证水流顺畅，避免冲刷和淤积。
抽水蓄能电站的抽水泵站设计应参照本规范执行，水泵选型应满足上下水库水位变幅和流量要求。`,
  },
  {
    id: 'std_gb_50011',
    title: 'GB 50011-2010《建筑抗震设计规范》（2016年版）',
    dataset: 'technical_document',
    category: 'gb',
    content: `GB 50011-2010《建筑抗震设计规范》（2016年版）关键条款摘要：
1.0.1 为贯彻执行国家有关建筑工程、防震减灾的法律法规，实行以预防为主的方针，使建筑经抗震设防后，减轻建筑的地震破坏，避免人员伤亡，减少经济损失，制定本规范。
1.0.2 本规范适用于抗震设防烈度为6～9度地区的建筑工程抗震设计。
3.1.1 建筑应根据其使用功能的重要性分为甲类、乙类、丙类、丁类四个抗震设防类别。
3.3.1 选择建筑场地时，应根据工程需要和地震活动情况、工程地质和地震地质的有关资料，对抗震有利、一般、不利和危险地段作出综合评价。
3.4.1 建筑设计应符合抗震概念设计的要求，不应采用严重不规则的设计方案。
5.1.1 各类建筑结构的抗震计算，应采用下列方法：高度不超过40m的规则结构，可采用底部剪力法；一般的建筑结构宜采用振型分解反应谱法；特别不规则的建筑及甲类建筑应采用时程分析法进行多遇地震下的补充计算。
6.1.1 钢筋混凝土房屋的抗震等级应根据设防类别、结构类型、烈度和房屋高度确定。
水利水电工程（含抽水蓄能电站）地面建筑的抗震设计应符合本规范要求，地下结构的抗震设计可参照执行。`,
  },
  {
    id: 'std_gb_50287',
    title: 'GB 50287-2016《水利水电工程地质勘察规范》',
    dataset: 'technical_document',
    category: 'gb',
    content: `GB 50287-2016《水利水电工程地质勘察规范》关键条款摘要：
1.0.1 为统一水利水电工程地质勘察工作，保证勘察成果质量，制定本规范。
3.0.1 水利水电工程地质勘察应按规划、可行性研究、初步设计和技能设计四个阶段进行。
4.0.1 规划阶段工程地质勘察应对规划方案的水利水电工程地质条件作出初步评价。
5.0.1 可行性研究阶段工程地质勘察应对坝址、引水线路、厂址等主要建筑物的工程地质条件作出评价。
6.0.1 初步设计阶段工程地质勘察应详细查明水库及各建筑物区的工程地质条件，为确定工程设计方案提供地质依据。
7.0.1 技施设计阶段工程地质勘察应在初步设计阶段勘察成果的基础上，针对专门性工程地质问题进行勘察。
抽水蓄能电站地质勘察应重点查明：上下水库渗漏条件、地下厂房区围岩类别、高压管道地段岩体最小主应力、天然建筑材料储量等。`,
  },
  {
    id: 'std_gb_50300',
    title: 'GB 50300-2013《建筑工程施工质量验收统一标准》',
    dataset: 'technical_document',
    category: 'gb',
    content: `GB 50300-2013《建筑工程施工质量验收统一标准》关键条款摘要：
3.0.1 建筑工程施工质量应按下列要求进行验收：（1）工程施工质量应符合本标准和相关专业验收规范的规定；（2）工程施工应符合工程勘察、设计文件的要求；（3）参加工程施工质量验收的各方人员应具备规定的资格。
3.0.2 建筑工程的分项工程应按主要工种、材料、施工工艺、设备类别等进行划分。
3.0.3 分部工程应按专业性质、建筑部位确定。
3.0.4 单位工程应具备独立施工条件并能形成独立使用功能。
4.0.1 检验批的质量检验，应根据检验项目的特点在下列抽样方案中选择：（1）计量计数或计数抽样方案；（2）一次或多次抽样方案。
5.0.3 检验批质量验收合格应符合下列规定：（1）主控项目的质量经抽样检验应全部合格；（2）一般项目的质量经抽样检验应合格。
5.0.4 分项工程质量验收合格应符合下列规定：（1）所含检验批的质量均应验收合格；（2）所含检验批的质量验收记录应完整。
5.0.6 单位工程质量验收合格应符合下列规定：（1）所含分部工程的质量均应验收合格；（2）质量控制资料应完整；（3）所含分部工程有关安全和功能的检验资料应完整；（4）主要功能的抽查结果应符合相关专业质量验收规范的规定；（5）观感质量应符合要求。`,
  },
  {
    id: 'std_gb_50204',
    title: 'GB 50204-2015《混凝土结构工程施工质量验收规范》',
    dataset: 'technical_document',
    category: 'gb',
    content: `GB 50204-2015《混凝土结构工程施工质量验收规范》关键条款摘要：
3.0.1 混凝土结构施工现场应健全相应的施工技术标准、质量管理体系、质量控制和检验制度。
4.1.1 模板及其支架应根据工程结构形式、荷载大小、地基土类别、施工设备和材料供应等条件进行设计。
4.2.1 模板及支架的安装质量应符合下列要求：模板的接缝不应漏浆；模板与混凝土的接触面应清理干净并涂刷隔离剂；浇筑混凝土前，模板内的杂物应清理干净。
5.1.1 钢筋进场时，应按国家现行标准的规定抽取试件作力学性能检验，其质量必须符合有关标准的规定。
5.2.1 钢筋加工的形状、尺寸应符合设计要求，其偏差应符合本规范表5.2.1的规定。
5.4.1 钢筋的接头宜设置在受力较小处。同一纵向受力钢筋不宜设置两个或两个以上接头。
5.5.1 钢筋安装时，受力钢筋的品种、级别、规格和数量必须符合设计要求。
6.1.1 混凝土强度等级必须符合设计要求。用于检查结构构件混凝土强度的试件，应在混凝土的浇筑地点随机抽取。
7.1.1 现浇结构的外观质量不应有严重缺陷。对已经出现的严重缺陷，应由施工单位提出技术处理方案，并经监理（建设）单位认可后进行处理。`,
  },
  {
    id: 'std_gb_50290',
    title: 'GB 50290-2014《土工合成材料应用技术规范》',
    dataset: 'technical_document',
    category: 'gb',
    content: `GB 50290-2014《土工合成材料应用技术规范》关键条款摘要：
1.0.1 为规范土工合成材料在工程中的应用，保证工程质量，制定本规范。
3.0.1 土工合成材料的选用应根据工程要求、环境条件、材料性能等因素综合确定。
4.1.1 土工合成材料用于反滤时，应满足保土性、透水性和防淤堵性要求。
5.1.1 土工合成材料用于防渗时，应满足防渗性和耐久性要求。
6.1.1 土工合成材料用于加筋时，应满足抗拉强度和界面摩擦系数要求。
7.1.1 土工合成材料用于排水时，应满足通水能力和耐压性要求。
抽水蓄能电站土石坝和围堰工程中，土工合成材料的应用应符合本规范要求，防渗膜和土工织物的选型应满足水头压力和耐久性要求。`,
  },
  // ===== 强制性行业标准 =====
  {
    id: 'std_nb_10922',
    title: 'NB/T 10922-2022《抽水蓄能电站工程施工安全规范》',
    dataset: 'safety_inspection',
    category: 'industry',
    content: `《抽水蓄能电站工程施工安全规范》（NB/T 10922-2022）关键条款摘要：
1 范围 本规范适用于抽水蓄能电站工程的施工安全管理。
3.0.1 抽水蓄能电站工程施工应坚持安全第一、预防为主、综合治理的方针。
3.0.2 工程建设各参建单位应建立健全安全生产责任制，落实安全生产主体责任。
3.0.3 施工单位应编制施工组织设计和专项施工方案，对危险性较大的分部分项工程应组织专家论证。
4.1 地下工程安全：
4.1.1 地下洞室开挖应遵循新奥法原则，坚持短进尺、弱爆破、强支护、勤量测。
4.1.2 地下洞室施工应配置完善的通风排烟系统，确保作业面空气质量符合职业健康标准。
4.1.3 斜井和竖井施工应设置防坠装置和安全防护设施，提升系统应经检测合格后方可使用。
4.2 高边坡安全：
4.2.1 高边坡施工应自上而下分层开挖，严禁掏根挖脚。
4.2.2 高边坡应设置安全监测设施，定期进行变形观测和稳定性分析。
4.3 水库大坝安全：
4.3.1 大坝填筑施工应严格控制填筑质量，按设计要求进行压实度检测。
4.3.2 面板堆石坝面板施工应做好止水结构的安装质量检查。
5 施工用电与机械安全：
5.0.1 施工用电应符合现行行业标准的规定，采用三级配电二级保护系统。
5.0.2 特种设备使用前应经检测检验合格，取得使用登记证书。
6 应急管理：
6.0.1 施工单位应制定生产安全事故综合应急预案和专项应急预案。
6.0.2 应急预案应定期演练，每年不少于一次综合应急演练。`,
  },
  {
    id: 'std_dl_5144',
    title: 'DL/T 5144-2015《水工混凝土施工规范》',
    dataset: 'technical_document',
    category: 'industry',
    content: `《水电水利工程混凝土施工规范》（DL/T 5144-2015）关键条款摘要：
3.1 一般规定：
3.1.1 水工混凝土施工应符合设计要求和本规范的规定。
3.1.2 混凝土配合比应通过试验确定，满足设计强度、耐久性和施工和易性要求。
3.1.3 混凝土原材料（水泥、骨料、水、外加剂、掺合料）应经检验合格后方可使用。
5.1 混凝土浇筑：
5.1.1 混凝土浇筑前应检查模板、钢筋、预埋件等是否符合设计要求。
5.1.2 混凝土应连续浇筑，如因故中断且超过允许间歇时间，应按施工缝处理。
5.1.3 浇筑混凝土时，自由落料高度不宜大于2m。当大于2m时，应采用溜槽、串筒等辅助设施。
5.1.4 混凝土振捣应密实，不得漏振、过振。振捣器插入间距不应大于振捣器有效作用半径的1.5倍。
6.1 混凝土养护：
6.1.1 混凝土浇筑完毕后，应在12h内进行覆盖和保湿养护。
6.1.2 硅酸盐水泥、普通硅酸盐水泥拌制的混凝土，养护时间不得少于14d；矿渣水泥、火山灰水泥等拌制的混凝土，养护时间不得少于21d。
7.1 质量检查：
7.1.1 混凝土强度应按标准方法检验，评定应符合设计要求。
7.1.2 混凝土抗渗、抗冻等耐久性指标应按设计要求进行检验。`,
  },
  {
    id: 'std_dl_5169',
    title: 'DL/T 5169-2013《水工混凝土钢筋施工规范》',
    dataset: 'technical_document',
    category: 'industry',
    content: `《水工混凝土钢筋施工规范》（DL/T 5169-2013）关键条款摘要：
4.1 钢筋加工：
4.1.1 钢筋加工前应进行调直和除锈。
4.1.2 钢筋下料长度应考虑弯钩增加长度和弯曲调整值。
5.1 钢筋连接：
5.1.1 钢筋连接方式可采用绑扎搭接、焊接或机械连接。
5.1.2 受拉钢筋绑扎搭接长度不应小于规范规定值。
5.1.3 焊接接头质量应进行外观检查和力学性能试验。
5.1.4 机械连接接头等级应符合设计要求，I级接头抗拉强度不应小于被连接钢筋实际抗拉强度或1.10倍钢筋抗拉强度标准值。
6.1 钢筋安装：
6.1.1 钢筋安装位置、间距、保护层厚度应符合设计要求。
6.1.2 钢筋保护层厚度允许偏差：受力钢筋±3mm，分布钢筋±5mm。`,
  },
  {
    id: 'std_dl_5173',
    title: 'DL/T 5173-2022《水电水利工程施工测量规范》',
    dataset: 'technical_document',
    category: 'industry',
    content: `DL/T 5173-2022《水电水利工程施工测量规范》关键条款摘要：
1.0.1 为规范水电水利工程施工测量工作，保证施工测量质量，制定本规范。
3.0.1 施工测量应建立统一的平面和高程控制网。
3.0.2 施工平面控制网等级依次为二等、三等、四等、一级、二级。
3.0.3 施工高程控制网等级依次为二等、三等、四等、五等。
4.1.1 施工控制网应根据工程规模、施工总布置图和施工方案进行布设。
5.1.1 施工放样前应收集设计图纸、控制点成果等资料，并对资料进行校核。
6.1.1 开挖工程测量应保证开挖轮廓的正确性，超挖量应控制在允许范围内。
7.1.1 填筑工程测量应控制填筑轮廓和层厚。
8.1.1 混凝土工程测量应保证模板安装的精度和结构尺寸的正确性。
抽水蓄能电站施工测量应特别注意上下水库、引水系统、地下厂房等关键部位的测量控制。`,
  },
  {
    id: 'std_sl_721',
    title: 'SL 721-2015《水利水电工程施工安全管理导则》',
    dataset: 'safety_inspection',
    category: 'industry',
    content: `《水利水电工程施工安全管理导则》（SL 721-2015）关键条款摘要：
1.0.1 为规范水利水电工程施工安全管理，保障施工人员生命和财产安全，制定本导则。
3.1.1 项目法人应建立安全生产管理机构，配备专职安全生产管理人员。
3.1.2 施工单位应设置安全生产管理机构，配备专职安全生产管理人员。施工从业人员超过200人的，应设置安全生产管理机构；施工从业人员50人以上200人以下的，应配备专职安全生产管理人员；施工从业人员50人以下的，应配备兼职安全生产管理人员。
3.2.1 项目法人应组织编制工程项目安全生产措施方案，并在开工后15日内报有管辖权的水行政主管部门备案。
3.2.4 施工单位应在施工前编制施工组织设计，对达到一定规模的危险性较大的工程应编制专项施工方案，经施工单位技术负责人签字后实施，由专职安全生产管理人员进行现场监督。
4.1.1 施工单位应制定安全生产教育培训计划，定期对从业人员进行安全生产教育和培训。
4.1.2 新进场的作业人员，必须接受三级安全教育培训，经考核合格后方可上岗。
4.2.1 施工单位应定期组织安全检查，对发现的安全隐患应及时整改。
5.1.1 高处作业必须有可靠的安全防护措施。高处作业人员必须系安全带，穿防滑鞋。
5.2.1 起重吊装作业应编制专项施工方案，明确安全技术措施。
5.3.1 临时用电应编制临时用电施工组织设计，采用TN-S接零保护系统，实行三级配电二级保护。
6.1.1 施工单位应制定生产安全事故应急救援预案，配备应急救援人员和器材设备。
6.2.1 发生生产安全事故后，事故现场有关人员应当立即报告本单位负责人。单位负责人接到事故报告后，应当于1小时内向事故发生地县级以上人民政府安全生产监督管理部门和负有安全生产监督管理职责的有关部门报告。`,
  },
  {
    id: 'std_sl_378',
    title: 'SL 378-2007《水工建筑物地下开挖工程施工规范》',
    dataset: 'technical_document',
    category: 'industry',
    content: `SL 378-2007《水工建筑物地下开挖工程施工规范》关键条款摘要：
1.0.1 为规范水工建筑物地下开挖工程施工，保证工程质量和施工安全，制定本规范。
3.0.1 地下开挖工程施工前应编制施工组织设计，对围岩进行分类，制定开挖支护方案。
3.0.2 地下洞室开挖方法应根据围岩类别、断面尺寸、工期要求等条件确定。
4.1.1 平洞开挖宜采用全断面法或台阶法，围岩条件较差时宜采用分部开挖法。
4.2.1 竖井开挖宜采用正井法或反井法，施工前应做好井口锁口和防护设施。
4.3.1 斜井开挖宜采用自上而下方式，综合机械化施工。
5.0.1 隧洞支护应根据围岩类别和开挖跨度确定，I～II类围岩可局部支护，III类围岩应系统支护，IV～V类围岩应加强支护。
5.0.2 锚喷支护应按设计要求施工，喷射混凝土厚度不应小于设计值。
6.0.1 地下洞室施工应配置机械通风设施，确保作业面空气中有害气体浓度低于允许值。
7.0.1 地下开挖应进行安全监测，监测项目包括围岩变形、支护应力、地下水等。
抽水蓄能电站地下厂房、引水隧洞、尾水隧洞等地下工程开挖施工必须符合本规范要求。`,
  },
  {
    id: 'std_nb_35083',
    title: 'NB/T 35083-2016《水电工程混凝土面板堆石坝施工规范》',
    dataset: 'technical_document',
    category: 'industry',
    content: `NB/T 35083-2016《水电工程混凝土面板堆石坝施工规范》关键条款摘要：
1.0.1 为规范混凝土面板堆石坝的施工，保证工程质量，制定本规范。
3.0.1 坝料开采和加工应根据料场特性和坝料要求进行，确保坝料质量。
4.0.1 趾板施工应在基岩开挖验收合格后进行，趾板混凝土应按分块跳仓浇筑。
5.0.1 堆石体填筑应按设计分区进行，各区填筑料和压实标准应符合设计要求。
5.0.2 垫层料和过渡料应优先采用级配良好的加工料，填筑时应与主堆石区同步上升。
5.0.3 堆石体碾压参数应通过碾压试验确定，施工中应严格控制铺料厚度和碾压遍数。
6.0.1 混凝土面板施工应在堆石体预沉降期满足要求后进行。
6.0.2 面板混凝土应满足抗渗、抗冻、抗裂性能要求，配合比应通过试验确定。
6.0.3 面板浇筑宜采用滑模施工，一次浇筑宽度不宜大于16m。
7.0.1 接缝止水施工是面板堆石坝防渗的关键，止水材料性能和安装质量必须符合设计要求。
8.0.1 坝体填筑质量检测应按规范规定频率进行，检测结果应满足设计要求。
抽水蓄能电站上、下水库面板堆石坝施工应严格执行本规范。`,
  },
  {
    id: 'std_dl_5110',
    title: 'DL/T 5110-2013《水电水利工程模板施工规范》',
    dataset: 'technical_document',
    category: 'industry',
    content: `DL/T 5110-2013《水电水利工程模板施工规范》关键条款摘要：
1.0.1 为规范水电水利工程模板施工，保证工程质量与施工安全，制定本规范。
3.0.1 模板及支架应具有足够的承载力、刚度和稳定性，能可靠地承受浇筑混凝土的重量、侧压力和施工荷载。
3.0.2 模板及支架的设计应符合安全可靠、经济合理、方便施工的原则。
4.1.1 模板材料应选用符合国家标准的钢材、木材或人造板材。
5.1.1 模板安装前应进行技术交底，安装后应进行检查验收。
5.2.1 模板安装偏差应符合本规范表5.2.1的要求，结构边线与设计边线偏差不应大于10mm。
5.3.1 承重模板拆除时的混凝土强度应符合设计要求，当设计无要求时，应符合本规范规定。
6.0.1 滑模施工应连续进行，如因故中断，应采取停滑措施。
7.0.1 模板及支架在使用过程中应定期检查，发现变形、松动等情况应及时处理。`,
  },
  {
    id: 'std_nb_10216',
    title: 'NB/T 10216-2019《抽水蓄能电站设计规范》',
    dataset: 'technical_document',
    category: 'industry',
    content: `NB/T 10216-2019《抽水蓄能电站设计规范》关键条款摘要：
1.0.1 为规范抽水蓄能电站设计，保证设计质量和安全，制定本规范。
3.0.1 抽水蓄能电站的设计应满足电力系统调峰填谷、调频调相、紧急事故备用等需求。
4.0.1 电站装机容量应根据电力系统需求、水文条件和地形地质条件等综合确定。
5.0.1 上、下水库设计应满足水量平衡和水位变幅要求，防渗设计应安全可靠。
6.0.1 引水系统设计应满足水力学条件、结构安全和施工要求。高压管道应按明管或埋管分别设计，钢板衬砌厚度应满足抗外压和抗内压要求。
7.0.1 地下厂房设计应综合考虑围岩条件、机组类型和安装要求。主厂房跨度大于25m时应进行专门的围岩稳定分析。
8.0.1 机电设备选型应满足电站运行方式和转换时间要求。可逆式机组选型应综合考虑水头变幅、比转速和效率等因素。
9.0.1 电站安全监测设计应覆盖上下水库、大坝、引水系统、地下厂房等关键部位，监测项目设置应全面反映结构工作性态。`,
  },
  // ===== 人员/企业资质专项 =====
  {
    id: 'std_personnel_qualification',
    title: '水利水电工程施工人员资质要求（依据国家法律法规和行业标准）',
    dataset: 'personnel_qualification',
    category: 'law',
    content: `水利水电工程施工人员资质要求（依据国家法律法规和行业标准）：
一、项目负责人资质要求：
1. 一级注册建造师（水利水电工程专业）- 大中型水利水电工程项目经理必须持有
2. 二级注册建造师（水利水电工程专业）- 小型水利水电工程项目经理持有
3. 注册安全工程师 - 施工单位安全管理岗位必须持有
4. 项目负责人安全生产考核合格证书（B证）- 施工项目负责人必须持有
二、专职安全管理人员资质要求：
1. 专职安全生产管理人员安全生产考核合格证书（C证）
2. 注册安全工程师执业资格证书
3. 水利部或省级水行政主管部门颁发的安全生产考核合格证
三、特种作业人员资质要求（依据《特种作业人员安全技术培训考核管理规定》）：
1. 电工作业 - 低压电工证/高压电工证
2. 焊接与热切割作业 - 焊工操作证
3. 起重机械作业 - 起重机司机证、起重指挥证
4. 垂直运输机械作业 - 升降机操作证
5. 爆破作业 - 爆破作业人员许可证
6. 高处作业 - 高处作业操作证
7. 信号工 - 信号工操作证
四、技术工人资质要求：
1. 混凝土工 - 职业技能等级证书
2. 钢筋工 - 职业技能等级证书
3. 模板工 - 职业技能等级证书
4. 锚喷工 - 职业技能等级证书
5. 测量工 - 职业技能等级证书
五、强制性要求（依据《建设工程安全生产管理条例》第二十六条、第三十六条）：
1. 施工单位的主要负责人、项目负责人、专职安全生产管理人员应当经建设行政主管部门考核合格后方可任职
2. 作业人员进入新的岗位或者新的施工现场前，应当接受安全生产教育培训
3. 未经教育培训或者教育培训考核不合格的人员，不得上岗作业
4. 特种作业人员必须取得特种作业操作资格证后方可上岗`,
  },
  {
    id: 'std_enterprise_qualification',
    title: '水利水电工程施工企业资质要求（依据国家法律法规和行业标准）',
    dataset: 'enterprise_qualification',
    category: 'law',
    content: `水利水电工程施工企业资质要求（依据国家法律法规和行业标准）：
一、施工总承包资质（依据《建筑业企业资质标准》）：
1. 水利水电工程施工总承包一级资质 - 可承担各类型水利水电工程的施工
2. 水利水电工程施工总承包二级资质 - 可承担单项合同额不超过企业注册资本金5倍的水利水电工程
3. 水利水电工程施工总承包三级资质 - 可承担单项合同额不超过企业注册资本金5倍的小型水利水电工程
二、专业承包资质：
1. 水工大坝工程专业承包一级/二级/三级
2. 水工隧洞工程专业承包一级/二级/三级
3. 河湖整治工程专业承包一级/二级/三级
4. 堤防工程专业承包一级/二级/三级
三、安全生产许可证（依据《安全生产许可证条例》）：
1. 施工企业必须取得安全生产许可证方可从事施工活动
2. 安全生产许可证有效期为3年，需在期满前3个月向原发证机关办理延期手续
3. 企业不得转让、冒用、伪造安全生产许可证
四、强制性要求（依据《建设工程安全生产管理条例》第二十条）：
1. 施工单位从事建设工程的新建、扩建、改建和拆除等活动，应当具备国家规定的注册资本、专业技术人员、技术装备和安全生产等条件
2. 依法取得相应等级的资质证书，并在其资质等级许可的范围内承揽工程
3. 禁止施工单位超越本单位资质等级许可的业务范围或者以其他施工单位的名义承揽工程
五、抽水蓄能电站特殊资质要求：
1. 承担抽水蓄能电站施工的企业应具有水利水电工程施工总承包一级及以上资质
2. 地下厂房施工应具有相应隧洞工程专业承包资质
3. 机电设备安装应具有水利水电机电设备安装工程专业承包资质`,
  },
  {
    id: 'std_document_format',
    title: '水利水电工程公文审核规范（依据GB/T 9704-2012）',
    dataset: 'document_review',
    category: 'gb',
    content: `水利水电工程公文审核规范要求（依据国家法律法规和行业标准）：
一、公文格式规范（依据 GB/T 9704-2012《党政机关公文格式》）：
1. 公文用纸：采用GB/T 148中规定的A4型纸，幅面尺寸210mm×297mm
2. 公文页边距：上边距37mm，下边距35mm，左边距28mm，右边距26mm
3. 正文用字：仿宋GB2312三号字
4. 标题用字：方正小标宋简体二号字
5. 结构层次序数：第一层"一、"，第二层"（一）"，第三层"1."，第四层"（1）"
6. 行间距：固定值28磅
二、报审单审核要点：
1. 工程名称应与批复文件一致
2. 审批意见栏应有明确意见和签字
3. 日期应完整准确，不得缺漏
4. 编号应连续规范，不得跳号重号
三、技术文件审核要点（依据 DL/T 5173-2022）：
1. 文件编号应符合标准规定格式
2. 引用标准应为现行有效版本
3. 技术参数应与设计文件一致
4. 计算公式和单位应准确规范
5. 图表编号应连续，不得缺漏
6. 签字栏应齐全，日期应完整
四、强制性条文审核要求：
1. 任何工程文件不得违反《工程建设标准强制性条文》
2. 引用的标准规范应为现行有效版本
3. 过期标准必须替换为最新版本
4. 技术参数不得低于强制性标准要求`,
  },
];

// ==================== 自动补齐标准（仅管理员） ====================
router.post('/api/knowledge/auto-update-standards', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const supabase: AnyClient = await getSupabaseClient();
    const config = new LLMConfig();
    const customHeaders: Record<string, string> = {};
    const knowledgeClient = new KnowledgeClient(config, customHeaders);

    // 获取已有文件记录
    const { data: existingFiles } = await supabase.from('knowledge_files').select('id, title, dataset, doc_id, content_preview');
    const existingMap = new Map<string, { id: string; title: string; dataset: string; doc_id: string; content_preview: string }>();
    for (const f of (existingFiles || [])) {
      existingMap.set(f.title, f);
    }

    const result: { added: string[]; skipped: string[]; updated: string[]; errors: string[] } = { added: [], skipped: [], updated: [], errors: [] };

    for (const std of INDUSTRY_STANDARDS) {
      const existing = existingMap.get(std.title);
      if (existing) {
        // 已存在，对比内容
        const existingPreview = (existing.content_preview || '').trim();
        const newPreview = std.content.substring(0, 200).trim();
        if (existingPreview === newPreview) {
          result.skipped.push(std.title);
          continue;
        }
        // 内容有差异，更新（删除旧记录+重新导入）
        try {
          await supabase.from('knowledge_files').delete().eq('id', existing.id);
          const docs: KnowledgeDocument[] = [{ source: DataSourceType.TEXT, raw_data: std.content }];
          const response = await knowledgeClient.addDocuments(docs, std.dataset);
          if (response.code === 0) {
            await supabase.from('knowledge_files').insert({
              title: std.title,
              dataset: std.dataset,
              doc_id: response.doc_ids?.[0]?.toString() || '',
              content_preview: std.content.substring(0, 200),
              source_type: 'auto',
            });
            result.updated.push(std.title);
          } else {
            result.errors.push(`${std.title}: 更新导入失败 - ${response.msg}`);
          }
        } catch (err) {
          result.errors.push(`${std.title}: ${err instanceof Error ? err.message : '更新异常'}`);
        }
        continue;
      }

      // 不存在，新增
      try {
        const docs: KnowledgeDocument[] = [{ source: DataSourceType.TEXT, raw_data: std.content }];
        const response = await knowledgeClient.addDocuments(docs, std.dataset);
        if (response.code === 0) {
          await supabase.from('knowledge_files').insert({
            title: std.title,
            dataset: std.dataset,
            doc_id: response.doc_ids?.[0]?.toString() || '',
            content_preview: std.content.substring(0, 200),
            source_type: 'auto',
          });
          result.added.push(std.title);
        } else {
          result.errors.push(`${std.title}: 导入失败 - ${response.msg}`);
        }
      } catch (err) {
        result.errors.push(`${std.title}: ${err instanceof Error ? err.message : '导入异常'}`);
      }
    }

    res.json({
      success: true,
      message: `补齐完成：新增 ${result.added.length} 项，跳过 ${result.skipped.length} 项（已有），更新 ${result.updated.length} 项，失败 ${result.errors.length} 项`,
      result,
      total: INDUSTRY_STANDARDS.length,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ success: false, error: msg });
  }
});

export default router;
