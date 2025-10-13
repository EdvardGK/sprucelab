import { Code, AlertCircle } from 'lucide-react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function ScriptsLibrary() {
  return (
    <AppLayout>
      <div className="container mx-auto p-6">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <Code className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-text-primary">Scripts Library</h1>
          </div>
          <p className="text-text-secondary">
            Automation scripts and templates for BIM workflows
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
              This page will provide a library of automation scripts for common BIM tasks
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-text-primary mb-2">Planned Features:</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-text-secondary">
                  <li>Browse pre-built automation scripts</li>
                  <li>Create and save custom Python/TypeScript scripts</li>
                  <li>Run scripts directly on IFC models</li>
                  <li>Schedule automated tasks (clash detection, reports, etc.)</li>
                  <li>Share scripts with team members</li>
                  <li>Version control and script history</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-text-primary mb-2">Example Script Categories:</h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Property Extraction</Badge>
                  <Badge variant="outline">Clash Detection</Badge>
                  <Badge variant="outline">Quantity Takeoff</Badge>
                  <Badge variant="outline">Model Validation</Badge>
                  <Badge variant="outline">Custom Reports</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
