import { Settings as SettingsIcon, AlertCircle } from 'lucide-react';
import { AppLayout } from '@/components/Layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function Settings() {
  return (
    <AppLayout>
      <div className="container mx-auto p-6">
        {/* Page header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <SettingsIcon className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold text-text-primary">Settings</h1>
          </div>
          <p className="text-text-secondary">
            Customize your workspace preferences and account settings
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
              This page will provide comprehensive settings for your account and workspace
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-text-primary mb-2">Planned Settings Categories:</h3>
                <ul className="list-disc list-inside space-y-1 text-sm text-text-secondary">
                  <li>Profile: Name, email, avatar, bio</li>
                  <li>Appearance: Theme (dark/light), color scheme, sidebar preferences</li>
                  <li>Notifications: Email alerts, in-app notifications, frequency</li>
                  <li>Privacy: Account visibility, data sharing preferences</li>
                  <li>3D Viewer: Default render settings, navigation controls</li>
                  <li>Integrations: Connect external tools (Revit, Navisworks, etc.)</li>
                  <li>Security: Password, two-factor authentication, session management</li>
                  <li>API Keys: Generate and manage API access tokens</li>
                </ul>
              </div>

              <div>
                <h3 className="font-semibold text-text-primary mb-2">Quick Actions:</h3>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline">Update Profile</Badge>
                  <Badge variant="outline">Change Theme</Badge>
                  <Badge variant="outline">Manage Notifications</Badge>
                  <Badge variant="outline">API Access</Badge>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
