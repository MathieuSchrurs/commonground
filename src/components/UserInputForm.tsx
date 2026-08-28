'use client';

import React, { useState, useEffect } from 'react';
import { Car, Bike, Loader2 } from 'lucide-react';
import { CommuteConstraint, TransportMode } from '@/types/user';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

interface UserInputFormProps {
  onAddUser: (user: CommuteConstraint) => void;
  onUpdateUser?: (user: CommuteConstraint) => void;
  userToEdit?: CommuteConstraint | null;
  onCancelEdit?: () => void;
  isLoading?: boolean;
}

export default function UserInputForm({
  onAddUser,
  onUpdateUser,
  userToEdit,
  onCancelEdit,
  isLoading = false,
}: UserInputFormProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [maxMinutes, setMaxMinutes] = useState(30);
  const [transportMode, setTransportMode] = useState<TransportMode>('driving');
  const [hideCommercial, setHideCommercial] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (userToEdit) {
      setName(userToEdit.name);
      setAddress(userToEdit.address);
      setMaxMinutes(userToEdit.maxMinutes);
      setTransportMode(userToEdit.transportMode);
      setHideCommercial(userToEdit.hideCommercial ?? true);
    } else {
      setName('');
      setAddress('');
      setMaxMinutes(30);
      setTransportMode('driving');
      setHideCommercial(true);
    }
    setError('');
  }, [userToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) return setError('Please enter a name');
    if (!address.trim()) return setError('Please enter an address');

    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim() }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to geocode address');
      }

      const geocodeResult = await response.json();

      if (userToEdit && onUpdateUser) {
        onUpdateUser({
          ...userToEdit,
          name: name.trim(),
          address: geocodeResult.formattedAddress,
          latitude: geocodeResult.latitude,
          longitude: geocodeResult.longitude,
          maxMinutes,
          transportMode,
          hideCommercial,
        });
      } else {
        onAddUser({
          id: crypto.randomUUID(),
          name: name.trim(),
          address: geocodeResult.formattedAddress,
          latitude: geocodeResult.latitude,
          longitude: geocodeResult.longitude,
          maxMinutes,
          transportMode,
          hideCommercial,
        });

        setName('');
        setAddress('');
        setMaxMinutes(30);
        setTransportMode('driving');
        setHideCommercial(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleCancel = () => {
    onCancelEdit?.();
    setName('');
    setAddress('');
    setMaxMinutes(30);
    setTransportMode('driving');
    setHideCommercial(true);
    setError('');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {userToEdit ? 'Edit location' : 'Add a location'}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Anna"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Work address</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Korenmarkt 1, Gent"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label>Transport mode</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setTransportMode('driving')}
                disabled={isLoading}
                className={cn(
                  'flex items-center justify-center gap-2 h-10 px-3 rounded-md border text-sm font-medium transition-colors',
                  'disabled:opacity-50 disabled:pointer-events-none',
                  transportMode === 'driving'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Car className="h-4 w-4" />
                Car
              </button>
              <button
                type="button"
                onClick={() => setTransportMode('cycling')}
                disabled={isLoading}
                className={cn(
                  'flex items-center justify-center gap-2 h-10 px-3 rounded-md border text-sm font-medium transition-colors',
                  'disabled:opacity-50 disabled:pointer-events-none',
                  transportMode === 'cycling'
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Bike className="h-4 w-4" />
                Bike
              </button>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-baseline justify-between">
              <Label>Max commute</Label>
              <span className="text-sm font-mono tabular-nums text-muted-foreground">
                {maxMinutes} min
              </span>
            </div>
            <Slider
              min={5}
              max={60}
              step={5}
              value={[maxMinutes]}
              onValueChange={(v) => setMaxMinutes(Array.isArray(v) ? v[0] : v)}
              disabled={isLoading}
            />
            <div className="flex justify-between text-xs text-muted-foreground font-mono">
              <span>5 min</span>
              <span>60 min</span>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Commercial listings</Label>
            <button
              type="button"
              onClick={() => setHideCommercial((v) => !v)}
              disabled={isLoading}
              aria-pressed={hideCommercial}
              className={cn(
                'flex items-center justify-center gap-2 h-10 px-3 w-full rounded-md border text-sm font-medium transition-colors',
                'disabled:opacity-50 disabled:pointer-events-none',
                hideCommercial
                  ? 'border-foreground bg-foreground text-background'
                  : 'border-border hover:bg-accent hover:text-accent-foreground'
              )}
            >
              {hideCommercial ? 'Hide commercial listings' : 'Show commercial listings'}
            </button>
          </div>

          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}

          <div className="flex gap-2 pt-1">
            <Button type="submit" disabled={isLoading} className="flex-1">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving
                </>
              ) : userToEdit ? (
                'Update location'
              ) : (
                'Add location'
              )}
            </Button>
            {userToEdit && (
              <Button type="button" variant="outline" onClick={handleCancel} disabled={isLoading}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
