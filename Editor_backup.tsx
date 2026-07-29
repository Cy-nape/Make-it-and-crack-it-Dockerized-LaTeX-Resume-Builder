import { useState, useEffect, useCallback, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const DEFAULT_TEX = `\\documentclass{article}
\\usepackage[margin=1in]{geometry}

\\begin{document}

\\begin{center}
  {\\LARGE\\bfseries Your Name Here} \\\\[4pt]
  \\small email@example.com \\enspace|\\enspace (555) 123-4567 \\enspace|\\enspace City, ST
\\end{center}

\\section*{Experience}
\\textbf{Job Title} \\hfill Start -- Present \\\\
\\textit{Company Name} \\hfill City, ST
\\begin{itemize}
  \\item Accomplished X by doing Y which resulted in Z
  \\item Led a team of N people to deliver project on time
\\end{itemize}

\\section*{Education}
\\textbf{Degree} \\hfill Year \\\\
\\textit{University Name} \\hfill City, ST

\\section*{Skills}
Languages, Frameworks, Tools, etc.

\\end{document}
`;

const AUTOSAVE_KEY = 'makeitandcrackit_autosave';

export default function Editor() {
  const [texContent, setTexContent] = useState(DEFAULT_TEX);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [lastGoodPdfUrl, setLastGoodPdfUrl] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved'>('saved');
  const [zoomLevel, setZoomLevel] = useState(100);

  const compileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(true);

  // Template Loading
  useEffect(() => {
    const templateId = searchParams.get('template');
    if (templateId) {
      fetch(`/templates/${templateId}.tex`)
        .then(res => {
          if (!res.ok) throw new Error('Template not found');
          return res.text();
        })
        .then(content => {
          setTexContent(content);
          localStorage.setItem(AUTOSAVE_KEY, content);
          setSaveStatus('saved');
        })
        .catch(err => {
          console.error('Failed to load template:', err);
        });
    } else {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved && saved.trim().length > 0) {
        setTexContent(saved);
      }
    }
    initialLoadRef.current = false;
  }, []);

  // Auto-save
  useEffect(() => {
    if (initialLoadRef.current) return;
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      localStorage.setItem(AUTOSAVE_KEY, texContent);
      setSaveStatus('saved');
    }, 500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [texContent]);

  // Debounced Compilation
  useEffect(() => {
    if (compileTimerRef.current) clearTimeout(compileTimerRef.current);
    compileTimerRef.current = setTimeout(() => {
      compileLatex(texContent);
    }, 1500);
    return () => {
      if (compileTimerRef.current) clearTimeout(compileTimerRef.current);
    };
  }, [texContent]);

  // Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (isCtrlOrCmd && e.key === 's') {
        e.preventDefault();
        localStorage.setItem(AUTOSAVE_KEY, texContent);
        setSaveStatus('saved');
        compileLatex(texContent);
      }
      if (isCtrlOrCmd && e.key === 'Enter') {
        e.preventDefault();
        compileLatex(texContent);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [texContent]);

  // Compilation Logic
  const compileLatex = useCallback(async (content: string) => {
    setIsCompiling(true);
    setCompileError(null);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const response = await fetch(`${apiUrl}/api/latex/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texContent: content }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.log || errData.error || 'Compilation failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfBlob(blob);
      setPdfUrl(url);
      setLastGoodPdfUrl(url);
    } catch (err: any) {
      setCompileError(err.message);
      console.error(err);
    } finally {
      setIsCompiling(false);
    }
  }, [pdfUrl]);

  // Downloads
  const handleDownloadPdf = () => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resume.pdf';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadTex = () => {
    const blob = new Blob([texContent], { type: 'application/x-tex' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'resume.tex';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleNewResume = () => {
    const confirmed = window.confirm('Start a new resume? Your current work will be cleared.');
    if (!confirmed) return;
    setTexContent(DEFAULT_TEX);
    setPdfUrl(null);
    setPdfBlob(null);
    setLastGoodPdfUrl(null);
    setCompileError(null);
    localStorage.setItem(AUTOSAVE_KEY, DEFAULT_TEX);
    setSaveStatus('saved');
  };

  const displayPdfUrl = pdfUrl || lastGoodPdfUrl;

  return (
    <div className="h-screen w-screen flex flex-col bg-white text-black font-sans">
      {/* HEADER */}
      <header className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/')} className="text-blue-600 hover:underline">Back</button>
          <span className="font-bold">Editor</span>
          <span className="text-sm text-gray-500">
            {saveStatus === 'saved' ? 'Saved' : 'Unsaved changes...'}
          </span>
          {isCompiling && <span className="text-sm text-blue-600">Compiling...</span>}
        </div>

        <div className="flex items-center gap-2">
          <button onClick={handleNewResume} className="px-3 py-1 border rounded hover:bg-gray-100 text-sm">New</button>
          <button onClick={() => navigate('/templates')} className="px-3 py-1 border rounded hover:bg-gray-100 text-sm">Templates</button>
          <button onClick={handleDownloadTex} className="px-3 py-1 border rounded hover:bg-gray-100 text-sm">Download .tex</button>
          <button 
            onClick={handleDownloadPdf} 
            disabled={!pdfBlob || isCompiling}
            className="px-3 py-1 border rounded bg-blue-600 text-white disabled:opacity-50 text-sm"
          >
            Download PDF
          </button>
        </div>
      </header>

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex overflow-hidden">
        {/* EDITOR */}
        <div className="flex-1 h-full w-full border-r">
          <MonacoEditor
            height="100%"
            language="latex"
            theme="vs-light"
            value={texContent}
            onChange={(val) => setTexContent(val || '')}
            options={{ minimap: { enabled: false }, wordWrap: 'on' }}
          />
        </div>

        {/* PREVIEW */}
        <div className="flex-1 h-full flex flex-col bg-gray-100 relative">
          <div className="flex justify-between items-center px-4 py-2 border-b bg-gray-50">
            <span className="font-bold text-sm">Preview</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setZoomLevel(z => Math.max(z - 15, 50))} className="px-2 border rounded bg-white text-sm">-</button>
              <span className="text-sm">{zoomLevel}%</span>
              <button onClick={() => setZoomLevel(z => Math.min(z + 15, 200))} className="px-2 border rounded bg-white text-sm">+</button>
              <button onClick={() => setZoomLevel(100)} className="px-2 border rounded bg-white text-sm">Reset</button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto relative">
            {displayPdfUrl && !compileError && (
              <div className="w-full h-full overflow-auto p-4 flex justify-center items-start">
                <iframe
                  src={displayPdfUrl + '#toolbar=0'}
                  className="border"
                  style={{
                    width: `${zoomLevel}%`,
                    height: `${zoomLevel}%`,
                    minHeight: '100%',
                  }}
                  title="PDF Preview"
                />
              </div>
            )}
            
            {compileError && lastGoodPdfUrl && (
              <div className="w-full h-full p-4 flex justify-center items-start opacity-50">
                <iframe
                  src={lastGoodPdfUrl + '#toolbar=0'}
                  className="w-full h-full border"
                  title="Previous PDF"
                />
              </div>
            )}

            {!displayPdfUrl && !isCompiling && !compileError && (
              <div className="flex items-center justify-center h-full text-gray-500">Waiting for compilation...</div>
            )}

            {compileError && (
              <div className="absolute bottom-0 left-0 right-0 bg-red-50 border-t border-red-200 p-4 max-h-64 overflow-auto">
                <h3 className="font-bold text-red-700 mb-2">Compilation Error</h3>
                <pre className="text-xs text-red-600 whitespace-pre-wrap font-mono">{compileError}</pre>
              </div>
            )}
          </div>
        </div>
      </div>
      
      <div className="bg-gray-50 border-t p-1 px-4 text-xs text-gray-500 text-right">
        ⌘S Save & Compile | ⌘↵ Force Compile
      </div>
    </div>
  );
}
