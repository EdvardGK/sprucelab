import { QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { queryClient } from './lib/query-client';
import Dashboard from './pages/Dashboard';
import MyPage from './pages/MyPage';
import ProjectsGallery from './pages/ProjectsGallery';
import ProjectDetail from './pages/ProjectDetail';
import ProjectMyPage from './pages/ProjectMyPage';
import ProjectDocuments from './pages/ProjectDocuments';
import ProjectDrawings from './pages/ProjectDrawings';
import BIMWorkbench from './pages/BIMWorkbench';
import ModelWorkspace from './pages/ModelWorkspace';
import MyIssues from './pages/MyIssues';
import MyRFIs from './pages/MyRFIs';
import ScriptsLibrary from './pages/ScriptsLibrary';
import QuickStats from './pages/QuickStats';
import Settings from './pages/Settings';
import FederatedViewer from './pages/FederatedViewer';
import ViewerGroups from './pages/ViewerGroups';
import ProcessingReports from './pages/dev/ProcessingReports';
import ProcessingReportDetail from './pages/dev/ProcessingReportDetail';
import EmergencyViewerPage from './pages/EmergencyViewer';

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/my-page" element={<MyPage />} />
          <Route path="/projects" element={<ProjectsGallery />} />
          <Route path="/projects/:id" element={<ProjectDetail />} />
          <Route path="/projects/:id/my-page" element={<ProjectMyPage />} />
          <Route path="/projects/:id/viewer-groups" element={<ViewerGroups />} />
          <Route path="/projects/:id/viewer/:groupId" element={<FederatedViewer />} />
          <Route path="/projects/:id/documents" element={<ProjectDocuments />} />
          <Route path="/projects/:id/drawings" element={<ProjectDrawings />} />
          <Route path="/projects/:id/workbench" element={<BIMWorkbench />} />
          <Route path="/models/:id" element={<ModelWorkspace />} />
          <Route path="/my-issues" element={<MyIssues />} />
          <Route path="/my-rfis" element={<MyRFIs />} />
          <Route path="/scripts" element={<ScriptsLibrary />} />
          <Route path="/stats" element={<QuickStats />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/dev/processing-reports" element={<ProcessingReports />} />
          <Route path="/dev/processing-reports/:id" element={<ProcessingReportDetail />} />
          <Route path="/emergency-viewer" element={<EmergencyViewerPage />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
