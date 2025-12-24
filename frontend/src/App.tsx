import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { queryClient } from './lib/query-client';
import { Toaster } from './components/ui/toaster';
import { UploadProvider } from './contexts/UploadContext';
import MyPage from './pages/MyPage';
import ProjectsGallery from './pages/ProjectsGallery';
import ProjectDashboard from './pages/ProjectDashboard';
import ProjectModels from './pages/ProjectModels';
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

const router = createBrowserRouter([
  { path: "/", element: <ProjectsGallery /> },
  { path: "/my-page", element: <MyPage /> },
  { path: "/projects", element: <ProjectsGallery /> },
  { path: "/projects/:id", element: <ProjectDashboard /> },
  { path: "/projects/:id/models", element: <ProjectModels /> },
  { path: "/projects/:id/my-page", element: <ProjectMyPage /> },
  { path: "/projects/:id/viewer-groups", element: <ViewerGroups /> },
  { path: "/projects/:id/viewer/:groupId", element: <FederatedViewer /> },
  { path: "/projects/:id/documents", element: <ProjectDocuments /> },
  { path: "/projects/:id/drawings", element: <ProjectDrawings /> },
  { path: "/projects/:id/workbench", element: <BIMWorkbench /> },
  { path: "/models/:id", element: <ModelWorkspace /> },
  { path: "/my-issues", element: <MyIssues /> },
  { path: "/my-rfis", element: <MyRFIs /> },
  { path: "/scripts", element: <ScriptsLibrary /> },
  { path: "/stats", element: <QuickStats /> },
  { path: "/settings", element: <Settings /> },
  { path: "/dev/processing-reports", element: <ProcessingReports /> },
  { path: "/dev/processing-reports/:id", element: <ProcessingReportDetail /> },
]);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <UploadProvider>
        <Toaster />
        <RouterProvider router={router} />
      </UploadProvider>
    </QueryClientProvider>
  );
}

export default App;
