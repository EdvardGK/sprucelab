import { useState } from 'react';
import { useCreateViewerGroup } from '@/hooks/use-viewer-groups';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

interface CreateGroupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}

export function CreateGroupDialog({ open, onOpenChange, projectId }: CreateGroupDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const createGroup = useCreateViewerGroup();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) return;

    try {
      await createGroup.mutateAsync({
        project: projectId,
        name: name.trim(),
        description: description.trim() || undefined,
      });

      // Reset form
      setName('');
      setDescription('');
      onOpenChange(false);
    } catch (error) {
      console.error('Failed to create group:', error);
    }
  };

  const handleClose = () => {
    if (!createGroup.isPending) {
      setName('');
      setDescription('');
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Create Viewer Group</DialogTitle>
            <DialogDescription>
              Create a new group to organize models for federated viewing
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="group-name">
                Group Name <span className="text-error">*</span>
              </Label>
              <Input
                id="group-name"
                placeholder="e.g., Building A, Site Overview"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={createGroup.isPending}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="group-description">Description (optional)</Label>
              <Textarea
                id="group-description"
                placeholder="Optional description of this group"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={createGroup.isPending}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={handleClose}
              disabled={createGroup.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={createGroup.isPending || !name.trim()}>
              {createGroup.isPending ? 'Creating...' : 'Create Group'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
