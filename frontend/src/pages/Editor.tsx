// Yaha React ke zaruri hooks import kiye
// useState: variables store karne ke liye (jaise loading, error, results)
// useEffect: page load ya kisi cheez ke change hone par kuch run karne ke liye
// useCallback: function ko unnecessary baar baar naye se banana band karne ke liye
// useRef: timer reference rakhne ke liye
import { useState, useEffect, useCallback, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { useNavigate, useSearchParams } from 'react-router-dom';

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

  // --- NEW: AI Assessment ke liye State Variables ---
  // showAiPanel: AI ka side panel open/close control karta hai
  const [showAiPanel, setShowAiPanel] = useState(false);
  // apiKey: Environment variable se la rahe hain taaki GitHub pe leak na ho
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  // isAssessing: jab AI kaam kar raha ho tab true (loading spinner ke liye)
  const [isAssessing, setIsAssessing] = useState(false);
  // assessmentResult: Gemini se aaya assessment text yahan store hoga
  const [assessmentResult, setAssessmentResult] = useState<string | null>(null);
  // assessmentError: koi error aaye AI call mein toh yahan dikhega
  const [assessmentError, setAssessmentError] = useState<string | null>(null);

  // Debounce timer ka reference - typing rukne par compile karne ke liye
  const compileTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // --- NEW: AI Assessment Function ---
  // Yaha Gemini API ko SEEDHA browser se call kiya hai
  // Pehle backend ke through jaata tha - nginx/flask chain mein issue tha
  // Ab seedha Google ke server ko call karte hain - reliable aur simple!
  const handleAssessResume = async () => {
    // API key nahi diya toh pehle hi rok lo
    if (!apiKey.trim()) {
      setAssessmentError('Pehle apni Gemini API key daalein!');
      return;
    }

    setIsAssessing(true);
    setAssessmentResult(null);
    setAssessmentError(null);

    try {
      // Ye wala prompt Gemini ko batata hai ki kaise assess karna hai
      const prompt = `You are an expert technical recruiter. Review the following LaTeX resume and provide a concise assessment in ENGLISH ONLY. Keep the response short and directly to the point.

Format your response strictly into these 3 sections:
1. **Overall Score**: Give a score out of 10 with a one-sentence justification.
2. **Weaknesses**: List 2-3 brief bullet points on what is lacking or weak.
3. **Suggestions**: Provide 2-3 brief, actionable suggestions to improve the resume.

LaTeX Code:
---
${texContent}
---`;

      // Gemini REST API ka direct URL - apni API key query param mein jaati hai
      // Ye browser se seedha Google ke server ko call karta hai - koi backend nahi!
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

      const response = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: prompt }]
          }]
        }),
      });

      // Pehle text lo, phir JSON parse karo - safe tarika
      const rawText = await response.text();
      let data: any;
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(`Gemini ne unexpected response bheja: ${rawText.substring(0, 150)}`);
      }

      // API error check karo (galat key, quota khatam, etc.)
      if (!response.ok) {
        const errorMsg = data?.error?.message || `API Error: ${response.status}`;
        if (response.status === 400 && errorMsg.includes('API_KEY')) {
          throw new Error('API key galat format mein hai.');
        }
        if (response.status === 403) {
          throw new Error('API key valid nahi hai ya enabled nahi hai. aistudio.google.com pe check karo.');
        }
        if (response.status === 429) {
          throw new Error('Rate limit hit ho gayi. Thodi der baad try karo.');
        }
        throw new Error(errorMsg);
      }

      // Gemini ke response se actual text nikala
      // Response structure: candidates[0].content.parts[0].text
      const resultText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!resultText) {
        throw new Error('Gemini ne khaali response bheja. Dobara try karo.');
      }

      setAssessmentResult(resultText);

    } catch (err: any) {
      // Network error alag se handle karo
      if (err.name === 'TypeError' && err.message.includes('fetch')) {
        setAssessmentError('Network error - internet connection check karo.');
      } else {
        setAssessmentError(err.message);
      }
    } finally {
      setIsAssessing(false);
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
          {/* Jab panel open ho toh button ka rang badal jaata hai */}
          <button
            onClick={() => {
              setShowAiPanel(!showAiPanel);
              // Panel band karte waqt results clear mat karo
            }}
            className={`px-3 py-1 border rounded text-sm font-medium transition-colors ${
              showAiPanel
                ? 'bg-purple-600 text-white border-purple-600'   // Panel khula hai - purple
                : 'bg-white text-purple-600 border-purple-400 hover:bg-purple-50' // Band hai - outline
            }`}
          >
            ✨ AI Assess
          </button>
        </div>
      </header>

      {/* --- MAIN LAYOUT --- */}
      {/* Teen column layout: Editor | PDF Preview | AI Panel (optional) */}
      <div className="flex-1 flex overflow-hidden">

        {/* --- EDITOR --- */}
        {/* Monaco Editor - VS Code jaisa editor browser mein */}
        <div className="flex-1 h-full w-full border-r">
          <MonacoEditor
            height="100%"
            language="latex"
            theme="vs-light"
            value={texContent}
            onChange={(val) => {
              const content = val || '';
              setTexContent(content);
              // Har change ke saath autosave bhi hota rahe
              localStorage.setItem(AUTOSAVE_KEY, content);
            }}
            options={{ minimap: { enabled: false }, wordWrap: 'on' }}
          />
        </div>

        {/* --- PDF PREVIEW --- */}
        {/* Compile hone ke baad PDF yahan dikhti hai */}
        <div className="flex-1 h-full flex flex-col bg-gray-100 relative">
          <div className="flex justify-between items-center px-4 py-2 border-b bg-gray-50">
            <span className="font-bold text-sm">Preview</span>
          </div>

          <div className="flex-1 overflow-auto relative">
            {/* Successful PDF dikhao */}
            {displayPdfUrl && !compileError && (
              <div className="w-full h-full overflow-auto p-4 flex justify-center items-start">
                <iframe
                  src={displayPdfUrl + '#toolbar=0'}
                  className="border"
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
                  className="w-full h-full border"
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

        {/* --- NEW: AI ASSESSMENT PANEL --- */}
        {/* Ye panel sirf tab dikhega jab user "AI Assess" button dabaye */}
        {/* showAiPanel state true hone par hi render hoga */}
        {showAiPanel && (
          <div className="w-96 h-full flex flex-col border-l bg-white">

            {/* AI Panel ka Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b bg-purple-50">
              <div className="flex items-center gap-2">
                <span className="text-purple-600 text-lg">✨</span>
                <span className="font-bold text-purple-800 text-sm">AI Resume Assessment</span>
              </div>
              {/* X button se panel band karo */}
              <button
                onClick={() => setShowAiPanel(false)}
                className="text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ×
              </button>
            </div>

            {/* Panel ka scrollable content area */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">

              {/* API Key UI hata diya gaya hai kyunki ab key code mein hardcode hai */}

              {/* Assess Button */}
              {/* Ye button dabane se AI assessment shuru hoti hai */}
              <button
                onClick={handleAssessResume}
                disabled={isAssessing || !texContent.trim()}
                className="w-full py-2 px-4 bg-purple-600 text-white rounded font-medium text-sm
                           hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed
                           transition-colors flex items-center justify-center gap-2"
              >
                {/* Jab assess ho raha ho tab loading spinner aur text badal do */}
                {isAssessing ? (
                  <>
                    <span className="animate-spin">⟳</span>
                    AI soch raha hai...
                  </>
                ) : (
                  <>
                    ✨ Resume Assess Karo
                  </>
                )}
              </button>

              {/* Error Message - agar API call fail ho */}
              {assessmentError && (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-xs font-bold text-red-700 mb-1">❌ Error:</p>
                  <p className="text-xs text-red-600">{assessmentError}</p>
                </div>
              )}

              {/* Assessment Result - Gemini ka jawab yahan dikhao */}
              {/* Ye tab dikhega jab AI ne successfully response diya ho */}
              {assessmentResult && (
                <div className="bg-purple-50 border border-purple-200 rounded p-3">
                  <p className="text-xs font-bold text-purple-800 mb-2">✅ Gemini ka Assessment:</p>
                  {/* whitespace-pre-wrap: Gemini ke newlines aur formatting preserve karta hai */}
                  <div className="text-xs text-gray-800 whitespace-pre-wrap leading-relaxed">
                    {assessmentResult}
                  </div>
                </div>
              )}

              {/* Default state - jab abhi tak koi assessment nahi hua */}
              {!assessmentResult && !assessmentError && !isAssessing && (
                <div className="text-center text-gray-400 text-xs mt-4">
                  <p className="text-2xl mb-2">🤖</p>
                  <p>API key daalo aur button dabao</p>
                  <p>Gemini tumhara resume padh ke</p>
                  <p>suggestions dega!</p>
                </div>
              )}

            </div>
          </div>
        )}

      </div>

      {/* Footer - Keyboard shortcuts ki reminder */}
      <div className="bg-gray-50 border-t p-1 px-4 text-xs text-gray-500 text-right">
        ⌘S Save & Compile | ⌘↵ Force Compile
      </div>
    </div>
  );
}
