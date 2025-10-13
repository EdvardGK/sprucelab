import { BarChart3, AlertCircle } from 'lucide-react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function QuickStats() {
  return (
    <AppLayout>
      <div className="container mx-auto p-6">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <BarChart3 className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-text-primary">Quick Stats</h1>
          </div>
          <p className="text-text-secondary">
            Your activity and statistics across all projects
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
              This page will provide comprehensive analytics and statistics about your BIM workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-text-primary mb-2">Planned Metrics:</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-text-secondary">
                  <li>Total projects, models, and storage used</li>
                  <li>Issues resolved vs. open across all projects</li>
                  <li>RFI response times and completion rates</li>
                  <li>Model processing statistics (success rate, avg time)</li>
                  <li>Activity timeline and contribution history</li>
                  <li>Team collaboration metrics</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-text-primary mb-2">Visualization Types:</h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Time-series Charts</Badge>
                  <Badge variant="outline">Project Comparison</Badge>
                  <Badge variant="outline">Activity Heatmaps</Badge>
                  <Badge variant="outline">Storage Breakdown</Badge>
                  <Badge variant="outline">Element Statistics</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
