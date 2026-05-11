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
const Welcome = lazy(() => import('./pages/Welcome'));
const AuthCallback = lazy(() => import('./pages/AuthCallback'));
const MyPage = lazy(() => import('./pages/MyPage'));
const ProjectsGallery = lazy(() => import('./pages/ProjectsGallery'));
const ProjectShell = lazy(() => import('./pages/ProjectShell'));
const ProjectDashboard = lazy(() => import('./pages/ProjectDashboard'));
const ProjectModels = lazy(() => import('./pages/ProjectModels'));
const ProjectMyPage = lazy(() => import('./pages/ProjectMyPage'));
const ProjectDocuments = lazy(() => import('./pages/ProjectDocuments'));
const ProjectClaimsPage = lazy(() => import('./pages/ProjectClaimsPage'));
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
const GridDemo = lazy(() => import('./pages/dev/GridDemo'));
const EmbedDashboard = lazy(() => import('./pages/EmbedDashboard'));
const WebhookSubscriptions = lazy(() => import('./pages/Settings/WebhookSubscriptions'));
const WebhookDeliveries = lazy(() => import('./pages/Settings/WebhookDeliveries'));

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
  { path: "/", element: withSuspense(<Welcome />) },
  { path: "/welcome", element: withSuspense(<Welcome />) },
  { path: "/signup", element: withSuspense(<Welcome />) },
  { path: "/login", element: withSuspense(<Login />) },
  { path: "/auth/callback", element: withSuspense(<AuthCallback />) },
  { path: "/my-page", element: withSuspense(guard(<MyPage />)) },
  { path: "/projects", element: withSuspense(guard(<ProjectsGallery />)) },
  {
    path: "/projects/:id",
    element: withSuspense(guard(<ProjectShell />)),
    children: [
      { index: true, element: withSuspense(<ProjectDashboard />) },
      { path: "dashboard", element: withSuspense(<ProjectDashboard />) },
      { path: "models", element: withSuspense(<ProjectModels />) },
      { path: "models/:modelId", element: withSuspense(<ModelWorkspace />) },
      { path: "my-page", element: withSuspense(<ProjectMyPage />) },
      { path: "viewer-groups", element: withSuspense(<ViewerGroups />) },
      { path: "viewer/:groupId", element: withSuspense(<FederatedViewer />) },
      { path: "documents", element: withSuspense(<ProjectDocuments />) },
      { path: "claims", element: withSuspense(<ProjectClaimsPage />) },
      { path: "drawings", element: withSuspense(<ProjectDrawings />) },
      { path: "types", element: withSuspense(<ProjectTypesPage />) },
      { path: "type-library", element: withSuspense(<ProjectTypeLibrary />) },
      { path: "material-library", element: withSuspense(<ProjectMaterialLibrary />) },
      { path: "field", element: withSuspense(<ProjectField />) },
      { path: "workbench", element: withSuspense(<BIMWorkbench />) },
    ],
  },
  { path: "/type-library", element: withSuspense(guard(<TypeLibraryPage />)) },
  { path: "/admin", element: withSuspense(guard(<AdminDashboard />)) },
  { path: "/settings/webhooks", element: withSuspense(guard(<WebhookSubscriptions />)) },
  { path: "/settings/webhooks/deliveries", element: withSuspense(guard(<WebhookDeliveries />)) },
  { path: "/dev/processing-reports", element: withSuspense(guard(<ProcessingReports />)) },
  { path: "/dev/processing-reports/:id", element: withSuspense(guard(<ProcessingReportDetail />)) },
  { path: "/dev/grid-demo", element: withSuspense(guard(<GridDemo />)) },
  // Forward-deployed embed surface — token-authenticated, no Supabase guard.
  // The token rides on the URL (`?token=…`) and is the sole credential.
  { path: "/embed/:dashboard", element: withSuspense(<EmbedDashboard />) },
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
