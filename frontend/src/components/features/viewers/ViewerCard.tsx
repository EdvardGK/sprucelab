import { useNavigate } from 'react-router-dom';
import { Box, Eye } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ViewerGroupListItem } from '@/lib/api-types';

interface ViewerCardProps {
  viewer: ViewerGroupListItem;
  projectId: string;
}

export function ViewerCard({ viewer, projectId }: ViewerCardProps) {
  const navigate = useNavigate();

  return (
    <Card className="hover:border-primary/50 transition-colors cursor-pointer group">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <Box className="w-6 h-6 text-primary" />
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <h3 className="font-medium text-text-primary truncate">
              {viewer.name}
            </h3>
            {viewer.description && (
              <p className="text-xs text-text-secondary mt-0.5 line-clamp-2">
                {viewer.description}
              </p>
            )}

            {/* Stats */}
            <div className="flex items-center gap-3 mt-2 text-xs text-text-tertiary">
              <span>{viewer.model_count} {viewer.model_count === 1 ? 'model' : 'models'}</span>
            </div>
          </div>

          {/* Action */}
          <Button
            size="sm"
            variant="outline"
            className="flex-shrink-0"
            onClick={() => navigate(`/projects/${projectId}/viewer/${viewer.id}`)}
          >
            <Eye className="w-4 h-4 mr-1" />
            Open
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
