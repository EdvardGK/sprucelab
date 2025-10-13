import { useParams, useNavigate } from 'react-router-dom';
import { Target, FileText, Clock, AlertCircle, ArrowLeft } from 'lucide-react';
import { useProject } from '@/hooks/use-projects';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/Layout/AppLayout';

export default function ProjectMyPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: project, isLoading } = useProject(id!);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="container mx-auto p-6">
          <div className="text-text-secondary">Loading...</div>
        </div>
      </AppLayout>
    );
  }

  if (!project) {
    return (
      <AppLayout>
        <div className="container mx-auto p-6">
          <div className="text-error">Project not found</div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-[calc(100vh-4rem)] overflow-hidden p-6">
        <div className="max-w-7xl mx-auto h-full flex flex-col gap-4">
          {/* Header */}
          <header className="flex items-center justify-between">
            <div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate(`/projects/${id}`)}
                className="mb-2 -ml-2"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to Project
              </Button>
              <h1 className="text-2xl font-semibold text-text-primary">My Work</h1>
              <p className="text-sm text-text-secondary">
                Your work in <span className="text-text-primary font-medium">{project.name}</span>
              </p>
            </div>
          </header>

          {/* Main Grid - 2 rows */}
          <div className="flex-1 grid grid-rows-[2fr_1fr] gap-4 min-h-0">
            {/* Top Row: Work Items */}
            <div className="grid grid-cols-3 gap-4">
              {/* Issues */}
              <Card className="flex flex-col">
                <CardHeader className="pb-3 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">My Issues</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <div className="space-y-3 flex-1">
                    <div>
                      <div className="text-3xl font-bold text-text-primary">0</div>
                      <div className="text-xs text-text-secondary">Assigned to you</div>
                    </div>
                    <div className="space-y-1.5 pt-2 border-t border-border">
                      <div className="flex justify-between text-xs">
                        <span className="text-text-secondary">Open</span>
                        <span className="text-text-primary font-medium">0</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-text-secondary">In Progress</span>
                        <span className="text-text-primary font-medium">0</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-text-secondary">Due Soon</span>
                        <span className="text-warning font-medium">0</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-4"
                    onClick={() => navigate(`/projects/${id}/issues?assignee=me`)}
                  >
                    View All Issues
                  </Button>
                </CardContent>
              </Card>

              {/* RFIs */}
              <Card className="flex flex-col">
                <CardHeader className="pb-3 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">My RFIs</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col">
                  <div className="space-y-3 flex-1">
                    <div>
                      <div className="text-3xl font-bold text-text-primary">0</div>
                      <div className="text-xs text-text-secondary">Awaiting your response</div>
                    </div>
                    <div className="space-y-1.5 pt-2 border-t border-border">
                      <div className="flex justify-between text-xs">
                        <span className="text-text-secondary">Pending</span>
                        <span className="text-text-primary font-medium">0</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-text-secondary">Due Soon</span>
                        <span className="text-error font-medium">0</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-text-secondary">Overdue</span>
                        <span className="text-error font-medium">0</span>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-4"
                    onClick={() => navigate(`/projects/${id}/rfis?assignee=me`)}
                  >
                    View All RFIs
                  </Button>
                </CardContent>
              </Card>

              {/* Needs Attention */}
              <Card className="flex flex-col overflow-hidden">
                <CardHeader className="pb-3 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-warning" />
                    <CardTitle className="text-base">Needs Attention</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  <div className="space-y-2">
                    {/* Placeholder for urgent items */}
                    <div className="text-xs text-text-tertiary text-center py-8">
                      <p>No urgent items</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Bottom Row: Activity & Stats */}
            <div className="grid grid-cols-2 gap-4">
              {/* Recent Activity */}
              <Card className="flex flex-col overflow-hidden">
                <CardHeader className="pb-3 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">Your Recent Activity</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  <div className="space-y-3">
                    <div className="text-xs text-text-tertiary text-center py-4">
                      <p>No recent activity in this project</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Your Stats in This Project */}
              <Card className="flex flex-col">
                <CardHeader className="pb-3 flex-shrink-0">
                  <CardTitle className="text-base">Your Project Stats</CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-2xl font-bold text-text-primary">0</div>
                      <div className="text-xs text-text-tertiary">Issues Closed</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-text-primary">0</div>
                      <div className="text-xs text-text-tertiary">RFIs Responded</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-text-primary">0</div>
                      <div className="text-xs text-text-tertiary">Comments Made</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-text-primary">—</div>
                      <div className="text-xs text-text-tertiary">Avg Response Time</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
