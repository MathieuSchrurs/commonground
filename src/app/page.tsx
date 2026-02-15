'use client';

import React, { useState, useCallback } from 'react';
import { CommuteConstraint } from '@/types/user';
import { Feature, Polygon, MultiPolygon } from 'geojson';
import UserInputForm from '@/components/UserInputForm';
import UserList from '@/components/UserList';
import Map from '@/components/Map';
import ZoneLegend from '@/components/ZoneLegend';
import { computeIntersection, calculateArea } from '@/lib/geo';

export default function Home() {
  const [users, setUsers] = useState<CommuteConstraint[]>([]);
  const [isochrones, setIsochrones] = useState<Feature<Polygon | MultiPolygon>[]>([]);
  const [intersection, setIntersection] = useState<Feature<Polygon | MultiPolygon> | null>(null);
  const [intersectionArea, setIntersectionArea] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [editingUser, setEditingUser] = useState<CommuteConstraint | null>(null);

  const computeAndSetIntersection = useCallback((updatedIsochrones: Feature<Polygon | MultiPolygon>[]) => {
    if (updatedIsochrones.length > 0) {
      const newIntersection = computeIntersection(updatedIsochrones);
      setIntersection(newIntersection);

      if (newIntersection) {
        const area = calculateArea(newIntersection);
        setIntersectionArea(area);
      } else {
        setIntersectionArea(null);
      }
    } else {
      setIntersection(null);
      setIntersectionArea(null);
    }
  }, []);

  const handleAddUser = useCallback(async (newUser: CommuteConstraint) => {
    setIsLoading(true);
    setError('');

    try {
      // Fetch isochrone for the new user
      const response = await fetch('/api/isochrone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: newUser.latitude,
          lng: newUser.longitude,
          minutes: newUser.maxMinutes,
          mode: newUser.transportMode,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch isochrone');
      }

      const isochroneData = await response.json();

      // Update state with new user and isochrone
      const updatedUsers = [...users, newUser];
      const updatedIsochrones = [...isochrones, isochroneData.features[0]];

      setUsers(updatedUsers);
      setIsochrones(updatedIsochrones);
      computeAndSetIntersection(updatedIsochrones);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [users, isochrones, computeAndSetIntersection]);

  const handleUpdateUser = useCallback(async (updatedUser: CommuteConstraint) => {
    setIsLoading(true);
    setError('');

    try {
      // Fetch new isochrone for the updated user
      const response = await fetch('/api/isochrone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lat: updatedUser.latitude,
          lng: updatedUser.longitude,
          minutes: updatedUser.maxMinutes,
          mode: updatedUser.transportMode,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to fetch isochrone');
      }

      const isochroneData = await response.json();

      // Find the index of the user being edited
      const userIndex = users.findIndex(u => u.id === updatedUser.id);
      if (userIndex === -1) {
        throw new Error('User not found');
      }

      // Update users array
      const updatedUsers = [...users];
      updatedUsers[userIndex] = updatedUser;
      setUsers(updatedUsers);

      // Update isochrones array
      const updatedIsochrones = [...isochrones];
      updatedIsochrones[userIndex] = isochroneData.features[0];
      setIsochrones(updatedIsochrones);

      // Recompute intersection
      computeAndSetIntersection(updatedIsochrones);

      // Clear editing state
      setEditingUser(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [users, isochrones, computeAndSetIntersection]);

  const handleRemoveUser = useCallback((userId: string) => {
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) return;

    const updatedUsers = users.filter(u => u.id !== userId);
    const updatedIsochrones = isochrones.filter((_, i) => i !== userIndex);

    setUsers(updatedUsers);
    setIsochrones(updatedIsochrones);

    // If we were editing this user, stop editing
    if (editingUser?.id === userId) {
      setEditingUser(null);
    }

    // Recompute intersection
    computeAndSetIntersection(updatedIsochrones);
  }, [users, isochrones, editingUser, computeAndSetIntersection]);

  const handleEditUser = useCallback((user: CommuteConstraint) => {
    setEditingUser(user);
    setError('');
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingUser(null);
    setError('');
  }, []);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-gray-900">CommonGround</h1>
          <p className="text-sm text-gray-600">Find the perfect place for everyone to live</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Sidebar - Forms */}
          <div className="space-y-6">
            <UserInputForm 
              onAddUser={handleAddUser} 
              onUpdateUser={handleUpdateUser}
              userToEdit={editingUser}
              onCancelEdit={handleCancelEdit}
              isLoading={isLoading} 
            />
            <UserList 
              users={users} 
              onRemoveUser={handleRemoveUser} 
              onEditUser={handleEditUser}
              editingUserId={editingUser?.id}
              isLoading={isLoading} 
            />
            <ZoneLegend 
              users={users} 
              intersectionArea={intersectionArea} 
              hasIntersection={!!intersection} 
            />
          </div>

          {/* Right Side - Map */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-lg shadow-md p-4 h-[600px]">
              <Map 
                users={users} 
                intersection={intersection} 
                isochrones={isochrones}
                isLoading={isLoading}
              />
            </div>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {intersection && (
              <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
                <strong>Success!</strong> Found a common area of {intersectionArea?.toFixed(2)} km² where everyone can live.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
