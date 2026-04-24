import { type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { queryClient } from './lib/query-client';
import { Toaster } from './components/ui/toaster';
import { UploadProvider } from './contexts/UploadContext';
import { AuthProvider } from './contexts/AuthContext';
import { RequireAuth } from './components/RequireAuth';
import Login from './pages/Login';
import Signup from './pages/Signup';
import Welcome from './pages/Welcome';
import AuthCallback from './pages/AuthCallback';
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
import TypeLibraryPage from './pages/TypeLibraryPage';
import ProjectTypeLibrary from './pages/ProjectTypeLibrary';
import ProjectTypesPage from './pages/ProjectTypesPage';
import ProjectMaterialLibrary from './pages/ProjectMaterialLibrary';
import ProjectBEP from './pages/ProjectBEP';
import ProjectField from './pages/ProjectField';
import AdminDashboard from './pages/AdminDashboard';
import ProcessingReports from './pages/dev/ProcessingReports';
import ProcessingReportDetail from './pages/dev/ProcessingReportDetail';

const guard = (element: ReactNode) => <RequireAuth>{element}</RequireAuth>;

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/signup", element: <Signup /> },
  { path: "/welcome", element: <Welcome /> },
  { path: "/auth/callback", element: <AuthCallback /> },
  { path: "/", element: guard(<ProjectsGallery />) },
  { path: "/my-page", element: guard(<MyPage />) },
  { path: "/projects", element: guard(<ProjectsGallery />) },
  { path: "/projects/:id", element: guard(<ProjectModels />) },
  { path: "/projects/:id/dashboard", element: guard(<ProjectDashboard />) },
  { path: "/projects/:id/models", element: guard(<ProjectModels />) },
  { path: "/projects/:id/my-page", element: guard(<ProjectMyPage />) },
  { path: "/projects/:id/viewer-groups", element: guard(<ViewerGroups />) },
  { path: "/projects/:id/viewer/:groupId", element: guard(<FederatedViewer />) },
  { path: "/projects/:id/documents", element: guard(<ProjectDocuments />) },
  { path: "/projects/:id/drawings", element: guard(<ProjectDrawings />) },
  { path: "/projects/:id/types", element: guard(<ProjectTypesPage />) },
  { path: "/projects/:id/type-library", element: guard(<ProjectTypeLibrary />) },
  { path: "/projects/:id/material-library", element: guard(<ProjectMaterialLibrary />) },
  { path: "/projects/:id/bep", element: guard(<ProjectBEP />) },
  { path: "/projects/:id/field", element: guard(<ProjectField />) },
  { path: "/projects/:id/workbench", element: guard(<BIMWorkbench />) },
  { path: "/projects/:id/models/:modelId", element: guard(<ModelWorkspace />) },
  { path: "/my-issues", element: guard(<MyIssues />) },
  { path: "/my-rfis", element: guard(<MyRFIs />) },
  { path: "/scripts", element: guard(<ScriptsLibrary />) },
  { path: "/stats", element: guard(<QuickStats />) },
  { path: "/settings", element: guard(<Settings />) },
  { path: "/type-library", element: guard(<TypeLibraryPage />) },
  { path: "/admin", element: guard(<AdminDashboard />) },
  { path: "/dev/processing-reports", element: guard(<ProcessingReports />) },
  { path: "/dev/processing-reports/:id", element: guard(<ProcessingReportDetail />) },
]);

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <UploadProvider>
          <Toaster />
          <RouterProvider router={router} />
        </UploadProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
