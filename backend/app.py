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
# App ka main entry point
# Ye tab chalega jab seedha python app.py se run karo
# Docker mein gunicorn use karta hai
# ---------------------------------------------------------------
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3001))
    app.run(host='0.0.0.0', port=port)
