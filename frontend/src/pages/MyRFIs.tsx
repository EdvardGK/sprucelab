import { FileText, AlertCircle } from 'lucide-react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function MyRFIs() {
  return (
    <AppLayout>
      <div className="container mx-auto p-6">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <FileText className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-text-primary">My RFIs</h1>
          </div>
          <p className="text-text-secondary">
            Manage Requests for Information delegated to you
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
              This page will display all RFIs (Requests for Information) awaiting your response
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-text-primary mb-2">Planned Features:</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-text-secondary">
                  <li>View all RFIs delegated to you across projects</li>
                  <li>Filter by status (Open, Pending Response, Answered, Closed)</li>
                  <li>Sort by due date, priority, or project</li>
                  <li>Respond to RFIs with attachments and references</li>
                  <li>Track RFI history and conversation threads</li>
                  <li>Link RFIs to specific model elements</li>
                </ul>
              </div>

              <div className="flex gap-2">
                <Badge variant="outline">Status Tracking</Badge>
                <Badge variant="outline">Response Threading</Badge>
                <Badge variant="outline">Attachments</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
