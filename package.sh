#!/bin/bash

# 打包 Chrome 扩展脚本
# 用于提交到 Chrome 网上应用店

set -e

VERSION=$(grep '"version"' manifest.json | sed 's/.*"version": "\(.*\)".*/\1/')
FILENAME="ai-chat-export-pro-v${VERSION}.zip"

echo "📦 打包 AI Chat Export Pro 扩展..."
echo "版本: ${VERSION}"
echo "输出文件: ${FILENAME}"
echo ""

# 清理旧的打包文件
rm -f *.zip

# 创建 zip 文件，排除不必要的文件
zip -r "${FILENAME}" \
  manifest.json \
  src/ \
  public/ \
  -x "*.git*" \
  -x "*.DS_Store" \
  -x "private-docs/*" \
  -x "*.md" \
  -x "*.txt" \
  -x "优化总结.md" \
  -x "plan.md" \
  -x ".gitignore"

echo ""
echo "✅ 打包完成!"
echo "📁 文件: ${FILENAME}"
echo "📊 大小: $(du -h "${FILENAME}" | cut -f1)"
echo ""
echo "📋 包含的文件:"
unzip -l "${FILENAME}" | sed '1,3d;$d;$d'
echo ""
echo "🚀 准备提交到 Chrome 网上应用店!"
