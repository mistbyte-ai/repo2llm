#!/bin/sh

# создаём каталоги
mkdir -p lib

# создаём файлы
touch package.json
touch repo2llm.js

touch lib/collector.js
touch lib/analyzer.js
touch lib/renderer.js
touch lib/state.js
touch lib/ignore.js
touch lib/utils.js

echo "repo2llm project skeleton created."

echo ""
echo "Structure:"
echo ""
echo "repo2llm/"
echo "├─ package.json"
echo "├─ repo2llm.js"
echo "└─ lib/"
echo "   ├─ collector.js"
echo "   ├─ analyzer.js"
echo "   ├─ renderer.js"
echo "   ├─ state.js"
echo "   ├─ ignore.js"
echo "   └─ utils.js"
