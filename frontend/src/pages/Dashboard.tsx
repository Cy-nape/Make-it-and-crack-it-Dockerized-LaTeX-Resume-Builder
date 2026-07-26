import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FileText, LayoutTemplate, LogOut, Plus } from 'lucide-react';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Header */}
      <header className="border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">
            <span className="text-blue-500">Resume</span>Forge
          </h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-zinc-400">
              {user?.name || user?.email}
            </span>
            <button 
              onClick={handleLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 text-zinc-400 hover:text-red-400 rounded-md text-sm font-medium transition-colors hover:bg-zinc-800"
            >
              <LogOut size={14} />
              Logout
            </button>
          </div>
        </div>
      </header>
      
      <main className="max-w-5xl mx-auto px-6 py-10">
        {/* Welcome */}
        <div className="mb-10">
          <h2 className="text-2xl font-bold mb-2">
            Welcome back{user?.name ? `, ${user.name}` : ''}
          </h2>
          <p className="text-zinc-400">
            Create professional resumes with LaTeX and AI-powered feedback.
          </p>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-10">
          <button 
            onClick={() => navigate('/editor')}
            className="group flex items-start gap-4 p-5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/5 transition-all duration-300 text-left"
          >
            <div className="p-2.5 rounded-lg bg-blue-600/10 text-blue-500 group-hover:bg-blue-600/20 transition-colors">
              <Plus size={22} />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Create New Resume</h3>
              <p className="text-sm text-zinc-400">Start from scratch with the LaTeX editor</p>
            </div>
          </button>

          <button 
            onClick={() => navigate('/templates')}
            className="group flex items-start gap-4 p-5 bg-zinc-900 border border-zinc-800 rounded-xl hover:border-purple-500/50 hover:shadow-lg hover:shadow-purple-500/5 transition-all duration-300 text-left"
          >
            <div className="p-2.5 rounded-lg bg-purple-600/10 text-purple-500 group-hover:bg-purple-600/20 transition-colors">
              <LayoutTemplate size={22} />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-1">Browse Templates</h3>
              <p className="text-sm text-zinc-400">Pick from ATS-friendly LaTeX templates</p>
            </div>
          </button>
        </div>

        {/* Recent resumes section (placeholder for future) */}
        <section className="bg-zinc-900 border border-zinc-800 rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Your Resumes</h3>
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText size={40} className="text-zinc-700 mb-3" />
            <p className="text-zinc-500 mb-1">No saved resumes yet</p>
            <p className="text-zinc-600 text-sm">Your work auto-saves in the editor — start writing to see it here.</p>
          </div>
        </section>
      </main>
    </div>
  );
}
