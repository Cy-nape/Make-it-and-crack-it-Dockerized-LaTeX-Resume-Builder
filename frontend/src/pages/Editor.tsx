import { useState, useEffect, useCallback, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Download,
  FileDown,
  FilePlus,
  LayoutTemplate,
  Sun,
  Moon,
  ZoomIn,
  ZoomOut,
  Maximize,
  Copy,
  ChevronDown,
  ChevronUp,
  Check,
  Clock,
  AlertTriangle,
  Loader2,
} from 'lucide-react';

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

const AUTOSAVE_KEY = 'resumeforge_autosave';
const THEME_KEY = 'resumeforge_editor_theme';

export default function Editor() {
  const [texContent, setTexContent] = useState(DEFAULT_TEX);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  const [lastGoodPdfUrl, setLastGoodPdfUrl] = useState<string | null>(null);
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // AI state (untouched)
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // New polish state
  const [saveStatus, setSaveStatus] = useState<'saved' | 'unsaved' | 'saving'>('saved');
  const [compileTime, setCompileTime] = useState<number | null>(null);
  const [editorTheme, setEditorTheme] = useState<'vs-dark' | 'vs-light'>(() => {
    return (localStorage.getItem(THEME_KEY) as 'vs-dark' | 'vs-light') || 'vs-dark';
  });
  const [zoomLevel, setZoomLevel] = useState(100);
  const [showErrorPanel, setShowErrorPanel] = useState(true);
  const [templateLoaded, setTemplateLoaded] = useState(false);

  const compileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const initialLoadRef = useRef(true);

  // ============================================
  // TEMPLATE LOADING (from URL param)
  // ============================================
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
          setTemplateLoaded(true);
          localStorage.setItem(AUTOSAVE_KEY, content);
          setSaveStatus('saved');
        })
        .catch(err => {
          console.error('Failed to load template:', err);
          // Fall through to autosave restore
        });
    } else {
      // Restore from localStorage
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved && saved.trim().length > 0) {
        setTexContent(saved);
      }
    }
    initialLoadRef.current = false;
  }, []);

  // ============================================
  // AUTO-SAVE (debounced, 500ms)
  // ============================================
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

  // ============================================
  // DEBOUNCED COMPILATION (1.5s)
  // ============================================
  useEffect(() => {
    if (compileTimerRef.current) clearTimeout(compileTimerRef.current);
    compileTimerRef.current = setTimeout(() => {
      compileLatex(texContent);
    }, 1500);

    return () => {
      if (compileTimerRef.current) clearTimeout(compileTimerRef.current);
    };
  }, [texContent]);

  // ============================================
  // KEYBOARD SHORTCUTS
  // ============================================
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

  // ============================================
  // COMPILE LATEX
  // ============================================
  const compileLatex = useCallback(async (content: string) => {
    setIsCompiling(true);
    setCompileError(null);
    const startTime = performance.now();

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/latex/compile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ texContent: content }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.log || errData.error || 'Compilation failed');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Clean up old URL
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);

      setPdfBlob(blob);
      setPdfUrl(url);
      setLastGoodPdfUrl(url);
      setCompileTime(Math.round(performance.now() - startTime) / 1000);
    } catch (err: any) {
      setCompileError(err.message);
      setCompileTime(null);
      console.error(err);
    } finally {
      setIsCompiling(false);
    }
  }, [token, pdfUrl]);

  // ============================================
  // DOWNLOAD HANDLERS
  // ============================================
  const getFileName = (ext: string) => {
    const name = user?.name?.replace(/\s+/g, '_').toLowerCase() || 'resume';
    return `${name}_resume.${ext}`;
  };

  const handleDownloadPdf = () => {
    if (!pdfBlob) return;
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = getFileName('pdf');
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
    a.download = getFileName('tex');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ============================================
  // NEW RESUME
  // ============================================
  const handleNewResume = () => {
    const confirmed = window.confirm(
      'Start a new resume? Your current work will be cleared.\n\n(Your last auto-save is in the browser — this cannot be undone.)'
    );
    if (!confirmed) return;
    setTexContent(DEFAULT_TEX);
    setPdfUrl(null);
    setPdfBlob(null);
    setLastGoodPdfUrl(null);
    setCompileError(null);
    setCompileTime(null);
    localStorage.setItem(AUTOSAVE_KEY, DEFAULT_TEX);
    setSaveStatus('saved');
  };

  // ============================================
  // THEME TOGGLE
  // ============================================
  const toggleTheme = () => {
    const next = editorTheme === 'vs-dark' ? 'vs-light' : 'vs-dark';
    setEditorTheme(next);
    localStorage.setItem(THEME_KEY, next);
  };

  // ============================================
  // ZOOM
  // ============================================
  const handleZoomIn = () => setZoomLevel(prev => Math.min(prev + 15, 200));
  const handleZoomOut = () => setZoomLevel(prev => Math.max(prev - 15, 50));
  const handleZoomFit = () => setZoomLevel(100);

  // ============================================
  // AI HANDLERS (untouched)
  // ============================================
  const handleAskAI = async () => {
    setIsAnalyzing(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/ai/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ texContent }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Analysis failed');
      }

      const data = await response.json();
      setAiAnalysis(data);
    } catch (err: any) {
      console.error(err);
      alert(`Failed to analyze resume: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleTailor = async () => {
    const jobDescription = prompt("Paste the job description or role:");
    if (!jobDescription) return;

    setIsAnalyzing(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/ai/tailor`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ texContent, jobDescription }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Tailoring failed');
      }

      const data = await response.json();
      if (data.tailoredTex) {
        setTexContent(data.tailoredTex);
        alert(`Tailoring complete! Match Score: ${data.matchScore}\nGap Report: ${data.gapReport}`);
      }
    } catch (err: any) {
      console.error(err);
      alert(`Failed to tailor resume: ${err.message}`);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // ============================================
  // RENDER
  // ============================================
  const isDark = editorTheme === 'vs-dark';
  const displayPdfUrl = pdfUrl || lastGoodPdfUrl;

  return (
    <div className={`h-screen w-screen overflow-hidden flex flex-col ${isDark ? 'bg-zinc-950' : 'bg-gray-100'}`}>
      {/* ===== HEADER ===== */}
      <header className={`h-13 flex items-center justify-between px-3 border-b shrink-0 ${
        isDark
          ? 'bg-zinc-900 border-zinc-800 text-white'
          : 'bg-white border-gray-200 text-gray-900'
      }`}>
        {/* Left section */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/')}
            className={`p-1.5 rounded-md transition-colors ${isDark ? 'text-zinc-400 hover:text-white hover:bg-zinc-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'}`}
            title="Back to Dashboard"
          >
            ← 
          </button>
          <div className={`w-px h-5 ${isDark ? 'bg-zinc-700' : 'bg-gray-300'}`} />
          <h1 className="font-semibold text-sm">Resume Editor</h1>

          {/* Save status */}
          <div className={`flex items-center gap-1 text-xs ml-2 ${
            saveStatus === 'saved'
              ? (isDark ? 'text-emerald-400' : 'text-emerald-600')
              : (isDark ? 'text-amber-400' : 'text-amber-600')
          }`}>
            {saveStatus === 'saved' ? <Check size={12} /> : <Clock size={12} />}
            {saveStatus === 'saved' ? 'Saved' : 'Unsaved changes'}
          </div>

          {/* Compile time */}
          {compileTime !== null && !isCompiling && !compileError && (
            <span className={`text-xs ml-2 ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
              Compiled in {compileTime}s
            </span>
          )}
          {isCompiling && (
            <span className={`flex items-center gap-1 text-xs ml-2 ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
              <Loader2 size={12} className="animate-spin" />
              Compiling...
            </span>
          )}
        </div>

        {/* Right section */}
        <div className="flex items-center gap-1.5">
          {/* New Resume */}
          <button
            onClick={handleNewResume}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isDark
                ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
            title="Start fresh"
          >
            <FilePlus size={14} />
            New
          </button>

          {/* Templates */}
          <button
            onClick={() => navigate('/templates')}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isDark
                ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
            title="Browse templates"
          >
            <LayoutTemplate size={14} />
            Templates
          </button>

          {/* Theme toggle */}
          <button
            onClick={toggleTheme}
            className={`p-1.5 rounded-md transition-colors ${
              isDark
                ? 'text-zinc-400 hover:text-amber-300 hover:bg-zinc-800'
                : 'text-gray-500 hover:text-indigo-600 hover:bg-gray-100'
            }`}
            title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {isDark ? <Sun size={15} /> : <Moon size={15} />}
          </button>

          <div className={`w-px h-5 ${isDark ? 'bg-zinc-700' : 'bg-gray-300'}`} />

          {/* Download .tex */}
          <button
            onClick={handleDownloadTex}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              isDark
                ? 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
            }`}
            title="Download LaTeX source file"
          >
            <FileDown size={14} />
            .tex
          </button>

          {/* Download PDF */}
          <button
            onClick={handleDownloadPdf}
            disabled={!pdfBlob || isCompiling}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              !pdfBlob || isCompiling
                ? 'opacity-40 cursor-not-allowed bg-blue-600/50 text-white/70'
                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-sm hover:shadow-blue-500/25'
            }`}
            title={
              isCompiling
                ? 'Compiling...'
                : !pdfBlob
                ? 'Compile successfully before downloading'
                : 'Download compiled PDF'
            }
          >
            {isCompiling ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            PDF
          </button>

          <div className={`w-px h-5 ${isDark ? 'bg-zinc-700' : 'bg-gray-300'}`} />

          {/* AI Buttons (untouched) */}
          <button
            onClick={handleAskAI}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-md text-xs font-medium transition-colors"
          >
            {isAnalyzing ? 'Analyzing...' : 'Ask AI'}
          </button>
          <button
            onClick={handleTailor}
            disabled={isAnalyzing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-md text-xs font-medium transition-colors"
          >
            Tailor to Job
          </button>
        </div>
      </header>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex">
          {/* EDITOR PANE */}
          <div className="flex-1 h-full w-full min-w-0">
            <MonacoEditor
              height="100%"
              language="latex"
              theme={editorTheme}
              value={texContent}
              onChange={(value) => setTexContent(value || '')}
              options={{
                minimap: { enabled: false },
                wordWrap: 'on',
                fontSize: 14,
                lineNumbers: 'on',
                renderLineHighlight: 'gutter',
                scrollBeyondLastLine: false,
                padding: { top: 8 },
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                bracketPairColorization: { enabled: true },
              }}
            />
          </div>

          {/* PREVIEW PANE */}
          <div className={`flex-1 h-full flex flex-col min-w-0 border-l ${
            isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-200 border-gray-300'
          }`}>
            {/* Zoom toolbar */}
            <div className={`flex items-center justify-between px-3 py-1.5 border-b shrink-0 ${
              isDark ? 'bg-zinc-900 border-zinc-800' : 'bg-gray-100 border-gray-300'
            }`}>
              <span className={`text-xs font-medium ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                Preview
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={handleZoomOut}
                  className={`p-1 rounded transition-colors ${isDark ? 'text-zinc-500 hover:text-white hover:bg-zinc-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`}
                  title="Zoom out"
                >
                  <ZoomOut size={14} />
                </button>
                <span className={`text-xs min-w-[3rem] text-center tabular-nums ${isDark ? 'text-zinc-500' : 'text-gray-500'}`}>
                  {zoomLevel}%
                </span>
                <button
                  onClick={handleZoomIn}
                  className={`p-1 rounded transition-colors ${isDark ? 'text-zinc-500 hover:text-white hover:bg-zinc-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`}
                  title="Zoom in"
                >
                  <ZoomIn size={14} />
                </button>
                <button
                  onClick={handleZoomFit}
                  className={`p-1 rounded transition-colors ${isDark ? 'text-zinc-500 hover:text-white hover:bg-zinc-800' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-200'}`}
                  title="Fit to width"
                >
                  <Maximize size={14} />
                </button>
              </div>
            </div>

            {/* PDF / Error content */}
            <div className="flex-1 relative overflow-auto">
              {/* Show the PDF preview (last good or current) */}
              {displayPdfUrl && !compileError && (
                <div
                  className="w-full h-full flex items-start justify-center overflow-auto"
                >
                  <iframe
                    src={displayPdfUrl + '#toolbar=0'}
                    className="border-0"
                    style={{
                      width: `${zoomLevel}%`,
                      height: `${zoomLevel}%`,
                      minHeight: '100%',
                      transformOrigin: 'top center',
                    }}
                    title="PDF Preview"
                  />
                </div>
              )}

              {/* Show last good PDF behind the error panel */}
              {compileError && lastGoodPdfUrl && (
                <div className="w-full h-full opacity-30">
                  <iframe
                    src={lastGoodPdfUrl + '#toolbar=0'}
                    className="w-full h-full border-0"
                    title="Previous PDF Preview"
                  />
                </div>
              )}

              {/* No PDF at all */}
              {!displayPdfUrl && !compileError && !isCompiling && (
                <div className={`flex h-full items-center justify-center ${isDark ? 'text-zinc-600' : 'text-gray-400'}`}>
                  <div className="text-center">
                    <FileDown size={40} className="mx-auto mb-3 opacity-50" />
                    <p className="text-sm">Waiting for compilation...</p>
                    <p className="text-xs mt-1 opacity-60">Start typing LaTeX to see the preview</p>
                  </div>
                </div>
              )}

              {!displayPdfUrl && isCompiling && (
                <div className={`flex h-full items-center justify-center ${isDark ? 'text-zinc-500' : 'text-gray-400'}`}>
                  <div className="text-center">
                    <Loader2 size={32} className="mx-auto mb-3 animate-spin" />
                    <p className="text-sm">Compiling...</p>
                  </div>
                </div>
              )}

              {/* Error panel overlay */}
              {compileError && (
                <div className={`absolute bottom-0 left-0 right-0 ${lastGoodPdfUrl ? 'max-h-[60%]' : 'inset-0'} flex flex-col`}>
                  <button
                    onClick={() => setShowErrorPanel(!showErrorPanel)}
                    className={`flex items-center justify-between px-4 py-2 shrink-0 ${
                      isDark
                        ? 'bg-red-950/90 border-t border-red-900/50 text-red-400'
                        : 'bg-red-50 border-t border-red-200 text-red-700'
                    }`}
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <AlertTriangle size={14} />
                      Compilation Error
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigator.clipboard.writeText(compileError);
                        }}
                        className={`p-1 rounded transition-colors ${isDark ? 'hover:bg-red-900/50' : 'hover:bg-red-100'}`}
                        title="Copy error"
                      >
                        <Copy size={13} />
                      </button>
                      {showErrorPanel ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                    </div>
                  </button>
                  {showErrorPanel && (
                    <div className={`flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed ${
                      isDark ? 'bg-zinc-950/95 text-red-300' : 'bg-white text-red-800'
                    }`}>
                      <pre className="whitespace-pre-wrap">{compileError}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* AI Analysis Sidebar (untouched) */}
        {aiAnalysis && (
          <div className={`w-80 border-l p-4 overflow-y-auto shrink-0 ${
            isDark
              ? 'bg-zinc-900 border-zinc-800 text-white'
              : 'bg-white border-gray-200 text-gray-900'
          }`}>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">AI Feedback</h2>
              <button onClick={() => setAiAnalysis(null)} className={isDark ? 'text-zinc-500 hover:text-white' : 'text-gray-400 hover:text-gray-700'}>×</button>
            </div>

            <div className="mb-6 text-center">
              <div className="text-4xl font-bold text-blue-500 mb-2">{aiAnalysis.score}/100</div>
              <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>{aiAnalysis.summary}</p>
            </div>

            <div className="space-y-4">
              {aiAnalysis.sections?.map((sec: any, idx: number) => (
                <div key={idx} className={`p-3 rounded-lg border ${
                  isDark ? 'bg-zinc-800/50 border-zinc-700' : 'bg-gray-50 border-gray-200'
                }`}>
                  <h4 className="font-medium mb-1">{sec.name}</h4>
                  <p className={`text-sm ${isDark ? 'text-zinc-400' : 'text-gray-600'}`}>{sec.feedback}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Keyboard shortcut hint */}
      <div className={`h-6 flex items-center justify-end px-3 text-[10px] border-t shrink-0 ${
        isDark
          ? 'bg-zinc-900 border-zinc-800 text-zinc-600'
          : 'bg-gray-50 border-gray-200 text-gray-400'
      }`}>
        <span className="mr-4">⌘S Save & Compile</span>
        <span>⌘↵ Force Compile</span>
      </div>
    </div>
  );
}
