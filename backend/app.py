import os
import tempfile
import subprocess
import shutil
import uuid
import re
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

# --- ML Model Import ---
from sentence_transformers import SentenceTransformer, util

# Yaha Flask app banana shuru kiya aur CORS enable kiya
app = Flask(__name__)
CORS(app)

# Model ko app startup par ek baar load karo (~80MB RAM lega)
MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'finetuned-resume-model')
if os.path.exists(MODEL_DIR):
    print(f"Loading custom fine-tuned model from {MODEL_DIR}...")
    semantic_model = SentenceTransformer(MODEL_DIR)
    ENGINE_NAME = "Hybrid (Lexical Regex + Fine-Tuned MiniLM Embeddings)"
else:
    print("Fine-tuned model directory not found, loading 'all-MiniLM-L6-v2'...")
    semantic_model = SentenceTransformer('all-MiniLM-L6-v2')
    ENGINE_NAME = "Hybrid (Lexical Regex + MiniLM-L6-v2 Semantic Embeddings)"
print("Model loaded successfully!")


# ---------------------------------------------------------------
# Health Check Endpoint
# ---------------------------------------------------------------
@app.route('/health', methods=['GET'])
def health():
    from datetime import datetime, timezone
    return jsonify({
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })


# ---------------------------------------------------------------
# LaTeX Compilation Endpoint (Unchanged)
# ---------------------------------------------------------------
@app.route('/api/latex/compile', methods=['POST'])
def compile_latex():
    data = request.get_json()
    if not data or 'texContent' not in data:
        return jsonify({"error": "LaTeX content is required"}), 400

    tex_content = data['texContent']
    unique_id = uuid.uuid4().hex
    temp_dir = os.path.join(tempfile.gettempdir(), f"latex_{unique_id}")

    try:
        os.makedirs(temp_dir, exist_ok=True)
        tex_file_path = os.path.join(temp_dir, 'main.tex')
        pdf_file_path = os.path.join(temp_dir, 'main.pdf')

        with open(tex_file_path, 'w', encoding='utf-8') as f:
            f.write(tex_content)

        command = [
            "pdflatex",
            "-no-shell-escape",
            "-interaction=nonstopmode",
            "-halt-on-error",
            f"-output-directory={temp_dir}",
            tex_file_path
        ]

        try:
            result = subprocess.run(
                command,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                timeout=10,
                text=True
            )

            if result.returncode != 0:
                if not os.path.exists(pdf_file_path):
                    print('LaTeX compilation failed:', result.stdout)
                    return jsonify({
                        "error": "Compilation failed",
                        "log": result.stdout
                    }), 400

        except subprocess.TimeoutExpired as e:
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
        try:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
        except Exception as cleanup_error:
            print('Failed to clean up temp directory:', cleanup_error)


# ---------------------------------------------------------------
# Gemini AI Resume Assessment Endpoint (Unchanged)
# ---------------------------------------------------------------
@app.route('/api/ai/assess', methods=['POST'])
def assess_resume():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body khaali hai"}), 400

    tex_content = data.get('texContent', '').strip()
    api_key = data.get('apiKey', '').strip()

    if not tex_content:
        return jsonify({"error": "LaTeX content required hai"}), 400
    if not api_key:
        return jsonify({"error": "Gemini API key required hai"}), 400

    try:
        import google.generativeai as genai
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel('gemini-1.5-flash')

        prompt = f"""
Tu ek experienced technical recruiter aur resume expert hai.
Neeche ek LaTeX resume ka code diya gaya hai.
Isko padhke ek detailed assessment de jisme yeh sab ho:

1. **Overall Score**: Resume ko 10 mein se score de aur ek line mein reason bata.
2. **Strengths (Kya Achha Hai)**: 3 bullet points mein batao resume ki khoobiyan kya hain.
3. **Areas for Improvement (Kya Behtar Ho Sakta Hai)**: 3 bullet points mein batao kya improve karna chahiye.
4. **Specific Suggestions (Specific Changes)**: 2-3 concrete examples do.
5. **ATS Compatibility**: Kya ye resume ATS compatible lagta hai?

LaTeX code yahan hai:
---
{tex_content}
---
"""
        response = model.generate_content(prompt)
        return jsonify({
            "success": True,
            "assessment": response.text
        })

    except Exception as e:
        error_message = str(e)
        print(f"Gemini API error: {error_message}")
        if "API_KEY_INVALID" in error_message or "api_key" in error_message.lower():
            return jsonify({"error": "Gemini API key galat hai. Please check karein."}), 401
        elif "quota" in error_message.lower():
            return jsonify({"error": "API quota khatam ho gayi. Thodi der baad try karein."}), 429
        else:
            return jsonify({"error": f"AI assessment fail ho gayi: {error_message}"}), 500


# ---------------------------------------------------------------
# Helper Functions for Text Extraction
# ---------------------------------------------------------------
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

def strip_latex(tex_content):
    """LaTeX commands hata ke plain text nikalta hai safely"""
    text = tex_content
    text = re.sub(r'%.*$', '', text, flags=re.MULTILINE)
    text = re.sub(r'\\(?:documentclass|usepackage|begin|end|pagestyle|setlength|renewcommand|fancyhf|fancyfoot|thispagestyle|addtolength|urlstyle|titleformat)\*?(?:\[[^\]]*\])?(?:\{[^}]*\})*', '', text)
    text = re.sub(r'\\(?:hfill|hspace|vspace|newline|newpage|clearpage|noindent|centering|raggedright|raggedleft|raggedbottom)\b', '', text)
    text = re.sub(r'\\[a-zA-Z]+\*?', '', text)
    text = re.sub(r'[{}\\~\^\|\$]', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()

def extract_resume_sentences(resume_text):
    """Resume text ko meaningful sentences/chunks me baant-ta hai embeddings ke liye"""
    # Newlines, bullets, and periods par split karo
    raw_chunks = re.split(r'[\n\r\•\-\–]|\.\s+', resume_text)
    # Chote khali pieces hatao
    sentences = [s.strip() for s in raw_chunks if len(s.strip()) > 5]
    # Agar kuch na bache toh poora text as single chunk use karo
    return sentences if sentences else [resume_text]


# ---------------------------------------------------------------
# UPGRADED: JD Matching Endpoint (Hybrid: Keyword + Semantic Model)
# ---------------------------------------------------------------
@app.route('/api/jd/match', methods=['POST'])
def match_jd():
    data = request.get_json()
    if not data:
        return jsonify({"error": "Request body khaali hai"}), 400

    tex_content = data.get('texContent', '').strip()
    jd_text = data.get('jdText', '').strip()
    skills_list = data.get('skills', [])

    if not tex_content:
        return jsonify({"error": "Resume content required hai"}), 400
    if not jd_text and not skills_list:
        return jsonify({"error": "Job description or skills required hai"}), 400

    resume_text = strip_latex(tex_content).lower()
    resume_chunks = extract_resume_sentences(resume_text)

    # Agar frontend se explicit skills aayi hain
    target_skills = skills_list if (skills_list and isinstance(skills_list, list)) else []
    
    # Agar frontend se skills list nahi aayi, toh JD text se extract karo
    if not target_skills and jd_text:
        raw_words = re.sub(r'[^a-z0-9\s\+\#\.]', ' ', jd_text.lower()).split()
        target_skills = list({w for w in raw_words if w not in STOP_WORDS and len(w) > 2})

    if not target_skills:
        return jsonify({"error": "No evaluatable skills found"}), 400

    # 1. Step: Exact keyword check pehle karo
    matched_exact = set()
    unmatched_skills = []

    for skill in target_skills:
        skill_clean = str(skill).strip().lower()
        if not skill_clean: 
            continue
        
        pattern = r'\b' + re.escape(skill_clean) + r'\b'
        if skill_clean in ['c++', 'c#', '.net']:
            if skill_clean in resume_text:
                matched_exact.add(skill_clean)
            else:
                unmatched_skills.append(skill_clean)
        elif re.search(pattern, resume_text):
            matched_exact.add(skill_clean)
        else:
            unmatched_skills.append(skill_clean)

    # 2. Step: Jo direct match nahi hue, unpe MiniLM Semantic Model chalao
    # (Yeh 'relational database' vs 'PostgreSQL' jaise synonyms pakdega)
    matched_semantic = []
    missing_final = []

    if unmatched_skills and resume_chunks:
        skill_embeddings = semantic_model.encode(unmatched_skills, convert_to_tensor=True)
        resume_embeddings = semantic_model.encode(resume_chunks, convert_to_tensor=True)
        sim_matrix = util.cos_sim(skill_embeddings, resume_embeddings)

        SEMANTIC_THRESHOLD = 0.45  # 58% similarity threshold

        for idx, skill in enumerate(unmatched_skills):
            best_score = sim_matrix[idx].max().item()
            print(f"Debug: Skill '{skill}' ka best similarity score = {best_score:.4f}")
            if best_score >= SEMANTIC_THRESHOLD:
                matched_semantic.append({
                    "skill": skill,
                    "confidence": round(best_score * 100, 1)
                })
            else:
                missing_final.append(skill)
    else:
        missing_final = unmatched_skills

    total_evaluated = len(matched_exact) + len(matched_semantic) + len(missing_final)
    total_matched = len(matched_exact) + len(matched_semantic)
    match_percentage = 0 if total_evaluated == 0 else round((total_matched / total_evaluated) * 100, 1)

    return jsonify({
        "success": True,
        "matchPercentage": match_percentage,
        "totalEvaluated": total_evaluated,
        "exactMatches": sorted(list(matched_exact)),
        "semanticMatches": matched_semantic,
        "missingSkills": sorted(missing_final),
        "engine": ENGINE_NAME,
        # Backward-compatibility aliases
        "matchedKeywords": sorted(list(matched_exact)) + [s["skill"] for s in matched_semantic],
        "missingKeywords": sorted(missing_final),
        "totalJdKeywords": total_evaluated
    })


# ---------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3001))
    app.run(host='0.0.0.0', port=port)