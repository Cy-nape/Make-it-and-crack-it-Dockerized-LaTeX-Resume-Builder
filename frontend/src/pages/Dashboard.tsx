import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface Template {
  id: string;
  name: string;
  description: string;
  file: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/templates/templates.json')
      .then(res => res.json())
      .then(data => {
        setTemplates(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to load templates:', err);
        setLoading(false);
      });
  }, []);

  const handleUseTemplate = (template: Template) => {
    const autosaved = localStorage.getItem('makeitandcrackit_autosave');
    if (autosaved && autosaved.trim().length > 0) {
      const confirmed = window.confirm(
        'You have unsaved work in the editor. Loading a template will replace it. Continue?'
      );
      if (!confirmed) return;
    }
    navigate(`/editor?template=${template.id}`);
  };

  return (
    <div className="min-h-screen bg-white text-black p-8">
      <header className="mb-12 border-b pb-4">
        <h1 className="text-3xl font-bold">Resume Builder</h1>
        <p className="text-gray-600">Docker-powered LaTeX compiler</p>
      </header>

      <main className="max-w-4xl">
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">LaTeX resumes, compiled in a container.</h2>
          <p className="text-lg mb-6 text-gray-700">
            Resume Builder packages a Python/Flask API and the TeX Live toolchain in Docker, so a browser can turn LaTeX into a PDF without a local LaTeX installation.
          </p>
          <div className="flex gap-4">
            <button 
              onClick={() => navigate('/editor')} 
              className="bg-blue-600 text-white px-4 py-2 rounded font-medium"
            >
              Open Blank Editor
            </button>
          </div>
        </section>

        <section className="mb-12">
          <h3 className="text-xl font-bold mb-4">Start with a template</h3>
          {loading ? (
            <p>Loading templates...</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {templates.map(template => (
                <div key={template.id} className="border p-4 rounded flex flex-col justify-between">
                  <div>
                    <h4 className="font-bold">{template.name}</h4>
                    <p className="text-sm text-gray-600 mb-4">{template.description}</p>
                  </div>
                  <button
                    onClick={() => handleUseTemplate(template)}
                    className="bg-gray-100 hover:bg-gray-200 text-black px-3 py-1 rounded text-sm self-start"
                  >
                    Use Template
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>


      </main>
    </div>
  );
}
