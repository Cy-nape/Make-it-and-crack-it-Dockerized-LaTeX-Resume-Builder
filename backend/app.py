import os
import tempfile
import subprocess
import shutil
import uuid
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS

app = Flask(__name__)

# Configure CORS similar to Node.js backend
# The Node.js version allowed true for CORS_ORIGIN
CORS(app)

@app.route('/health', methods=['GET'])
def health():
    from datetime import datetime, timezone
    return jsonify({
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

@app.route('/api/latex/compile', methods=['POST'])
def compile_latex():
    data = request.get_json()
    if not data or 'texContent' not in data:
        return jsonify({"error": "LaTeX content is required"}), 400

    tex_content = data['texContent']

    # Create a unique temporary directory
    unique_id = uuid.uuid4().hex
    temp_dir = os.path.join(tempfile.gettempdir(), f"latex_{unique_id}")

    try:
        os.makedirs(temp_dir, exist_ok=True)
        tex_file_path = os.path.join(temp_dir, 'main.tex')
        pdf_file_path = os.path.join(temp_dir, 'main.pdf')

        with open(tex_file_path, 'w', encoding='utf-8') as f:
            f.write(tex_content)

        # Run pdflatex in non-interactive mode with shell escape disabled
        command = [
            "pdflatex",
            "-no-shell-escape",
            "-interaction=nonstopmode",
            "-halt-on-error",
            f"-output-directory={temp_dir}",
            tex_file_path
        ]

        try:
            # 10s timeout, capturing output
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
            # pdflatex timed out
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

        # Read the generated PDF
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
        # Cleanup the temp directory
        try:
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
        except Exception as cleanup_error:
            print('Failed to clean up temp directory:', cleanup_error)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 3001))
    app.run(host='0.0.0.0', port=port)
