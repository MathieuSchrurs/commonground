'use client';

import React, { useState, useEffect } from 'react';
import { CommuteConstraint, TransportMode } from '@/types/user';

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
  isLoading = false 
}: UserInputFormProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [maxMinutes, setMaxMinutes] = useState(30);
  const [transportMode, setTransportMode] = useState<TransportMode>('driving');
  const [error, setError] = useState('');

  useEffect(() => {
    if (userToEdit) {
      setName(userToEdit.name);
      setAddress(userToEdit.address);
      setMaxMinutes(userToEdit.maxMinutes);
      setTransportMode(userToEdit.transportMode);
      setError('');
    } else {
      setName('');
      setAddress('');
      setMaxMinutes(30);
      setTransportMode('driving');
      setError('');
    }
  }, [userToEdit]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Please enter a name');
      return;
    }

    if (!address.trim()) {
      setError('Please enter an address');
      return;
    }

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
        const updatedUser: CommuteConstraint = {
          ...userToEdit,
          name: name.trim(),
          address: geocodeResult.formattedAddress,
          latitude: geocodeResult.latitude,
          longitude: geocodeResult.longitude,
          maxMinutes,
          transportMode,
        };
        onUpdateUser(updatedUser);
      } else {
        const newUser: CommuteConstraint = {
          id: crypto.randomUUID(),
          name: name.trim(),
          address: geocodeResult.formattedAddress,
          latitude: geocodeResult.latitude,
          longitude: geocodeResult.longitude,
          maxMinutes,
          transportMode,
        };
        onAddUser(newUser);
        
        setName('');
        setAddress('');
        setMaxMinutes(30);
        setTransportMode('driving');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  const handleCancel = () => {
    if (onCancelEdit) {
      onCancelEdit();
    }
    setName('');
    setAddress('');
    setMaxMinutes(30);
    setTransportMode('driving');
    setError('');
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-800">
        {userToEdit ? 'Edit Location' : 'Add Commute Location'}
      </h2>
      
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            type="text"
            id="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., John, Sarah"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
        </div>

        <div>
          <label htmlFor="address" className="block text-sm font-medium text-gray-700 mb-1">
            Work Address
          </label>
          <input
            type="text"
            id="address"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="e.g., 123 Main St, San Francisco, CA"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            disabled={isLoading}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Transport Mode
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTransportMode('driving')}
              disabled={isLoading}
              className={`flex-1 py-2 px-3 rounded-md border-2 transition-colors flex items-center justify-center gap-2 ${
                transportMode === 'driving'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 hover:border-gray-400 text-gray-700'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              <span>Car</span>
            </button>
            <button
              type="button"
              onClick={() => setTransportMode('cycling')}
              disabled={isLoading}
              className={`flex-1 py-2 px-3 rounded-md border-2 transition-colors flex items-center justify-center gap-2 ${
                transportMode === 'cycling'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 hover:border-gray-400 text-gray-700'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>Bike</span>
            </button>
          </div>
        </div>

        <div>
          <label htmlFor="maxMinutes" className="block text-sm font-medium text-gray-700 mb-1">
            Max Commute: {maxMinutes} minutes
          </label>
          <input
            type="range"
            id="maxMinutes"
            min="5"
            max="60"
            step="5"
            value={maxMinutes}
            onChange={(e) => setMaxMinutes(Number(e.target.value))}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            disabled={isLoading}
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>5 min</span>
            <span>60 min</span>
          </div>
        </div>

        {error && (
          <div className="text-red-600 text-sm bg-red-50 p-2 rounded">
            {error}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isLoading}
            className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Saving...' : (userToEdit ? 'Update Location' : 'Add Location')}
          </button>
          
          {userToEdit && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={isLoading}
              className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
