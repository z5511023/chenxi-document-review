# 依赖版本避坑对照表

## 文件上传相关

| 包名 | ❌ 不要用 | ✅ 推荐版本 | 原因 |
|------|----------|-----------|------|
| multer | ^2.x | ^1.4.5-lts.2 | v2 与 Express 4.x 不兼容，上传请求会挂起 |
| @types/multer | ^2.x | ^1.4.12 | 需与 multer v1 匹配 |

## PDF 解析相关

| 包名 | ❌ 不要用 | ✅ 推荐版本 | 原因 |
|------|----------|-----------|------|
| pdf-parse | 动态import/移除 | ^1.1.1（正式依赖） | tsup 打包后动态 import 不可靠 |
| PyMuPDF | - | pip3 install PyMuPDF | 大型 PDF(200+页) 必备，pdf-parse 处理不了 |

## LLM 相关

| 模型 | 适用场景 | 注意事项 |
|------|---------|---------|
| doubao-seed-1-6-lite-251015 | 高性价比日常审核 | 常见任务最佳选择 |
| doubao-seed-2-0-lite-260215 | 更强理解力 | 消耗更多积分 |

## 通用避坑

| 场景 | ❌ 错误做法 | ✅ 正确做法 |
|------|-----------|-----------|
| 构建脚本 | `set -Eeuo pipefail` + `--prefer-frozen-lockfile` | 非关键步骤 `2>/dev/null \|\| true` |
| .gitignore | 不排除二进制文件 | 排除 `assets/*.pdf` `assets/*.png` |
| 进程检测 | `lsof -i:5000` | `ss -tuln \| grep :5000` |
| 端口检测 | `curl localhost:5000` | `curl -I -s --max-time 3 http://localhost:5000` |
