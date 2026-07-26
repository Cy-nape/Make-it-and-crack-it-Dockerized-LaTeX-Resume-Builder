import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ArrowLeft, FileText, ArrowRight } from 'lucide-react';

interface Template {
  id: string;
  name: string;
  description: string;
  file: string;
  tags: string[];
  icon: string;
}

const TAG_COLORS: Record<string, string> = {
  'Technical': 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  'Developer': 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  'ATS-Friendly': 'bg-green-500/15 text-green-400 border-green-500/20',
  'Modern': 'bg-purple-500/15 text-purple-400 border-purple-500/20',
  'Colorful': 'bg-pink-500/15 text-pink-400 border-pink-500/20',
  'Full Stack': 'bg-cyan-500/15 text-cyan-400 border-cyan-500/20',
  'Academic': 'bg-amber-500/15 text-amber-400 border-amber-500/20',
  'Research': 'bg-orange-500/15 text-orange-400 border-orange-500/20',
  'Data Science': 'bg-indigo-500/15 text-indigo-400 border-indigo-500/20',
  'Minimal': 'bg-gray-500/15 text-gray-400 border-gray-500/20',
  'Clean': 'bg-teal-500/15 text-teal-400 border-teal-500/20',
  'Business': 'bg-yellow-500/15 text-yellow-400 border-yellow-500/20',
  'Two-Column': 'bg-red-500/15 text-red-400 border-red-500/20',
  'Dense': 'bg-violet-500/15 text-violet-400 border-violet-500/20',
  'DevOps': 'bg-sky-500/15 text-sky-400 border-sky-500/20',
};

export default function Templates() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

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

  const allTags = [...new Set(templates.flatMap(t => t.tags))];

  const filteredTemplates = selectedTag
    ? templates.filter(t => t.tags.includes(selectedTag))
    : templates;

  const handleUseTemplate = (template: Template) => {
    const autosaved = localStorage.getItem('resumeforge_autosave');
    if (autosaved && autosaved.trim().length > 0) {
      const confirmed = window.confirm(
        'You have unsaved work in the editor. Loading a template will replace it. Continue?'
      );
      if (!confirmed) return;
    }
    navigate(`/editor?template=${template.id}`);
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="flex items-center gap-2 text-zinc-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={18} />
              <span className="text-sm">Back</span>
            </button>
            <div className="w-px h-5 bg-zinc-700" />
            <h1 className="text-lg font-semibold">Template Gallery</h1>
          </div>
          <button
            onClick={() => navigate('/editor')}
            className="flex items-center gap-2 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-sm font-medium transition-colors border border-zinc-700"
          >
            <FileText size={16} />
            Blank Resume
          </button>
        </div>
      </header>

      {/* Hero */}
      <div className="max-w-6xl mx-auto px-6 pt-10 pb-6">
        <h2 className="text-3xl font-bold mb-2">Choose a Template</h2>
        <p className="text-zinc-400 text-lg">
          Start with a professionally designed, ATS-friendly LaTeX template. Pick one and customize it in the editor.
        </p>
      </div>

      {/* Tag Filter */}
      <div className="max-w-6xl mx-auto px-6 pb-6">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedTag(null)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
              selectedTag === null
                ? 'bg-white text-zinc-900 border-white'
                : 'bg-zinc-800/50 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300'
            }`}
          >
            All
          </button>
          {allTags.map(tag => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${
                selectedTag === tag
                  ? 'bg-white text-zinc-900 border-white'
                  : 'bg-zinc-800/50 text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-300'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Template Grid */}
      <div className="max-w-6xl mx-auto px-6 pb-16">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-zinc-700 border-t-white rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filteredTemplates.map(template => (
              <div
                key={template.id}
                className="group relative bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 transition-all duration-300 hover:shadow-xl hover:shadow-black/20 hover:-translate-y-1"
              >
                {/* Icon Header */}
                <div className="h-32 bg-gradient-to-br from-zinc-800/80 to-zinc-900 flex items-center justify-center border-b border-zinc-800">
                  <span className="text-5xl opacity-80 group-hover:scale-110 transition-transform duration-300">
                    {template.icon}
                  </span>
                </div>

                {/* Content */}
                <div className="p-5">
                  <h3 className="text-lg font-semibold mb-1.5 text-white group-hover:text-blue-400 transition-colors">
                    {template.name}
                  </h3>
                  <p className="text-sm text-zinc-400 mb-4 leading-relaxed">
                    {template.description}
                  </p>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1.5 mb-5">
                    {template.tags.map(tag => (
                      <span
                        key={tag}
                        className={`px-2 py-0.5 rounded text-xs font-medium border ${
                          TAG_COLORS[tag] || 'bg-zinc-700/50 text-zinc-400 border-zinc-600'
                        }`}
                      >
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Use Button */}
                  <button
                    onClick={() => handleUseTemplate(template)}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-all group-hover:shadow-lg group-hover:shadow-blue-500/20"
                  >
                    Use This Template
                    <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && filteredTemplates.length === 0 && (
          <div className="text-center py-20 text-zinc-500">
            No templates match the selected filter.
          </div>
        )}
      </div>
    </div>
  );
}
