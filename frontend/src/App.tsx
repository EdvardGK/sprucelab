import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { queryClient } from './lib/query-client';
import Dashboard from './pages/Dashboard';
import ProjectDetail from './pages/ProjectDetail';
import ModelViewer from './pages/ModelViewer';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/models/:id" element={<ModelViewer />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
