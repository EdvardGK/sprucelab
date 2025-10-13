import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Settings, BarChart3, Code2 } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AppLayout } from '@/components/Layout/AppLayout';

// Tab definitions for BIM Workbench
const TABS = [
  { id: 'bep', label: 'BEP Configuration', icon: Settings },
  { id: 'analysis', label: 'Analysis & DataViz', icon: BarChart3 },
  { id: 'scripting', label: 'Scripting', icon: Code2 },
] as const;

type TabId = typeof TABS[number]['id'];

export default function BIMWorkbench() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProject(id!);
  const [activeTab, setActiveTab] = useState<TabId>('bep');

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex h-screen items-center justify-center">
          <div className="text-text-secondary">Loading workbench...</div>
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="flex h-screen items-center justify-center">
          <div className="text-error">Project not found</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex h-screen flex-col bg-background text-foreground">
        {/* Header */}
        <header className="border-b border-border bg-background-elevated px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/projects/${id}`)}
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Project
              </Button>

              <div>
                <h1 className="text-xl font-semibold text-text-primary">
                  BIM Workbench
                </h1>
                <p className="text-sm text-text-tertiary">{project.name}</p>
              </div>
            </div>

            <div className="text-sm text-text-secondary">
              Project-level tools for BIM coordination
            </div>
          </div>
        </header>

        {/* Tabs Navigation */}
        <div className="border-b border-border bg-background-elevated">
          <nav className="flex px-6 space-x-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`
                    flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors
                    border-b-2 -mb-px
                    ${activeTab === tab.id
                      ? 'text-text-primary border-primary'
                      : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border'
                    }
                  `}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-auto bg-background">
          {activeTab === 'bep' && <BEPTab projectId={project.id} />}
          {activeTab === 'analysis' && <AnalysisTab projectId={project.id} />}
          {activeTab === 'scripting' && <ScriptingTab projectId={project.id} />}
        </div>
      </div>
    </AppLayout>
  );
}

// BEP Configuration Tab
function BEPTab({ projectId: _projectId }: { projectId: string }) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">
          BIM Execution Plan Configuration
        </h2>
        <p className="text-text-secondary">
          Configure project-wide BIM standards, MMI scale, and validation rules
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <Settings className="h-12 w-12 text-text-tertiary mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              BEP Configuration Coming Soon
            </h3>
            <p className="text-text-secondary mb-4">
              View and manage BEP templates, MMI scale, technical requirements
            </p>
            <div className="space-y-2 text-sm text-text-tertiary text-left max-w-md mx-auto">
              <p>• Browse available BEP templates (MMI-veileder 2.0, ISO 19650)</p>
              <p>• Assign BEP configuration to project</p>
              <p>• Customize MMI scale and color mapping</p>
              <p>• Define technical requirements (IFC schema, units, etc.)</p>
              <p>• Configure naming conventions and validation rules</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Analysis & DataViz Tab
function AnalysisTab({ projectId: _projectId }: { projectId: string }) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">
          Analysis & Data Visualization
        </h2>
        <p className="text-text-secondary">
          Compare models, visualize trends, and analyze project data
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <BarChart3 className="h-12 w-12 text-text-tertiary mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              Analysis Module Coming Soon
            </h3>
            <p className="text-text-secondary mb-4">
              Powerful tools for comparing models and visualizing trends
            </p>
            <div className="space-y-2 text-sm text-text-tertiary text-left max-w-md mx-auto">
              <p>• Compare multiple model versions side-by-side</p>
              <p>• Visualize MMI progression over time</p>
              <p>• Track QTO changes across versions</p>
              <p>• Generate comparison reports</p>
              <p>• Export analysis results (CSV, Excel, PDF)</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Scripting Tab
function ScriptingTab({ projectId: _projectId }: { projectId: string }) {
  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-text-primary mb-2">
          Script Library & Automation
        </h2>
        <p className="text-text-secondary">
          Run scripts on models, upload custom scripts, and automate workflows
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="text-center py-12">
            <Code2 className="h-12 w-12 text-text-tertiary mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              Scripting Module Coming Soon
            </h3>
            <p className="text-text-secondary mb-4">
              Execute Python scripts on any model in the project
            </p>
            <div className="space-y-2 text-sm text-text-tertiary text-left max-w-md mx-auto">
              <p>• Browse script library (validation, export, analysis)</p>
              <p>• Upload custom Python scripts</p>
              <p>• Run scripts on selected models</p>
              <p>• View execution history and results</p>
              <p>• Schedule automated workflows</p>
              <p>• 3rd party script support</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
