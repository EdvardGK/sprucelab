import { Target, AlertCircle } from 'lucide-react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function MyIssues() {
  return (
    <AppLayout>
      <div className="container mx-auto p-6">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Target className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-text-primary">My Issues</h1>
          </div>
          <p className="text-text-secondary">
            Track all issues assigned to you across all projects
          </p>
        </div>

        {/* Coming soon placeholder */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-accent" />
              <CardTitle>Feature Coming Soon</CardTitle>
            </div>
            <CardDescription>
              This page will display all BIM coordination issues assigned to you
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-text-primary mb-2">Planned Features:</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-text-secondary">
                  <li>View all issues assigned to you across projects</li>
                  <li>Filter by priority (High, Medium, Low)</li>
                  <li>Filter by status (Open, In Progress, Resolved)</li>
                  <li>Group by project or due date</li>
                  <li>Quick actions: Mark as resolved, reassign, add comments</li>
                  <li>Link to specific model elements in 3D viewer</li>
                </ul>
              </div>

              <div className="flex gap-2">
                <Badge variant="outline">Priority Filtering</Badge>
                <Badge variant="outline">Status Tracking</Badge>
                <Badge variant="outline">3D Integration</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
