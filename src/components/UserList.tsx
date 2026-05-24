'use client';

import { Car, Bike, Pencil, Trash2 } from 'lucide-react';
import { CommuteConstraint } from '@/types/user';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface UserListProps {
  users: CommuteConstraint[];
  onRemoveUser: (id: string) => void;
  onEditUser: (user: CommuteConstraint) => void;
  editingUserId?: string | null;
  isLoading?: boolean;
}

const ZONE_COLORS = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
  '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F',
];

export default function UserList({ users, onRemoveUser, onEditUser, editingUserId, isLoading = false }: UserListProps) {
  if (users.length === 0) return null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Locations</CardTitle>
        <span className="text-xs font-mono tabular-nums text-muted-foreground">
          {users.length}
        </span>
      </CardHeader>
      <CardContent className="space-y-2">
        {users.map((user, index) => {
          const isEditing = editingUserId === user.id;
          const Icon = user.transportMode === 'driving' ? Car : Bike;
          return (
            <div
              key={user.id}
              className={cn(
                'group flex items-start gap-3 rounded-md border p-3 transition-colors',
                isEditing ? 'border-foreground bg-accent/50' : 'border-border hover:bg-accent/30'
              )}
            >
              <div
                className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
                style={{ backgroundColor: ZONE_COLORS[index % ZONE_COLORS.length] }}
              >
                {index + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium truncate">{user.name}</span>
                  <Badge variant="secondary" className="gap-1 font-normal">
                    <Icon className="h-3 w-3" />
                    {user.maxMinutes}m
                  </Badge>
                  {isEditing && (
                    <span className="text-xs text-muted-foreground">editing</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground truncate mt-0.5">{user.address}</p>
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => onEditUser(user)}
                  disabled={isLoading || isEditing}
                  aria-label={`Edit ${user.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => onRemoveUser(user.id)}
                  disabled={isLoading}
                  aria-label={`Remove ${user.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
