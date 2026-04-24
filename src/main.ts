// 类型定义
export interface FileItem { id: string; name: string; size: number; type: string; file: File }
export interface ReviewHistory {
  id: string; file_name: string; review_type: ReviewType; review_mode: ReviewMode;
  user_role: Role; status: 'pending' | 'processing' | 'completed' | 'failed'; result?: ReviewResult; created_at: string;
}
export interface ReviewResult {
  conclusion: 'pass' | 'fail' | 'warning'; score: number; issues: Issue[];
  suggestions: string[]; details: string; annotatedContent?: string; references?: Reference[];
}
export interface Issue { level: 'high' | 'medium' | 'low'; title: string; description: string; suggestion: string; location?: string; category?: 'format' | 'typo' | 'outdated_standard' | 'non_compliant' | 'missing' | 'other' }
export interface Reference { source: 'knowledge' | 'web'; title: string; snippet: string }
export type Role = 'general' | 'supervisor' | 'construction';
export type ReviewType = 'personnel' | 'enterprise' | 'technical' | 'safety' | 'document' | 'comprehensive';
export type ReviewMode = 'quick' | 'detailed';
export type TabView = 'review' | 'knowledge' | 'admin';
export interface KnowledgeEntry { id: string; title: string; type: 'text' | 'url'; content?: string; url?: string; targetDataset: string; targetReviewType: ReviewType; companyType: string; createdAt: string }
export interface AuthUser { id: string; username: string; role: 'admin' | 'user' | 'guest'; displayName: string; companyType?: string }
export interface ManagedUser { id: string; username: string; role: string; display_name: string; company_type?: string; created_at: string }

// ✅ pdf.js worker 引入方案：
// 不用 Vite ?url import（在 Vite middleware 模式下对 .mjs 不稳定）
// 而是在构建脚本中将 worker 复制到 public/ 目录
// 开发和生产都通过 /pdf.worker.min.mjs 绝对路径引用
// 构建脚本在 build.sh 和 dev.sh 中执行 cp 操作

export const REVIEW_TYPES: Record<ReviewType, { label: string; icon: string; desc: string; dataset: string; datasetName: string }> = {
  personnel:     { label: '人员资质', icon: '👤', desc: '身份证、特种作业证、安全考核证等', dataset: 'personnel_qualification', datasetName: '人员资质标准库' },
  enterprise:    { label: '企业资质', icon: '🏢', desc: '营业执照、安全生产许可证等', dataset: 'enterprise_qualification', datasetName: '企业资质标准库' },
  technical:     { label: '技术文件', icon: '📐', desc: '施工方案、技术交底等', dataset: 'technical_document', datasetName: '技术文件标准库' },
  safety:        { label: '安全检查', icon: '🔒', desc: '安全检查表、风险评估等', dataset: 'safety_inspection', datasetName: '安全检查标准库' },
  document:      { label: '公文审核', icon: '📄', desc: '通知、函件、报告等公文', dataset: 'document_review', datasetName: '公文格式标准库' },
  comprehensive: { label: '全面审核', icon: '🔍', desc: '综合审核所有文件类型', dataset: 'coze_doc_knowledge', datasetName: '全部标准库' },
};
export const REVIEW_MODES: Record<ReviewMode, { label: string; icon: string; desc: string }> = {
  quick:    { label: '快速审核', icon: '⚡', desc: '5分钟内完成' },
  detailed: { label: '详细审核', icon: '📋', desc: '全面深入审核' },
};
export const COMPANY_TYPES: Record<string, { label: string; icon: string; desc: string; color: string }> = {
  general:      { label: '总包单位', icon: '🏗️', desc: '负责 EPC 整体管理', color: '#1e40af' },
  supervisor:   { label: '监理单位', icon: '🔍', desc: '负责工程质量监督', color: '#7c3aed' },
  construction: { label: '施工单位', icon: '⚒️', desc: '负责工程施工执行', color: '#b45309' },
};

export const DEFAULT_COMPANY_RULES: Record<string, Record<string, string>> = {
  supervisor: {
    technical: `水利水电工程施工方案监理审核核心重点
结合水利行业规范、抽蓄/水工建筑物施工特点及监理管控要求，从合规性、安全、质量、技术、管理、危大工程、应急七大维度，梳理监理审核关键要点，适配厂房、引水隧洞、管道、土石方、混凝土、围堰等各类水工专项方案。

一、方案合规性与编制基础审核
编制依据：核查是否引用现行有效规范、规程（SL、DL、GB水利水电标准）、设计图纸、地质勘察报告、施工合同、监理规划及细则；严禁使用废止规范。
编制审批流程：施工单位技术负责人审批签字、盖章齐全；分包单位施工方案需总包统一审批，超过一定规模专项方案需专家论证手续完整。
内容完整性：工程概况、施工部署、工艺流程、资源配置、进度计划、质量安全措施、验收要求、附图附表齐全，无缺项漏项。

二、施工技术方案合理性审核
工艺选型：施工工艺、施工方法适配水工地质条件（围岩、软基、岩溶、地下水）、建筑物结构特点，与设计要求一致；特殊工艺（压力管道焊接、隧洞衬砌、防渗施工）工艺成熟、可落地。
图纸与参数匹配：断面尺寸、坡度、防渗等级、混凝土标号、钢筋保护层、焊接标准、试验参数等严格对应设计图纸及技术通知单。
季节性与工况适配：汛期、雨季、冬季、高温施工专项措施完善，水利工程重点考虑水流影响、汛期防洪、地下水排水、抗渗抗冻特殊要求。
交叉施工协调：土建、机电、金结、管线交叉施工顺序合理，避免工序冲突，满足水工建筑物沉降、防渗、结构受力时序要求。

三、工程质量管控措施审核
质量目标与验收标准：明确单元工程、分部工程质量目标，严格执行水利单元工程质量评定标准，验收划分合理。
关键工序管控：水工核心工序（基础处理、防渗止水、大体积混凝土温控、金属结构焊接、压力管道安装、回填灌浆/固结灌浆、土石方边坡支护等），设置旁站、平行检验、见证取样控制点。
原材料与试验检测：原材料（钢筋、水泥、砂石、防水材料、管材）进场验收、复检方案；试块、焊缝探伤、水压试验、防渗检测等试验计划合理，检测频次、标准符合规范。
质量通病预防：水工渗漏、裂缝、边坡坍塌、混凝土蜂窝麻面、管道焊缝缺陷等质量通病防控措施具体。

四、安全生产与文明施工审核（水利重中之重）
危险源辨识：针对深基坑、高边坡、隧洞开挖、围堰导流、水上/水下作业、临建设施、临时用电、大型机械等水利重大危险源辨识全面。
安全专项措施：高处作业、有限空间、爆破作业、临时围堰防洪度汛、排水导流、水上作业救生、临边防护等专项措施针对性强。
临时工程安全：施工围堰、临时排水系统、施工便道、脚手架、模板支撑体系验算完整，承载力、稳定性计算资料齐全。
临时用电与机械管理：严格执行三级配电两级保护，特种设备验收、操作人员持证上岗、设备检修维护方案完善。

五、危大工程专项管控审核
危大工程界定准确：高边坡开挖、深基坑、隧洞暗挖、大体积混凝土、大型模板支撑、压力管道重型安装、围堰拆除等依规界定。
专项方案及论证：危大工程单独编制专项方案，超规模危大工程专家论证意见落实，方案按论证意见修改完善。
过程监测措施：边坡位移、围岩收敛、基坑沉降、围堰变形等监测方案、预警值、监测频次明确。

六、进度、资源与现场管理审核
施工进度计划：总工期、节点工期满足合同要求，关键线路清晰，汛期、停水停电等干扰因素有工期调整预案。
人材机资源配置：管理人员、特种作业人员持证齐全；机械设备、周转材料、劳动力配置满足施工强度要求。
现场管理与环保水保：符合水利工程水土保持、生态环保要求，弃渣堆放、污水排放、扬尘控制、河道保护措施合规。

七、应急预案与度汛管理（水利独有核心要点）
防洪度汛方案：明确汛期施工安排、水位监测、防洪物资、人员撤离路线，围堰防洪标准满足设计及地方防汛要求。
应急处置预案：针对坍塌、透水、洪水漫堰、有限空间中毒、火灾、机械伤害等突发事件，应急组织机构、物资、救援流程完善。
雨季、地下水处置：基坑排水、隧洞抽排水、地表截排水系统布置合理，防止积水浸泡基础、破坏防渗结构。`,
    safety: `水利水电工程安全检查监理审核核心要点
依据《水利水电工程施工安全管理导则》及行业规范，重点审核：
- 危险源辨识与风险评估完整性
- 安全专项施工方案编制与审批合规性
- 危大工程界定、方案论证与过程监测
- 施工围堰、临时用电、高处作业等专项安全措施
- 特种作业人员持证与设备验收情况
- 应急预案与防洪度汛方案完备性`,
  },
  general: {
    technical: `总包单位技术文件审核核心要点
作为EPC总承包方，重点审核：
- 设计图纸与施工方案的一致性
- 施工组织设计全面性与可执行性
- 分包单位方案审批与管控措施
- 施工进度计划与资源配置合理性
- 质量保证体系与验收标准合规性
- 安全生产管理体系的健全性
- 环保水保措施与地方要求符合性`,
  },
  construction: {
    technical: `施工单位技术文件审核核心要点
作为施工执行方，重点审核：
- 施工方案与设计要求、施工合同的符合性
- 施工工艺与作业条件的适配性
- 质量控制措施与检验标准完整性
- 安全技术措施与操作规程完备性
- 人员资质与机械设备配置合理性
- 施工进度与资源配置的可行性
- 文明施工与环保措施落实情况`,
  },
};


export class ReviewAssistant {
  private currentUser: AuthUser | null = null;
  private token: string | null = null;
  private role: Role = 'general';
  private companyType: string = 'general';
  private files: FileItem[] = [];
  private reviewType: ReviewType = 'comprehensive';
  private reviewMode: ReviewMode = 'quick';
  private history: ReviewHistory[] = [];
  private currentReview: ReviewHistory | null = null;
  private isReviewing = false;
  private container!: HTMLElement;
  private activeTab: TabView = 'review';
  private knowledgeEntries: KnowledgeEntry[] = [];
  private knowledgeCompanyType: string = 'public';
  private knowledgeFileContent: string = '';
  private knowledgeFileName: string = '';
  // 审核依据：按模块绑定，管理员在知识库中配置
  private moduleConstraints: Record<string, { mode: 'smart' | 'none' | 'rules'; fileContent?: string; fileName?: string; rules?: string }> = {};
  // 知识库文件列表
  private knowledgeFiles: Array<{ id: string; title: string; dataset: string; doc_id: string; content_preview: string; source_type: string; created_at: string }> = [];
  private isImporting = false;
  private managedUsers: ManagedUser[] = [];
  private reviewMeta: { knowledgeUsed?: boolean; knowledgeChunks?: number; knowledgeDatasets?: string[]; webSearchUsed?: boolean; webSearchResults?: number } | null = null;
  private originalFileContent = '';
  private resultTab: 'issues' | 'comparison' | 'details' | 'suggestions' | 'references' = 'comparison';
  private showRegister = false;
  // 文本粘贴模式：用户可直接粘贴文本内容，绕过文件解析
  private textContent = '';
  // 文件预览模式：仅解析文件提取文本，不调用 LLM（零 Token 消耗）
  private previewContent: string | null = null;
  private isPreviewing = false;
  // 批量审核：多个文件时逐个审核，结果用折叠面板展示
  private batchResults: ReviewHistory[] = [];
  private expandedBatchIndex: number = -1;
  private batchTotal = 0;
  private batchCompleted = 0;

  /**
   * 清理 PDF 提取文本中的 CJK 字符间多余空格
   * pdf.js 常产生 "方 案 报 审 表" → 应为 "方案报审表"
   * 规则：当两个 CJK 字符之间仅有空格时，去除空格
   * 保留 CJK 与非 CJK 之间的空格（如 "第 1 章" 保留）
   */
  private normalizePdfText(text: string): string {
    // CJK Unified Ideographs: \u4e00-\u9fff
    // CJK Extension A: \u3400-\u4dbf
    // CJK Compatibility: \uf900-\ufaff
    const CJK = '[\\u4e00-\\u9fff\\u3400-\\u4dbf\\uf900-\\ufaff]';
    // 中文字符之间的空格 → 删除
    const result = text.replace(new RegExp(`(${CJK})\\s+(${CJK})`, 'g'), '$1$2');
    // 多次替换（处理连续多个CJK字符间空格，如 "方 案 报 审 表"）
    let prev = '';
    let cleaned = result;
    let rounds = 0;
    while (prev !== cleaned && rounds < 5) {
      prev = cleaned;
      cleaned = cleaned.replace(new RegExp(`(${CJK})\\s+(${CJK})`, 'g'), '$1$2');
      rounds++;
    }
    // 清理多余连续空格（非CJK间保留单空格）
    cleaned = cleaned.replace(/[^\S\n]+/g, ' ').trim();
    console.log(`[文件解析] PDF文本归一化完成，原文 ${text.length} → 归一化 ${cleaned.length} 字符`);
    return cleaned;
  }

  /** 显示轻量提示（替代 alert，不打断用户操作） */
  private showToast(message: string, type: 'success' | 'error' | 'info' = 'info') {
    const existing = document.getElementById('appToast');
    if (existing) existing.remove();
    const colors = { success: 'bg-green-600', error: 'bg-red-600', info: 'bg-blue-600' };
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = `fixed top-4 left-1/2 -translate-x-1/2 ${colors[type]} text-white px-5 py-3 rounded-xl shadow-lg z-[100] flex items-center gap-2 text-sm font-medium transition-all`;
    toast.innerHTML = `<span class="text-base">${icons[type]}</span> ${message}`;
    document.body.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, 3000);
  }

  mount(el: HTMLElement) {
    this.container = el;
    // 尝试恢复登录状态
    const savedToken = localStorage.getItem('auth_token');
    const savedUser = localStorage.getItem('auth_user');
    if (savedToken && savedUser) {
      try { this.token = savedToken; this.currentUser = JSON.parse(savedUser); if (this.currentUser?.companyType) this.companyType = this.currentUser.companyType; } catch { localStorage.removeItem('auth_token'); localStorage.removeItem('auth_user'); }
    }
    this.render();
    if (this.isLoggedIn()) { this.loadHistoryFromDB(); }
  }

  private isLoggedIn() { return !!this.currentUser && !!this.token; }
  private isAdmin() { return this.currentUser?.role === 'admin'; }

  private authHeaders(): Record<string, string> {
    return this.token ? { 'Authorization': `Bearer ${this.token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };
  }

  // ==================== 登录/登出 ====================
  async login(username: string, password: string) {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      if (data.success) {
        this.currentUser = data.user; this.token = data.token;
        if (data.user.companyType) this.companyType = data.user.companyType;
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        this.loadHistoryFromDB();
        this.render();
      } else { alert(data.error || '登录失败'); }
    } catch { alert('网络异常，请重试'); }
  }

  async register(username: string, password: string, displayName: string) {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, displayName, companyType: this.companyType }),
      });
      const data = await response.json();
      if (data.success) {
        this.currentUser = data.user; this.token = data.token;
        if (data.user.companyType) this.companyType = data.user.companyType;
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        this.showRegister = false;
        this.loadHistoryFromDB();
        this.render();
      } else { alert(data.error || '注册失败'); }
    } catch { alert('网络异常，请重试'); }
  }

  async updateCompanyType(companyType: string) {
    try {
      const response = await fetch('/api/auth/company-type', {
        method: 'PUT', headers: this.authHeaders(),
        body: JSON.stringify({ companyType }),
      });
      const data = await response.json();
      if (data.success) {
        this.companyType = companyType;
        this.currentUser = data.user; this.token = data.token;
        localStorage.setItem('auth_token', data.token);
        localStorage.setItem('auth_user', JSON.stringify(data.user));
        this.showToast(`已切换为${COMPANY_TYPES[companyType]?.label || companyType}`, 'success');
        this.render();
      } else { alert(data.error || '更新失败'); }
    } catch { alert('网络异常，请重试'); }
  }

  logout() {
    this.currentUser = null; this.token = null;
    localStorage.removeItem('auth_token'); localStorage.removeItem('auth_user');
    this.history = []; this.currentReview = null; this.files = [];
    this.activeTab = 'review';
    this.render();
  }

  // ==================== 数据加载 ====================
  private async loadHistoryFromDB() {
    try {
      const response = await fetch('/api/reviews?limit=20', { headers: this.authHeaders() });
      const data = await response.json();
      if (data.success && data.data) { this.history = data.data; this.render(); }
    } catch (error) { console.error('加载历史记录失败:', error); }
  }

  private async loadManagedUsers() {
    if (!this.isAdmin()) return;
    try {
      const response = await fetch('/api/users', { headers: this.authHeaders() });
      const data = await response.json();
      if (data.success) { this.managedUsers = data.users; this.render(); }
    } catch (error) { console.error('加载用户列表失败:', error); }
  }

  private dbStats: { usedMB: number; totalMB: number; remainingMB: number; usagePercent: number; tables: Record<string, {count: number}>; dataSource: string } | null = null;
  private usageLogs: Array<{ user: { username: string; displayName: string; role: string }; totalCount: number; recentRecords: Array<{ id: string; fileName: string; reviewType: string; reviewMode: string; status: string; createdAt: string }> }> = [];
  private usageLogsTotal = 0;

  private async loadDbStats() {
    if (!this.isAdmin()) return;
    try {
      const res = await fetch('/api/db-stats', { headers: this.authHeaders() });
      const data = await res.json();
      if (data.success && data.data) {
        this.dbStats = data.data;
        this.renderDbStats();
      }
    } catch (error) { console.error('加载数据库统计失败:', error); }
  }

  private renderDbStats() {
    const el = document.getElementById('dbStatsContent');
    if (!el || !this.dbStats) { if (el) el.textContent = '暂无数据'; return; }
    const s = this.dbStats;
    const barColor = s.usagePercent < 50 ? 'bg-green-500' : s.usagePercent < 80 ? 'bg-yellow-500' : 'bg-red-500';
    const textColor = s.usagePercent < 50 ? 'text-green-700' : s.usagePercent < 80 ? 'text-yellow-700' : 'text-red-700';
    el.innerHTML = `
      <div class="mb-3">
        <div class="flex justify-between items-baseline mb-1">
          <span class="text-gray-600">已用 <span class="font-semibold ${textColor}">${s.usedMB.toFixed(1)} MB</span> / 总计 ${s.totalMB} MB</span>
          <span class="font-semibold ${textColor}">${s.usagePercent}%</span>
        </div>
        <div class="w-full h-2.5 bg-gray-200 rounded-full overflow-hidden">
          <div class="${barColor} h-full rounded-full transition-all duration-500" style="width:${Math.min(100, s.usagePercent)}%"></div>
        </div>
        <div class="flex justify-between mt-1">
          <span class="text-slate-400">剩余 <span class="font-medium text-slate-600">${s.remainingMB.toFixed(1)} MB</span></span>
          <span class="text-slate-400">${s.dataSource === 'rpc' ? '实际数据' : '估算数据'}</span>
        </div>
      </div>
      <div class="border-t pt-2 space-y-1" style="border-color:var(--c-border-light)">
        <div class="flex justify-between"><span class="text-slate-500">用户表</span><span class="font-medium text-slate-700">${s.tables?.users?.count ?? 0} 条</span></div>
        <div class="flex justify-between"><span class="text-slate-500">审核记录表</span><span class="font-medium text-slate-700">${s.tables?.review_records?.count ?? 0} 条</span></div>
      </div>
    `;
  }

  private async loadUsageLogs() {
    if (!this.isAdmin()) return;
    try {
      const res = await fetch('/api/usage-logs', { headers: this.authHeaders() });
      const data = await res.json();
      if (data.success && data.data) {
        this.usageLogs = data.data;
        this.usageLogsTotal = data.totalRecords || 0;
        this.renderUsageLogs();
      }
    } catch (error) { console.error('加载使用记录失败:', error); }
  }

  private renderUsageLogs() {
    const el = document.getElementById('usageLogsContent');
    if (!el) return;
    if (this.usageLogs.length === 0) { el.innerHTML = '<p class="text-xs text-gray-400 py-4 text-center">暂无使用记录</p>'; return; }

    el.innerHTML = this.usageLogs.map((g, idx) => {
      const roleTag = g.user.role === 'admin' ? '<span class="text-xs px-1.5 py-0.5 rounded bg-red-50 text-red-600">管理员</span>' : g.user.role === 'guest' ? '<span class="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">游客</span>' : '<span class="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600">用户</span>';
      const statusIcon = (s: string) => s === 'completed' ? '<span class="text-green-500">✓</span>' : s === 'failed' ? '<span class="text-red-500">✗</span>' : '<span class="text-yellow-500">⏳</span>';
      const typeLabel = (t: string) => { const c = REVIEW_TYPES[t as ReviewType]; return c ? `${c.icon} ${c.label}` : t; };
      const fmtTime = (t: string) => { try { return new Date(t).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); } catch { return t; } };

      return `
        <div class="border border-gray-100 rounded-lg overflow-hidden">
          <div class="flex items-center gap-2 px-3 py-2 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors usage-log-toggle" data-idx="${idx}">
            <div class="w-6 h-6 ${g.user.role==='admin'?'bg-red-100 text-red-600':'bg-blue-100 text-blue-600'} rounded-full flex items-center justify-center text-xs font-bold">${g.user.displayName.charAt(0)}</div>
            <span class="text-sm font-medium text-gray-900 flex-1">${g.user.displayName}</span>
            ${roleTag}
            <span class="text-xs text-gray-500">${g.totalCount} 次审核</span>
            <svg class="w-4 h-4 text-gray-400 transition-transform usage-log-arrow" data-idx="${idx}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </div>
          <div class="hidden usage-log-detail" data-idx="${idx}">
            <div class="px-3 py-1.5 space-y-1 max-h-48 overflow-y-auto">
              ${g.recentRecords.map(r => `
                <div class="flex items-center gap-2 text-xs py-1 border-b border-gray-50 last:border-0">
                  ${statusIcon(r.status)}
                  <span class="text-gray-800 font-medium truncate flex-1" title="${r.fileName}">${r.fileName}</span>
                  <span class="text-gray-400 whitespace-nowrap">${typeLabel(r.reviewType)}</span>
                  <span class="text-gray-300 whitespace-nowrap">${fmtTime(r.createdAt)}</span>
                </div>
              `).join('')}
              ${g.totalCount > 20 ? `<div class="text-xs text-gray-400 text-center py-1">仅显示最近 20 条</div>` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  }

  // ==================== 文件和审核 ====================
  addFiles(files: File[]) {
    const validTypes = ['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','image/jpeg','image/png','image/jpg'];
    let addedCount = 0;
    for (const file of files) {
      if (!validTypes.includes(file.type)) { alert(`文件 "${file.name}" 格式不支持`); continue; }
      if (file.size > 20*1024*1024) { alert(`文件 "${file.name}" 超过20MB`); continue; }
      this.files.push({ id: `${Date.now()}-${Math.random().toString(36).substr(2,9)}`, name: file.name, size: file.size, type: file.type, file });
      addedCount++;
    }
    if (addedCount > 0) {
      this.showToast(`已添加 ${addedCount} 个文件，可选择"预览解析"查看内容或"开始审核"`, 'success');
    }
    this.render();
  }
  removeFile(id: string) { this.files = this.files.filter(f => f.id !== id); this.render(); }
  setReviewType(type: ReviewType) { this.reviewType = type; this.render(); }
  setReviewMode(mode: ReviewMode) { this.reviewMode = mode; this.render(); }
  setRole(role: Role) { this.role = role; this.render(); }
  setActiveTab(tab: TabView) {
    this.activeTab = tab;
    if (tab === 'admin') { this.loadManagedUsers(); this.loadDbStats(); this.loadUsageLogs(); }
    if (tab === 'knowledge') { this.loadKnowledgeFiles(); }
    this.render();
  }

  /** 带超时的 fetch */
  private async fetchWithTimeout(url: string, options: RequestInit, timeoutMs = 120000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      return response;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 更新加载遮罩上的提示文本，让用户看到实时进度 */
  private updateLoadingStatus(msg: string) {
    const el = document.getElementById('loadingStatusText');
    if (el) el.innerText = msg;
  }

  private async readFileContents(fileList?: FileItem[]): Promise<{ name: string; content: string }[]> {
    const results: { name: string; content: string }[] = [];
    const filesToRead = fileList || this.files;

    for (let idx = 0; idx < filesToRead.length; idx++) {
      const f = filesToRead[idx];
      this.updateLoadingStatus(`正在解析文件 ${idx + 1}/${filesToRead.length}：${f.name}`);
      try {
        const ext = f.name.split('.').pop()?.toLowerCase() || '';

        if (ext === 'pdf') {
          // 前端用 pdf.js 解析 PDF
          console.log(`[文件解析] 开始解析 PDF: ${f.name} (${(f.size / 1024).toFixed(1)} KB)`);
          const arrayBuffer = await f.file.arrayBuffer();
          const pdfjsLib = await import('pdfjs-dist');
          console.log('[文件解析] pdfjs-dist 动态导入成功');

          // ✅ Worker 配置策略：
          // 直接设置 workerSrc 为 /pdf.worker.min.mjs（构建脚本已复制到 public/）
          // 不做 fetch HEAD 检测（跨域环境可能失败）
          // 如果 worker 加载失败，catch 中降级为主线程模式
          if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
            pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
            console.log('[文件解析] 设置 workerSrc = /pdf.worker.min.mjs');
          }

          let pdf: any;
          try {
            // Worker 模式（性能好，异步解析不阻塞 UI）
            console.log('[文件解析] 开始 Worker 模式解析...');
            const pdfPromise = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
            pdf = await Promise.race([
              pdfPromise,
              new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PDF 解析超时(30s)')), 30000))
            ]);
            console.log(`[文件解析] Worker 模式解析成功，共 ${pdf.numPages} 页`);
          } catch (workerErr) {
            // Worker 加载失败 → 降级为主线程模式（慢但 100% 可靠）
            console.warn('[文件解析] Worker 模式失败，降级为主线程解析:', workerErr);
            pdfjsLib.GlobalWorkerOptions.workerSrc = '';
            try {
              const pdfPromise = pdfjsLib.getDocument({
                data: new Uint8Array(arrayBuffer),
                useWorkerFetch: false,
                isEvalSupported: false,
                useSystemFonts: true,
              }).promise;
              pdf = await Promise.race([
                pdfPromise,
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error('PDF 主线程解析超时')), 60000))
              ]);
              console.log(`[文件解析] 主线程模式解析成功，共 ${pdf.numPages} 页`);
            } catch (fallbackErr) {
              const fbMsg = fallbackErr instanceof Error ? fallbackErr.message : '未知错误';
              console.error('[文件解析] 主线程模式也失败:', fallbackErr);
              throw new Error(`PDF 解析失败：${fbMsg}。建议：用 PDF 阅读器打开文件，复制文本内容粘贴到下方文本框中。`);
            }
          }

          // 逐页提取文本（插入页码标记方便审核定位）
          const textParts: string[] = [];
          for (let i = 1; i <= pdf.numPages; i++) {
            this.updateLoadingStatus(`正在提取第 ${i}/${pdf.numPages} 页文本...`);
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map((item: any) => item.str || '').join(' ');
	            textParts.push(`【第${i}页】\n${pageText}`);
          }
          let text = textParts.join('\n\n');

          // ✅ 清理CJK字符间多余空格
          // pdf.js提取的文本常有"方 案 报 审 表"这种字间空格
          // 规则：当中文字符之间只有空格（无标点/数字/英文）时，合并空格
          text = this.normalizePdfText(text);
          console.log(`[文件解析] PDF 文本提取完成，总长度 ${text.length} 字符`);
          results.push({ name: f.name, content: text || '[PDF解析结果为空，请将文件内容复制粘贴到下方文本框]' });
        } else if (['doc', 'docx'].includes(ext)) {
          // 前端用 JSZip 解析 Word
          console.log(`[文件解析] 开始解析 Word: ${f.name}`);
          const JSZip = (await import('jszip')).default;
          const arrayBuffer = await f.file.arrayBuffer();
          const zip = await JSZip.loadAsync(arrayBuffer);
          const docXml = zip.file('word/document.xml');
          if (docXml) {
            const xml = await docXml.async('string');
            const text = xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            console.log(`[文件解析] Word 文本提取完成，总长度 ${text.length} 字符`);
            results.push({ name: f.name, content: text || '[Word解析结果为空，请将文件内容复制粘贴到下方文本框]' });
          } else {
            results.push({ name: f.name, content: '[Word文档结构异常，请将文件内容复制粘贴到下方文本框]' });
          }
        } else if (f.file.type.startsWith('image/')) {
          // 图片：提取 base64，供 LLM 多模态识别
          console.log(`[文件解析] 开始处理图片: ${f.name}`);
          const base64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => resolve((reader.result as string).split(',')[1]);
            reader.readAsDataURL(f.file);
          });
          const imageContent = `[图片: ${f.name}]\ndata:${f.file.type};base64,${base64}`;
          console.log(`[文件解析] 图片 base64 提取完成，长度 ${imageContent.length} 字符`);
          results.push({ name: f.name, content: imageContent });
        } else {
          // 纯文本
          console.log(`[文件解析] 读取纯文本: ${f.name}`);
          const text = await f.file.text();
          results.push({ name: f.name, content: text });
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : '未知错误';
        console.error(`[文件解析] 文件 ${f.name} 解析失败:`, err);
        results.push({ name: f.name, content: `[文件解析失败: ${errMsg}]` });
      }
    }

    return results;
  }

  /** 文件预览：仅解析文件提取文本，不调用 LLM，零 Token 消耗 */
  async previewFile() {
    const hasTextContent = this.textContent.trim().length > 0;
    const hasFiles = this.files.length > 0;
    if (!hasTextContent && !hasFiles) { alert('请先上传文件或粘贴文本内容'); return; }

    this.isPreviewing = true; this.render();
    this.updateLoadingStatus('正在解析文件...');

    try {
      let combinedContent = '';
      if (hasTextContent) {
        combinedContent = this.textContent.trim();
      } else {
        const fileContents = await this.readFileContents();
        combinedContent = fileContents.map(f => `=== ${f.name} ===\n${f.content}`).join('\n\n---\n\n');
      }

      // 前端截断（预览模式不限，显示全部）
      if (combinedContent.length > 200000) {
        const headLen = Math.floor(200000 * 0.8);
        const tailLen = 200000 - headLen;
        combinedContent = combinedContent.substring(0, headLen)
          + '\n\n[... 中间内容因长度限制已省略 ...]\n\n'
          + combinedContent.substring(combinedContent.length - tailLen);
      }

      this.previewContent = combinedContent;
      console.log(`[文件预览] 解析完成，文本长度 ${combinedContent.length} 字符`);
    } catch (err) {
      console.error('[文件预览] 解析失败:', err);
      this.previewContent = `[解析失败: ${err instanceof Error ? err.message : '未知错误'}]`;
    }

    this.isPreviewing = false; this.render();
  }

  closePreview() { this.previewContent = null; this.render(); }

  async startReview() {
    const hasTextContent = this.textContent.trim().length > 0;
    const hasFiles = this.files.length > 0;
    if (!hasTextContent && !hasFiles) { alert('请先上传文件或粘贴文本内容'); return; }

    // 判断是否为批量审核模式（多个文件）
    const isBatch = hasFiles && this.files.length > 1 && !hasTextContent;

    this.isReviewing = true;
    this.batchResults = [];
    this.expandedBatchIndex = -1;
    this.batchTotal = isBatch ? this.files.length : 1;
    this.batchCompleted = 0;
    this.render();
    this.updateLoadingStatus('正在准备审核...');

    try {
      if (isBatch) {
        // ===== 批量审核：逐个文件提交 =====
        for (let fileIdx = 0; fileIdx < this.files.length; fileIdx++) {
          const fileItem = this.files[fileIdx];
          this.updateLoadingStatus(`正在审核第 ${fileIdx + 1}/${this.files.length} 个文件：${fileItem.name}`);
          console.log(`[批量审核] 审核第 ${fileIdx + 1}/${this.files.length} 个文件：${fileItem.name}`);

          try {
            // 解析单个文件
            const fileContents = await this.readFileContents([fileItem]);
            let combinedContent = fileContents.map(f => f.content).join('\n');
            this.originalFileContent = combinedContent;

            // 截断保护
            const MAX_CHARS = 100000;
            if (combinedContent.length > MAX_CHARS) {
              combinedContent = combinedContent.substring(0, Math.floor(MAX_CHARS * 0.8))
                + '\n\n[... 中间内容因长度限制已省略 ...]\n\n'
                + combinedContent.substring(combinedContent.length - Math.floor(MAX_CHARS * 0.2));
            }

            const reviewBody: Record<string, unknown> = {
              fileName: fileItem.name, fileContent: combinedContent,
              reviewType: this.reviewType, reviewMode: this.reviewMode, userRole: this.role,
            };
            const mc = this.moduleConstraints[this.reviewType];
            if (mc && mc.mode === 'rules' && mc.rules?.trim()) {
              reviewBody.constraintMode = 'rules';
              reviewBody.constraintContent = mc.rules.trim();
            }

            // SSE 审核
            const result = await this.doSSEReview(reviewBody, fileItem.name);
            if (result) {
              this.batchResults.push(result);
              this.batchCompleted++;
              // 默认展开第一个结果
              if (this.batchResults.length === 1) this.expandedBatchIndex = 0;
            }
          } catch (fileErr) {
            console.error(`[批量审核] 文件 ${fileItem.name} 审核失败:`, fileErr);
            this.batchResults.push({
              id: '', file_name: fileItem.name, review_type: this.reviewType,
              review_mode: this.reviewMode, user_role: this.role, status: 'failed',
              result: { conclusion: 'fail', score: 0, issues: [{ level: 'high', title: '审核失败', description: String(fileErr), suggestion: '请重试' }], suggestions: [], annotatedContent: '', details: '' },
              created_at: new Date().toISOString(),
            });
            this.batchCompleted++;
          }
          // 逐步渲染，显示已完成的进度
          this.render();
        }
      } else {
        // ===== 单文件/文本审核 =====
        let combinedContent = '';
        if (hasTextContent) {
          combinedContent = this.textContent.trim();
          this.originalFileContent = combinedContent;
        } else {
          const fileContents = await this.readFileContents();
          combinedContent = fileContents.map(f => `=== ${f.name} ===\n${f.content}`).join('\n\n---\n\n');
          this.originalFileContent = combinedContent;
        }

        const MAX_CHARS = 100000;
        if (combinedContent.length > MAX_CHARS) {
          combinedContent = combinedContent.substring(0, Math.floor(MAX_CHARS * 0.8))
            + '\n\n[... 中间内容因长度限制已省略 ...]\n\n'
            + combinedContent.substring(combinedContent.length - Math.floor(MAX_CHARS * 0.2));
        }

        const fileName = hasTextContent ? '粘贴文本内容' : this.files.map(f => f.name).join(', ');
        const reviewBody: Record<string, unknown> = {
          fileName, fileContent: combinedContent, reviewType: this.reviewType, reviewMode: this.reviewMode, userRole: this.role,
        };
        const mc = this.moduleConstraints[this.reviewType];
        if (mc && mc.mode === 'rules' && mc.rules?.trim()) {
          reviewBody.constraintMode = 'rules';
          reviewBody.constraintContent = mc.rules.trim();
        }

        const result = await this.doSSEReview(reviewBody, fileName);
        if (result) {
          this.currentReview = result;
          this.batchResults = [result];
          this.expandedBatchIndex = 0;
          this.resultTab = 'comparison';
        }
      }
    } catch (err) {
      console.error('[审核] 审核异常:', err);
      const errMsg = err instanceof Error ? err.message : '网络异常';
      alert('审核失败：' + errMsg);
    }
    this.isReviewing = false; this.files = []; this.textContent = '';
    await this.loadHistoryFromDB(); this.render();
  }

  /** 执行 SSE 流式审核，返回审核结果 */
  private async doSSEReview(reviewBody: Record<string, unknown>, fileName: string): Promise<ReviewHistory | null> {
    this.updateLoadingStatus(`正在提交审核：${fileName}...`);

    const response = await fetch('/api/review', {
      method: 'POST',
      headers: { ...this.authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(reviewBody),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({ error: '提交失败' }));
      console.error('[审核] 提交失败:', errData);
      throw new Error(errData.error || '审核提交失败');
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('浏览器不支持流式响应');

    const decoder = new TextDecoder();
    let sseBuffer = '';
    let finalResult: Record<string, unknown> | null = null;
    let recordId = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      sseBuffer += decoder.decode(value, { stream: true });

      const lines = sseBuffer.split('\n');
      sseBuffer = '';
      let currentEvent = '';
      let currentData = '';

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          currentEvent = line.substring(7).trim();
        } else if (line.startsWith('data: ')) {
          currentData = line.substring(6);
        } else if (line === '' && currentEvent && currentData) {
          try {
            const data = JSON.parse(currentData);
            switch (currentEvent) {
              case 'started': recordId = data.id as string; break;
              case 'progress': this.updateLoadingStatus(data.message as string || 'AI 审核中...'); break;
              case 'segment': this.updateLoadingStatus(`AI 审核中... (${data.segment}/${data.totalSegments} 段已完成)`); break;
              case 'completed': finalResult = data.result as Record<string, unknown>; break;
              case 'error': throw new Error(data.error || '服务端错误');
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== '服务端错误') {
              console.warn('[审核] SSE 解析错误:', parseErr);
            } else { throw parseErr; }
          }
          currentEvent = ''; currentData = '';
        } else if (line !== '' && !line.startsWith('event:') && !line.startsWith('data:')) {
          sseBuffer = line + '\n';
        }
      }
    }

    if (finalResult) {
      return {
        id: recordId, file_name: fileName, review_type: this.reviewType,
        review_mode: this.reviewMode, user_role: this.role, status: 'completed',
        result: finalResult as any, created_at: new Date().toISOString(),
      };
    } else if (recordId) {
      // 降级：从数据库获取
      try {
        const pollResp = await this.fetchWithTimeout(`/api/reviews/${recordId}`, { headers: this.authHeaders() }, 10000);
        const pollData = await pollResp.json();
        if (pollData.success && pollData.data && pollData.data.status === 'completed') return pollData.data;
      } catch { /* ignore */ }
    }
    return null;
  }

  async viewHistoryDetail(id: string) {
    try {
      const response = await fetch(`/api/reviews/${id}`, { headers: this.authHeaders() });
      const data = await response.json();
      if (data.success && data.data) { this.currentReview = data.data; this.reviewMeta = null; this.resultTab = 'comparison'; this.render(); }
    } catch { console.error('获取详情失败'); }
  }

  async deleteHistory(id: string) {
    try {
      await fetch(`/api/reviews/${id}`, { method: 'DELETE', headers: this.authHeaders() });
      if (this.currentReview?.id === id) this.currentReview = null;
      await this.loadHistoryFromDB();
    } catch { console.error('删除失败'); }
  }

  closeResult() { this.currentReview = null; this.reviewMeta = null; this.batchResults = []; this.expandedBatchIndex = -1; this.render(); }

  // ==================== 知识库管理 ====================
  addKnowledgeEntry(entry: KnowledgeEntry) { this.knowledgeEntries.push(entry); this.render(); }
  removeKnowledgeEntry(id: string) { this.knowledgeEntries = this.knowledgeEntries.filter(e => e.id !== id); this.render(); }

  private async loadKnowledgeFiles() {
    try {
      const res = await fetch('/api/knowledge/files', { headers: this.authHeaders() });
      const data = await res.json();
      if (data.success && data.files) { this.knowledgeFiles = data.files; this.renderKnowledgeFileList(); }
    } catch (error) { console.error('加载知识库文件列表失败:', error); }
  }

  private async deleteKnowledgeFile(id: string) {
    if (!confirm('确定删除此知识库文件？')) return;
    try {
      const res = await fetch(`/api/knowledge/files/${id}`, { method: 'DELETE', headers: this.authHeaders() });
      const data = await res.json();
      if (data.success) { this.knowledgeFiles = this.knowledgeFiles.filter(f => f.id !== id); this.renderKnowledgeFileList(); }
      else alert(data.error || '删除失败');
    } catch (error) { console.error('删除知识库文件失败:', error); }
  }

  private renderKnowledgeFileList() {
    const el = document.getElementById('knowledgeFileList');
    if (!el) return;
    if (this.knowledgeFiles.length === 0) { el.innerHTML = '<p class="text-xs text-gray-400 text-center py-3">暂无知识库文件</p>'; return; }
    const datasetLabels: Record<string, string> = { personnel_qualification: '👤 人员资质', enterprise_qualification: '🏢 企业资质', technical_document: '📐 技术文件', safety_inspection: '🔒 安全检查', document_review: '📄 公文审核', coze_doc_knowledge: '📚 通用法规' };
    const fmtTime = (t: string) => { try { return new Date(t).toLocaleString('zh-CN', {month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}); } catch { return ''; } };
    el.innerHTML = this.knowledgeFiles.map(f => `
      <div class="flex items-center gap-2 p-2 bg-gray-50 rounded-lg group hover:bg-gray-100 transition-colors">
        <span class="text-xs px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 whitespace-nowrap">${datasetLabels[f.dataset] || f.dataset}</span>
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium text-gray-800 truncate" title="${f.title}">${f.title}</div>
          <div class="text-xs text-gray-400">${f.source_type === 'url' ? '🔗 链接' : '📝 文本'} · ${fmtTime(f.created_at)}</div>
        </div>
        <button class="knowledge-file-delete opacity-0 group-hover:opacity-100 text-xs text-red-400 hover:text-red-600 transition-all px-1.5 py-0.5 rounded hover:bg-red-50" data-fid="${f.id}" title="删除">✕</button>
      </div>
    `).join('');
    // 绑定删除事件
    el.querySelectorAll('.knowledge-file-delete').forEach(btn => {
      btn.addEventListener('click', () => { const fid = (btn as HTMLElement).dataset.fid; if (fid) this.deleteKnowledgeFile(fid); });
    });
  }

  /** 处理知识库文件上传（前端解析文本，与审核文件解析复用逻辑） */
  async handleKnowledgeFile(file: File) {
    const fileInfo = document.getElementById('knowledgeFileInfo');
    const fileNameEl = document.getElementById('knowledgeFileName');
    try {
      let text = '';
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const parts: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const tc = await page.getTextContent();
          parts.push(tc.items.map((item: any) => item.str).join(' '));
        }
        text = this.normalizePdfText(parts.join('\n\n'));
      } else if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);
        const docXml = await zip.file('word/document.xml')?.async('string');
        text = docXml ? docXml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
      } else {
        text = await file.text();
      }
      if (!text) { alert('文件内容为空或无法解析'); return; }
      this.knowledgeFileContent = text;
      this.knowledgeFileName = file.name;
      if (fileNameEl) fileNameEl.textContent = `${file.name} (${(text.length / 1000).toFixed(1)}k字)`;
      if (fileInfo) fileInfo.classList.remove('hidden');
      // 自动设置标题为文件名
      const titleEl = document.getElementById('knowledgeTitle') as HTMLInputElement;
      if (titleEl && !titleEl.value) titleEl.value = file.name.replace(/\.[^.]+$/, '');
    } catch (err) {
      console.error('[知识库文件解析失败]', err);
      alert('文件解析失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  /** 处理审核依据文件上传（按模块绑定） */
  async handleConstraintFile(file: File, module: string) {
    try {
      let text = '';
      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        const pdfjsLib = await import('pdfjs-dist');
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const parts: string[] = [];
        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const tc = await page.getTextContent();
          parts.push(tc.items.map((item: any) => item.str).join(' '));
        }
        text = this.normalizePdfText(parts.join('\n\n'));
      } else if (file.name.endsWith('.docx') || file.name.endsWith('.doc')) {
        const JSZip = (await import('jszip')).default;
        const zip = await JSZip.loadAsync(file);
        const docXml = await zip.file('word/document.xml')?.async('string');
        text = docXml ? docXml.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() : '';
      } else {
        text = await file.text();
      }
      if (!text) { alert('文件内容为空或无法解析'); return; }
      if (!this.moduleConstraints[module]) this.moduleConstraints[module] = { mode: 'smart' };
      this.moduleConstraints[module].mode = 'smart';
      this.moduleConstraints[module].fileContent = text.substring(0, 50000);
      this.moduleConstraints[module].fileName = file.name;
      this.showToast(`范文已加载: ${file.name} → ${REVIEW_TYPES[module as ReviewType]?.label || module}`, 'success');
      this.render();
    } catch (err) {
      console.error('[范文文件解析失败]', err);
      alert('文件解析失败: ' + (err instanceof Error ? err.message : String(err)));
    }
  }

  async importKnowledgeToServer() {
    if (this.knowledgeEntries.length === 0) { alert('没有待导入的知识条目'); return; }
    this.isImporting = true; this.render();
    try {
      const grouped = new Map<string, KnowledgeEntry[]>();
      for (const entry of this.knowledgeEntries) { const ds = entry.targetDataset; if (!grouped.has(ds)) grouped.set(ds, []); grouped.get(ds)!.push(entry); }
      let totalSuccess = 0;
      for (const [dataset, entries] of grouped) {
        const documents = entries.map(e => e.type === 'url' ? { type: 'url', url: e.url } : { type: 'text', content: `${e.title}\n\n${e.content}` });
        const response = await fetch('/api/knowledge/import', { method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ documents, dataset, title: entries.map(e=>e.title).join(', ') }) });
        const data = await response.json();
        if (data.success) totalSuccess += entries.length;
      }
      alert(`成功导入 ${totalSuccess} 条知识！`);
      this.knowledgeEntries = [];
      this.loadKnowledgeFiles();
    } catch { alert('导入失败'); }
    this.isImporting = false; this.render();
  }

  async testKnowledgeSearch(query: string, reviewType?: ReviewType): Promise<string> {
    try {
      const response = await fetch('/api/knowledge/search', { method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ query, topK: 3, reviewType }) });
      const data = await response.json();
      if (data.success && data.results.length > 0) {
        const dsLabel = data.searchedDatasets ? `（范围：${data.searchedDatasets.join(', ')}）` : '';
        return `📚 知识库搜索结果 ${dsLabel}：\n\n` + data.results.map((r: { content: string; score: number; documentName: string }) =>
          `[${r.documentName || '文档'} 相似度:${(r.score*100).toFixed(0)}%] ${r.content.substring(0,200)}...`).join('\n\n');
      }
      return '知识库中未找到相关内容';
    } catch { return '搜索失败'; }
  }

  async testWebSearch(query: string): Promise<string> {
    try {
      const response = await fetch('/api/web-search', { method: 'POST', headers: this.authHeaders(), body: JSON.stringify({ query, count: 3 }) });
      const data = await response.json();
      if (data.success && data.results.length > 0) return '🌐 联网搜索结果：\n\n' + data.results.map((r: { title: string; snippet: string; url: string }) => `[${r.title}] ${r.snippet||''}\n来源: ${r.url||''}`).join('\n\n');
      return '联网搜索未找到相关内容';
    } catch { return '搜索失败'; }
  }

  // ==================== 渲染 ====================
  render() { this.container.innerHTML = this.getTemplate(); this.attachEventListeners(); }

  private getTemplate(): string {
    if (!this.isLoggedIn()) return this.renderLoginPage();
    return `
      <div class="min-h-screen bg-gray-50">
        ${this.renderHeader()}
        <div class="max-w-7xl mx-auto px-4 py-6">
          ${this.activeTab === 'review' ? this.renderReviewTab() : this.activeTab === 'knowledge' ? this.renderKnowledgeTab() : this.renderAdminTab()}
        </div>
      </div>
      <div class="fixed bottom-3 right-4 z-40 text-xs text-gray-400 select-none pointer-events-none" style="font-family:system-ui,sans-serif">
        <span class="opacity-70">作者：宋林峰</span><span class="mx-1 opacity-40">|</span><span class="opacity-60">有BUG可及时向我反馈</span>
      </div>
      ${this.isReviewing ? this.renderLoadingOverlay() : ''}
      ${this.isPreviewing ? this.renderPreviewLoadingOverlay() : ''}
      ${this.isImporting ? this.renderImportingOverlay() : ''}
    `;
  }

  // ==================== 登录页面 ====================
  private renderLoginPage(): string {
    if (this.showRegister) return this.renderRegisterPage();
    return `
      <div class="min-h-screen flex items-center justify-center p-4" style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%);">
        <div class="absolute inset-0 overflow-hidden pointer-events-none">
          <div class="absolute top-1/4 -left-20 w-96 h-96 rounded-full opacity-[0.07]" style="background: radial-gradient(circle, #3b82f6, transparent 70%)"></div>
          <div class="absolute bottom-1/4 -right-20 w-80 h-80 rounded-full opacity-[0.05]" style="background: radial-gradient(circle, #60a5fa, transparent 70%)"></div>
          <svg class="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" stroke-width="0.5"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid)"/></svg>
        </div>
        <div class="w-full max-w-sm relative z-10 animate-fadeIn">
          <div class="text-center mb-8">
            <div class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-white/10" style="background: rgba(255,255,255,0.08); backdrop-filter: blur(12px);">
              <span class="text-white font-bold text-2xl tracking-tight">辰</span>
            </div>
            <h1 class="text-xl font-bold text-white tracking-tight">辰溪工程文件审核助手</h1>
            <p class="text-blue-300/70 mt-1.5 text-sm">抽水蓄能电站数字化管控平台</p>
          </div>
          <div class="bg-white rounded-2xl p-7" style="box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4);">
            <h2 class="text-base font-semibold text-gray-900 mb-5">登录系统</h2>
            <div class="mb-4">
              <label class="text-xs font-medium text-gray-600 mb-1.5 block tracking-wide uppercase">用户名</label>
              <input type="text" id="loginUsername" class="input" placeholder="输入用户名" />
            </div>
            <div class="mb-5">
              <label class="text-xs font-medium text-gray-600 mb-1.5 block tracking-wide uppercase">密码</label>
              <input type="password" id="loginPassword" class="input" placeholder="输入密码" />
            </div>
            <button id="loginBtn" class="btn btn-primary w-full py-3 text-sm font-semibold">登录</button>
            <div class="mt-3 text-center">
              <button id="guestLoginBtn" class="text-xs text-gray-400 hover:text-gray-600 transition-colors font-medium">
                游客模式进入
              </button>
            </div>
            <div class="mt-4 pt-4 border-t border-gray-100 text-center">
              <span class="text-xs text-gray-400">还没有账号？</span>
              <button id="showRegisterBtn" class="text-xs text-brand-700 font-semibold hover:text-brand-800 ml-1 transition-colors">立即注册</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderRegisterPage(): string {
    return `
      <div class="min-h-screen flex items-center justify-center p-4" style="background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f172a 100%);">
        <div class="absolute inset-0 overflow-hidden pointer-events-none">
          <div class="absolute top-1/4 -left-20 w-96 h-96 rounded-full opacity-[0.07]" style="background: radial-gradient(circle, #3b82f6, transparent 70%)"></div>
          <svg class="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"><path d="M 60 0 L 0 0 0 60" fill="none" stroke="white" stroke-width="0.5"/></pattern></defs><rect width="100%" height="100%" fill="url(#grid)"/></svg>
        </div>
        <div class="w-full max-w-sm relative z-10 animate-fadeIn">
          <div class="text-center mb-8">
            <div class="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5 border border-white/10" style="background: rgba(255,255,255,0.08); backdrop-filter: blur(12px);">
              <span class="text-white font-bold text-2xl tracking-tight">辰</span>
            </div>
            <h1 class="text-xl font-bold text-white tracking-tight">注册新账号</h1>
            <p class="text-blue-300/70 mt-1.5 text-sm">辰溪工程文件审核助手</p>
          </div>
          <div class="bg-white rounded-2xl p-7" style="box-shadow: 0 25px 50px -12px rgba(0,0,0,0.4);">
            <div class="mb-4">
              <label class="text-xs font-medium text-gray-600 mb-1.5 block tracking-wide uppercase">用户名 <span class="text-red-500">*</span></label>
              <input type="text" id="regUsername" class="input" placeholder="设置用户名" />
            </div>
            <div class="mb-4">
              <label class="text-xs font-medium text-gray-600 mb-1.5 block tracking-wide uppercase">密码 <span class="text-red-500">*</span></label>
              <input type="password" id="regPassword" class="input" placeholder="设置密码" />
            </div>
            <div class="mb-4">
              <label class="text-xs font-medium text-gray-600 mb-1.5 block tracking-wide uppercase">确认密码 <span class="text-red-500">*</span></label>
              <input type="password" id="regPasswordConfirm" class="input" placeholder="再次输入密码" />
            </div>
            <div class="mb-5">
              <label class="text-xs font-medium text-gray-600 mb-1.5 block tracking-wide uppercase">显示名称</label>
              <input type="text" id="regDisplayName" class="input" placeholder="可选，用于界面显示" />
            </div>
            <button id="registerBtn" class="btn btn-primary w-full py-3 text-sm font-semibold">注册</button>
            <div class="mt-4 pt-4 border-t border-gray-100 text-center">
              <span class="text-xs text-gray-400">已有账号？</span>
              <button id="backToLoginBtn" class="text-xs text-brand-700 font-semibold hover:text-brand-800 ml-1 transition-colors">返回登录</button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== 主头部 ====================
  private renderHeader(): string {
    const showKnowledge = this.isAdmin();
    const showAdmin = this.isAdmin();
    const currentCompany = COMPANY_TYPES[this.companyType];
    return `
      <header class="bg-white border-b sticky top-0 z-50" style="border-color:var(--c-border)">
        <div class="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm" style="background:var(--c-brand)">辰</div>
            <div>
              <div class="font-semibold text-slate-900 text-sm leading-tight">辰溪工程文件审核助手</div>
              <div class="text-[11px] text-slate-400">抽水蓄能电站数字化管控平台</div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <div class="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
              <button class="main-tab-btn tab-btn ${this.activeTab==='review'?'active':''}" data-tab="review">审核</button>
              ${showKnowledge ? `<button class="main-tab-btn tab-btn ${this.activeTab==='knowledge'?'active':''}" data-tab="knowledge">知识库</button>` : ''}
              ${showAdmin ? `<button class="main-tab-btn tab-btn ${this.activeTab==='admin'?'active':''}" data-tab="admin">管理</button>` : ''}
            </div>
            <div class="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
              <button class="role-btn tab-btn ${this.role==='general'?'active':''}" data-role="general">总包</button>
              <button class="role-btn tab-btn ${this.role==='supervisor'?'active':''}" data-role="supervisor">监理</button>
              <button class="role-btn tab-btn ${this.role==='construction'?'active':''}" data-role="construction">施工</button>
            </div>
            <div class="flex items-center gap-2 pl-3 border-l" style="border-color:var(--c-border)">
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-semibold" style="background:${currentCompany?.color || 'var(--c-brand)'}">${this.currentUser?.displayName?.charAt(0) || '?'}</div>
              <div class="text-xs">
                <div class="text-slate-600 font-medium">${this.currentUser?.displayName || ''}</div>
                <div class="text-slate-400 leading-tight">${currentCompany?.label || '未选择单位'}</div>
              </div>
              <button id="logoutBtn" class="btn btn-ghost btn-sm">退出</button>
            </div>
          </div>
        </div>
      </header>
    `;
  }

  // ==================== 审核 Tab ====================
  private renderReviewTab(): string {
    const companyBanner = this.currentUser && this.currentUser.role !== 'guest' && this.currentUser.role !== 'admin' && !this.currentUser.companyType ? `
      <div class="p-3 rounded-lg border border-amber-200 bg-amber-50 flex items-center gap-3 mb-2">
        <span class="text-lg">⚠️</span>
        <div class="flex-1"><div class="text-sm font-medium text-amber-800">请选择您所属的单位</div><div class="text-xs text-amber-600">不同单位使用不同的审核标准和知识库，请在下方选择</div></div>
      </div>
    ` : '';
    return `
      <div class="grid-layout">
        <div class="space-y-4">
          ${companyBanner}${this.renderUploadArea()} ${this.renderReviewSettings()} ${this.renderHistory()}
        </div>
        <div class="card-static min-h-[600px]">
          ${this.previewContent ? this.renderPreview() : (this.currentReview || this.batchResults.length > 1) ? this.renderResult() : this.renderEmptyState()}
        </div>
      </div>
    `;
  }

  private renderUploadArea(): string {
    const hasContent = this.files.length > 0 || this.textContent.trim().length > 0;
    return `
      <div class="card">
        <h3 class="text-sm font-semibold text-slate-900 mb-3">文件上传</h3>
        <div class="upload-area" id="uploadArea">
          <p class="text-slate-700 text-sm mb-1">拖拽文件到此处，或 <span class="font-semibold" style="color:var(--c-brand)">点击上传</span></p>
          <p class="text-xs text-slate-400">PDF / Word / Excel / 图片，20MB 内</p>
        </div>
        <input type="file" id="fileInput" class="hidden" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" />
        ${this.files.length > 0 ? `<div class="mt-2.5 space-y-1">${this.files.map(f => this.renderFileItem(f)).join('')}</div>` : ''}
        <div class="mt-3 pt-3 border-t" style="border-color:var(--c-border-light)">
          <label class="text-xs font-medium text-slate-500 mb-1.5 block">或直接粘贴文本内容</label>
          <textarea id="textContentInput" class="input" rows="2" placeholder="从文件中复制文本内容粘贴到此处...">${this.textContent}</textarea>
          ${this.textContent.trim() ? '<p class="text-xs mt-1" style="color:var(--c-success)">已输入 ' + this.textContent.trim().length + ' 字符</p>' : ''}
        </div>
        <div class="mt-3 flex gap-2 items-center">
          <button id="previewFileBtn" class="btn btn-secondary flex-1 ${hasContent?'':'opacity-50 cursor-not-allowed'}">预览解析</button>
          <span class="text-[10px] text-slate-400">不消耗Token</span>
        </div>
      </div>
    `;
  }

  private renderFileItem(file: FileItem): string {
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const colorMap: Record<string,string> = {pdf:'#dc2626',doc:'#2563eb',docx:'#2563eb',xls:'#16a34a',xlsx:'#16a34a',jpg:'#8b5cf6',jpeg:'#8b5cf6',png:'#8b5cf6'};
    const color = colorMap[ext] || '#64748b';
    return `<div class="file-item"><div class="w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0" style="background:${color}">${ext.toUpperCase()}</div><div class="flex-1 min-w-0"><div class="text-xs font-medium text-slate-800 truncate">${file.name}</div><div class="text-[10px] text-slate-400">${(file.size/1024).toFixed(1)} KB</div></div><button class="file-remove w-5 h-5 rounded hover:bg-slate-200 flex items-center justify-center text-slate-400 hover:text-red-500 text-xs" data-remove="${file.id}">&times;</button></div>`;
  }

  private renderReviewSettings(): string {
    return `
      <div class="card">
        <h3 class="text-sm font-semibold text-slate-900 mb-3">审核设置</h3>
        <div class="mb-3.5">
          <div class="flex items-center gap-1 mb-2">
            <label class="text-xs font-medium text-slate-600">审核类型</label>
            <span class="help-tip-type cursor-help text-xs text-slate-400" data-tip="type">[?]</span>
          </div>
          <div class="grid grid-cols-2 gap-1.5">
            ${Object.entries(REVIEW_TYPES).map(([key,config]) => `
              <button class="review-type-btn p-2 rounded-lg border text-left transition-all text-xs ${this.reviewType===key?'active':'border-slate-200 hover:border-slate-300'}" data-type="${key}">
                <span class="text-sm">${config.icon}</span> <span class="font-medium text-slate-800">${config.label}</span>
              </button>
            `).join('')}
          </div>
          <div id="typeHelpTip" class="hidden mt-2 p-3 rounded-lg text-xs leading-relaxed" style="background:var(--c-brand-bg);border:1px solid #bfdbfe;color:#1e40af">
            <div class="font-semibold mb-1">不同审核类型检索不同的知识库模块</div>
            <div class="space-y-0.5">
              <div><b>人员资质</b> → 特种作业证、安全考核证等标准</div>
              <div><b>企业资质</b> → 营业执照、安全生产许可证等标准</div>
              <div><b>技术文件</b> → 施工方案、技术交底等国家技术标准</div>
              <div><b>安全检查</b> → 安全检查表、风险评估等标准</div>
              <div><b>公文审核</b> → 仅审核格式规范（字体、边距、签章）</div>
              <div><b>全面审核</b> → 检索全部知识库，综合审核</div>
            </div>
          </div>
        </div>
        <div>
          <div class="flex items-center gap-1 mb-2">
            <label class="text-xs font-medium text-slate-600">审核模式</label>
            <span class="help-tip cursor-help text-xs text-slate-400" data-tip="mode">[?]</span>
          </div>
          <div class="flex gap-2">
            ${Object.entries(REVIEW_MODES).map(([key,config]) => `
              <button class="review-mode-btn flex-1 p-2.5 rounded-lg border text-center transition-all ${this.reviewMode===key?'active':'border-slate-200 hover:border-slate-300'}" data-mode="${key}">
                <div class="text-lg mb-0.5">${config.icon}</div><div class="text-xs font-medium text-slate-700">${config.label}</div>
              </button>
            `).join('')}
          </div>
          <div id="modeHelpTip" class="hidden mt-2 p-3 rounded-lg text-xs leading-relaxed" style="background:var(--c-warning-bg);border:1px solid #fde68a;color:#92400e">
            <div class="font-semibold mb-1">快速审核 vs 详细审核</div>
            <div><span class="font-medium">快速审核：</span>重点检查关键合规性问题，约 30 秒出结果</div>
            <div><span class="font-medium">详细审核：</span>逐条对照法规标准全面审核，约 1-2 分钟出结果</div>
          </div>
        </div>
        <button id="startReviewBtn" class="btn btn-primary w-full mt-4" ${this.files.length===0 && this.textContent.trim().length===0?'disabled':''}>
          开始审核 ${this.files.length>1?`批量 ${this.files.length} 个文件`:this.files.length===1?'(1个文件)':this.textContent.trim()?'(文本内容)':''}
        </button>
      </div>
    `;
  }

  private renderHistory(): string {
    return `
      <div class="card">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-semibold text-slate-900">审核历史</h3>
          ${this.history.length>0?`<span class="badge badge-neutral">${this.history.length}条</span>`:''}
        </div>
        ${this.currentUser?.role==='guest'?`<div class="text-center py-5 text-slate-400"><p class="text-xs">游客模式无历史记录</p><p class="text-[10px] text-slate-400 mt-1">登录后可保存审核记录</p></div>`:
        this.history.length===0?`<div class="text-center py-5 text-slate-400"><p class="text-xs">暂无审核记录</p></div>`:
        `<div class="space-y-1.5 max-h-60 overflow-y-auto">${this.history.map(h => this.renderHistoryItem(h)).join('')}</div>`}
      </div>
    `;
  }

  private renderHistoryItem(h: ReviewHistory): string {
    const tc = REVIEW_TYPES[h.review_type as ReviewType] || REVIEW_TYPES.comprehensive;
    const statusMap: Record<string,{text:string;cls:string}> = {pending:{text:'等待',cls:'badge-neutral'},processing:{text:'审核中',cls:'badge-brand'},completed:{text:'完成',cls:'badge-success'},failed:{text:'失败',cls:'badge-danger'}};
    const status = statusMap[h.status] || statusMap.pending;
    return `
      <div class="history-item" data-id="${h.id}">
        <div class="flex items-start justify-between mb-1">
          <div class="flex items-center gap-1.5"><span class="text-sm">${tc.icon}</span><div><div class="text-xs font-medium text-slate-800 truncate max-w-[160px]">${h.file_name}</div><div class="text-[10px] text-slate-400">${tc.label}</div></div></div>
          <button class="delete-history w-5 h-5 rounded hover:bg-red-50 flex items-center justify-center text-slate-400 hover:text-red-500 text-xs" data-delete="${h.id}">&times;</button>
        </div>
        <div class="flex items-center justify-between"><span class="text-[10px] text-slate-400">${this.formatTime(h.created_at)}</span><span class="badge ${status.cls} text-[10px]">${status.text}</span></div>
      </div>
    `;
  }

  private formatTime(dateStr: string): string {
    const d = new Date(dateStr); const now = new Date(); const diff = now.getTime()-d.getTime();
    const m = Math.floor(diff/60000); if(m<1) return '刚刚'; if(m<60) return `${m}分钟前`;
    const h = Math.floor(diff/3600000); if(h<24) return `${h}小时前`;
    const day = Math.floor(diff/86400000); if(day<7) return `${day}天前`;
    return d.toLocaleDateString('zh-CN');
  }

  private renderPreview(): string {
    const content = this.previewContent || '';
    const charCount = content.length;
    const escaped = content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `
      <div class="h-full flex flex-col">
        <div class="p-4 border-b flex items-center justify-between" style="border-color:var(--c-border)">
          <div><h3 class="text-sm font-semibold text-slate-900">文件预览</h3><p class="text-[10px] text-slate-400">共提取 ${charCount.toLocaleString()} 字符（未消耗Token）</p></div>
          <div class="flex items-center gap-2">
            <button id="copyPreviewBtn" class="btn btn-secondary btn-sm">复制</button>
            <button id="closePreviewBtn" class="btn btn-ghost btn-sm">&times;</button>
          </div>
        </div>
        <div class="flex-1 overflow-auto p-4">
          <pre class="text-xs text-slate-700 whitespace-pre-wrap break-all leading-relaxed font-mono bg-slate-50 p-4 rounded-lg border" style="border-color:var(--c-border)">${escaped}</pre>
        </div>
        <div class="p-3 border-t text-center" style="border-color:var(--c-border);background:#f8fafc">
          <p class="text-[10px] text-slate-400 mb-2">确认内容无误后，点击开始审核调用 AI 审核</p>
          <button id="startReviewFromPreviewBtn" class="btn btn-primary">开始审核</button>
        </div>
      </div>
    `;
  }

  private renderEmptyState(): string {
    return `
      <div class="h-full flex flex-col items-center justify-center p-10 text-center">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center mb-4 bg-slate-100"><span class="text-2xl text-slate-400">审核</span></div>
        <h3 class="text-base font-semibold text-slate-900 mb-1.5">上传文件开始审核</h3>
        <p class="text-slate-500 text-sm max-w-xs">系统根据审核类型检索对应模块知识库，并检测错别字</p>
        <div class="mt-6 grid grid-cols-3 gap-6 text-center">
          <div><div class="w-10 h-10 rounded-xl mx-auto mb-1.5 flex items-center justify-center bg-blue-50 text-blue-600 text-lg">查</div><div class="text-xs font-medium text-slate-600">模块化检索</div></div>
          <div><div class="w-10 h-10 rounded-xl mx-auto mb-1.5 flex items-center justify-center bg-red-50 text-red-600 text-lg">标</div><div class="text-xs font-medium text-slate-600">分类标注</div></div>
          <div><div class="w-10 h-10 rounded-xl mx-auto mb-1.5 flex items-center justify-center bg-green-50 text-green-600 text-lg">审</div><div class="text-xs font-medium text-slate-600">AI 审核</div></div>
        </div>
      </div>
    `;
  }

  // ==================== 审核结果 ====================
  private renderResult(): string {
    if (this.batchResults.length > 1) return this.renderBatchResults();

    const review = this.currentReview!; const result = review.result;
    if (!result) return `<div class="h-full flex items-center justify-center"><p class="text-slate-400">加载中...</p></div>`;
    const cm: Record<string,{text:string;color:string;bg:string;icon:string}> = {
      pass:{text:'审核通过',color:'var(--c-success)',bg:'var(--c-success-bg)',icon:'✅'},
      fail:{text:'审核未通过',color:'var(--c-danger)',bg:'var(--c-danger-bg)',icon:'❌'},
      warning:{text:'需要整改',color:'var(--c-warning)',bg:'var(--c-warning-bg)',icon:'⚠️'}
    };
    const c = cm[result.conclusion] || cm.warning;
    const scoreColor = result.score>=80?'var(--c-success)':result.score>=60?'var(--c-warning)':'var(--c-danger)';
    const scoreBg = result.score>=80?'var(--c-success)':result.score>=60?'var(--c-warning)':'var(--c-danger)';
    return `
      <div class="h-full flex flex-col">
        <div class="p-4 border-b" style="border-color:var(--c-border)">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <span class="text-xl">${c.icon}</span>
              <div>
                <h3 class="text-sm font-semibold" style="color:${c.color}">${c.text}</h3>
                <p class="text-[10px] text-slate-400">${REVIEW_TYPES[review.review_type as ReviewType]?.label||''} · ${REVIEW_MODES[review.review_mode as ReviewMode]?.label||''}</p>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <button id="downloadReportBtn" class="btn btn-secondary btn-sm">下载</button>
              <button id="closeResultBtn" class="btn btn-ghost btn-sm">&times;</button>
            </div>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <div class="flex items-center gap-1.5"><span class="text-xs text-slate-500">评分</span><span class="text-xl font-bold" style="color:${scoreColor}">${result.score}</span></div>
            <div class="flex-1 bg-slate-100 rounded-full h-1.5 max-w-[150px]"><div class="h-1.5 rounded-full" style="width:${result.score}%;background:${scoreBg}"></div></div>
            ${this.renderKnowledgeSourceBadges()}
          </div>
          ${(result as any)._totalSegments > 1 ? `<div class="mt-2 px-2.5 py-1.5 rounded-lg text-xs" style="background:var(--c-brand-bg);color:var(--c-brand)">全文分段审核：共 ${(result as any)._totalSegments} 段，每段独立审核后合并结果，全文覆盖无遗漏</div>` : ''}
        </div>
        <div class="px-4 pt-1 flex gap-1 border-b overflow-x-auto" style="border-color:var(--c-border)">
          <button class="result-tab cat-btn ${this.resultTab==='comparison'?'active':''}" data-tab="comparison">对比标注</button>
          ${(result.issues && result.issues.length > 0) ? `<button class="result-tab cat-btn ${this.resultTab==='issues'?'active':''}" data-tab="issues">问题 (${result.issues.length})</button>` : ''}
          ${result.details ? `<button class="result-tab cat-btn ${this.resultTab==='details'?'active':''}" data-tab="details">分析</button>` : ''}
          <button class="result-tab cat-btn ${this.resultTab==='references'?'active':''}" data-tab="references">来源</button>
        </div>
        <div class="flex-1 overflow-y-auto p-4">
          <div id="tab-comparison" class="tab-content ${this.resultTab==='comparison'?'':'hidden'}">${this.renderComparisonView(result)}</div>
          <div id="tab-issues" class="tab-content ${this.resultTab==='issues'?'':'hidden'}">${!result.issues||result.issues.length===0?'<div class="text-center py-10 text-slate-400"><p class="text-sm">未发现问题</p></div>':`<div class="space-y-3">${result.issues.map(i=>this.renderIssue(i)).join('')}</div>`}</div>
          <div id="tab-details" class="tab-content ${this.resultTab==='details'?'':'hidden'}"><div class="bg-slate-50 rounded-lg p-3 text-sm text-slate-700 whitespace-pre-wrap">${result.details||'暂无详细分析'}</div></div>
          <div id="tab-references" class="tab-content ${this.resultTab==='references'?'':'hidden'}">${this.renderReferencesTab(result)}</div>
        </div>
      </div>
    `;
  }

  /** 批量审核结果：折叠面板（手风琴） */
  private renderBatchResults(): string {
    const results = this.batchResults;
    const isStillRunning = this.isReviewing;
    const completedCount = results.length;
    const totalCount = this.batchTotal;
    const avgScore = completedCount > 0 ? Math.round(results.reduce((sum, r) => sum + (r.result?.score || 0), 0) / completedCount) : 0;
    const totalIssues = results.reduce((sum, r) => sum + (r.result?.issues?.length || 0), 0);

    return `
      <div class="h-full flex flex-col">
        <div class="p-4 border-b border-gray-200">
          <div class="flex items-center justify-between mb-2">
            <div class="flex items-center gap-2">
              <div class="w-10 h-10 rounded-xl flex items-center justify-center text-lg" style="background:var(--c-brand-bg);color:var(--c-brand)">📁</div>
              <div>
                <h3 class="font-semibold text-gray-800">批量审核${isStillRunning ? '中' : '完成'}</h3>
                <p class="text-xs text-gray-500">${REVIEW_TYPES[this.reviewType]?.label||''} \xb7 ${completedCount}/${totalCount} 文件</p>
              </div>
            </div>
            <button id="closeResultBtn" class="w-7 h-7 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500">\u2715</button>
          </div>
          <div class="flex items-center gap-3 flex-wrap">
            <div class="flex items-center gap-1.5"><span class="text-xs text-gray-600">平均评分</span><span class="text-lg font-bold ${avgScore>=80?'text-green-600':avgScore>=60?'text-yellow-600':'text-red-600'}">${avgScore}</span></div>
            <div class="flex items-center gap-1.5"><span class="text-xs text-gray-600">总问题数</span><span class="text-sm font-bold text-gray-800">${totalIssues}</span></div>
            ${isStillRunning ? `<div class="flex items-center gap-1.5 text-xs text-blue-600"><div class="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>审核中...</div>` : ''}
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-2">
          ${results.map((r, i) => this.renderBatchItem(r, i)).join('')}
          ${isStillRunning && completedCount < totalCount ? `
            <div class="border border-dashed border-gray-300 rounded-xl p-4 text-center">
              <div class="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              <p class="text-xs text-gray-500">正在审核第 ${completedCount + 1}/${totalCount} 个文件...</p>
            </div>
          ` : ''}
        </div>
      </div>
    `;
  }

  /** 渲染单个批量审核结果项（折叠面板） */
  private renderBatchItem(review: ReviewHistory, index: number): string {
    const result = review.result;
    const isExpanded = this.expandedBatchIndex === index;
    const cm: Record<string,{text:string;icon:string;color:string;bg:string}> = {pass:{text:'通过',icon:'\u2705',color:'text-green-600',bg:'bg-green-50'},fail:{text:'未通过',icon:'\u274c',color:'text-red-600',bg:'bg-red-50'},warning:{text:'需整改',icon:'\u26a0\ufe0f',color:'text-yellow-600',bg:'bg-yellow-50'}};
    const c = result ? (cm[result.conclusion] || cm.warning) : {text:'失败',icon:'\u274c',color:'text-red-600',bg:'bg-red-50'};
    const score = result?.score || 0;
    const issueCount = result?.issues?.length || 0;
    const fileName = review.file_name || '未知文件';

    return `
      <div class="border ${isExpanded ? 'border-blue-300 shadow-md' : 'border-gray-200'} rounded-xl overflow-hidden transition-all">
        <div class="batch-item-header flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 select-none" data-batch-index="${index}">
          <div class="flex items-center gap-2.5 flex-1 min-w-0">
            <div class="w-8 h-8 ${c.bg} rounded-lg flex items-center justify-center text-sm flex-shrink-0">${c.icon}</div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-medium text-gray-900 truncate">${fileName}</span>
                <span class="text-xs px-1.5 py-0.5 rounded ${c.color} ${c.bg} font-medium flex-shrink-0">${c.text}</span>
              </div>
              <div class="flex items-center gap-2 mt-0.5">
                <span class="text-xs text-gray-500">评分 <span class="font-bold ${score>=80?'text-green-600':score>=60?'text-yellow-600':'text-red-600'}">${score}</span></span>
                <span class="text-xs text-gray-400">|</span>
                <span class="text-xs text-gray-500">${issueCount} 个问题</span>
              </div>
            </div>
          </div>
          <div class="flex items-center gap-2 flex-shrink-0 ml-2">
            <button class="download-batch-btn px-2 py-1 text-xs text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded" data-batch-index="${index}" title="下载报告">\ud83d\udce5</button>
            <svg class="w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/></svg>
          </div>
        </div>
        ${isExpanded && result ? `
          <div class="border-t border-gray-100">
            <div class="p-3">${this.renderComparisonView(result)}</div>
          </div>
        ` : ''}
      </div>
    `;
  }

  private renderComparisonView(result: ReviewResult): string {
    const annotated = result.annotatedContent || '';
    const issues = result.issues || [];
    
    if (!annotated && issues.length === 0) {
      return `<div class="text-center py-10 text-slate-400"><p class="text-sm text-slate-400">无审核标注数据</p></div>`;
    }

    // 高亮标注内容（左侧原文标注）—— 使用宽松正则兼容 LLM 输出格式差异
    const highlighted = annotated
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      // 错别字标注：匹配 【🔴错别字...】 中的正确字（引号内的内容）
      .replace(/【🔴错别字[^】]*】/g, (m) => {
        const correct = m.match(/["\u201c\u201d']([^"'\u201c\u201d】]+)["\u201c\u201d']/);
        return `<mark class="bg-red-300 text-red-900 px-1 rounded font-bold border-b-2 border-red-500" title="错别字">🔴 应为"${correct ? correct[1] : '?'}"</mark>`;
      })
      .replace(/【❌过期规范[：:][^】]+】/g, (m) => { const c = m.match(/过期规范[：:](.+)/); return `<mark class="bg-purple-200 text-purple-900 px-1 rounded font-bold border-b-2 border-purple-500">📜 ${c ? c[1].replace(/】$/, '') : m}</mark>`; })
      .replace(/【❌参数不合规[：:][^】]+】/g, (m) => { const c = m.match(/参数不合规[：:](.+)/); return `<mark class="bg-orange-200 text-orange-900 px-1 rounded font-bold border-b-2 border-orange-500">⛔ ${c ? c[1].replace(/】$/, '') : m}</mark>`; })
      .replace(/【❌问题[：:][^】]+】/g, (m) => { const c = m.match(/问题[：:](.+)/); return `<mark class="bg-red-200 text-red-800 px-1 rounded font-medium">❌ ${c ? c[1].replace(/】$/, '') : m}</mark>`; })
      .replace(/【❌格式错误[：:][^】]+】/g, (m) => { const c = m.match(/格式错误[：:](.+)/); return `<mark class="bg-red-200 text-red-800 px-1 rounded font-medium">📐 ${c ? c[1].replace(/】$/, '') : m}</mark>`; })
      .replace(/【⚠️提醒[：:][^】]+】/g, (m) => { const c = m.match(/提醒[：:](.+)/); return `<mark class="bg-yellow-200 text-yellow-800 px-1 rounded font-medium">⚠️ ${c ? c[1].replace(/】$/, '') : m}</mark>`; })
      .replace(/\n/g,'<br/>');

    const typoCount = (annotated.match(/🔴错别字/g) || []).length;
    const outdatedCount = (annotated.match(/过期规范/g) || []).length;
    const nonCompliantCount = (annotated.match(/参数不合规/g) || []).length;
    const errorCount = (annotated.match(/【❌/g) || []).length;
    const warnCount = (annotated.match(/【⚠️/g) || []).length;
    const totalAnnotations = typoCount + errorCount + warnCount + outdatedCount + nonCompliantCount;
    const noAnnotationHint = totalAnnotations === 0 && annotated
      ? `<div class="mb-3 p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
          ⚠️ AI 未在文本中发现需标注的问题。如果文件确实存在问题，请尝试使用"详细审核"模式。
        </div>`
      : '';

    // === 右侧：按分类展示问题列表（参考范文格式） ===
    const categoryConfig: Record<string, {icon: string; title: string; sectionClass: string; headerClass: string; itemBorder: string; itemBg: string}> = {
      format: {icon: '📐', title: '格式错误', sectionClass: 'border-red-200 bg-red-50/30', headerClass: 'text-red-800 bg-red-100', itemBorder: 'border-red-100', itemBg: 'bg-white'},
      typo: {icon: '✏️', title: '错别字与表述错误', sectionClass: 'border-orange-200 bg-orange-50/30', headerClass: 'text-orange-800 bg-orange-100', itemBorder: 'border-orange-100', itemBg: 'bg-white'},
      outdated_standard: {icon: '📜', title: '过期规范引用', sectionClass: 'border-purple-200 bg-purple-50/30', headerClass: 'text-purple-800 bg-purple-100', itemBorder: 'border-purple-100', itemBg: 'bg-white'},
      non_compliant: {icon: '⛔', title: '技术参数不合规', sectionClass: 'border-red-300 bg-red-50/30', headerClass: 'text-red-800 bg-red-100', itemBorder: 'border-red-100', itemBg: 'bg-white'},
      missing: {icon: '❗', title: '内容缺失', sectionClass: 'border-amber-200 bg-amber-50/30', headerClass: 'text-amber-800 bg-amber-100', itemBorder: 'border-amber-100', itemBg: 'bg-white'},
      other: {icon: '⚠️', title: '问题与提醒', sectionClass: 'border-yellow-200 bg-yellow-50/30', headerClass: 'text-yellow-800 bg-yellow-100', itemBorder: 'border-yellow-100', itemBg: 'bg-white'},
    };

    // 智能分类：对缺少 category 或 category 不在已知范围内的 issues，根据内容推断分类
    const inferCategory = (issue: Issue): string => {
      if (issue.category && categoryConfig[issue.category]) return issue.category;
      const t = (issue.title || '').toLowerCase();
      const d = (issue.description || '').toLowerCase();
      // 错别字：title 包含 → 或描述中含"错别字"/"正确内容"
      if (t.includes('→') || t.includes('错别字') || d.includes('错别字') || d.includes('正确内容')) return 'typo';
      // 过期规范：含"过期"/"现行替代"/"实施日期"/规范编号格式
      if (t.includes('过期') || d.includes('过期规范') || d.includes('现行替代') || d.includes('实施日期') || d.includes('实施时间')) return 'outdated_standard';
      // 参数不合规：含"参数"/"不合规"/"正确值"
      if (t.includes('参数不合规') || t.includes('不合规') || d.includes('正确值') || d.includes('参数不合规')) return 'non_compliant';
      // 格式错误：含"格式"/"标点"/"编号"/"上下标"/"排版"
      if (t.includes('格式') || t.includes('标点') || t.includes('编号') || t.includes('上下标') || t.includes('排版') || d.includes('格式错误') || d.includes('格式问题')) return 'format';
      // 内容缺失：含"缺失"/"缺少"/"遗漏"
      if (t.includes('缺失') || t.includes('缺少') || t.includes('遗漏') || d.includes('缺失') || d.includes('缺少')) return 'missing';
      return 'other';
    };

    // 从 annotatedContent 中提取标注，补充 issues 中遗漏的条目
    const allIssues: Issue[] = issues.map(i => ({ ...i, category: inferCategory(i) as Issue['category'] }));
    if (annotated) {
      // 使用宽松正则提取各类标注（兼容 LLM 输出格式差异：冒号全半角、引号全半角、多余空格等）
      // 先用宽泛模式匹配整个标注，再从匹配内容中提取关键信息
      const typoAnnotations = [...annotated.matchAll(/【🔴错别字[^】]*】/g)].map(m => {
        const correct = m[0].match(/["\u201c\u201d']([^"'\u201c\u201d】]+)["\u201c\u201d']/);
        return { index: m.index || 0, match: m[0], correct: correct ? correct[1] : '' };
      }).filter(a => a.correct);
      const outdatedAnnotations = [...annotated.matchAll(/【❌过期规范[：:][^】]+】/g)].map(m => {
        const content = m[0].match(/过期规范[：:](.+)/);
        return { index: m.index || 0, match: m[0], content: content ? content[1].replace(/】$/, '') : '' };
      }).filter(a => a.content);
      const nonCompliantAnnotations = [...annotated.matchAll(/【❌参数不合规[：:][^】]+】/g)].map(m => {
        const content = m[0].match(/参数不合规[：:](.+)/);
        return { index: m.index || 0, match: m[0], content: content ? content[1].replace(/】$/, '') : '' };
      }).filter(a => a.content);
      const formatAnnotations = [...annotated.matchAll(/【❌格式错误[：:][^】]+】/g)].map(m => {
        const content = m[0].match(/格式错误[：:](.+)/);
        return { index: m.index || 0, match: m[0], content: content ? content[1].replace(/】$/, '') : '' };
      }).filter(a => a.content);
      const errorAnnotations = [...annotated.matchAll(/【❌问题[：:][^】]+】/g)].map(m => {
        const content = m[0].match(/问题[：:](.+)/);
        return { index: m.index || 0, match: m[0], content: content ? content[1].replace(/】$/, '') : '' };
      }).filter(a => a.content);
      const warnAnnotations = [...annotated.matchAll(/【⚠️提醒[：:][^】]+】/g)].map(m => {
        const content = m[0].match(/提醒[：:](.+)/);
        return { index: m.index || 0, match: m[0], content: content ? content[1].replace(/】$/, '') : '' };
      }).filter(a => a.content);

      // 备用提取：如果主正则没匹配到错别字，用更简单的方式扫描
      const typoAnnotationsFinal = typoAnnotations.length > 0 ? typoAnnotations :
        [...annotated.matchAll(/🔴错别字[^】]*】/g)].map(m => {
          const correct = m[0].match(/["\u201c\u201d']([^"'\u201c\u201d】]+)["\u201c\u201d']/);
          return { index: m.index || 0, match: m[0], correct: correct ? correct[1] : '' };
        }).filter(a => a.correct);

      console.log('[标注提取] typo:', typoAnnotations.length, '/fallback:', typoAnnotationsFinal.length, 'outdated:', outdatedAnnotations.length, 'nonCompliant:', nonCompliantAnnotations.length, 'format:', formatAnnotations.length, 'error:', errorAnnotations.length, 'warn:', warnAnnotations.length);
      console.log('[标注提取] annotated长度:', annotated.length, '前300字符:', annotated.substring(0, 300));
      console.log('[标注提取] issues原始数量:', issues.length, '推断后typo数量:', allIssues.filter(i => i.category === 'typo').length);
      // 调试：搜索 🔴 字符在 annotatedContent 中的位置和上下文
      let debugIdx = 0;
      let debugCount = 0;
      while (debugIdx < annotated.length && debugCount < 10) {
        const found = annotated.indexOf('🔴', debugIdx);
        if (found === -1) break;
        debugCount++;
        console.log('[标注提取] 🔴位置' + debugCount + ': idx=' + found + ', 上下文="' + annotated.substring(Math.max(0, found - 5), found + 40).replace(/\n/g, '\\n') + '"');
        debugIdx = found + 1;
      }
      // 调试：搜索 "错别字" 关键词
      let debugIdx2 = 0;
      let debugCount2 = 0;
      while (debugIdx2 < annotated.length && debugCount2 < 5) {
        const found = annotated.indexOf('错别字', debugIdx2);
        if (found === -1) break;
        debugCount2++;
        console.log('[标注提取] 错别字位置' + debugCount2 + ': idx=' + found + ', 上下文="' + annotated.substring(Math.max(0, found - 5), found + 50).replace(/\n/g, '\\n') + '"');
        debugIdx2 = found + 1;
      }

      // 构建已有的各类 issue 的标题/描述集合（按推断后的 category）
      const existingTypoTitles = new Set(allIssues.filter(i => i.category === 'typo').map(i => i.title.toLowerCase()));
      const existingOutdatedDescs = new Set(allIssues.filter(i => i.category === 'outdated_standard').map(i => (i.description || '').substring(0, 30).toLowerCase()));
      const existingNonCompliantDescs = new Set(allIssues.filter(i => i.category === 'non_compliant').map(i => (i.description || '').substring(0, 30).toLowerCase()));
      const existingFormatDescs = new Set(allIssues.filter(i => i.category === 'format').map(i => (i.description || '').substring(0, 30).toLowerCase()));
      const existingOtherDescs = new Set(allIssues.filter(i => i.category === 'other').map(i => (i.description || '').substring(0, 30).toLowerCase()));

      // 匹配检查：仅在同类 issue 中匹配，避免跨类误匹配
      const hasTypoMatch = (correctChar: string): boolean => {
        if (correctChar.length < 2) return false;
        const lower = correctChar.toLowerCase();
        for (const t of existingTypoTitles) { if (t.includes(lower)) return true; }
        return false;
      };
      const hasCategoryMatch = (desc: string, existingSet: Set<string>): boolean => {
        if (desc.length < 2) return false;
        const prefix = desc.substring(0, Math.min(desc.length, 20)).toLowerCase();
        for (const e of existingSet) { if (e && e.includes(prefix)) return true; }
        return false;
      };

      // 找到标注附近的页码标记（搜索范围2000字符）
      const findNearbyPage = (index: number): string => {
        const before = annotated.substring(Math.max(0, index - 2000), index);
        const pageMatches = [...before.matchAll(/【第(\d+)页】/g)];
        if (pageMatches.length > 0) {
          const lastMatch = pageMatches[pageMatches.length - 1];
          return `第${lastMatch[1]}页`;
        }
        return '';
      };

      // 补充遗漏的错别字（使用最终提取结果）
      for (const m of typoAnnotationsFinal) {
        if (hasTypoMatch(m.correct)) continue;
        const idx = m.index || 0;
        const before = annotated.substring(Math.max(0, idx - 30), idx);
        const charMatch = before.match(/([^\s【】]{1,10})$/);
        const wrongChar = charMatch ? charMatch[1] : '错别字';
        allIssues.push({ level: 'low', category: 'typo', title: `${wrongChar}→${m.correct}`, description: `错误内容："${wrongChar}"，正确内容："${m.correct}"`, location: findNearbyPage(idx), suggestion: `将"${wrongChar}"改为"${m.correct}"` });
      }
      // 补充遗漏的过期规范
      for (const m of outdatedAnnotations) {
        if (hasCategoryMatch(m.content, existingOutdatedDescs)) continue;
        const idx = m.index || 0;
        allIssues.push({ level: 'high', category: 'outdated_standard', title: '过期规范', description: m.content, location: findNearbyPage(idx), suggestion: '更新为现行规范版本' });
      }
      // 补充遗漏的参数不合规
      for (const m of nonCompliantAnnotations) {
        if (hasCategoryMatch(m.content, existingNonCompliantDescs)) continue;
        const idx = m.index || 0;
        allIssues.push({ level: 'high', category: 'non_compliant', title: '参数不合规', description: m.content, location: findNearbyPage(idx), suggestion: '按现行标准修正参数' });
      }
      // 补充遗漏的格式错误
      for (const m of formatAnnotations) {
        if (hasCategoryMatch(m.content, existingFormatDescs)) continue;
        const idx = m.index || 0;
        allIssues.push({ level: 'medium', category: 'format', title: '格式错误', description: m.content, location: findNearbyPage(idx), suggestion: '按规范修正格式' });
      }
      // 补充遗漏的问题标注
      for (const m of errorAnnotations) {
        if (hasCategoryMatch(m.content, existingOtherDescs)) continue;
        const idx = m.index || 0;
        allIssues.push({ level: 'high', category: 'other', title: m.content.substring(0, 30), description: m.content, location: findNearbyPage(idx), suggestion: '请核实并修正' });
      }
      // 补充遗漏的提醒标注
      for (const m of warnAnnotations) {
        if (hasCategoryMatch(m.content, existingOtherDescs)) continue;
        const idx = m.index || 0;
        allIssues.push({ level: 'low', category: 'other', title: '提醒', description: m.content, location: findNearbyPage(idx), suggestion: '请关注此提醒' });
      }

      // 为 LLM issues 中缺少 location 的条目，从 annotatedContent 中根据关键词查找页码
      for (const issue of allIssues) {
        if (issue.location) continue;
        const cleanTitle = issue.title.replace(/^\[.*?\]\s*/, '');
        const keywords = [cleanTitle];
        if (issue.category === 'outdated_standard' || cleanTitle.includes('过期规范')) {
          const codeMatch = (issue.description || '').match(/[A-Z]{1,3}\/T?\s*\d+-\d{4}/);
          if (codeMatch) keywords.push(codeMatch[0]);
        }
        for (const kw of keywords) {
          if (!kw || kw.length < 2) continue;
          const searchIdx = annotated.indexOf(kw);
          if (searchIdx >= 0) {
            issue.location = findNearbyPage(searchIdx);
            if (issue.location) break;
          }
        }
      }
    }

    // 按类别分组（使用合并后的 allIssues，所有 issue 都已推断 category）
    const categorizedIssues: Record<string, Issue[]> = {};
    for (const issue of allIssues) {
      const cat = issue.category || 'other';
      if (!categorizedIssues[cat]) categorizedIssues[cat] = [];
      categorizedIssues[cat].push(issue);
    }

    // 渲染单个问题条目（参考范文格式：页码+位置+描述+正确内容）
    const renderIssueItem = (issue: Issue): string => {
      const cc = categoryConfig[issue.category || 'other'] || categoryConfig.other;
      const location = issue.location ? `<span class="inline-flex items-center gap-0.5 text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded font-medium text-xs whitespace-nowrap">📄${issue.location}</span>` : '';
      let titleHtml = `<span class="font-medium text-gray-900">${issue.title}</span>`;
      
      // 根据 category 渲染不同格式的 description
      let descHtml = '';
      if (issue.description) {
        const d = issue.description;
        let formatted = false;
        
        // 过期规范：包含"现行替代"关键字
        if (issue.category === 'outdated_standard') {
          const m1 = d.match(/现行替代(?:规范)?[为：:\s]*([^，,]+)/);
          const m2 = d.match(/实施(?:时间|日期)[：:\s]*(\S+)/);
          if (m1) {
            descHtml = `<div class="flex flex-col gap-0.5 mt-1 ml-4 text-xs"><span class="text-purple-700">✅ 现行替代：${m1[1]}${m2 ? '（实施：' + m2[1] + '）' : ''}</span></div>`;
            formatted = true;
          }
        }
        
        // 参数不合规：包含"正确值"关键字
        if (!formatted && issue.category === 'non_compliant') {
          const m1 = d.match(/依据([^，,]+?)[，,]\s*([^，,]+?)正确值[为：:\s]*(.+)/);
          const m2 = d.match(/正确值[为：:\s]*(.+)/);
          if (m1) {
            descHtml = `<div class="flex flex-col gap-0.5 mt-1 ml-4 text-xs"><span class="text-gray-500">📋 依据：${m1[1]}</span><span class="text-green-700">✅ 正确值：${m1[3]}</span></div>`;
            formatted = true;
          } else if (m2) {
            descHtml = `<div class="mt-1 ml-4 text-xs text-green-700">✅ 正确值：${m2[1]}</div>`;
            formatted = true;
          }
        }
        
        // 错别字：title 包含 →
        if (!formatted && issue.category === 'typo' && issue.title.includes('→')) {
          const parts = issue.title.split('→');
          if (parts.length === 2) {
            descHtml = `<div class="flex items-center gap-2 mt-1 ml-4 text-xs"><span class="text-red-600 bg-red-50 px-1.5 py-0.5 rounded">❌ ${parts[0].replace('错别字：','')}</span><span class="text-gray-400">→</span><span class="text-green-700 bg-green-50 px-1.5 py-0.5 rounded">✅ ${parts[1]}</span></div>`;
            formatted = true;
          }
        }

        // 通用格式：尝试提取"错误/正确"对
        if (!formatted) {
          const errMatch = d.match(/错误[内容]?(?:位置)?[：:]\s*([^，,；;]+)/);
          const corMatch = d.match(/正确[内容]?[：:]\s*([^，,；;]+)/);
          if (errMatch && corMatch) {
            descHtml = `<div class="flex flex-col gap-0.5 mt-1 ml-4 text-xs"><span class="text-red-600">❌ ${errMatch[1]}</span><span class="text-green-700">✅ ${corMatch[1]}</span></div>`;
            formatted = true;
          }
        }
        
        // 兜底：直接显示 description
        if (!formatted) {
          descHtml = `<p class="text-gray-600 mt-0.5 ml-4 text-xs leading-relaxed">${d}</p>`;
        }
      }

      return `<div class="border ${cc.itemBorder} rounded-lg p-2 ${cc.itemBg} hover:shadow-sm transition-shadow">
        <div class="flex items-start gap-1.5 flex-wrap">
          ${location}
          ${titleHtml}
        </div>
        ${descHtml}
        ${issue.suggestion ? `<p class="text-xs text-blue-600 mt-1 ml-4">💡 ${issue.suggestion}</p>` : ''}
      </div>`;
    };

    // 按分类渲染问题 - 构建按钮Tab切换界面
    const categoryOrder = ['format', 'typo', 'outdated_standard', 'non_compliant', 'missing', 'other'];
    // 生成分类按钮和内容面板
    const tabs: Array<{key: string; label: string; icon: string; count: number; color: string; activeColor: string; borderColor: string}> = [];
    // 第一个按钮："全部"
    tabs.push({key: 'all', label: '全部', icon: '📋', count: allIssues.length, color: 'text-gray-600 bg-gray-100', activeColor: 'text-white bg-gray-800', borderColor: 'border-gray-300'});
    for (const cat of categoryOrder) {
      const count = categorizedIssues[cat]?.length || 0;
      if (count === 0) continue;
      const cc = categoryConfig[cat];
      tabs.push({key: cat, label: cc.title, icon: cc.icon, count, color: 'text-gray-600 bg-gray-100', activeColor: `text-white ${cc.headerClass}`, borderColor: cc.sectionClass});
    }

    // 渲染每个分类的内容
    const renderCategoryBlock = (cat: string): string => {
      const catIssues = categorizedIssues[cat];
      if (!catIssues || catIssues.length === 0) return '';
      const cc = categoryConfig[cat];
      return `
        <div class="border ${cc.sectionClass} rounded-xl overflow-hidden mb-3">
          <div class="px-3 py-2 ${cc.headerClass} font-semibold text-sm flex items-center gap-2">
            <span>${cc.icon}</span><span>${cc.title}</span><span class="opacity-70">(${catIssues.length})</span>
          </div>
          <div class="p-2.5 space-y-1.5">
            ${catIssues.map(i => renderIssueItem(i)).join('')}
          </div>
        </div>`;
    };

    // 生成所有分类内容（全部 tab 显示所有，单分类 tab 只显示对应分类）
    let rightPanelHtml = '';
    if (allIssues.length === 0 && annotated) {
      rightPanelHtml = `<div class="text-center py-8 text-slate-400"><p class="text-sm font-medium text-slate-600">未发现明显问题</p><p class="text-xs mt-1">建议使用"详细审核"模式进行更深入检查</p></div>`;
    } else {
      rightPanelHtml += `<div class="flex items-center gap-1.5 flex-wrap mb-3">
        ${tabs.map((tab, idx) => `<button class="review-cat-btn text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all border ${idx === 0 ? tab.activeColor + ' border-transparent shadow-sm' : tab.color + ' hover:bg-gray-200 border-gray-200'}" data-cat="${tab.key}">${tab.icon} ${tab.label} <span class="opacity-70">(${tab.count})</span></button>`).join('')}
      </div>`;

      // 为每个 tab key 生成对应的内容区
      for (const tab of tabs) {
        const isHidden = tab.key !== 'all' ? 'hidden' : '';
        let content = '';
        if (tab.key === 'all') {
          // 全部：按分类顺序显示所有分类
          for (const cat of categoryOrder) {
            content += renderCategoryBlock(cat);
          }
        } else {
          content = renderCategoryBlock(tab.key);
        }
        rightPanelHtml += `<div class="review-cat-panel ${isHidden}" data-cat="${tab.key}">${content}</div>`;
      }
    }

    return `
      ${noAnnotationHint}
      <div class="mb-3 flex items-center gap-3 flex-wrap">
        <span class="text-xs font-medium text-gray-700">标注说明：</span>
        <span class="text-xs flex items-center gap-1"><span class="w-2.5 h-2.5 bg-red-300 rounded inline-block border border-red-500"></span> 错别字 (${typoCount})</span>
        <span class="text-xs flex items-center gap-1"><span class="w-2.5 h-2.5 bg-purple-200 rounded inline-block border border-purple-500"></span> 过期规范 (${outdatedCount})</span>
        <span class="text-xs flex items-center gap-1"><span class="w-2.5 h-2.5 bg-orange-200 rounded inline-block border border-orange-500"></span> 参数不合规 (${nonCompliantCount})</span>
        <span class="text-xs flex items-center gap-1"><span class="w-2.5 h-2.5 bg-red-200 rounded inline-block"></span> 错误/问题 (${errorCount})</span>
        <span class="text-xs flex items-center gap-1"><span class="w-2.5 h-2.5 bg-yellow-200 rounded inline-block"></span> 提醒 (${warnCount})</span>
      </div>
      <div class="grid grid-cols-5 gap-3">
        <div class="col-span-3">
          <div class="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">原文标注</div>
          <div class="rounded-lg p-3 text-xs text-slate-700 leading-relaxed max-h-[500px] overflow-y-auto font-mono whitespace-pre-wrap break-all" style="background:#f8fafc;border:1px solid #e2e8f0">${highlighted || '<span class="text-gray-400">无标注内容</span>'}</div>
        </div>
        <div class="col-span-2">
          <div class="text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1">审查结果</div>
          <div class="space-y-2.5 max-h-[500px] overflow-y-auto">
            ${rightPanelHtml}
          </div>
        </div>
      </div>
    `;
  }

    private renderKnowledgeSourceBadges(): string {
    if (!this.reviewMeta) return '';
    const badges: string[] = [];
    if (this.reviewMeta.knowledgeUsed) badges.push(`<span class="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">📚 ${this.reviewMeta.knowledgeChunks||0}条</span>`);
    if (this.reviewMeta.webSearchUsed) badges.push(`<span class="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">🌐 ${this.reviewMeta.webSearchResults||0}条</span>`);
    if (badges.length === 0) badges.push(`<span class="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">仅AI</span>`);
    return badges.join('');
  }

  private renderReferencesTab(result: ReviewResult): string {
    const refs = result.references || [];
    const ki = this.reviewMeta?.knowledgeUsed ? `<div class="flex items-center gap-2 p-2.5 bg-blue-50 rounded-lg mb-2"><span class="text-lg">📚</span><div><div class="text-xs font-medium text-blue-700">知识库已检索</div><div class="text-xs text-blue-600">${this.reviewMeta?.knowledgeChunks||0}条 · ${(this.reviewMeta?.knowledgeDatasets||[]).join(', ')}</div></div></div>` : '';
    const wi = this.reviewMeta?.webSearchUsed ? `<div class="flex items-center gap-2 p-2.5 bg-purple-50 rounded-lg mb-2"><span class="text-lg">🌐</span><div><div class="text-xs font-medium text-purple-700">联网搜索已启用</div><div class="text-xs text-purple-600">${this.reviewMeta?.webSearchResults||0}条</div></div></div>` : '';
    const rl = refs.length > 0 ? `<div class="space-y-2 mt-2">${refs.map(r=>`<div class="border rounded-lg p-2.5 ${r.source==='knowledge'?'bg-blue-50 border-blue-200':'bg-purple-50 border-purple-200'}"><div class="flex items-center gap-1.5 mb-1"><span class="text-xs px-1.5 py-0.5 rounded-full ${r.source==='knowledge'?'bg-blue-200 text-blue-700':'bg-purple-200 text-purple-700'}">${r.source==='knowledge'?'📚':'🌐'}</span><span class="text-xs font-medium">${r.title}</span></div><p class="text-xs text-gray-600">${r.snippet}</p></div>`).join('')}</div>` : '';
    return `${ki}${wi}${rl}`;
  }

  private renderIssue(issue: Issue): string {
    const lm: Record<string,{text:string;color:string;bg:string}> = {high:{text:'严重',color:'text-red-600',bg:'bg-red-50 border-red-200'},medium:{text:'中等',color:'text-yellow-600',bg:'bg-yellow-50 border-yellow-200'},low:{text:'轻微',color:'text-blue-600',bg:'bg-blue-50 border-blue-200'}};
    const l = lm[issue.level]||lm.medium;
    const categoryLabels: Record<string,string> = {format:'📐格式',typo:'✏️错别字',outdated_standard:'📜过期规范',non_compliant:'⛔不合规',missing:'❗缺失',other:'⚠️其他'};
    const catBadge = issue.category ? `<span class="px-1.5 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600 ml-1">${categoryLabels[issue.category]||issue.category}</span>` : '';
    return `<div class="border rounded-lg p-3 ${l.bg}"><div class="flex items-center gap-1.5 mb-2"><span class="px-1.5 py-0.5 text-xs font-medium rounded ${l.color} bg-white">${l.text}</span><h4 class="text-sm font-medium text-gray-900">${issue.title}</h4>${catBadge}</div><p class="text-xs text-gray-600 mb-2">${issue.description}</p>${issue.location?`<p class="text-xs text-gray-500 mb-1">📍 ${issue.location}</p>`:''}<div class="flex items-start gap-1.5 text-xs"><span class="text-blue-600">💡</span><span class="text-gray-600">${issue.suggestion}</span></div></div>`;
  }

  // ==================== 知识库 Tab ====================
  private renderKnowledgeTab(): string {
    return `
      <div class="space-y-4">
        <div class="rounded-xl p-5 text-white" style="background:var(--c-brand)">
          <div class="flex items-center gap-3 mb-2">
            <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">📚</div>
            <div><h2 class="text-lg font-bold">知识库管理</h2><p class="text-indigo-200 text-xs">按模块上传标准文件，审核时自动检索匹配</p></div>
          </div>
          <div class="text-xs text-indigo-200 mt-2 flex items-center gap-1">仅管理员可见和操作</div>
        </div>
        <div class="grid-layout">
          <!-- 左侧：知识库文件上传 -->
          <div class="space-y-5">
            <div class="card">
              <h3 class="text-sm font-semibold text-slate-900 mb-3">添加知识到指定模块</h3>
              <div class="mb-3">
                <label class="text-xs font-medium text-gray-700 mb-1.5 block">目标模块</label>
                <div class="grid grid-cols-2 gap-1.5">
                  ${Object.entries(REVIEW_TYPES).filter(([k])=>k!=='comprehensive').map(([key,config])=>`
                    <button class="knowledge-target-btn p-2 rounded-lg border text-left transition-all text-xs ${this.knowledgeEntries.length>0&&this.knowledgeEntries[this.knowledgeEntries.length-1].targetReviewType===key?'border-blue-500 bg-blue-50 ring-2 ring-blue-200':'border-gray-200 hover:border-gray-300'}" data-target="${key}">
                      <div class="flex items-center gap-1"><span>${config.icon}</span><span class="font-medium">${config.label}</span></div>
                    </button>
                  `).join('')}
                </div>
              </div>
              <div class="mb-3">
                <div class="flex gap-1.5">
                  <button class="knowledge-type-btn flex-1 p-2 rounded-lg border text-center transition-all border-blue-500 bg-blue-50 ring-2 ring-blue-200 text-xs" data-ktype="text">📝 文本</button>
                  <button class="knowledge-type-btn flex-1 p-2 rounded-lg border text-center transition-all border-gray-200 hover:border-gray-300 text-xs" data-ktype="url">🔗 链接</button>
                  <button class="knowledge-type-btn flex-1 p-2 rounded-lg border text-center transition-all border-gray-200 hover:border-gray-300 text-xs" data-ktype="file">📁 文件</button>
                </div>
              </div>
              <div class="mb-3"><input type="text" id="knowledgeTitle" class="input" placeholder="标题" /></div>
              <div id="knowledgeTextInput" class="mb-3"><textarea id="knowledgeContent" rows="4" class="input text-xs resize-none" placeholder="粘贴内容..."></textarea></div>
              <div id="knowledgeUrlInput" class="mb-3 hidden"><input type="url" id="knowledgeUrl" class="input text-xs" placeholder="https://..." /></div>
              <div id="knowledgeFileInput" class="mb-3 hidden">
                <div class="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center hover:border-blue-400 transition-colors cursor-pointer" id="knowledgeFileDropZone">
                  <div class="text-2xl mb-1">📁</div>
                  <p class="text-xs text-gray-500">拖拽文件到此处或点击选择</p>
                  <p class="text-xs text-gray-400 mt-1">支持 PDF、Word、TXT</p>
                  <input type="file" id="knowledgeFileInput_file" class="hidden" accept=".pdf,.docx,.doc,.txt,.text" />
                </div>
                <div id="knowledgeFileInfo" class="hidden mt-2 p-2 bg-green-50 rounded-lg flex items-center gap-2">
                  <span class="text-green-600 text-sm">✅</span>
                  <span id="knowledgeFileName" class="text-xs text-green-700 flex-1 truncate"></span>
                  <button id="knowledgeFileClear" class="text-xs text-gray-400 hover:text-red-500">✕</button>
                </div>
              </div>
              <button id="addKnowledgeBtn" class="btn btn-primary w-full" style="background:var(--c-success)">添加</button>
            </div>
            ${this.knowledgeEntries.length>0?`
              <div class="card">
                <div class="flex items-center justify-between mb-3"><h3 class="text-sm font-semibold text-slate-900">待导入 ${this.knowledgeEntries.length} 条</h3></div>
                <div class="space-y-1.5 mb-3 max-h-40 overflow-y-auto">${this.knowledgeEntries.map(e=>{const tc=REVIEW_TYPES[e.targetReviewType];const ct=COMPANY_TYPES[e.companyType];const ctLabel=e.companyType==='public'?'📚公共':ct?`${ct.icon}${ct.label}`:'📚公共';return `<div class="flex items-center gap-1.5 p-1.5 bg-gray-50 rounded"><span class="text-xs">${tc?.icon||'📝'}</span><div class="flex-1 min-w-0"><div class="text-xs font-medium text-gray-900 truncate">${e.title}</div><div class="flex items-center gap-1"><span class="text-xs text-blue-600">${tc?.datasetName||''}</span><span class="text-[10px] px-1 py-0.5 rounded bg-slate-200 text-slate-600">${ctLabel}</span></div></div><button class="remove-knowledge text-xs text-gray-400 hover:text-red-500" data-kremove="${e.id}">✕</button></div>`;}).join('')}</div>
                <button id="importKnowledgeBtn" class="btn btn-primary w-full">按模块分类导入</button>
              </div>
            `:''}
            <div class="card">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-gray-900">📚 已入库文件</h3>
                <div class="flex items-center gap-2">
                  <button id="autoUpdateStandardsBtn" class="btn btn-sm text-white" style="background:var(--c-success);border:none" title="自动下载并补齐国家法律法规+强制性GB标准+行业强制标准">补齐标准</button>
                  <button id="refreshKnowledgeFilesBtn" class="text-xs hover:underline" style="color:var(--c-brand)">🔄</button>
                </div>
              </div>
              <p class="text-xs text-gray-400 mb-2">按国家法律法规 + 强制性国标(GB) + 行业标准自动补齐</p>
              <div id="autoUpdateResult" class="hidden mb-2"></div>
              <div id="knowledgeFileList" class="space-y-1.5 max-h-60 overflow-y-auto"><p class="text-xs text-gray-400 text-center py-3">加载中...</p></div>
            </div>
          </div>
          <!-- 右侧：审核依据配置 + 搜索测试 -->
          <div class="space-y-5">
            <div class="card">
              <div class="flex items-center gap-2 mb-3"><span class="text-sm">🎯</span><h3 class="text-sm font-semibold text-gray-900">审核依据配置</h3><span class="text-xs text-gray-400">— 按模块设定审核约束</span></div>
              <p class="text-xs text-gray-500 mb-3">为每个模块配置审核方式：<b>智能</b>自动检索知识库，不足时联网搜索；<b>文字约束</b>即PROMPT，优先检查约束内容，再检索知识库，最后联网搜索。</p>
              <div class="space-y-3">
                ${Object.entries(REVIEW_TYPES).filter(([k])=>k!=='comprehensive').map(([key,config])=>{
                  const mc = this.moduleConstraints[key] || { mode: 'none' as const };
                  return `
                  <div class="border rounded-lg p-2.5">
                    <div class="flex items-center gap-1.5 mb-2"><span>${config.icon}</span><span class="text-xs font-medium">${config.label}</span>
                      ${mc.mode === 'rules' ? `<span class="text-xs px-1.5 py-0.5 rounded bg-amber-50 text-amber-600">📝 文字约束</span>` : `<span class="text-xs text-green-600">🧠 智能检索</span>`}
                    </div>
                    <div class="flex gap-1 mb-1.5">
                      <button class="mc-mode-btn px-2 py-1 rounded text-xs border transition-all ${mc.mode==='smart'||mc.mode==='none'?'border-green-400 bg-green-50 text-green-700':'border-gray-200 text-gray-400 hover:border-gray-300'}" data-mcmodule="${key}" data-mcmode="smart">🧠 智能</button>
                      
                      <button class="mc-mode-btn px-2 py-1 rounded text-xs border transition-all ${mc.mode==='rules'?'border-amber-400 bg-amber-50 text-amber-600':'border-gray-200 text-gray-400 hover:border-gray-300'}" data-mcmodule="${key}" data-mcmode="rules">📝 文字约束</button>
                    </div>
                    ${mc.mode==='smart'?`
                      <div class="text-xs text-green-600 bg-green-50 rounded p-1.5 flex items-center gap-1.5"><span>🧠</span><span>自动检索知识库，知识库不足时联网搜索补全</span></div>
                    `:''}
                    
                    ${mc.mode==='rules'?`
                      <div class="mc-rules-zone" data-mcmodule="${key}">
                        <textarea class="w-full border border-amber-200 rounded-lg p-1.5 text-xs text-gray-700 resize-none focus:ring-1 focus:ring-amber-300 focus:border-amber-400 mc-rules-input" data-mcmodule="${key}" rows="2" placeholder="输入约束条件，如：&#10;- 正文仿宋GB2312三号字&#10;- 页边距上下2.54cm">${mc.rules||''}</textarea>
                      </div>
                    `:''}
                  </div>`;
                }).join('')}
              </div>
            </div>
            <div class="card">
              <h3 class="text-sm font-semibold text-gray-900 mb-3">🔎 搜索测试</h3>
              <div class="mb-2"><select id="searchTestModule" class="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs"><option value="">全部模块</option>${Object.entries(REVIEW_TYPES).map(([key,config])=>`<option value="${key}">${config.icon} ${config.label}</option>`).join('')}</select></div>
              <div class="flex gap-1.5 mb-3"><input type="text" id="searchTestInput" class="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs" placeholder="关键词" /><button id="searchKnowledgeTestBtn" class="px-2 py-1.5 bg-blue-600 text-white rounded-lg text-xs">知识库</button><button id="searchWebTestBtn" class="px-2 py-1.5 bg-purple-600 text-white rounded-lg text-xs">联网</button></div>
              <div id="searchTestResult" class="hidden bg-gray-50 rounded-lg p-3 text-xs text-gray-700 whitespace-pre-wrap max-h-40 overflow-y-auto"></div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  // ==================== Admin 管理 Tab ====================
  private renderAdminTab(): string {
    return `
      <div class="space-y-4">
        <div class="rounded-xl p-5 text-white" style="background:#991b1b">
          <div class="flex items-center gap-3">
            <div class="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">👥</div>
            <div><h2 class="text-lg font-bold">账号管理</h2><p class="text-red-200 text-xs">管理员专属：创建、修改、删除用户账号</p></div>
          </div>
        </div>
        <div id="dbStatsCard" class="card">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2"><span class="text-sm">💾</span><h3 class="text-sm font-semibold text-gray-900">数据库存储</h3></div>
            <button id="refreshDbStatsBtn" class="text-xs hover:underline" style="color:var(--c-brand) transition-colors">🔄 刷新</button>
          </div>
          <div id="dbStatsContent" class="text-xs text-gray-500">加载中...</div>
        </div>
        <div class="card">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-2"><span class="text-sm">📊</span><h3 class="text-sm font-semibold text-gray-900">用户使用记录</h3><span class="text-xs text-gray-400">共 ${this.usageLogsTotal} 次审核</span></div>
            <button id="refreshUsageLogsBtn" class="text-xs hover:underline" style="color:var(--c-brand) transition-colors">🔄 刷新</button>
          </div>
          <p class="text-xs text-gray-400 mb-3">仅记录文件名与审核信息，不上传存储文件内容</p>
          <div id="usageLogsContent" class="space-y-2 max-h-[400px] overflow-y-auto">${this.usageLogs.length === 0 ? '<p class="text-xs text-gray-400 py-4 text-center">加载中...</p>' : ''}</div>
        </div>
        <div class="grid-layout">
          <div class="space-y-5">
            <div class="card">
              <h3 class="text-sm font-semibold text-gray-900 mb-3">➕ 创建新账号</h3>
              <div class="mb-2"><label class="text-xs text-gray-600 mb-1 block">用户名</label><input type="text" id="newUsername" class="input text-xs" placeholder="输入用户名" /></div>
              <div class="mb-2"><label class="text-xs text-gray-600 mb-1 block">密码</label><input type="text" id="newPassword" class="input text-xs" placeholder="输入密码（默认123456）" /></div>
              <div class="mb-2"><label class="text-xs text-gray-600 mb-1 block">显示名</label><input type="text" id="newDisplayName" class="input text-xs" placeholder="显示名称" /></div>
              <div class="mb-3"><label class="text-xs text-gray-600 mb-1 block">角色</label><select id="newRole" class="input text-xs"><option value="user">普通用户</option><option value="admin">管理员</option></select></div>
              <button id="createUserBtn" class="btn btn-primary w-full">创建账号</button>
            </div>
            <div class="card">
              <h3 class="text-sm font-semibold text-gray-900 mb-3">🔑 修改我的密码</h3>
              <div class="mb-2"><input type="password" id="oldPassword" class="input text-xs" placeholder="原密码" /></div>
              <div class="mb-2"><input type="password" id="newMyPassword" class="input text-xs" placeholder="新密码" /></div>
              <button id="changeMyPasswordBtn" class="btn btn-primary w-full">修改密码</button>
            </div>
          </div>
          <div class="card">
            <h3 class="text-sm font-semibold text-gray-900 mb-3">📋 用户列表 (${this.managedUsers.length})</h3>
            <div class="space-y-2 max-h-[500px] overflow-y-auto">
              ${this.managedUsers.map(u => `
                <div class="flex items-center gap-2 p-2.5 rounded-lg border border-gray-100 hover:bg-gray-50">
                  <div class="w-8 h-8 ${u.role==='admin'?'bg-red-100 text-red-600':'bg-blue-100 text-blue-600'} rounded-full flex items-center justify-center text-xs font-bold">${(u.display_name||u.username).charAt(0)}</div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900">${u.display_name||u.username}</div>
                    <div class="text-xs text-gray-500">@${u.username} · ${u.role==='admin'?'管理员':'普通用户'}</div>
                  </div>
                  <div class="flex items-center gap-1">
                    <button class="edit-user-btn px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100" data-uid="${u.id}" data-uname="${u.username}" data-dname="${u.display_name||''}" data-urole="${u.role}">编辑</button>
                    ${u.role!=='admin'||this.managedUsers.filter(x=>x.role==='admin').length>1?`<button class="delete-user-btn px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100" data-uid="${u.id}" data-uname="${u.username}">删除</button>`:''}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private renderLoadingOverlay(): string {
    const tc = REVIEW_TYPES[this.reviewType];
    const ct = COMPANY_TYPES[this.companyType];
    const mc = this.moduleConstraints[this.reviewType];
    const hasRules = mc?.mode === 'rules' && mc.rules?.trim();
    return `<div class="fixed inset-0 bg-black/40 flex items-center justify-center z-50"><div class="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-xl"><div class="w-12 h-12 border-4 rounded-full animate-spin mx-auto mb-4" style="border-color:#dbeafe;border-top-color:var(--c-brand)"></div><h3 class="font-semibold text-slate-900 mb-2">AI 智能审核中</h3><p id="loadingStatusText" class="text-sm font-medium mb-3" style="color:var(--c-brand)">正在准备审核...</p><div class="space-y-1 text-sm text-slate-500 mb-4">${hasRules?'<div>检查文字约束</div>':''}<div>检索公共知识库「${tc?.datasetName||'知识库'}」</div>${ct?`<div>检索${ct.label}私有知识库</div>`:''}<div>联网搜索补全（如需）</div><div>AI 分段对比标注</div></div><p class="text-xs text-slate-400 mb-2">长文档将自动分段审核，全文无遗漏</p><div class="w-full rounded-full h-1.5 bg-slate-100"><div class="h-1.5 rounded-full animate-pulse" style="width:60%;background:var(--c-brand)"></div></div></div></div>`;
  }

  private renderPreviewLoadingOverlay(): string {
    return `<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><div class="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 text-center"><div class="w-14 h-14 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mx-auto mb-5"></div><h3 class="font-semibold text-gray-900 mb-2">👁 文件预览解析中</h3><p id="loadingStatusText" class="text-sm text-green-600 font-medium mb-3">正在提取文本...</p><p class="text-xs text-gray-400">此操作不消耗 Token</p></div></div>`;
  }

  private renderImportingOverlay(): string {
    return `<div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50"><div class="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 text-center"><div class="w-14 h-14 border-4 border-green-200 border-t-green-600 rounded-full animate-spin mx-auto mb-5"></div><h3 class="font-semibold text-gray-900 mb-2">正在按模块导入</h3><p class="text-sm text-gray-500">文档分类向量化入库中...</p></div></div>`;
  }

  // ==================== 事件绑定 ====================
  private attachEventListeners() {
    // 登录
    document.getElementById('loginBtn')?.addEventListener('click', () => {
      const u = (document.getElementById('loginUsername') as HTMLInputElement)?.value;
      const p = (document.getElementById('loginPassword') as HTMLInputElement)?.value;
      this.login(u, p);
    });
    document.getElementById('guestLoginBtn')?.addEventListener('click', () => { this.login('', ''); });
    document.getElementById('showRegisterBtn')?.addEventListener('click', () => { this.showRegister = true; this.render(); });
    document.getElementById('backToLoginBtn')?.addEventListener('click', () => { this.showRegister = false; this.render(); });
    // 登录页回车
    ['loginUsername','loginPassword'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { const u = (document.getElementById('loginUsername') as HTMLInputElement)?.value; const p = (document.getElementById('loginPassword') as HTMLInputElement)?.value; this.login(u, p); } });
    });

    // 注册
    document.getElementById('registerBtn')?.addEventListener('click', () => {
      const u = (document.getElementById('regUsername') as HTMLInputElement)?.value.trim();
      const p = (document.getElementById('regPassword') as HTMLInputElement)?.value;
      const pc = (document.getElementById('regPasswordConfirm') as HTMLInputElement)?.value;
      const dn = (document.getElementById('regDisplayName') as HTMLInputElement)?.value.trim();
      const ct = (document.getElementById('regCompanyType') as HTMLSelectElement)?.value;
      if (!u) { alert('请输入用户名'); return; }
      if (!p) { alert('请输入密码'); return; }
      if (p !== pc) { alert('两次输入的密码不一致'); return; }
      if (!ct) { alert('请选择所属单位'); return; }
      this.companyType = ct;
      this.register(u, p, dn);
    });
    // 注册页回车
    ['regUsername','regPassword','regPasswordConfirm','regDisplayName','regCompanyType'].forEach(id => {
      document.getElementById(id)?.addEventListener('keydown', (e) => { if ((e as KeyboardEvent).key === 'Enter') { (document.getElementById('registerBtn') as HTMLElement)?.click(); } });
    });

    // 登出
    document.getElementById('logoutBtn')?.addEventListener('click', () => this.logout());

    // Tab
    document.querySelectorAll('.main-tab-btn').forEach(btn => btn.addEventListener('click', e => { const tab = (e.currentTarget as HTMLElement).dataset.tab as TabView; if (tab) this.setActiveTab(tab); }));
    document.querySelectorAll('.role-btn').forEach(btn => btn.addEventListener('click', e => { const role = (e.currentTarget as HTMLElement).dataset.role as Role; if (role) this.setRole(role); }));
    document.querySelectorAll('.company-type-btn').forEach(btn => btn.addEventListener('click', e => { const ct = (e.currentTarget as HTMLElement).dataset.company as string; if (ct) this.updateCompanyType(ct); }));

    // 上传
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput') as HTMLInputElement;
    if (uploadArea && fileInput) {
      uploadArea.addEventListener('click', () => fileInput.click());
      uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.classList.add('border-blue-400','bg-blue-50/50'); });
      uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('border-blue-400','bg-blue-50/50'));
      uploadArea.addEventListener('drop', e => { e.preventDefault(); uploadArea.classList.remove('border-blue-400','bg-blue-50/50'); const files = Array.from(e.dataTransfer?.files||[]); if(files.length>0) this.addFiles(files); });
      fileInput.addEventListener('change', () => { const files = Array.from(fileInput.files||[]); if(files.length>0) this.addFiles(files); fileInput.value=''; });
    }

    document.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', e => { e.stopPropagation(); const id=(e.currentTarget as HTMLElement).dataset.remove; if(id) this.removeFile(id); }));

    // 文本粘贴输入监听
    const textInput = document.getElementById('textContentInput') as HTMLTextAreaElement;
    if (textInput) {
      textInput.addEventListener('input', () => { this.textContent = textInput.value; });
      // 防止回车触发登录等其他事件
      textInput.addEventListener('keydown', (e) => e.stopPropagation());
    }

    document.querySelectorAll('.review-type-btn').forEach(btn => btn.addEventListener('click', () => { const type=(btn as HTMLElement).dataset.type as ReviewType; if(type) this.setReviewType(type); }));
    document.querySelectorAll('.review-mode-btn').forEach(btn => btn.addEventListener('click', () => { const mode=(btn as HTMLElement).dataset.mode as ReviewMode; if(mode) this.setReviewMode(mode); }));

    // 审核依据模式切换（按模块）
    document.querySelectorAll('.mc-mode-btn').forEach(btn => btn.addEventListener('click', () => {
      const module = (btn as HTMLElement).dataset.mcmodule as string;
      const mode = (btn as HTMLElement).dataset.mcmode as 'smart' | 'rules';
      if (module && mode) {
        if (!this.moduleConstraints[module]) this.moduleConstraints[module] = { mode: 'smart' };
        // 切换前保存当前文字约束输入
        const rulesInput = document.querySelector(`.mc-rules-input[data-mcmodule="${module}"]`) as HTMLTextAreaElement;
        if (rulesInput) {
          this.moduleConstraints[module].rules = rulesInput.value;
        }
        this.moduleConstraints[module].mode = mode;
        // 切换模式时清理旧数据
        if (mode === 'smart') {
          delete this.moduleConstraints[module].fileContent;
          delete this.moduleConstraints[module].fileName;
          delete this.moduleConstraints[module].rules;
        }
        this.render();
      }
    }));

    // 使用默认约束按钮
    document.querySelectorAll('.use-default-rules-btn').forEach(btn => btn.addEventListener('click', () => {
      const module = (btn as HTMLElement).dataset.mcmodule as string;
      if (module && DEFAULT_COMPANY_RULES[this.companyType]?.[module]) {
        if (!this.moduleConstraints[module]) this.moduleConstraints[module] = { mode: 'rules' };
        this.moduleConstraints[module].mode = 'rules';
        this.moduleConstraints[module].rules = DEFAULT_COMPANY_RULES[this.companyType][module];
        this.render();
      }
    }));

    // 文字约束保存（按模块）
    document.querySelectorAll('.mc-rules-input').forEach(ta => {
      const module = (ta as HTMLElement).dataset.mcmodule as string;
      ta.addEventListener('input', () => {
        if (!this.moduleConstraints[module]) this.moduleConstraints[module] = { mode: 'rules' };
        this.moduleConstraints[module].rules = (ta as HTMLTextAreaElement).value;
      });
    });

    // 帮助提示切换
    document.querySelectorAll('.help-tip').forEach(el => el.addEventListener('click', () => { document.getElementById('modeHelpTip')?.classList.toggle('hidden'); }));
    document.querySelectorAll('.help-tip-type').forEach(el => el.addEventListener('click', () => { document.getElementById('typeHelpTip')?.classList.toggle('hidden'); }));

    const startBtn = document.getElementById('startReviewBtn');
    if (startBtn && !startBtn.hasAttribute('disabled')) startBtn.addEventListener('click', () => this.startReview());

    // 预览按钮（不消耗 Token）
    const previewBtn = document.getElementById('previewFileBtn');
    if (previewBtn && (this.files.length > 0 || this.textContent.trim().length > 0)) previewBtn.addEventListener('click', () => this.previewFile());

    // 预览面板按钮
    document.getElementById('closePreviewBtn')?.addEventListener('click', () => this.closePreview());
    document.getElementById('copyPreviewBtn')?.addEventListener('click', () => {
      if (this.previewContent) { navigator.clipboard.writeText(this.previewContent); this.showToast('文本已复制到剪贴板', 'success'); }
    });
    document.getElementById('startReviewFromPreviewBtn')?.addEventListener('click', () => this.startReview());

    document.querySelectorAll('.history-item').forEach(item => item.addEventListener('click', e => {
      const target = e.target as HTMLElement;
      if (target.closest('.delete-history')) { e.stopPropagation(); const id=(target.closest('.delete-history') as HTMLElement).dataset.delete; if(id && confirm('确定删除？')) this.deleteHistory(id); }
      else { const id=(item as HTMLElement).dataset.id; if(id) this.viewHistoryDetail(id); }
    }));

    document.querySelectorAll('.result-tab').forEach(tab => tab.addEventListener('click', e => {
      const tabId = (e.currentTarget as HTMLElement).dataset.tab as typeof this.resultTab; if(!tabId) return;
      this.resultTab = tabId;
      document.querySelectorAll('.result-tab').forEach(t => t.classList.remove('active'));
      (e.currentTarget as HTMLElement).classList.add('active');
      document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
      document.getElementById(`tab-${tabId}`)?.classList.remove('hidden');
    }));

    // 审查结果分类按钮切换
    document.querySelectorAll('.review-cat-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const catKey = (e.currentTarget as HTMLElement).dataset.cat;
        if (!catKey) return;
        // 更新按钮样式
        document.querySelectorAll('.review-cat-btn').forEach(b => {
          b.classList.remove('text-white', 'bg-gray-800', 'shadow-sm', 'border-transparent');
          b.classList.add('text-gray-600', 'bg-gray-100', 'border-gray-200');
        });
        const activeBtn = e.currentTarget as HTMLElement;
        activeBtn.classList.remove('text-gray-600', 'bg-gray-100', 'border-gray-200');
        activeBtn.classList.add('text-white', 'bg-gray-800', 'shadow-sm', 'border-transparent');
        // 切换面板
        document.querySelectorAll('.review-cat-panel').forEach(p => p.classList.add('hidden'));
        document.querySelector(`.review-cat-panel[data-cat="${catKey}"]`)?.classList.remove('hidden');
      });
    });

    document.getElementById('closeResultBtn')?.addEventListener('click', () => this.closeResult());
    document.getElementById('downloadReportBtn')?.addEventListener('click', () => {
      const review = this.currentReview; const result = review?.result; if(!result) return;
      const dsNames = this.reviewMeta?.knowledgeDatasets||[];
      const sourceStr = [this.reviewMeta?.knowledgeUsed?`知识库(${dsNames.join(',')})`:'',this.reviewMeta?.webSearchUsed?'联网搜索':''].filter(Boolean).join(' + ')||'AI';
      const catNames: Record<string,string> = {format:'格式错误',typo:'错别字与表述错误',outdated_standard:'过期规范引用',non_compliant:'技术参数不合规',missing:'内容缺失',other:'其他问题'};
      const issuesByCat: Record<string,typeof result.issues> = {};
      (result.issues||[]).forEach((i: Issue) => { const c = i.category||'other'; if(!issuesByCat[c]) issuesByCat[c]=[]; issuesByCat[c].push(i); });
      const catOrder = ['format','typo','outdated_standard','non_compliant','missing','other'];
      let issueReport = '';
      for (const cat of catOrder) { if(!issuesByCat[cat]||issuesByCat[cat].length===0) continue; issueReport += `\n${catNames[cat]||cat}（${issuesByCat[cat].length}项）\n${'─'.repeat(30)}\n`; issuesByCat[cat].forEach((i: Issue,n: number) => { issueReport += `${n+1}. ${i.title}${i.location?' ('+i.location+')':''}\n   ${i.description}${i.suggestion?'\n   建议：'+i.suggestion:''}\n`; }); }
      const report = `辰溪工程文件审核助手 - 审核报告\n========================================\n\n审核类型：${REVIEW_TYPES[review!.review_type as ReviewType]?.label}\n审核模式：${REVIEW_MODES[review!.review_mode as ReviewMode]?.label}\n文件名称：${review!.file_name}\n审核时间：${new Date(review!.created_at).toLocaleString('zh-CN')}\n知识来源：${sourceStr}\n\n审核结论：${result.conclusion==='pass'?'通过':result.conclusion==='fail'?'未通过':'需整改'}\n综合评分：${result.score}/100\n${issueReport||'\n未发现问题\n'}\n========================================\n辰溪工程文件审核助手 自动生成`.trim();
      const blob = new Blob([report],{type:'text/plain;charset=utf-8'}); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href=url; link.download=`审核报告_${new Date().toISOString().slice(0,10)}.txt`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
    });

    // 批量审核：折叠面板展开/折叠
    document.querySelectorAll('.batch-item-header').forEach(header => {
      header.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        // 如果点击的是下载按钮，不切换折叠
        if (target.closest('.download-batch-btn')) return;
        const idx = parseInt((header as HTMLElement).dataset.batchIndex || '0');
        this.expandedBatchIndex = this.expandedBatchIndex === idx ? -1 : idx;
        this.render();
      });
    });

    // 批量审核：单个文件下载报告
    document.querySelectorAll('.download-batch-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt((btn as HTMLElement).dataset.batchIndex || '0');
        const review = this.batchResults[idx];
        if (!review?.result) return;
        const result = review.result;
        const catNames: Record<string,string> = {format:'格式错误',typo:'错别字与表述错误',outdated_standard:'过期规范引用',non_compliant:'技术参数不合规',missing:'内容缺失',other:'其他问题'};
        const issuesByCat: Record<string,typeof result.issues> = {};
        (result.issues||[]).forEach((i: Issue) => { const c = i.category||'other'; if(!issuesByCat[c]) issuesByCat[c]=[]; issuesByCat[c].push(i); });
        const catOrder = ['format','typo','outdated_standard','non_compliant','missing','other'];
        let issueReport = '';
        for (const cat of catOrder) { if(!issuesByCat[cat]||issuesByCat[cat].length===0) continue; issueReport += `\n${catNames[cat]||cat}（${issuesByCat[cat].length}项）\n${'─'.repeat(30)}\n`; issuesByCat[cat].forEach((i: Issue,n: number) => { issueReport += `${n+1}. ${i.title}${i.location?' ('+i.location+')':''}\n   ${i.description}${i.suggestion?'\n   建议：'+i.suggestion:''}\n`; }); }
        const report = `辰溪工程文件审核助手 - 审核报告\n========================================\n\n文件名称：${review.file_name}\n审核类型：${REVIEW_TYPES[review.review_type as ReviewType]?.label}\n审核时间：${new Date(review.created_at).toLocaleString('zh-CN')}\n\n审核结论：${result.conclusion==='pass'?'通过':result.conclusion==='fail'?'未通过':'需整改'}\n综合评分：${result.score}/100\n${issueReport||'\n未发现问题\n'}\n========================================\n辰溪工程文件审核助手 自动生成`.trim();
        const blob = new Blob([report],{type:'text/plain;charset=utf-8'}); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href=url; link.download=`审核报告_${review.file_name}_${new Date().toISOString().slice(0,10)}.txt`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url);
      });
    });

    // 知识库管理事件
    document.querySelectorAll('.knowledge-target-btn').forEach(btn => btn.addEventListener('click', () => {
      document.querySelectorAll('.knowledge-target-btn').forEach(b => { b.classList.remove('border-blue-500','bg-blue-50','ring-2','ring-blue-200'); b.classList.add('border-gray-200'); });
      btn.classList.add('border-blue-500','bg-blue-50','ring-2','ring-blue-200'); btn.classList.remove('border-gray-200');
      const target = (btn as HTMLElement).dataset.target as ReviewType;
      (document.getElementById('knowledgeTitle') as HTMLInputElement).dataset.targetReviewType = target;
    }));

    // 知识库文件列表刷新
    document.getElementById('refreshKnowledgeFilesBtn')?.addEventListener('click', () => {
      const el = document.getElementById('knowledgeFileList');
      if (el) el.innerHTML = '<p class="text-xs text-gray-400 text-center py-3">加载中...</p>';
      this.knowledgeFiles = [];
      this.loadKnowledgeFiles();
    });

    // 自动补齐标准
    document.getElementById('autoUpdateStandardsBtn')?.addEventListener('click', async () => {
      const btn = document.getElementById('autoUpdateStandardsBtn') as HTMLElement;
      const resultEl = document.getElementById('autoUpdateResult');
      if (!btn || !resultEl) return;
      btn.innerHTML = '<span class="animate-spin inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full"></span> 补齐中...';
      btn.setAttribute('disabled', 'true');
      resultEl.classList.remove('hidden');
      resultEl.innerHTML = '<div class="text-xs text-blue-600 bg-blue-50 rounded-lg p-2 flex items-center gap-2"><span class="animate-spin inline-block w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full"></span>正在对比并补齐最新行业标准，请稍候...</div>';
      try {
        const res = await fetch('/api/knowledge/auto-update-standards', { method: 'POST', headers: this.authHeaders() });
        const data = await res.json();
        if (data.success) {
          const r = data.result;
          let html = `<div class="text-xs rounded-lg p-2.5 bg-green-50 border border-green-200"><div class="font-semibold text-green-800 mb-1.5">${data.message}</div>`;
          if (r.added.length > 0) html += `<div class="text-green-700 mb-1">✅ 新增 ${r.added.length} 项：${r.added.slice(0, 5).join('、')}${r.added.length > 5 ? '...' : ''}</div>`;
          if (r.skipped.length > 0) html += `<div class="text-gray-600 mb-1">⏭️ 跳过 ${r.skipped.length} 项（已存在且内容一致）</div>`;
          if (r.updated.length > 0) html += `<div class="text-amber-700 mb-1">🔄 更新 ${r.updated.length} 项：${r.updated.join('、')}</div>`;
          if (r.errors.length > 0) html += `<div class="text-red-600">❌ 失败 ${r.errors.length} 项：${r.errors.join('；')}</div>`;
          html += '</div>';
          resultEl.innerHTML = html;
          this.loadKnowledgeFiles();
        } else {
          resultEl.innerHTML = `<div class="text-xs text-red-600 bg-red-50 rounded-lg p-2">❌ ${data.error || '补齐失败'}</div>`;
        }
      } catch (error) {
        resultEl.innerHTML = `<div class="text-xs text-red-600 bg-red-50 rounded-lg p-2">❌ 网络错误：${error}</div>`;
      }
      btn.innerHTML = '⚡ 补齐标准';
      btn.removeAttribute('disabled');
    });
    document.querySelectorAll('.knowledge-type-btn').forEach(btn => btn.addEventListener('click', () => {
      const ktype = (btn as HTMLElement).dataset.ktype;
      document.querySelectorAll('.knowledge-type-btn').forEach(b => { b.classList.remove('border-blue-500','bg-blue-50','ring-2','ring-blue-200'); b.classList.add('border-gray-200'); });
      btn.classList.add('border-blue-500','bg-blue-50','ring-2','ring-blue-200'); btn.classList.remove('border-gray-200');
      const textInput = document.getElementById('knowledgeTextInput'); const urlInput = document.getElementById('knowledgeUrlInput'); const fileInput = document.getElementById('knowledgeFileInput');
      if (ktype==='url') { textInput?.classList.add('hidden'); urlInput?.classList.remove('hidden'); fileInput?.classList.add('hidden'); }
      else if (ktype==='file') { textInput?.classList.add('hidden'); urlInput?.classList.add('hidden'); fileInput?.classList.remove('hidden'); }
      else { textInput?.classList.remove('hidden'); urlInput?.classList.add('hidden'); fileInput?.classList.add('hidden'); }
    }));
    document.getElementById('addKnowledgeBtn')?.addEventListener('click', () => {
      const titleEl = document.getElementById('knowledgeTitle') as HTMLInputElement; const contentEl = document.getElementById('knowledgeContent') as HTMLTextAreaElement; const urlEl = document.getElementById('knowledgeUrl') as HTMLInputElement;
      const urlInput = document.getElementById('knowledgeUrlInput'); const fileInput = document.getElementById('knowledgeFileInput');
      const isUrl = urlInput && !urlInput.classList.contains('hidden');
      const isFile = fileInput && !fileInput.classList.contains('hidden');
      const title = titleEl?.value.trim(); const targetReviewType = (titleEl?.dataset.targetReviewType||'comprehensive') as ReviewType; const content = contentEl?.value.trim(); const url = urlEl?.value.trim();
      if(!title){alert('请输入标题');return;} const tc=REVIEW_TYPES[targetReviewType];
      if(isUrl){if(!url){alert('请输入链接');return;} this.addKnowledgeEntry({id:`k-${Date.now()}`,title,type:'url',url,targetDataset:tc.dataset,targetReviewType,companyType:this.knowledgeCompanyType,createdAt:new Date().toISOString()});}
      else if(isFile){
        const fileText = this.knowledgeFileContent;
        if(!fileText){alert('请先选择文件并等待解析完成');return;}
        this.addKnowledgeEntry({id:`k-${Date.now()}`,title,type:'text',content:fileText,targetDataset:tc.dataset,targetReviewType,companyType:this.knowledgeCompanyType,createdAt:new Date().toISOString()});
        this.knowledgeFileContent=''; this.knowledgeFileName='';
        const fileInfo=document.getElementById('knowledgeFileInfo'); if(fileInfo) fileInfo.classList.add('hidden');
      }
      else{if(!content){alert('请输入内容');return;} this.addKnowledgeEntry({id:`k-${Date.now()}`,title,type:'text',content,targetDataset:tc.dataset,targetReviewType,companyType:this.knowledgeCompanyType,createdAt:new Date().toISOString()});}
      titleEl.value='';contentEl.value='';urlEl.value='';
    });
    document.querySelectorAll('[data-kremove]').forEach(btn => btn.addEventListener('click', e => { const id=(e.currentTarget as HTMLElement).dataset.kremove; if(id) this.removeKnowledgeEntry(id); }));

    // 知识库文件上传事件
    const knowledgeFileDropZone = document.getElementById('knowledgeFileDropZone');
    const knowledgeFileInputEl = document.getElementById('knowledgeFileInput_file') as HTMLInputElement;
    if (knowledgeFileDropZone) {
      knowledgeFileDropZone.addEventListener('click', () => knowledgeFileInputEl?.click());
      knowledgeFileDropZone.addEventListener('dragover', (e: Event) => { e.preventDefault(); (knowledgeFileDropZone as HTMLElement).classList.add('border-blue-400','bg-blue-50'); });
      knowledgeFileDropZone.addEventListener('dragleave', () => { knowledgeFileDropZone.classList.remove('border-blue-400','bg-blue-50'); });
      knowledgeFileDropZone.addEventListener('drop', (e: DragEvent) => {
        e.preventDefault(); knowledgeFileDropZone.classList.remove('border-blue-400','bg-blue-50');
        const file = e.dataTransfer?.files[0];
        if (file) this.handleKnowledgeFile(file);
      });
    }
    if (knowledgeFileInputEl) {
      knowledgeFileInputEl.addEventListener('change', () => {
        const file = knowledgeFileInputEl.files?.[0];
        if (file) this.handleKnowledgeFile(file);
      });
    }
    document.getElementById('knowledgeFileClear')?.addEventListener('click', () => {
      this.knowledgeFileContent = ''; this.knowledgeFileName = '';
      const fileInfo = document.getElementById('knowledgeFileInfo'); if (fileInfo) fileInfo.classList.add('hidden');
    });
    document.getElementById('importKnowledgeBtn')?.addEventListener('click', () => this.importKnowledgeToServer());
    document.getElementById('searchKnowledgeTestBtn')?.addEventListener('click', async () => {
      const query = (document.getElementById('searchTestInput') as HTMLInputElement)?.value.trim(); if(!query){alert('请输入关键词');return;}
      const reviewType = (document.getElementById('searchTestModule') as HTMLSelectElement)?.value as ReviewType|'';
      const el = document.getElementById('searchTestResult'); if(el){el.classList.remove('hidden');el.textContent='搜索中...';el.textContent=await this.testKnowledgeSearch(query,reviewType||undefined);}
    });
    document.getElementById('searchWebTestBtn')?.addEventListener('click', async () => {
      const query = (document.getElementById('searchTestInput') as HTMLInputElement)?.value.trim(); if(!query){alert('请输入关键词');return;}
      const el = document.getElementById('searchTestResult'); if(el){el.classList.remove('hidden');el.textContent='搜索中...';el.textContent=await this.testWebSearch(query);}
    });

    // 数据库统计刷新
    document.getElementById('refreshDbStatsBtn')?.addEventListener('click', () => {
      const el = document.getElementById('dbStatsContent');
      if (el) el.textContent = '加载中...';
      this.dbStats = null;
      this.loadDbStats();
    });

    // 使用记录刷新
    document.getElementById('refreshUsageLogsBtn')?.addEventListener('click', () => {
      const el = document.getElementById('usageLogsContent');
      if (el) el.innerHTML = '<p class="text-xs text-gray-400 py-4 text-center">加载中...</p>';
      this.usageLogs = [];
      this.loadUsageLogs();
    });

    // 使用记录折叠切换
    document.querySelectorAll('.usage-log-toggle').forEach(header => {
      header.addEventListener('click', () => {
        const idx = (header as HTMLElement).dataset.idx;
        const detail = document.querySelector(`.usage-log-detail[data-idx="${idx}"]`);
        const arrow = document.querySelector(`.usage-log-arrow[data-idx="${idx}"]`);
        if (detail) detail.classList.toggle('hidden');
        if (arrow) arrow.classList.toggle('rotate-180');
      });
    });

    // Admin 管理事件
    document.getElementById('createUserBtn')?.addEventListener('click', async () => {
      const username = (document.getElementById('newUsername') as HTMLInputElement)?.value.trim();
      const password = (document.getElementById('newPassword') as HTMLInputElement)?.value.trim();
      const displayName = (document.getElementById('newDisplayName') as HTMLInputElement)?.value.trim();
      const role = (document.getElementById('newRole') as HTMLSelectElement)?.value;
      const companyType = (document.getElementById('newCompanyType') as HTMLSelectElement)?.value;
      if(!username){alert('请输入用户名');return;}
      try {
        const res = await fetch('/api/users',{method:'POST',headers:this.authHeaders(),body:JSON.stringify({username,password:password||'123456',role,companyType:companyType||'general',displayName:displayName||username})});
        const data = await res.json();
        if(data.success){alert('创建成功！');this.loadManagedUsers();}else{alert(data.error||'创建失败');}
      } catch{alert('创建失败');}
    });
    document.getElementById('changeMyPasswordBtn')?.addEventListener('click', async () => {
      const oldPassword = (document.getElementById('oldPassword') as HTMLInputElement)?.value;
      const newPassword = (document.getElementById('newMyPassword') as HTMLInputElement)?.value;
      if(!newPassword){alert('请输入新密码');return;}
      try {
        const res = await fetch('/api/auth/password',{method:'PUT',headers:this.authHeaders(),body:JSON.stringify({oldPassword,newPassword})});
        const data = await res.json();
        if(data.success){alert('密码修改成功！');}else{alert(data.error||'修改失败');}
      } catch{alert('修改失败');}
    });
    document.querySelectorAll('.delete-user-btn').forEach(btn => btn.addEventListener('click', async () => {
      const uid = (btn as HTMLElement).dataset.uid; const uname = (btn as HTMLElement).dataset.uname;
      if(!confirm(`确定删除用户 "${uname}"？`))return;
      try { const res = await fetch(`/api/users/${uid}`,{method:'DELETE',headers:this.authHeaders()}); const data = await res.json(); if(data.success){alert('已删除');this.loadManagedUsers();}else{alert(data.error||'删除失败');} } catch{alert('删除失败');}
    }));
    document.querySelectorAll('.edit-user-btn').forEach(btn => btn.addEventListener('click', async () => {
      const uid = (btn as HTMLElement).dataset.uid; const uname = (btn as HTMLElement).dataset.uname; const dname = (btn as HTMLElement).dataset.dname; const urole = (btn as HTMLElement).dataset.urole; const ucompany = (btn as HTMLElement).dataset.ucompany || 'general';
      const newDisplayName = prompt('修改显示名：', dname); if(newDisplayName===null) return;
      const newRole = confirm('点击"确定"设为管理员，"取消"保持当前角色') ? 'admin' : urole;
      const companyOptions = ['general', 'supervisor', 'construction'];
      const companyInput = prompt(`选择单位类型（输入数字）：\n1. 总包单位\n2. 监理单位\n3. 施工单位\n当前：${COMPANY_TYPES[ucompany]?.label||'总包单位'}`, companyOptions.indexOf(ucompany)+1+'');
      const newCompanyType = companyInput && companyOptions[parseInt(companyInput)-1] ? companyOptions[parseInt(companyInput)-1] : ucompany;
      try {
        const res = await fetch(`/api/users/${uid}`,{method:'PUT',headers:this.authHeaders(),body:JSON.stringify({displayName:newDisplayName,role:newRole,companyType:newCompanyType})});
        const data = await res.json(); if(data.success){alert('已更新');this.loadManagedUsers();}else{alert(data.error||'修改失败');}
      } catch{alert('修改失败');}
    }));
  }
}
