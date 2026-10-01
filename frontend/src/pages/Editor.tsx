// Yaha React ke zaruri hooks import kiye
// useState: variables store karne ke liye (jaise loading, error, results)
// useEffect: page load ya kisi cheez ke change hone par kuch run karne ke liye
// useCallback: function ko unnecessary baar baar naye se banana band karne ke liye
// useRef: timer reference rakhne ke liye
import { useState, useEffect, useCallback, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';

// Ye default LaTeX template hai jo blank editor khulne par dikhega
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

// LocalStorage mein autosave key - is naam se resume save hoga browser mein
const AUTOSAVE_KEY = 'makeitandcrackit_autosave';

export default function Editor() {
  // --- State Variables ---
  // texContent: editor mein jo LaTeX likhi hai wo yahan store hoti hai
  const [texContent, setTexContent] = useState(DEFAULT_TEX);
  // pdfUrl: compile hone ke baad PDF ka temporary URL
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
  // isCompiling: jab PDF ban rahi ho tab true hota hai (loading dikhane ke liye)
  const [isCompiling, setIsCompiling] = useState(false);
  const [compileError, setCompileError] = useState<string | null>(null);
  // lastGoodPdfUrl: pichli successful compile ka PDF - error pe bhi dikhata rahe
  const [lastGoodPdfUrl, setLastGoodPdfUrl] = useState<string | null>(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // --- AI Assessment ke liye State Variables ---
  const [showAiPanel, setShowAiPanel] = useState(false);
  const apiKey = (import.meta.env.VITE_GEMINI_API_KEY || '').trim();
  const [isAssessing, setIsAssessing] = useState(false);
  const [assessmentResult, setAssessmentResult] = useState<string | null>(null);
  const [assessmentError, setAssessmentError] = useState<string | null>(null);

  // --- AI Panel active tab: 'assess' | 'jdmatch' | 'rewrite' ---
  const [aiTab, setAiTab] = useState<'assess' | 'jdmatch' | 'rewrite'>('assess');

  // --- JD Matcher state ---
  const [jdText, setJdText] = useState('');
  const [jdMatchData, setJdMatchData] = useState<any>(null); // Backend ka deterministic result
  const [jdResult, setJdResult] = useState<string | null>(null); // AI suggestions
  const [isMatchingJd, setIsMatchingJd] = useState(false);
  const [jdError, setJdError] = useState<string | null>(null);

  // --- Bullet Rewriter state ---
  const [selectedBullet, setSelectedBullet] = useState('');
  const [rewriteResult, setRewriteResult] = useState<string | null>(null);
  const [isRewriting, setIsRewriting] = useState(false);
  const [rewriteError, setRewriteError] = useState<string | null>(null);

  // --- Refs ---
  const compileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<any>(null);

  // --- Resizer State ---
  const [editorWidth, setEditorWidth] = useState(50);
  const [aiPanelWidth, setAiPanelWidth] = useState(420);
  const [isResizing, setIsResizing] = useState(false);
  const resizeType = useRef<'editor' | 'ai' | null>(null);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeType.current) return;
      
      if (resizeType.current === 'editor') {
        const container = document.getElementById('main-workspace');
        if (container) {
          const containerRect = container.getBoundingClientRect();
          const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
          if (newWidth > 20 && newWidth < 80) {
            setEditorWidth(newWidth);
          }
        }
      } else if (resizeType.current === 'ai') {
        const newWidth = window.innerWidth - e.clientX;
        if (newWidth > 250 && newWidth < 800) {
          setAiPanelWidth(newWidth);
        }
      }
    };

    const handleMouseUp = () => {
      resizeType.current = null;
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const handleEditorMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeType.current = 'editor';
    setIsResizing(true);
  };
  
  const handleAiMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    resizeType.current = 'ai';
    setIsResizing(true);
  };

  // --- Template Loading ---
  // Page load hone par check karo ki koi template select hua hai ya nahi
  // Agar hai toh template ka .tex file fetch karo, warna autosave load karo
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
        })
        .catch(err => {
          console.error('Failed to load template:', err);
        });
    } else {
      // Koi template nahi - browser mein pehle se save kiya hua content lo
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved && saved.trim().length > 0) {
        setTexContent(saved);
      }
    }
  }, []);

  // --- Debounced Compilation ---
  // User type karna band kare aur 1.5 second baad auto-compile shuru ho
  // Har keystroke pe timer reset ho jaata hai
  useEffect(() => {
    if (compileTimerRef.current) clearTimeout(compileTimerRef.current);
    compileTimerRef.current = setTimeout(() => {
      compileLatex(texContent);
    }, 1500);
    return () => {
      if (compileTimerRef.current) clearTimeout(compileTimerRef.current);
    };
  }, [texContent]);

  // --- Keyboard Shortcuts ---
  // Ctrl+S / Cmd+S: save karo aur compile karo
  // Ctrl+Enter / Cmd+Enter: force compile karo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCtrlOrCmd = e.ctrlKey || e.metaKey;
      if (isCtrlOrCmd && e.key === 's') {
        e.preventDefault();
        localStorage.setItem(AUTOSAVE_KEY, texContent);
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

  // --- LaTeX Compilation Logic ---
  // Ye function backend ko LaTeX bhejta hai aur wapas PDF leta hai
  const compileLatex = useCallback(async (content: string) => {
    setIsCompiling(true);
    setCompileError(null);
    try {
      // VITE_API_URL env variable se backend ka address leta hai
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

      // PDF ko blob ke roop mein receive kiya aur ek temporary URL banaya
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);

      // Purana URL revoke karo (memory free karo) aur naya set karo
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

  // --- Download Functions ---
  // PDF download karne ka button - blob se ek temporary link banata hai
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

  // .tex file download karna - seedha text content ko file mein daal deta hai
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

  // Naya resume shuru karne ka function - pehle confirm karta hai user se
  const handleNewResume = () => {
    const confirmed = window.confirm('Start a new resume? Your current work will be cleared.');
    if (!confirmed) return;
    setTexContent(DEFAULT_TEX);
    setPdfUrl(null);
    setPdfBlob(null);
    setLastGoodPdfUrl(null);
    setCompileError(null);
    localStorage.setItem(AUTOSAVE_KEY, DEFAULT_TEX);
  };

  // --- Reusable Gemini API Helper ---
  // Ye function Gemini API ko call karta hai aur response text return karta hai
  const callGemini = async (prompt: string): Promise<string> => {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    });

    const rawText = await response.text();
    let data: any;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new Error(`Gemini ne unexpected response bheja: ${rawText.substring(0, 150)}`);
    }

    if (!response.ok) {
      const errMsg = data?.error?.message || `API Error: ${response.status}`;
      if (response.status === 403) throw new Error('API key valid nahi hai. aistudio.google.com pe check karo.');
      if (response.status === 429) throw new Error('Rate limit hit. Thodi der baad try karo.');
      throw new Error(errMsg);
    }

    const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!resultText) throw new Error('Gemini ne khaali response bheja. Dobara try karo.');
    return resultText;
  };

  // --- Feature 1: AI Assessment ---
  const handleAssessResume = async () => {
    if (!apiKey.trim()) {
      setAssessmentError('Demo Mode: AI features are disabled in this public deployment to prevent API abuse. The LaTeX compiler is fully functional!');
      return;
    }

    setIsAssessing(true);
    setAssessmentResult(null);
    setAssessmentError(null);

    try {
      const prompt = `You are an expert technical recruiter. Review the following LaTeX resume and provide a concise assessment in ENGLISH ONLY. Keep the response short and directly to the point.

Format your response strictly into these 3 sections:
1. **Overall Score**: Give a score out of 10 with a one-sentence justification.
2. **Weaknesses**: List 2-3 brief bullet points on what is lacking or weak.
3. **Suggestions**: Provide 2-3 brief, actionable suggestions to improve the resume.

LaTeX Code:
---
${texContent}
---`;

      const result = await callGemini(prompt);
      setAssessmentResult(result);
    } catch (err: any) {
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setAssessmentError('Network error - internet connection check karo.');
      } else {
        setAssessmentError(err.message);
      }
    } finally {
      setIsAssessing(false);
    }
  };

  // --- Feature 3: Job Description Matcher ---
  // Pehle backend se deterministic keyword matching hogi
  // Phir AI se qualitative suggestions aayengi
  const handleMatchJd = async () => {
    if (!jdText.trim()) {
      setJdError('Job description paste karo pehle!');
      return;
    }

    setIsMatchingJd(true);
    setJdMatchData(null);
    setJdResult(null);
    setJdError(null);

    try {
      let extractedSkills = [];

      // Step 0: Agar API key hai, toh Gemini se exact skills nikalwao (taaki faltu words na aaye)
      if (apiKey.trim()) {
        try {
          const extractPrompt = `You are an expert technical recruiter. Extract ALL the core hard skills, soft skills, and technologies required from this job description. 
Return ONLY a JSON array of strings (e.g. ["python", "react", "communication", "machine learning"]). 
Do not include generic words like "advantage", "basic", "good", "algorithms", "analytical", "concepts", "effectively".
IMPORTANT: Your entire response must be a single valid JSON array and NOTHING else. No markdown formatting, no backticks, no explanations.

Job Description:
${jdText}`;
          const skillResult = await callGemini(extractPrompt);
          
          // Regex se JSON array extract karne ki koshish (agar AI ne kuch extra text de diya)
          const jsonMatch = skillResult.match(/\[([\s\S]*)\]/);
          if (jsonMatch) {
            extractedSkills = JSON.parse(jsonMatch[0]);
          } else {
            // Backup parsing
            const cleanJson = skillResult.replace(/```json/gi, '').replace(/```/g, '').trim();
            extractedSkills = JSON.parse(cleanJson);
          }
        } catch (e: any) {
          console.error("AI skill extraction failed", e);
          // Silent fallback ki jagah user ko batao ki AI fail hua hai
          throw new Error(`AI Skill Extraction failed: ${e.message}. Please check your API key or try again.`);
        }
      }

      // Step 1: Backend se deterministic keyword matching
      const apiUrl = import.meta.env.VITE_API_URL || '';
      const matchResponse = await fetch(`${apiUrl}/api/jd/match`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          texContent: texContent, 
          jdText: jdText,
          skills: extractedSkills.length > 0 ? extractedSkills : undefined
        }),
      });

      const matchData = await matchResponse.json();
      if (!matchResponse.ok) {
        throw new Error(matchData.error || 'Matching failed');
      }
      setJdMatchData(matchData);

      // Step 2: AI se qualitative suggestions (optional - sirf agar API key hai)
      if (apiKey.trim()) {
        const prompt = `You are an expert resume consultant. Based on the keyword analysis below, provide 3-4 specific, actionable suggestions to improve the resume's match with the job description. RESPOND IN ENGLISH ONLY. Be concise.

Match Percentage: ${matchData.matchPercentage}%
Matched Keywords: ${matchData.matchedKeywords.join(', ')}
Missing Keywords: ${matchData.missingKeywords.slice(0, 20).join(', ')}

For each suggestion, show the EXACT change to make in the LaTeX resume.

Resume LaTeX:
---
${texContent.substring(0, 2000)}
---`;

        const result = await callGemini(prompt);
        setJdResult(result);
      }
    } catch (err: any) {
      setJdError(err.message);
    } finally {
      setIsMatchingJd(false);
    }
  };

  // --- Feature 4: Bullet Point Rewriter ---
  const handleGrabSelection = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const selectedText = editor.getModel()?.getValueInRange(selection) || '';
    setSelectedBullet(selectedText.trim());
  };

  const handleRewriteBullet = async () => {
    if (!apiKey.trim()) {
      setRewriteError('Demo Mode: AI features are disabled in this public deployment to prevent API abuse. The LaTeX compiler is fully functional!');
      return;
    }
    if (!selectedBullet.trim()) {
      setRewriteError('Pehle editor mein text select karo, phir "Grab Selection" dabao!');
      return;
    }

    setIsRewriting(true);
    setRewriteResult(null);
    setRewriteError(null);

    try {
      const prompt = `You are an expert resume writer. Rewrite the following resume bullet point(s) to be more impactful. RESPOND IN ENGLISH ONLY.

Rules:
- Start each bullet with a strong ACTION VERB (Led, Engineered, Optimized, Spearheaded, etc.)
- Add QUANTIFIED IMPACT where possible (%, $, time saved, users impacted)
- Keep the LaTeX formatting (\\\\item, \\\\textbf, etc.) intact
- Provide 2-3 alternative rewrites for each bullet
- Format each rewrite as a numbered option

Original text:
---
${selectedBullet}
---

Context from full resume (for relevance):
---
${texContent.substring(0, 1500)}
---`;

      const result = await callGemini(prompt);
      setRewriteResult(result);
    } catch (err: any) {
      setRewriteError(err.message);
    } finally {
      setIsRewriting(false);
    }
  };


  // Preview mein current PDF dikhaao, ya pichli wali agar error aaya

  const displayPdfUrl = pdfUrl || lastGoodPdfUrl;

  return (
    // Main container - poora screen cover karta hai
    <div className="h-screen w-screen flex flex-col bg-white text-black font-sans">

      {/* --- HEADER --- */}
      {/* Top bar jisme buttons hain */}
      <header className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
        <div className="flex items-center gap-4">
          {/* Back button - Dashboard par wapas jaane ke liye */}
          <button onClick={() => navigate('/')} className="text-blue-600 hover:underline">Back</button>
          <span className="font-bold">Editor</span>
          {/* Jab compile ho raha ho tab ye dikhta hai */}
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

          {/* NEW: AI Assess Button - ye button AI panel open ya band karta hai */}
          <button
            onClick={() => {
              setShowAiPanel(!showAiPanel);
            }}
            className={`px-3 py-1 border rounded text-sm font-medium transition-colors ${
              showAiPanel
                ? 'bg-black text-white border-black'
                : 'bg-white text-black border-gray-300 hover:bg-gray-100'
            }`}
          >
            AI Tools
          </button>
        </div>
      </header>

      {/* --- MAIN LAYOUT --- */}
      {/* Teen column layout: Editor | PDF Preview | AI Panel (optional) */}
      <div className="flex-1 flex overflow-hidden">

        {/* Workspace jisme Editor aur Preview honge */}
        <div id="main-workspace" className="flex-1 flex overflow-hidden relative">
        
          {/* --- EDITOR --- */}
          {/* Monaco Editor - VS Code jaisa editor browser mein */}
          <div className="h-full border-r" style={{ width: `${editorWidth}%` }}>
          <MonacoEditor
            height="100%"
            language="latex"
            theme="vs-light"
            value={texContent}
            onMount={(editor) => { editorRef.current = editor; }}
            onChange={(val) => {
              const content = val || '';
              setTexContent(content);
              localStorage.setItem(AUTOSAVE_KEY, content);
            }}
            options={{ minimap: { enabled: false }, wordWrap: 'on' }}
          />
        </div>

        {/* --- DRAG SPLITTER --- */}
        <div
          className="w-2 cursor-col-resize bg-gray-200 hover:bg-purple-400 transition-colors z-10 flex items-center justify-center"
          onMouseDown={handleEditorMouseDown}
        >
          <div className="h-8 w-0.5 bg-gray-400 rounded-full" />
        </div>

        {/* --- PDF PREVIEW --- */}
        {/* Compile hone ke baad PDF yahan dikhti hai */}
        <div className="h-full flex flex-col bg-gray-100 relative" style={{ width: `${100 - editorWidth}%` }}>
          <div className="flex justify-between items-center px-4 py-2 border-b bg-gray-50">
            <span className="font-bold text-sm">Preview</span>
          </div>

          <div className="flex-1 overflow-auto relative">
            {/* Successful PDF dikhao */}
            {displayPdfUrl && !compileError && (
              <div className="w-full h-full overflow-auto p-4 flex justify-center items-start">
                <iframe
                  src={displayPdfUrl + '#toolbar=0'}
                  className={`border ${isResizing ? 'pointer-events-none' : ''}`}
                  style={{ width: '100%', height: '100%', minHeight: '100%' }}
                  title="PDF Preview"
                />
              </div>
            )}

            {/* Error aaya - pichli wali PDF thodi dim karke dikhao */}
            {compileError && lastGoodPdfUrl && (
              <div className="w-full h-full p-4 flex justify-center items-start opacity-50">
                <iframe
                  src={lastGoodPdfUrl + '#toolbar=0'}
                  className={`w-full h-full border ${isResizing ? 'pointer-events-none' : ''}`}
                  title="Previous PDF"
                />
              </div>
            )}

            {/* Abhi tak koi PDF nahi bani */}
            {!displayPdfUrl && !isCompiling && !compileError && (
              <div className="flex items-center justify-center h-full text-gray-500">Waiting for compilation...</div>
            )}

            {/* Compilation error message neeche bar mein dikhao */}
            {compileError && (
              <div className="absolute bottom-0 left-0 right-0 bg-red-50 border-t border-red-200 p-4 max-h-64 overflow-auto">
                <h3 className="font-bold text-red-700 mb-2">Compilation Error</h3>
                <pre className="text-xs text-red-600 whitespace-pre-wrap font-mono">{compileError}</pre>
              </div>
            )}
          </div>
        </div>

        </div>

        {/* --- AI TOOLS PANEL --- */}
        {showAiPanel && (
          <>
            {/* AI Panel Drag Splitter */}
            <div
              className="w-2 cursor-col-resize bg-gray-200 hover:bg-purple-400 transition-colors z-10 flex items-center justify-center border-l border-r"
              onMouseDown={handleAiMouseDown}
            >
              <div className="h-8 w-0.5 bg-gray-400 rounded-full" />
            </div>

            <div className="flex-shrink-0 h-full flex flex-col bg-white" style={{ width: `${aiPanelWidth}px` }}>

            {/* Panel Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b bg-gray-50">
              <div className="flex items-center gap-2">
                <span className="font-bold text-gray-800 text-sm">AI Tools</span>
              </div>
              <button
                onClick={() => setShowAiPanel(false)}
                className="text-gray-400 hover:text-gray-800 text-lg font-bold leading-none"
              >
                ×
              </button>
            </div>

            {/* Tab Bar */}
            <div className="flex border-b bg-gray-50">
              {([
                { id: 'assess' as const, label: 'Assess' },
                { id: 'jdmatch' as const, label: 'JD Match' },
                { id: 'rewrite' as const, label: 'Rewrite' },
              ]).map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setAiTab(tab.id)}
                  className={`flex-1 py-2 text-xs font-medium transition-colors ${
                    aiTab === tab.id
                      ? 'text-black border-b-2 border-black bg-white'
                      : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

              {/* ========== ASSESS TAB ========== */}
              {aiTab === 'assess' && (
                <>
                  <button
                    onClick={handleAssessResume}
                    disabled={isAssessing || !texContent.trim()}
                    className="w-full py-2 px-4 bg-black text-white rounded font-medium text-sm
                               hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed
                               transition-colors flex items-center justify-center gap-2"
                  >
                    {isAssessing ? (
                      <><span className="animate-spin">⟳</span> Analyzing...</>
                    ) : (
                      <>Assess Resume</>
                    )}
                  </button>

                  {/* Skeleton Loading Animation */}
                  {isAssessing && (
                    <div className="bg-gray-50 border border-gray-200 rounded p-4 space-y-3 animate-pulse">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse" style={{animationDelay: '0ms'}} />
                        <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse" style={{animationDelay: '150ms'}} />
                        <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse" style={{animationDelay: '300ms'}} />
                        <span className="text-xs text-gray-600 font-medium ml-1">Analyzing your resume...</span>
                      </div>
                      <div className="h-3 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 rounded w-full" />
                      <div className="h-3 bg-gray-200 rounded w-5/6" />
                      <div className="h-2 bg-gray-100 rounded w-1/2 mt-2" />
                      <div className="h-3 bg-gray-200 rounded w-full" />
                      <div className="h-3 bg-gray-200 rounded w-2/3" />
                      <div className="h-2 bg-gray-100 rounded w-3/4 mt-2" />
                      <div className="h-3 bg-gray-200 rounded w-5/6" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                    </div>
                  )}

                  {assessmentError && (
                    <div className="bg-red-50 border border-red-200 rounded p-3">
                      <p className="text-xs font-bold text-red-700 mb-1">Error:</p>
                      <p className="text-xs text-red-600">{assessmentError}</p>
                    </div>
                  )}

                  {assessmentResult && (
                    <div className="bg-gray-50 border border-gray-200 rounded p-3">
                      <div className="prose prose-xs max-w-none text-gray-800 text-xs leading-relaxed
                                      [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mt-2 [&_h1]:mb-1
                                      [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-gray-800 [&_h2]:mt-2 [&_h2]:mb-1
                                      [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-gray-700 [&_h3]:mt-2 [&_h3]:mb-1
                                      [&_strong]:text-gray-900
                                      [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1
                                      [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1
                                      [&_li]:my-0.5
                                      [&_p]:my-1
                                      [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-gray-900 [&_code]:border [&_code]:border-gray-200">
                        <ReactMarkdown>{assessmentResult}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {!assessmentResult && !assessmentError && !isAssessing && (
                    <div className="text-center text-gray-400 text-xs mt-4">
                      <p className="text-sm font-medium text-gray-500 mb-2">Assess Resume</p>
                      <p>Click the button above to get</p>
                      <p>an AI-powered assessment of</p>
                      <p>your resume with scoring.</p>
                    </div>
                  )}
                </>
              )}

              {/* ========== JD MATCH TAB ========== */}
              {aiTab === 'jdmatch' && (
                <>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">
                      Paste Job Description:
                    </label>
                    <textarea
                      value={jdText}
                      onChange={(e) => setJdText(e.target.value)}
                      placeholder="Paste the full job description here..."
                      className="w-full h-32 border rounded p-2 text-xs resize-none focus:outline-none focus:ring-2 focus:ring-purple-400"
                    />
                  </div>

                  <button
                    onClick={handleMatchJd}
                    disabled={isMatchingJd || !texContent.trim() || !jdText.trim()}
                    className="w-full py-2 px-4 bg-black text-white rounded font-medium text-sm
                               hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed
                               transition-colors flex items-center justify-center gap-2"
                  >
                    {isMatchingJd ? (
                      <><span className="animate-spin">⟳</span> Matching...</>
                    ) : (
                      <>Match Against JD</>
                    )}
                  </button>

                  {/* Skeleton Loading Animation */}
                  {isMatchingJd && (
                    <div className="bg-gray-50 border border-gray-200 rounded p-4 space-y-3 animate-pulse">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse" style={{animationDelay: '0ms'}} />
                        <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse" style={{animationDelay: '150ms'}} />
                        <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse" style={{animationDelay: '300ms'}} />
                        <span className="text-xs text-gray-600 font-medium ml-1">Matching against job description...</span>
                      </div>
                      <div className="h-4 bg-gray-200 rounded w-1/2" />
                      <div className="h-3 bg-gray-200 rounded w-full" />
                      <div className="h-3 bg-gray-200 rounded w-3/4" />
                      <div className="h-2 bg-gray-100 rounded w-2/3 mt-2" />
                      <div className="h-3 bg-gray-200 rounded w-5/6" />
                      <div className="h-3 bg-gray-200 rounded w-full" />
                      <div className="h-3 bg-gray-200 rounded w-1/2" />
                    </div>
                  )}

                  {jdError && (
                    <div className="bg-red-50 border border-red-200 rounded p-3">
                      <p className="text-xs font-bold text-red-700 mb-1">Error:</p>
                      <p className="text-xs text-red-600">{jdError}</p>
                    </div>
                  )}

                  {/* Deterministic Match Results - Backend se aata hai, 100% reliable */}
                  {jdMatchData && (
                    <div className="space-y-3">
                      {/* Match Percentage - Big Number */}
                      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                        <p className="text-xs text-gray-700 font-medium mb-1">Match Percentage</p>
                        <p className={`text-4xl font-bold ${
                          jdMatchData.matchPercentage >= 60 ? 'text-green-600' :
                          jdMatchData.matchPercentage >= 40 ? 'text-amber-600' : 'text-red-600'
                        }`}>
                          {jdMatchData.matchPercentage}%
                        </p>
                        <p className="text-xs text-gray-500 mt-1">
                          Based on {jdMatchData.totalJdKeywords} keywords from JD
                        </p>
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          Deterministic score — same input = same result, always
                        </p>
                      </div>

                      {/* Matched Keywords */}
                      {jdMatchData.matchedKeywords.length > 0 && (
                        <div className="bg-gray-50 border border-gray-200 rounded p-3">
                          <p className="text-xs font-bold text-gray-800 mb-2">
                            Matched Keywords ({jdMatchData.matchedKeywords.length})
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {jdMatchData.matchedKeywords.map((kw: string) => (
                              <span key={kw} className="px-2 py-0.5 bg-gray-200 text-gray-800 rounded-full text-[10px] font-medium">
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Missing Keywords */}
                      {jdMatchData.missingKeywords.length > 0 && (
                        <div className="bg-red-50 border border-red-200 rounded p-3">
                          <p className="text-xs font-bold text-red-700 mb-2">
                            Missing Keywords ({jdMatchData.missingKeywords.length})
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {jdMatchData.missingKeywords.slice(0, 30).map((kw: string) => (
                              <span key={kw} className="px-2 py-0.5 bg-red-100 text-red-800 rounded-full text-[10px] font-medium">
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Matched Phrases */}
                      {jdMatchData.matchedPhrases && jdMatchData.matchedPhrases.length > 0 && (
                        <div className="bg-gray-50 border border-gray-200 rounded p-3">
                          <p className="text-xs font-bold text-gray-800 mb-2">
                            Matched Phrases ({jdMatchData.matchedPhrases.length})
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {jdMatchData.matchedPhrases.map((phrase: string) => (
                              <span key={phrase} className="px-2 py-0.5 bg-gray-200 text-gray-800 rounded-full text-[10px] font-medium">
                                {phrase}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* AI Suggestions - Gemini se aati hain (optional) */}
                  {jdResult && (
                    <div className="bg-gray-50 border border-gray-200 rounded p-3">
                      <p className="text-xs font-bold text-gray-800 mb-2">AI Suggestions:</p>
                      <div className="prose prose-xs max-w-none text-gray-800 text-xs leading-relaxed
                                      [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mt-2 [&_h1]:mb-1
                                      [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-gray-800 [&_h2]:mt-2 [&_h2]:mb-1
                                      [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-gray-700 [&_h3]:mt-2 [&_h3]:mb-1
                                      [&_strong]:text-gray-900
                                      [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1
                                      [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1
                                      [&_li]:my-0.5
                                      [&_p]:my-1
                                      [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-gray-900 [&_code]:border [&_code]:border-gray-200">
                        <ReactMarkdown>{jdResult}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {!jdMatchData && !jdResult && !jdError && !isMatchingJd && (
                    <div className="text-center text-gray-400 text-xs mt-4">
                      <p className="text-sm font-medium mb-1">JD Match</p>
                      <p>Paste a job description above</p>
                      <p>to see how well your resume</p>
                      <p>matches + get tailoring tips.</p>
                    </div>
                  )}
                </>
              )}

              {/* ========== REWRITE TAB ========== */}
              {aiTab === 'rewrite' && (
                <>
                  <div className="bg-gray-50 border border-gray-200 rounded p-3">
                    <p className="text-xs text-gray-600 mb-2">
                      <strong>How to use:</strong> Select text in the editor → click "Grab Selection" → click "Rewrite"
                    </p>
                    <button
                      onClick={handleGrabSelection}
                      className="w-full py-1.5 px-3 bg-white border border-gray-300 text-gray-700 rounded text-xs font-medium
                                 hover:bg-gray-50 transition-colors"
                    >
                      Grab Selection from Editor
                    </button>
                  </div>

                  {selectedBullet && (
                    <div className="bg-gray-50 border border-gray-200 rounded p-3">
                      <p className="text-xs font-bold text-gray-700 mb-1">Selected Text:</p>
                      <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-white p-2 rounded border">
                        {selectedBullet}
                      </pre>
                    </div>
                  )}

                  <button
                    onClick={handleRewriteBullet}
                    disabled={isRewriting || !selectedBullet.trim()}
                    className="w-full py-2 px-4 bg-black text-white rounded font-medium text-sm
                               hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed
                               transition-colors flex items-center justify-center gap-2"
                  >
                    {isRewriting ? (
                      <><span className="animate-spin">⟳</span> Rewriting...</>
                    ) : (
                      <>Rewrite with AI</>
                    )}
                  </button>

                  {/* Skeleton Loading Animation */}
                  {isRewriting && (
                    <div className="bg-gray-50 border border-gray-200 rounded p-4 space-y-3 animate-pulse">
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse" style={{animationDelay: '0ms'}} />
                        <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse" style={{animationDelay: '150ms'}} />
                        <div className="w-4 h-4 bg-gray-300 rounded-full animate-pulse" style={{animationDelay: '300ms'}} />
                        <span className="text-xs text-gray-600 font-medium ml-1">Rewriting with stronger impact...</span>
                      </div>
                      <div className="h-3 bg-gray-200 rounded w-full" />
                      <div className="h-3 bg-gray-200 rounded w-5/6" />
                      <div className="h-2 bg-gray-100 rounded w-1/2 mt-2" />
                      <div className="h-3 bg-gray-200 rounded w-3/4" />
                      <div className="h-3 bg-gray-200 rounded w-full" />
                    </div>
                  )}

                  {rewriteError && (
                    <div className="bg-red-50 border border-red-200 rounded p-3">
                      <p className="text-xs font-bold text-red-700 mb-1">Error:</p>
                      <p className="text-xs text-red-600">{rewriteError}</p>
                    </div>
                  )}

                  {rewriteResult && (
                    <div className="bg-gray-50 border border-gray-200 rounded p-3">
                      <p className="text-xs font-bold text-gray-800 mb-2">AI Rewrites:</p>
                      <div className="prose prose-xs max-w-none text-gray-800 text-xs leading-relaxed whitespace-pre-wrap break-words
                                      [&_h1]:text-sm [&_h1]:font-bold [&_h1]:text-gray-900 [&_h1]:mt-2 [&_h1]:mb-1
                                      [&_h2]:text-sm [&_h2]:font-bold [&_h2]:text-gray-800 [&_h2]:mt-2 [&_h2]:mb-1
                                      [&_h3]:text-xs [&_h3]:font-bold [&_h3]:text-gray-700 [&_h3]:mt-2 [&_h3]:mb-1
                                      [&_strong]:text-gray-900
                                      [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:my-1
                                      [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:my-1
                                      [&_li]:my-0.5
                                      [&_p]:my-1
                                      [&_pre]:whitespace-pre-wrap [&_pre]:break-words
                                      [&_code]:whitespace-pre-wrap [&_code]:break-words [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-gray-900 [&_code]:border [&_code]:border-gray-200">
                        <ReactMarkdown>{rewriteResult}</ReactMarkdown>
                      </div>
                    </div>
                  )}

                  {!rewriteResult && !rewriteError && !isRewriting && !selectedBullet && (
                    <div className="text-center text-gray-400 text-xs mt-4">
                      <p className="text-sm font-medium mb-1">Rewrite Bullet</p>
                      <p>Select a bullet point in the editor</p>
                      <p>and AI will rewrite it with stronger</p>
                      <p>action verbs and quantified impact.</p>
                    </div>
                  )}
                </>
              )}

            </div>
          </div>
          </>
        )}

      </div>

      {/* Footer - Keyboard shortcuts ki reminder */}
      <div className="bg-gray-50 border-t p-1 px-4 text-xs text-gray-500 text-right">
        ⌘S Save & Compile | ⌘↵ Force Compile
      </div>
    </div>
  );
}
