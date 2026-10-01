import os
import tempfile
import subprocess
import shutil
import uuid
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# Yaha Flask app banana shuru kiya aur CORS enable kiya taaki
# frontend (React) backend se baat kar sake bina kisi error ke
app = Flask(__name__)
CORS(app)


# ---------------------------------------------------------------
# Health Check Endpoint
# Ye sirf ye check karne ke liye hai ki backend server chal raha hai ya nahi
# ---------------------------------------------------------------
@app.route('/health', methods=['GET'])
def health():
    from datetime import datetime, timezone
    return jsonify({
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })


# ---------------------------------------------------------------
# LaTeX Compilation Endpoint
# User ka LaTeX code leke PDF bana deta hai aur wapas bhej deta hai
# ---------------------------------------------------------------
@app.route('/api/latex/compile', methods=['POST'])
def compile_latex():
    # Frontend se JSON data liya - usme 'texContent' hona chahiye
    data = request.get_json()
    if not data or 'texContent' not in data:
        return jsonify({"error": "LaTeX content is required"}), 400

    tex_content = data['texContent']

    # Har request ke liye ek alag unique temporary folder banaya
    # Taaki ek user ka kaam dusre se mix na ho
    unique_id = uuid.uuid4().hex
    temp_dir = os.path.join(tempfile.gettempdir(), f"latex_{unique_id}")

    try:
        # Temporary folder create kiya aur usme .tex file likhi
        os.makedirs(temp_dir, exist_ok=True)
        tex_file_path = os.path.join(temp_dir, 'main.tex')
        pdf_file_path = os.path.join(temp_dir, 'main.pdf')

        with open(tex_file_path, 'w', encoding='utf-8') as f:
            f.write(tex_content)

        # pdflatex command run kiya - ye LaTeX ko PDF me convert karta hai
        # -no-shell-escape: security ke liye, dangerous commands band
        # -interaction=nonstopmode: bina ruke compile kare
        # -halt-on-error: pehli galti pe ruk jaaye
        command = [
            "pdflatex",
            "-no-shell-escape",
            "-interaction=nonstopmode",
            "-halt-on-error",
            f"-output-directory={temp_dir}",
            tex_file_path
        ]

        try:
            # 10 second ka time limit rakha - agar itne me na bane toh timeout
            result = subprocess.run(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=10,
                text=True
            )

            # Agar compilation fail ho gayi aur PDF bani hi nahi toh error bhejo
            if result.returncode != 0:
                if not os.path.exists(pdf_file_path):
                    print('LaTeX compilation failed:', result.stdout)
                    return jsonify({
                        "error": "Compilation failed",
                        "log": result.stdout
                    }), 400

        except subprocess.TimeoutExpired as e:
            # 10 second se zyada lag gaya - timeout error
            output = e.stdout.decode('utf-8') if e.stdout else "Timeout expired"
            return jsonify({
                "error": "Compilation failed",
                "log": output
            }), 400
        except Exception as e:
            if not os.path.exists(pdf_file_path):
                print('LaTeX compilation failed:', str(e))
                return jsonify({
                    "error": "Compilation failed",
                    "log": str(e)
                }), 400

        # Agar PDF successfully bani hai toh use frontend ko bhej do
        if os.path.exists(pdf_file_path):
            return send_file(
                pdf_file_path,
                mimetype='application/pdf',
                as_attachment=False,
                download_name='resume.pdf'
            )
        else:
            return jsonify({"error": "PDF file was not generated."}), 500

    except Exception as e:
        print('Error during LaTeX compilation:', e)
        return jsonify({"error": "Internal server error during compilation"}), 500

    finally:
        # Kaam ho gaya ya na ho - temporary folder hamesha delete karo
        # Ye important hai taaki server ki disk bhaari na ho
        try:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
        except Exception as cleanup_error:
            print('Failed to clean up temp directory:', cleanup_error)


# ---------------------------------------------------------------
# NEW: Gemini AI Resume Assessment Endpoint
# Yaha maine naya endpoint banaya jo Gemini AI se resume assess karata hai
# Frontend se LaTeX code aur Gemini API key aati hai
# Gemini usse padhta hai aur suggestions deta hai
# ---------------------------------------------------------------
@app.route('/api/ai/assess', methods=['POST'])
def assess_resume():
    # Step 1: Frontend se data lo - LaTeX code aur API key dono chahiye
    data = request.get_json()

    if not data:
        return jsonify({"error": "Request body khaali hai"}), 400

    tex_content = data.get('texContent', '').strip()
    api_key = data.get('apiKey', '').strip()

    # Dono cheezein honi chahiye, warna error
    if not tex_content:
        return jsonify({"error": "LaTeX content required hai"}), 400
    if not api_key:
        return jsonify({"error": "Gemini API key required hai"}), 400

    try:
        # Step 2: Google Generative AI library import karo
        # Yaha import andar kiya taaki agar package nahi hai toh sirf
        # ye endpoint fail ho, baaki app chal sakti rahe
        import google.generativeai as genai

        # Step 3: User ki API key se Gemini configure karo
        genai.configure(api_key=api_key)

        # Step 4: Gemini ka model choose kiya - gemini-1.5-flash fast aur free hai
        model = genai.GenerativeModel('gemini-1.5-flash')

        # Step 5: Prompt banaya - ye AI ko batata hai ki kya karna hai
        # Hum AI ko ek expert recruiter ki tarah behave karne bol rahe hain
        prompt = f"""
Tu ek experienced technical recruiter aur resume expert hai.
Neeche ek LaTeX resume ka code diya gaya hai.
Isko padhke ek detailed assessment de jisme yeh sab ho:

1.  **Overall Score**: Resume ko 10 mein se score de aur ek line mein reason bata.
2.  **Strengths (Kya Achha Hai)**: 3 bullet points mein batao resume ki khoobiyan kya hain.
3.  **Areas for Improvement (Kya Behtar Ho Sakta Hai)**: 3 bullet points mein batao kya improve karna chahiye (e.g., bullet points ki wording, skills section, action verbs ka use, impact quantification).
4.  **Specific Suggestions (Specific Changes)**: 2-3 concrete examples do ki koi ek existing line ko kaisi behtar likha ja sakta tha.
5.  **ATS Compatibility**: Kya ye resume Applicant Tracking Systems ke saath compatible lagta hai? Haan ya nahi aur kyun?

Apna jawab clear headings ke saath do. LaTeX code yahan hai:

---
{tex_content}
---
"""

        # Step 6: Gemini API ko call karo aur response lo
        # Ye actual AI call hai - Gemini yahan sochta hai aur jawab deta hai
        response = model.generate_content(prompt)

        # Step 7: Gemini ka response nikaala aur frontend ko bhej diya
        assessment_text = response.text

        return jsonify({
            "success": True,
            "assessment": assessment_text
        })

    except Exception as e:
        # Koi bhi error aaye - API key galat ho, network issue ho - yahan pakad lenge
        error_message = str(e)
        print(f"Gemini API error: {error_message}")

        # User-friendly error message dete hain
        if "API_KEY_INVALID" in error_message or "api_key" in error_message.lower():
            return jsonify({"error": "Gemini API key galat hai. Please check karein."}), 401
        elif "quota" in error_message.lower():
            return jsonify({"error": "API quota khatam ho gayi. Thodi der baad try karein."}), 429
        else:
            return jsonify({"error": f"AI assessment fail ho gayi: {error_message}"}), 500


# ---------------------------------------------------------------
# JD Matching Endpoint (Deterministic - No AI)
# Resume aur Job Description ke beech keyword matching karta hai
# Score 100% reproducible hai - har baar same input pe same output
# ---------------------------------------------------------------

# Common English stop words jo matching mein ignore honge
STOP_WORDS = {
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'of', 'with', 'by', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'can', 'shall', 'not', 'no', 'nor', 'so',
    'if', 'then', 'than', 'too', 'very', 'just', 'about', 'above', 'after',
    'again', 'all', 'also', 'am', 'as', 'because', 'before', 'between',
    'both', 'each', 'few', 'from', 'further', 'get', 'got', 'he', 'her',
    'here', 'him', 'his', 'how', 'i', 'into', 'it', 'its', 'me', 'more',
    'most', 'my', 'myself', 'new', 'now', 'only', 'other', 'our', 'out',
    'over', 'own', 'same', 'she', 'some', 'such', 'that', 'their', 'them',
    'there', 'these', 'they', 'this', 'those', 'through', 'under', 'until',
    'up', 'us', 'we', 'what', 'when', 'where', 'which', 'while', 'who',
    'whom', 'why', 'you', 'your', 'etc', 'e.g', 'i.e', 'vs', 'via',
    'using', 'used', 'use', 'work', 'working', 'worked', 'including',
    'include', 'includes', 'well', 'within', 'without', 'across',
    'ability', 'able', 'strong', 'experience', 'required', 'preferred',
    'must', 'role', 'position', 'job', 'team', 'company', 'looking',
    'join', 'opportunity', 'responsibilities', 'qualifications', 'years',
    'minimum', 'plus', 'bonus', 'salary', 'benefits', 'apply', 'equal',
}

import re

def strip_latex(tex_content):
    """LaTeX commands hata ke plain text nikalta hai safely"""
    text = tex_content
    # LaTeX comments hatao
    text = re.sub(r'%.*$', '', text, flags=re.MULTILINE)
    # 1. Structural commands with their arguments
    text = re.sub(r'\\(?:documentclass|usepackage|begin|end|pagestyle|setlength|renewcommand|fancyhf|fancyfoot|thispagestyle|addtolength|urlstyle|titleformat)\*?(?:\[[^\]]*\])?(?:\{[^}]*\})*', '', text)
    # 2. Spacing/alignment commands (no args)
    text = re.sub(r'\\(?:hfill|hspace|vspace|newline|newpage|clearpage|noindent|centering|raggedright|raggedleft|raggedbottom)\b', '', text)
    # 3. Any other backslash command without its arguments
    text = re.sub(r'\\[a-zA-Z]+\*?', '', text)
    # 4. Remove all curly braces and special chars
    text = re.sub(r'[{}\\~\^\|\$]', ' ', text)
    # 5. Normalize whitespace
    text = re.sub(r'\s+', ' ', text)
    return text.strip()


def extract_keywords(text):
    """Text se meaningful keywords nikalta hai (stop words filter karke)"""
    # Lowercase aur clean karo
    text = text.lower()
    # Sirf alphanumeric aur spaces rakho, baaki hatao
    text = re.sub(r'[^a-z0-9\s\+\#\.]', ' ', text)
    # Words nikalo aur trailing dots hatao (jaise "experience." -> "experience")
    words = [w.rstrip('.') for w in text.split()]
    # Stop words filter karo aur 2 character se chhote words hatao
    keywords = {w for w in words if w not in STOP_WORDS and len(w) > 1}
    return keywords


def extract_phrases(text):
    """Common 2-3 word tech phrases nikalta hai (e.g., 'machine learning')"""
    text = text.lower()
    text = re.sub(r'[^a-z0-9\s\+\#\.]', ' ', text)
    words = [w.rstrip('.') for w in text.split()]
    phrases = set()
    # 2-word phrases
    for i in range(len(words) - 1):
        phrase = f"{words[i]} {words[i+1]}"
        if words[i] not in STOP_WORDS and words[i+1] not in STOP_WORDS:
            phrases.add(phrase)
    # 3-word phrases
    for i in range(len(words) - 2):
        phrase = f"{words[i]} {words[i+1]} {words[i+2]}"
        if words[i] not in STOP_WORDS and words[i+2] not in STOP_WORDS:
            phrases.add(phrase)
    return phrases


@app.route('/api/jd/match', methods=['POST'])
def match_jd():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body khaali hai"}), 400

    tex_content = data.get('texContent', '').strip()
    jd_text = data.get('jdText', '').strip()
    skills_list = data.get('skills', [])  # Frontend se explicitly extracted skills aayenge

    if not tex_content:
        return jsonify({"error": "Resume content required hai"}), 400
    if not jd_text and not skills_list:
        return jsonify({"error": "Job description or skills required hai"}), 400

    # Step 1: LaTeX se plain text nikalo aur lowercase karo
    resume_text = strip_latex(tex_content).lower()

    if skills_list and isinstance(skills_list, list):
        # AI se extract kiye gaye skills ka direct matching
        matched_keywords = []
        missing_keywords = []
        
        for skill in skills_list:
            skill_clean = str(skill).strip().lower()
            if not skill_clean: continue
            
            # Word boundary check taaki "react" -> "reactor" me na match ho
            pattern = r'\b' + re.escape(skill_clean) + r'\b'
            
            # C++ aur C# jaise exceptions ke liye (unme word boundary \b alag behave karta hai)
            if skill_clean in ['c++', 'c#', '.net']:
                if skill_clean in resume_text:
                    matched_keywords.append(skill_clean)
                else:
                    missing_keywords.append(skill_clean)
            elif re.search(pattern, resume_text):
                matched_keywords.append(skill_clean)
            else:
                missing_keywords.append(skill_clean)

        total_skills = len(matched_keywords) + len(missing_keywords)
        match_percentage = 0 if total_skills == 0 else round((len(matched_keywords) / total_skills) * 100, 1)
        
        return jsonify({
            "success": True,
            "matchPercentage": match_percentage,
            "totalJdKeywords": total_skills,
            "matchedKeywords": sorted(matched_keywords),
            "missingKeywords": sorted(missing_keywords),
            "matchedPhrases": [], # Skip for explicit skills
            "resumeTextPreview": resume_text[:300]
        })
    else:
        # Fallback: Agar AI extraction fail ho jaye toh purana logic chalega
        jd_keywords = extract_keywords(jd_text)
        resume_keywords = extract_keywords(resume_text)
        jd_phrases = extract_phrases(jd_text)
        resume_phrases = extract_phrases(resume_text)

        matched_keywords = jd_keywords & resume_keywords
        missing_keywords = jd_keywords - resume_keywords
        matched_phrases = jd_phrases & resume_phrases

        total_jd_terms = len(jd_keywords) + len(jd_phrases)
        total_matched = len(matched_keywords) + len(matched_phrases)
        match_percentage = 0 if total_jd_terms == 0 else min(round((total_matched / total_jd_terms) * 100, 1), 100)

        return jsonify({
            "success": True,
            "matchPercentage": match_percentage,
            "totalJdKeywords": len(jd_keywords),
            "matchedKeywords": sorted(list(matched_keywords)),
            "missingKeywords": sorted(list(missing_keywords)),
            "matchedPhrases": sorted(list(matched_phrases)),
            "resumeTextPreview": resume_text[:300]
        })


# ---------------------------------------------------------------
# App ka main entry point
# Ye tab chalega jab seedha python app.py se run karo
# Docker mein gunicorn use karta hai
# ---------------------------------------------------------------
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3001))
    app.run(host='0.0.0.0', port=port)
