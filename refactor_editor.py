import re

with open('frontend/src/pages/Editor.tsx', 'r') as f:
    content = f.read()

# 1. Remove useRef from import
content = content.replace("import { useState, useEffect, useCallback, useRef } from 'react';", "import { useState, useEffect, useCallback } from 'react';")

# 2. Remove states
content = re.sub(r"  const \[saveStatus.*?;\n", "", content)
content = re.sub(r"  const \[zoomLevel.*?;\n", "", content)

# 3. Remove refs
content = re.sub(r"  const saveTimerRef.*?;\n", "", content)
content = re.sub(r"  const initialLoadRef.*?;\n", "", content)

# 4. Remove initialLoadRef usage
content = content.replace("    initialLoadRef.current = false;\n", "")
content = content.replace("          setSaveStatus('saved');\n", "")

# 5. Remove Auto-save useEffect block entirely
auto_save_regex = r"  // Auto-save\n  useEffect\(\(\) => \{\n    if \(initialLoadRef\.current\) return;\n    setSaveStatus\('unsaved'\);\n    if \(saveTimerRef\.current\) clearTimeout\(saveTimerRef\.current\);\n    saveTimerRef\.current = setTimeout\(\(\) => \{\n      localStorage\.setItem\(AUTOSAVE_KEY, texContent\);\n      setSaveStatus\('saved'\);\n    \}, 500\);\n    return \(\) => \{\n      if \(saveTimerRef\.current\) clearTimeout\(saveTimerRef\.current\);\n    \};\n  \}, \[texContent\]\);\n"
content = re.sub(auto_save_regex, "", content)

# 6. Keyboard shortcuts - remove setSaveStatus
content = content.replace("        setSaveStatus('saved');\n", "")

# 7. handleNewResume - remove setSaveStatus
content = content.replace("    setSaveStatus('saved');\n", "")

# 8. Header UI - remove SaveStatus and Compiling logic (or just saveStatus)
header_status = r"          <span className=\"text-sm text-gray-500\">\n            \{saveStatus === 'saved' \? 'Saved' : 'Unsaved changes\.\.\.'\}\n          </span>\n"
content = re.sub(header_status, "", content)

# 9. MonacoEditor onChange
monaco_onchange_old = "onChange={(val) => setTexContent(val || '')}"
monaco_onchange_new = """onChange={(val) => {
              const content = val || '';
              setTexContent(content);
              localStorage.setItem(AUTOSAVE_KEY, content);
            }}"""
content = content.replace(monaco_onchange_old, monaco_onchange_new)

# 10. Zoom controls UI
zoom_ui = r"            <div className=\"flex items-center gap-2\">\n              <button onClick=\{\(\) => setZoomLevel\(z => Math\.max\(z - 15, 50\)\)\} className=\"px-2 border rounded bg-white text-sm\">-</button>\n              <span className=\"text-sm\">\{zoomLevel\}%</span>\n              <button onClick=\{\(\) => setZoomLevel\(z => Math\.min\(z \+ 15, 200\)\)\} className=\"px-2 border rounded bg-white text-sm\">\+</button>\n              <button onClick=\{\(\) => setZoomLevel\(100\)\} className=\"px-2 border rounded bg-white text-sm\">Reset</button>\n            </div>\n"
content = re.sub(zoom_ui, "", content)

# 11. Iframe zoom style
iframe_zoom = r"                    width: `\$\{zoomLevel\}%`,\n                    height: `\$\{zoomLevel\}%`,\n"
content = re.sub(iframe_zoom, "                    width: '100%',\n                    height: '100%',\n", content)

with open('frontend/src/pages/Editor.tsx', 'w') as f:
    f.write(content)

