# 依赖版本避坑对照表

## 文件上传相关

| 包名 | ❌ 不要用 | ✅ 推荐版本 | 原因 |
|------|----------|-----------|------|
| formidable | - | ^3.5.2 | 独立解析，不依赖 Express 版本 |
| multer | ^1.x 或 ^2.x | 不要用 | v1 可能卡死，v2 与 Express 4.x 不兼容 |

## PDF 解析相关

| 包名 | ❌ 不要用 | ✅ 推荐版本 | 原因 |
|------|----------|-----------|------|
| pdf-parse | 动态import/移除 | ^1.1.1（正式依赖+tsup external） | 内含测试PDF文件，打包后运行时出错 |
| PyMuPDF | - | pip3 install PyMuPDF | 大型 PDF(200+页) 必备，pdf-parse 处理不了 |

## tsup 打包排除列表

```
--external vite --external pdf-parse --external formidable --external jszip
```

所有含原生模块、测试数据或动态加载的包都必须排除，运行时从 node_modules 加载。

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
