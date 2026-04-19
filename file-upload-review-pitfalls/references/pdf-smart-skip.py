#!/usr/bin/env python3
"""PDF 解析脚本 - 使用 PyMuPDF (fitz)
自动检测并跳过工程 PDF 前面的审批表和目录页，直接提取正文内容。

用法: python3 pdf-smart-skip.py <file_path> [max_pages] [skip_pages]
输出: JSON { pages, skip_pages, read_pages, text, text_length }
"""
import sys
import json

try:
    import fitz
except ImportError:
    print(json.dumps({"error": "PyMuPDF (fitz) 未安装，请运行 pip3 install PyMuPDF"}))
    sys.exit(1)


def parse_pdf(file_path, max_pages=0, skip_pages=0):
    doc = fitz.open(file_path)
    total_pages = len(doc)

    # 智能跳过前导内容：自动检测审批表和目录
    actual_skip = skip_pages
    if skip_pages == 0 and total_pages > 20:
        # 查找"目录"页，跳过目录及之前所有页
        toc_end_page = 0
        for i in range(min(30, total_pages)):
            text = doc[i].get_text().strip()
            if '目录' in text and i < 15:
                # 找到目录页，继续查找目录结束位置
                for j in range(i, min(i + 15, total_pages)):
                    page_text = doc[j].get_text()
                    lines = page_text.split('\n')
                    has_toc_entry = any(
                        ('...' in line or '……' in line) and any(c.isdigit() for c in line[-5:])
                        for line in lines
                    )
                    if has_toc_entry:
                        toc_end_page = j + 1
                    else:
                        break
                break

        if toc_end_page > 0:
            actual_skip = toc_end_page
        elif total_pages > 50:
            # 没找到目录，但文件很大，跳过前5%
            actual_skip = max(5, total_pages // 20)

    start_page = actual_skip
    pages_to_read = total_pages - start_page if max_pages == 0 else min(max_pages, total_pages - start_page)

    texts = []
    for i in range(start_page, start_page + pages_to_read):
        page = doc[i]
        text = page.get_text()
        if text.strip():
            texts.append(text.strip())

    doc.close()
    return {
        "pages": total_pages,
        "skip_pages": actual_skip,
        "read_pages": pages_to_read,
        "text": "\n\n".join(texts),
        "text_length": sum(len(t) for t in texts)
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "缺少文件路径参数"}))
        sys.exit(1)

    file_path = sys.argv[1]
    max_pages = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    skip_pages = int(sys.argv[3]) if len(sys.argv) > 3 else 0

    try:
        result = parse_pdf(file_path, max_pages, skip_pages)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)
