import { Target, FileText, AlertCircle, Clock, TrendingUp, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/Layout/AppLayout';

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="h-[calc(100vh-4rem)] overflow-hidden p-[clamp(0.5rem,2vw,1.5rem)]">
        <div className="max-w-7xl mx-auto h-full flex flex-col gap-[clamp(0.5rem,1.5vw,1rem)]">
          {/* Welcome Header - Compact */}
          <header className="flex-shrink-0">
            <h1 className="text-[clamp(1.25rem,3vw,1.5rem)] font-semibold text-text-primary">Home</h1>
            <p className="text-[clamp(0.625rem,1.5vw,0.875rem)] text-text-secondary">Overview of your work and activity</p>
          </header>

          {/* Main Grid - 2 rows */}
          <div className="flex-1 grid grid-rows-[2fr_1fr] gap-[clamp(0.5rem,1.5vw,1rem)] min-h-0">
            {/* Top Row: Work Stats + Activity */}
            <div className="grid grid-cols-4 gap-[clamp(0.5rem,1.5vw,1rem)] min-h-0">
              {/* Issues Assigned */}
              <Card
                className="cursor-pointer transition-all hover:shadow-glow hover:border-primary/50 flex flex-col overflow-hidden"
                onClick={() => navigate('/my-issues')}
              >
                <CardHeader className="pb-[clamp(0.375rem,1vw,0.75rem)] flex-shrink-0 p-[clamp(0.5rem,1.5vw,1rem)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-[clamp(0.25rem,0.75vw,0.5rem)]">
                      <Target className="h-[clamp(1rem,2vw,1.25rem)] w-[clamp(1rem,2vw,1.25rem)] text-primary" />
                      <CardTitle className="text-[clamp(0.75rem,1.5vw,1rem)]">Issues</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between p-[clamp(0.5rem,1.5vw,1rem)] pt-0 min-h-0">
                  <div className="space-y-[clamp(0.375rem,1vw,0.75rem)]">
                    <div>
                      <div className="text-[clamp(1.5rem,4vw,2rem)] font-bold text-text-primary leading-none">0</div>
                      <div className="text-[clamp(0.5rem,1vw,0.75rem)] text-text-secondary">Assigned to you</div>
                    </div>
                    <div className="space-y-[clamp(0.25rem,0.5vw,0.375rem)] pt-[clamp(0.25rem,0.75vw,0.5rem)] border-t border-border">
                      <div className="flex justify-between text-[clamp(0.5rem,1vw,0.75rem)]">
                        <span className="text-text-secondary">Open</span>
                        <span className="text-text-primary font-medium">0</span>
                      </div>
                      <div className="flex justify-between text-[clamp(0.5rem,1vw,0.75rem)]">
                        <span className="text-text-secondary">In Progress</span>
                        <span className="text-text-primary font-medium">0</span>
                      </div>
                      <div className="flex justify-between text-[clamp(0.5rem,1vw,0.75rem)]">
                        <span className="text-text-secondary">Due This Week</span>
                        <span className="text-warning font-medium">0</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* RFIs Delegated */}
              <Card
                className="cursor-pointer transition-all hover:shadow-glow hover:border-primary/50 flex flex-col overflow-hidden"
                onClick={() => navigate('/my-rfis')}
              >
                <CardHeader className="pb-[clamp(0.375rem,1vw,0.75rem)] flex-shrink-0 p-[clamp(0.5rem,1.5vw,1rem)]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-[clamp(0.25rem,0.75vw,0.5rem)]">
                      <FileText className="h-[clamp(1rem,2vw,1.25rem)] w-[clamp(1rem,2vw,1.25rem)] text-primary" />
                      <CardTitle className="text-[clamp(0.75rem,1.5vw,1rem)]">RFIs</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between p-[clamp(0.5rem,1.5vw,1rem)] pt-0 min-h-0">
                  <div className="space-y-[clamp(0.375rem,1vw,0.75rem)]">
                    <div>
                      <div className="text-[clamp(1.5rem,4vw,2rem)] font-bold text-text-primary leading-none">0</div>
                      <div className="text-[clamp(0.5rem,1vw,0.75rem)] text-text-secondary">Awaiting response</div>
                    </div>
                    <div className="space-y-[clamp(0.25rem,0.5vw,0.375rem)] pt-[clamp(0.25rem,0.75vw,0.5rem)] border-t border-border">
                      <div className="flex justify-between text-[clamp(0.5rem,1vw,0.75rem)]">
                        <span className="text-text-secondary">Pending</span>
                        <span className="text-text-primary font-medium">0</span>
                      </div>
                      <div className="flex justify-between text-[clamp(0.5rem,1vw,0.75rem)]">
                        <span className="text-text-secondary">Due Soon</span>
                        <span className="text-error font-medium">0</span>
                      </div>
                      <div className="flex justify-between text-[clamp(0.5rem,1vw,0.75rem)]">
                        <span className="text-text-secondary">Overdue</span>
                        <span className="text-error font-medium">0</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Needs Attention */}
              <Card className="flex flex-col overflow-hidden">
                <CardHeader className="pb-[clamp(0.375rem,1vw,0.75rem)] flex-shrink-0 p-[clamp(0.5rem,1.5vw,1rem)]">
                  <div className="flex items-center gap-[clamp(0.25rem,0.75vw,0.5rem)]">
                    <AlertCircle className="h-[clamp(1rem,2vw,1.25rem)] w-[clamp(1rem,2vw,1.25rem)] text-warning" />
                    <CardTitle className="text-[clamp(0.75rem,1.5vw,1rem)]">Needs Attention</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-[clamp(0.5rem,1.5vw,1rem)] pt-0 min-h-0">
                  <div className="space-y-[clamp(0.375rem,1vw,0.75rem)]">
                    <div className="text-[clamp(0.5rem,1vw,0.75rem)] text-text-tertiary text-center py-[clamp(0.5rem,1.5vw,1rem)]">
                      <p>No urgent items</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card className="flex flex-col overflow-hidden">
                <CardHeader className="pb-[clamp(0.375rem,1vw,0.75rem)] flex-shrink-0 p-[clamp(0.5rem,1.5vw,1rem)]">
                  <div className="flex items-center gap-[clamp(0.25rem,0.75vw,0.5rem)]">
                    <Clock className="h-[clamp(1rem,2vw,1.25rem)] w-[clamp(1rem,2vw,1.25rem)] text-primary" />
                    <CardTitle className="text-[clamp(0.75rem,1.5vw,1rem)]">Recent Activity</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto p-[clamp(0.5rem,1.5vw,1rem)] pt-0 min-h-0">
                  <div className="space-y-[clamp(0.375rem,1vw,0.75rem)]">
                    <div className="text-[clamp(0.5rem,1vw,0.75rem)] text-text-tertiary text-center py-[clamp(0.5rem,1.5vw,1rem)]">
                      <p>No recent activity</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Bottom Row: Quick Stats */}
            <div className="grid grid-cols-4 gap-[clamp(0.5rem,1.5vw,1rem)] min-h-0">
              {/* Your Projects */}
              <Card className="flex flex-col overflow-hidden">
                <CardHeader className="pb-[clamp(0.25rem,0.5vw,0.5rem)] p-[clamp(0.5rem,1.5vw,1rem)]">
                  <CardTitle className="text-[clamp(0.625rem,1.2vw,0.875rem)] text-text-secondary">Your Projects</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex items-center p-[clamp(0.5rem,1.5vw,1rem)] pt-0">
                  <div>
                    <div className="text-[clamp(1.25rem,3vw,1.5rem)] font-bold text-text-primary leading-none">0</div>
                    <div className="text-[clamp(0.5rem,1vw,0.75rem)] text-text-tertiary">Active projects</div>
                  </div>
                </CardContent>
              </Card>

              {/* Models Uploaded */}
              <Card className="flex flex-col overflow-hidden">
                <CardHeader className="pb-[clamp(0.25rem,0.5vw,0.5rem)] p-[clamp(0.5rem,1.5vw,1rem)]">
                  <CardTitle className="text-[clamp(0.625rem,1.2vw,0.875rem)] text-text-secondary">Models Uploaded</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex items-center p-[clamp(0.5rem,1.5vw,1rem)] pt-0">
                  <div>
                    <div className="text-[clamp(1.25rem,3vw,1.5rem)] font-bold text-text-primary leading-none">0</div>
                    <div className="text-[clamp(0.5rem,1vw,0.75rem)] text-text-tertiary">Total IFC files</div>
                  </div>
                </CardContent>
              </Card>

              {/* This Week */}
              <Card className="flex flex-col overflow-hidden">
                <CardHeader className="pb-[clamp(0.25rem,0.5vw,0.5rem)] p-[clamp(0.5rem,1.5vw,1rem)]">
                  <div className="flex items-center gap-[clamp(0.25rem,0.5vw,0.5rem)]">
                    <Activity className="h-[clamp(0.75rem,1.5vw,1rem)] w-[clamp(0.75rem,1.5vw,1rem)] text-primary" />
                    <CardTitle className="text-[clamp(0.625rem,1.2vw,0.875rem)] text-text-secondary">This Week</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 p-[clamp(0.5rem,1.5vw,1rem)] pt-0">
                  <div className="space-y-[clamp(0.25rem,0.5vw,0.375rem)]">
                    <div className="flex justify-between text-[clamp(0.5rem,1vw,0.75rem)]">
                      <span className="text-text-tertiary">Issues Closed</span>
                      <span className="text-text-primary font-medium">0</span>
                    </div>
                    <div className="flex justify-between text-[clamp(0.5rem,1vw,0.75rem)]">
                      <span className="text-text-tertiary">RFIs Responded</span>
                      <span className="text-text-primary font-medium">0</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Trend */}
              <Card className="flex flex-col overflow-hidden">
                <CardHeader className="pb-[clamp(0.25rem,0.5vw,0.5rem)] p-[clamp(0.5rem,1.5vw,1rem)]">
                  <div className="flex items-center gap-[clamp(0.25rem,0.5vw,0.5rem)]">
                    <TrendingUp className="h-[clamp(0.75rem,1.5vw,1rem)] w-[clamp(0.75rem,1.5vw,1rem)] text-success" />
                    <CardTitle className="text-[clamp(0.625rem,1.2vw,0.875rem)] text-text-secondary">Productivity</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex items-center p-[clamp(0.5rem,1.5vw,1rem)] pt-0">
                  <div>
                    <div className="text-[clamp(1.25rem,3vw,1.5rem)] font-bold text-success leading-none">—</div>
                    <div className="text-[clamp(0.5rem,1vw,0.75rem)] text-text-tertiary">vs last week</div>
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
