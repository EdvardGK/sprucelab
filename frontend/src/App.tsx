import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { queryClient } from './lib/query-client';
import Dashboard from './pages/Dashboard';
import ProjectsGallery from './pages/ProjectsGallery';
import ProjectDetail from './pages/ProjectDetail';
import ProjectMyPage from './pages/ProjectMyPage';
import ModelWorkspace from './pages/ModelWorkspace';
import MyIssues from './pages/MyIssues';
import MyRFIs from './pages/MyRFIs';
import ScriptsLibrary from './pages/ScriptsLibrary';
import QuickStats from './pages/QuickStats';
import Settings from './pages/Settings';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects" element={<ProjectsGallery />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:id/my-page" element={<ProjectMyPage />} />
          <Route path="/models/:id" element={<ModelWorkspace />} />
          <Route path="/my-issues" element={<MyIssues />} />
          <Route path="/my-rfis" element={<MyRFIs />} />
          <Route path="/scripts" element={<ScriptsLibrary />} />
          <Route path="/stats" element={<QuickStats />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
