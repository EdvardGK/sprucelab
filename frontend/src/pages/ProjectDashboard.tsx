import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  Layers,
  Box,
  Package,
  Database,
  MapPin,
  BarChart3,
  CheckCircle2,
  Clock,
  AlertCircle,
  Eye,
} from 'lucide-react';
import { Card, DonutChart, ProgressBar } from '@tremor/react';
import { useProject } from '@/hooks/use-projects';
import { useProjectStatistics } from '@/hooks/use-project-stats';
import { Button } from '@/components/ui/button';
import { AppLayout } from '@/components/Layout/AppLayout';

// Helper to format unit labels
function formatUnit(unit: string): string {
  switch (unit) {
    case 'm3':
      return 'm³';
    case 'm2':
      return 'm²';
    case 'm':
      return 'm';
    case 'pcs':
      return 'pcs';
    default:
      return unit;
  }
}

// Helper to format large numbers
function formatNumber(num: number): string {
  if (num >= 1000000) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  return num.toLocaleString();
}

export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: project, isLoading: projectLoading, error: projectError } = useProject(id!);
  const { data: stats, isLoading: statsLoading, error: _statsError } = useProjectStatistics(id!);

  if (projectLoading) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] flex items-center justify-center">
          <div className="text-text-secondary">Loading project...</div>
        </div>
      </AppLayout>
    );
  }

  if (projectError || !project) {
    return (
      <AppLayout>
        <div className="h-[calc(100vh-4rem)] p-6">
          <div className="max-w-7xl mx-auto">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mb-4">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Projects
            </Button>
            <div className="rounded-lg border border-error bg-error/10 p-4 text-error">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="h-5 w-5" />
                <h3 className="font-semibold">Project not found</h3>
              </div>
              <p className="text-sm">The project doesn't exist or has been deleted.</p>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-[calc(100vh-4rem)] overflow-hidden p-4">
        <div className="max-w-7xl mx-auto h-full flex flex-col gap-4">
          {/* Header */}
          <header className="flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="hidden sm:flex">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back
              </Button>
              <div>
                <h1 className="text-xl font-bold text-text-primary">{project.name}</h1>
                {project.description && (
                  <p className="text-sm text-text-secondary">{project.description}</p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <Link to={`/projects/${id}/models`}>
                <Button size="sm" variant="outline">
                  <Layers className="mr-1 h-4 w-4" />
                  <span className="hidden md:inline">Models</span>
                </Button>
              </Link>
              <Link to={`/projects/${id}/workbench`}>
                <Button size="sm" variant="outline">
                  <Package className="mr-1 h-4 w-4" />
                  <span className="hidden md:inline">Workbench</span>
                </Button>
              </Link>
              <Link to={`/projects/${id}/viewer-groups`}>
                <Button size="sm" variant="outline">
                  <Eye className="mr-1 h-4 w-4" />
                  <span className="hidden md:inline">Viewer</span>
                </Button>
              </Link>
            </div>
          </header>

          {/* Dashboard Grid */}
          <div className="flex-1 grid grid-rows-[auto_1fr_1fr] gap-4 min-h-0">
            {/* Row 1: KPI Cards */}
            <div className="grid grid-cols-4 gap-4">
              <Card decoration="top" decorationColor="blue" className="!p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-500/10 rounded-lg">
                    <Layers className="h-5 w-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary">Models</p>
                    <p className="text-2xl font-bold text-text-primary">
                      {statsLoading ? '...' : stats?.model_count ?? 0}
                    </p>
                  </div>
                </div>
              </Card>

              <Card decoration="top" decorationColor="emerald" className="!p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <Box className="h-5 w-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary">Elements</p>
                    <p className="text-2xl font-bold text-text-primary">
                      {statsLoading ? '...' : formatNumber(stats?.element_count ?? 0)}
                    </p>
                  </div>
                </div>
              </Card>

              <Card decoration="top" decorationColor="amber" className="!p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-500/10 rounded-lg">
                    <Package className="h-5 w-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary">Types</p>
                    <p className="text-2xl font-bold text-text-primary">
                      {statsLoading ? '...' : `${stats?.type_mapped_count ?? 0}/${stats?.type_count ?? 0}`}
                    </p>
                  </div>
                </div>
              </Card>

              <Card decoration="top" decorationColor="violet" className="!p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-violet-500/10 rounded-lg">
                    <Database className="h-5 w-5 text-violet-500" />
                  </div>
                  <div>
                    <p className="text-xs text-text-secondary">Materials</p>
                    <p className="text-2xl font-bold text-text-primary">
                      {statsLoading ? '...' : `${stats?.material_mapped_count ?? 0}/${stats?.material_count ?? 0}`}
                    </p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Row 2: Top Types and Materials */}
            <div className="grid grid-cols-2 gap-4 min-h-0">
              <Card className="flex flex-col overflow-hidden !p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-2 flex-shrink-0">Top Types</h3>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {statsLoading ? (
                    <p className="text-sm text-text-secondary">Loading...</p>
                  ) : stats?.top_types && stats.top_types.length > 0 ? (
                    <div className="space-y-3">
                      {stats.top_types.map((type, i) => (
                        <div key={i}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="truncate pr-2 text-text-primary">{type.name}</span>
                            <span className="text-text-secondary flex-shrink-0">
                              {type.quantity.toLocaleString()} {formatUnit(type.unit)}
                            </span>
                          </div>
                          <ProgressBar
                            value={(type.quantity / Math.max(...stats.top_types.map((t) => t.quantity))) * 100}
                            color="blue"
                            className="h-1"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No type data</p>
                  )}
                </div>
              </Card>

              <Card className="flex flex-col overflow-hidden !p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-2 flex-shrink-0">Top Materials</h3>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {statsLoading ? (
                    <p className="text-sm text-text-secondary">Loading...</p>
                  ) : stats?.top_materials && stats.top_materials.length > 0 ? (
                    <div className="space-y-3">
                      {stats.top_materials.map((mat, i) => (
                        <div key={i}>
                          <div className="flex justify-between text-xs mb-1">
                            <span className="truncate pr-2 text-text-primary">{mat.name}</span>
                            <span className="text-text-secondary flex-shrink-0">
                              {mat.count.toLocaleString()} elements
                            </span>
                          </div>
                          <ProgressBar
                            value={(mat.count / Math.max(...stats.top_materials.map((m) => m.count))) * 100}
                            color="emerald"
                            className="h-1"
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">No material data</p>
                  )}
                </div>
              </Card>
            </div>

            {/* Row 3: NS3451, MMI, Basepoint */}
            <div className="grid grid-cols-3 gap-4 min-h-0">
              <Card className="flex flex-col overflow-hidden !p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-2 flex-shrink-0">NS-3451 Mapping</h3>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {statsLoading ? (
                    <p className="text-sm text-text-secondary">Loading...</p>
                  ) : stats?.ns3451_coverage ? (
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-text-secondary">Coverage</span>
                          <span className="text-text-primary font-semibold">{stats.ns3451_coverage.percentage}%</span>
                        </div>
                        <ProgressBar value={stats.ns3451_coverage.percentage} color="blue" className="h-2" />
                      </div>
                      <div className="space-y-1.5 pt-2 border-t border-border text-xs">
                        <div className="flex justify-between">
                          <span className="flex items-center gap-1.5 text-text-secondary">
                            <CheckCircle2 className="h-3 w-3 text-emerald-500" /> Mapped
                          </span>
                          <span className="text-text-primary">{stats.ns3451_coverage.mapped}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="flex items-center gap-1.5 text-text-secondary">
                            <Clock className="h-3 w-3 text-amber-500" /> Pending
                          </span>
                          <span className="text-text-primary">{stats.ns3451_coverage.pending}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="flex items-center gap-1.5 text-text-secondary">
                            <Eye className="h-3 w-3 text-orange-500" /> Review
                          </span>
                          <span className="text-text-primary">{stats.ns3451_coverage.review}</span>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </div>
              </Card>

              <Card className="flex flex-col overflow-hidden !p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-2 flex-shrink-0">MMI Distribution</h3>
                <div className="flex-1 flex items-center justify-center min-h-0">
                  {statsLoading ? (
                    <p className="text-sm text-text-secondary">Loading...</p>
                  ) : stats?.mmi_distribution && stats.mmi_distribution.length > 0 ? (
                    <DonutChart
                      className="h-full w-full max-h-32"
                      data={stats.mmi_distribution.map((item) => ({
                        name: `MMI ${item.mmi_level}`,
                        value: item.count,
                      }))}
                      category="value"
                      index="name"
                      colors={['slate', 'violet', 'indigo', 'rose', 'cyan', 'amber']}
                      showLabel={true}
                    />
                  ) : (
                    <div className="text-center">
                      <BarChart3 className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                      <p className="text-xs text-gray-400">No MMI data</p>
                      <p className="text-xs text-gray-500">Configure BEP to enable</p>
                    </div>
                  )}
                </div>
              </Card>

              <Card className="flex flex-col overflow-hidden !p-4">
                <h3 className="text-sm font-semibold text-text-primary mb-2 flex-shrink-0">Project Basepoint</h3>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {statsLoading ? (
                    <p className="text-sm text-text-secondary">Loading...</p>
                  ) : stats?.basepoint ? (
                    <div className="space-y-3">
                      <div className="p-2 bg-surface rounded border border-border">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <p className="text-[10px] text-gray-400">X</p>
                            <p className="font-mono text-xs text-text-primary">{stats.basepoint.gis_x.toFixed(1)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400">Y</p>
                            <p className="font-mono text-xs text-text-primary">{stats.basepoint.gis_y.toFixed(1)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-gray-400">Z</p>
                            <p className="font-mono text-xs text-text-primary">{stats.basepoint.gis_z?.toFixed(1) || 'N/A'}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-400">CRS</span>
                        <span className="bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded text-[10px]">
                          {stats.basepoint.crs || 'Unknown'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <MapPin className="h-8 w-8 text-gray-600 mx-auto mb-2" />
                        <p className="text-xs text-gray-400">No basepoint set</p>
                        <p className="text-xs text-gray-500">Upload model with GIS coords</p>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
