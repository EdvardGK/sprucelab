import { User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AppLayout } from '@/components/Layout/AppLayout';

export default function MyPage() {
  return (
    <AppLayout>
      <div className="flex flex-col w-full flex-grow py-6 px-6 md:px-8 lg:px-12">
        {/* Header */}
        <div className="mb-8 max-w-7xl w-full mx-auto">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-4xl font-bold text-text-primary">My Page</h1>
              <p className="text-text-secondary mt-2">Your personal workspace overview</p>
            </div>

            <Button size="lg">
              <User className="mr-2 h-5 w-5" />
              Edit Profile
            </Button>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl w-full mx-auto">
          <div className="grid gap-6 md:grid-cols-2">
            {/* My Activity */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4">Recent Activity</h3>
                <div className="space-y-3 text-sm">
                  <div className="flex items-center gap-3 text-text-secondary">
                    <div className="h-2 w-2 rounded-full bg-primary"></div>
                    <span>Uploaded model "LBK_ARK_F-KJ" v6</span>
                    <span className="ml-auto text-text-tertiary">2h ago</span>
                  </div>
                  <div className="flex items-center gap-3 text-text-secondary">
                    <div className="h-2 w-2 rounded-full bg-success"></div>
                    <span>Completed QTO analysis</span>
                    <span className="ml-auto text-text-tertiary">5h ago</span>
                  </div>
                  <div className="flex items-center gap-3 text-text-secondary">
                    <div className="h-2 w-2 rounded-full bg-primary"></div>
                    <span>Created new project "TEST Project"</span>
                    <span className="ml-auto text-text-tertiary">1d ago</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* My Projects */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4">My Projects</h3>
                <div className="space-y-2 text-sm text-text-secondary">
                  <p>• 2 active projects</p>
                  <p>• 3 models uploaded this week</p>
                  <p>• 5 pending issues</p>
                </div>
              </CardContent>
            </Card>

            {/* My Tasks */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4">My Tasks</h3>
                <div className="text-sm text-text-tertiary">
                  Task management coming soon...
                </div>
              </CardContent>
            </Card>

            {/* My Preferences */}
            <Card>
              <CardContent className="pt-6">
                <h3 className="text-lg font-semibold text-text-primary mb-4">Preferences</h3>
                <div className="text-sm text-text-tertiary">
                  User settings coming soon...
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
