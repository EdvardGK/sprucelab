import { Target, FileText, AlertCircle, Clock, TrendingUp, Activity } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/Layout/AppLayout';

export default function Dashboard() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="h-[calc(100vh-4rem)] overflow-hidden p-6">
        <div className="max-w-7xl mx-auto h-full flex flex-col gap-4">
          {/* Welcome Header - Compact */}
          <header>
            <h1 className="text-2xl font-semibold text-text-primary">Home</h1>
            <p className="text-sm text-text-secondary">Overview of your work and activity</p>
          </header>

          {/* Main Grid - 2 rows */}
          <div className="flex-1 grid grid-rows-[2fr_1fr] gap-4 min-h-0">
            {/* Top Row: Work Stats + Activity */}
            <div className="grid grid-cols-4 gap-4">
              {/* Issues Assigned */}
              <Card
                className="cursor-pointer transition-all hover:shadow-glow hover:border-primary/50 flex flex-col"
                onClick={() => navigate('/my-issues')}
              >
                <CardHeader className="pb-3 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">Issues</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
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
                        <span className="text-text-secondary">Due This Week</span>
                        <span className="text-warning font-medium">0</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* RFIs Delegated */}
              <Card
                className="cursor-pointer transition-all hover:shadow-glow hover:border-primary/50 flex flex-col"
                onClick={() => navigate('/my-rfis')}
              >
                <CardHeader className="pb-3 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      <CardTitle className="text-base">RFIs</CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    <div>
                      <div className="text-3xl font-bold text-text-primary">0</div>
                      <div className="text-xs text-text-secondary">Awaiting response</div>
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
                </CardContent>
              </Card>

              {/* Needs Attention */}
              <Card className="flex flex-col">
                <CardHeader className="pb-3 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-warning" />
                    <CardTitle className="text-base">Needs Attention</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  <div className="space-y-3">
                    <div className="text-xs text-text-tertiary text-center py-4">
                      <p>No urgent items</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card className="flex flex-col overflow-hidden">
                <CardHeader className="pb-3 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    <Clock className="h-5 w-5 text-primary" />
                    <CardTitle className="text-base">Recent Activity</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  <div className="space-y-3">
                    <div className="text-xs text-text-tertiary text-center py-4">
                      <p>No recent activity</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Bottom Row: Quick Stats */}
            <div className="grid grid-cols-4 gap-4">
              {/* Your Projects */}
              <Card className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-text-secondary">Your Projects</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex items-center">
                  <div>
                    <div className="text-2xl font-bold text-text-primary">0</div>
                    <div className="text-xs text-text-tertiary">Active projects</div>
                  </div>
                </CardContent>
              </Card>

              {/* Models Uploaded */}
              <Card className="flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm text-text-secondary">Models Uploaded</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 flex items-center">
                  <div>
                    <div className="text-2xl font-bold text-text-primary">0</div>
                    <div className="text-xs text-text-tertiary">Total IFC files</div>
                  </div>
                </CardContent>
              </Card>

              {/* This Week */}
              <Card className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <CardTitle className="text-sm text-text-secondary">This Week</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex-1">
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs">
                      <span className="text-text-tertiary">Issues Closed</span>
                      <span className="text-text-primary font-medium">0</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-text-tertiary">RFIs Responded</span>
                      <span className="text-text-primary font-medium">0</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Trend */}
              <Card className="flex flex-col">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-success" />
                    <CardTitle className="text-sm text-text-secondary">Productivity</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex items-center">
                  <div>
                    <div className="text-2xl font-bold text-success">—</div>
                    <div className="text-xs text-text-tertiary">vs last week</div>
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
