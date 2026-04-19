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
| **修复** | 改为前端 FormData 上传原始文件 → 后端 multer 接收 → Python PyMuPDF / Node.js pdf-parse 解析提取文本 |
| **教训** | **永远不要用 readAsText 读取非纯文本文件（PDF/Word/Excel/图片）**，必须使用专业的文件解析库 |

**错误代码：**
```javascript
// ❌ 错误：PDF 二进制用 readAsText 产出乱码
const reader = new FileReader();
reader.readAsText(file);  // PDF 不是文本！
reader.onload = () => { content = reader.result; };  // 乱码！
```

**正确代码：**
```javascript
// ✅ 正确：上传原始文件，后端专业解析
const formData = new FormData();
formData.append('files', file.file, file.name);
const response = await fetch('/api/parse-file', { method: 'POST', body: formData });
```

---

### BUG-002：multer v2 上传接口卡死

| 项目 | 内容 |
|------|------|
| **严重级别** | 🔴 致命 |
| **发现时间** | 生产环境部署后 |
| **现象** | 上传任何文件（大小无关）进度条无限转圈，请求无响应 |
| **根因** | `multer@2.x` 是新大版本，与 Express 4.x 存在兼容性问题，导致请求被挂起 |
| **修复** | 降级到 `multer@1.4.5-lts.2`（LTS 稳定版），`@types/multer` 降级到 `1.4.12` |
| **教训** | **生产项目不要盲目使用最新大版本的 npm 包**，优先选择 LTS 版本；Express 4.x 配 multer 用 v1 |

---

### BUG-003：pdf-parse 动态 import 失败 + 正则降级方案卡死

| 项目 | 内容 |
|------|------|
| **严重级别** | 🔴 致命 |
| **发现时间** | BUG-002 修复后继续排查 |
| **现象** | PDF 解析仍然卡死 |
| **根因** | 1) pdf-parse 从 package.json 移除后动态 import 找不到模块；2) 降级方案用正则从 PDF 二进制流提取文本，正则 `stream...endstream` 匹配超大数据导致回溯卡死 |
| **修复** | 恢复 pdf-parse 为正式依赖，直接 `import pdfParse from 'pdf-parse'`，去掉正则降级方案 |
| **教训** | **不要对二进制数据使用贪婪正则**；降级方案要简单可靠，不要越降越复杂 |

---

### BUG-004：部署版本选择为空（构建失败）

| 项目 | 内容 |
|------|------|
| **严重级别** | 🔴 致命 |
| **发现时间** | 尝试部署时 |
| **现象** | 部署页面"请选择版本"下拉框为空，无法部署；或无限读条 |
| **根因** | 多个因素叠加：1) 17MB PDF 文件提交到 git 导致构建超时；2) pnpm-lock.yaml 与 package.json 不一致导致 install 失败（`--prefer-frozen-lockfile` 硬报错）；3) 构建脚本 `set -Eeuo pipefail` 使任何非零退出码都终止构建 |
| **修复** | 1) 从 git 移除大文件，.gitignore 添加 `assets/*.pdf` `assets/*.png`；2) 构建脚本去掉 `--prefer-frozen-lockfile`，改用 `pnpm install --loglevel warn`；3) PyMuPDF 安装加 `2>/dev/null || echo` 容错 |
| **教训** | **不要把大型二进制文件提交到 git**；构建脚本要容错，不要因为非关键步骤失败就中断整个构建 |

---

## 二、严重级 BUG（功能异常但可绕过）

### BUG-005：Python PyMuPDF 在生产环境可能不可用

| 项目 | 内容 |
|------|------|
| **严重级别** | 🟠 严重 |
| **现象** | 生产环境可能没有 Python 或 fitz 模块，PDF 只能用 pdf-parse（解析质量较低，大文件可能失败） |
| **修复** | 添加 `isPythonAvailable()` 检测，Python 不可用时自动降级到 pdf-parse |
| **建议** | 构建脚本中加入 `pip3 install PyMuPDF 2>/dev/null || true`，生产环境尽量保证 Python 可用 |

---

### BUG-006：207 页大型 PDF 前 14 页是审批表和目录

| 项目 | 内容 |
|------|------|
| **严重级别** | 🟠 严重 |
| **现象** | 大型工程 PDF 前面有审批表和目录，简单截取前 N 字符只拿到目录内容，正文被丢弃 |
| **修复** | Python 解析脚本自动检测"目录"关键词，跳过所有前导内容，直接提取正文；后端智能截取 head(80%) + tail(20%) |
| **教训** | **工程类 PDF 普遍有审批表+目录**，解析时必须智能跳过 |

---

### BUG-007：沙箱资源耗尽（fork: Resource temporarily unavailable）

| 项目 | 内容 |
|------|------|
| **严重级别** | 🟠 严重 |
| **现象** | 反复执行 pnpm install / build / python 解析后，沙箱无法 fork 新进程 |
| **根因** | 沙箱有进程数限制，多次编译 + 服务重启 + PDF 解析耗尽进程配额 |
| **修复** | 避免在单次会话中反复重启服务和编译；调试时不要循环执行命令 |
| **教训** | **不要在沙箱中反复执行重命令**；调试应先看日志再定点修复，不要无脑重试 |

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

### BUG-010：tsup 打包后 Python 脚本路径错误

| 项目 | 内容 |
|------|------|
| **严重级别** | 🟡 一般 |
| **现象** | `__dirname` 在 tsup 打包后指向 `dist-server/`，找不到 `pdf-parser.py` |
| **修复** | 优先使用 `COZE_WORKSPACE_PATH` 环境变量定位脚本；构建脚本额外复制 pdf-parser.py 到 dist-server/src/ |

---

## 四、架构与依赖经验

### 依赖版本避坑表

| 包名 | ❌ 不要用 | ✅ 推荐版本 | 原因 |
|------|----------|-----------|------|
| multer | ^2.1.1 | ^1.4.5-lts.2 | v2 与 Express 4.x 不兼容 |
| @types/multer | ^2.1.0 | ^1.4.12 | 需与 multer v1 匹配 |
| pdf-parse | 移除/动态import | ^1.1.1 正式依赖 | 动态 import 在 tsup 打包后不可靠 |
| PyMuPDF | - | pip3 install PyMuPDF | 大型 PDF 解析必备，pdf-parse 处理不了 200+ 页 |

### 文件处理架构最佳实践

```
前端上传（FormData 原始文件）
    ↓
后端 /api/parse-file（multer 接收）
    ↓
├─ PDF → Python PyMuPDF（优先）→ 降级 pdf-parse
├─ Word → JSZip 解压读 word/document.xml
├─ Excel → 提示导出 PDF
├─ 图片 → base64 编码
└─ 文本 → 直接 UTF-8 读取
    ↓
提取的纯文本 → LLM 审核
```

### 生产环境部署检查清单

- [ ] `.gitignore` 排除大文件（PDF/图片/视频）
- [ ] `pnpm-lock.yaml` 与 `package.json` 一致（提交前跑 `pnpm install`）
- [ ] 构建脚本容错：非关键步骤失败不中断（`|| true` / `2>/dev/null`）
- [ ] Python PyMuPDF 安装步骤加到 `scripts/build.sh`
- [ ] 静态资源（pdf-parser.py）复制到 dist 目录
- [ ] 所有 npm 包版本锁定，避免大版本自动升级

---

## 五、调试方法论

### 沙箱调试原则

1. **先看日志再改代码**：`tail -n 50 /app/work/logs/bypass/app.log`
2. **不要循环重试命令**：fork 失败说明资源耗尽，等一会儿再试
3. **最小化命令**：能读文件就不要用 cat，能 grep 就不要遍历
4. **端口检测用 `ss -tuln`**：不要用 `lsof -i`（沙箱 IPv6 误检）
5. **杀进程用 PID**：`ss -lptn 'sport = :5000'` 找到 PID 再 kill

### LLM 审核结果异常排查

1. 检查输入：文件内容是否正确解析（不是乱码）
2. 检查提示词：审核类型是否匹配文件类型
3. 检查内容截取：是否截断了关键内容
4. 检查模型：不同模型能力差异大，关键场景用更强模型

---

*文档最后更新：2025-04-19*
