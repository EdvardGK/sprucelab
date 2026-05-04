import { lazy, Suspense, type ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { queryClient } from './lib/query-client';
import { Toaster } from './components/ui/toaster';
import { UploadProvider } from './contexts/UploadContext';
import { AuthProvider } from './contexts/AuthContext';
import { RequireAuth } from './components/RequireAuth';

const Login = lazy(() => import('./pages/Login'));
const Signup = lazy(() => import('./pages/Signup'));
const Welcome = lazy(() => import('./pages/Welcome'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const MyPage = lazy(() => import('./pages/MyPage'));
const ProjectsGallery = lazy(() => import('./pages/ProjectsGallery'));
const ProjectDashboard = lazy(() => import('./pages/ProjectDashboard'));
const ProjectModels = lazy(() => import('./pages/ProjectModels'));
const ProjectMyPage = lazy(() => import('./pages/ProjectMyPage'));
const ProjectDocuments = lazy(() => import('./pages/ProjectDocuments'));
const ProjectDrawings = lazy(() => import('./pages/ProjectDrawings'));
const BIMWorkbench = lazy(() => import('./pages/BIMWorkbench'));
const ModelWorkspace = lazy(() => import('./pages/ModelWorkspace'));
const FederatedViewer = lazy(() => import('./pages/FederatedViewer'));
const ViewerGroups = lazy(() => import('./pages/ViewerGroups'));
const TypeLibraryPage = lazy(() => import('./pages/TypeLibraryPage'));
const ProjectTypeLibrary = lazy(() => import('./pages/ProjectTypeLibrary'));
const ProjectTypesPage = lazy(() => import('./pages/ProjectTypesPage'));
const ProjectMaterialLibrary = lazy(() => import('./pages/ProjectMaterialLibrary'));
const ProjectField = lazy(() => import('./pages/ProjectField'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const ProcessingReports = lazy(() => import('./pages/dev/ProcessingReports'));
const ProcessingReportDetail = lazy(() => import('./pages/dev/ProcessingReportDetail'));

const guard = (element: ReactNode) => <RequireAuth>{element}</RequireAuth>;

const RouteFallback = () => (
  <div className="flex h-screen w-screen items-center justify-center bg-background">
    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
  </div>
);

const withSuspense = (element: ReactNode) => (
  <Suspense fallback={<RouteFallback />}>{element}</Suspense>
);

const router = createBrowserRouter([
  { path: "/login", element: withSuspense(<Login />) },
  { path: "/signup", element: withSuspense(<Signup />) },
  { path: "/welcome", element: withSuspense(<Welcome />) },
  { path: "/auth/callback", element: withSuspense(<AuthCallback />) },
  { path: "/", element: withSuspense(guard(<ProjectsGallery />)) },
  { path: "/my-page", element: withSuspense(guard(<MyPage />)) },
  { path: "/projects", element: withSuspense(guard(<ProjectsGallery />)) },
  { path: "/projects/:id", element: withSuspense(guard(<ProjectDashboard />)) },
  { path: "/projects/:id/dashboard", element: withSuspense(guard(<ProjectDashboard />)) },
  { path: "/projects/:id/models", element: withSuspense(guard(<ProjectModels />)) },
  { path: "/projects/:id/my-page", element: withSuspense(guard(<ProjectMyPage />)) },
  { path: "/projects/:id/viewer-groups", element: withSuspense(guard(<ViewerGroups />)) },
  { path: "/projects/:id/viewer/:groupId", element: withSuspense(guard(<FederatedViewer />)) },
  { path: "/projects/:id/documents", element: withSuspense(guard(<ProjectDocuments />)) },
  { path: "/projects/:id/drawings", element: withSuspense(guard(<ProjectDrawings />)) },
  { path: "/projects/:id/types", element: withSuspense(guard(<ProjectTypesPage />)) },
  { path: "/projects/:id/type-library", element: withSuspense(guard(<ProjectTypeLibrary />)) },
  { path: "/projects/:id/material-library", element: withSuspense(guard(<ProjectMaterialLibrary />)) },
  { path: "/projects/:id/field", element: withSuspense(guard(<ProjectField />)) },
  { path: "/projects/:id/workbench", element: withSuspense(guard(<BIMWorkbench />)) },
  { path: "/projects/:id/models/:modelId", element: withSuspense(guard(<ModelWorkspace />)) },
  { path: "/type-library", element: withSuspense(guard(<TypeLibraryPage />)) },
  { path: "/admin", element: withSuspense(guard(<AdminDashboard />)) },
  { path: "/dev/processing-reports", element: withSuspense(guard(<ProcessingReports />)) },
  { path: "/dev/processing-reports/:id", element: withSuspense(guard(<ProcessingReportDetail />)) },
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
