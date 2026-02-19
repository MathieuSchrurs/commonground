'use client';

import { CommuteConstraint } from '@/types/user';

interface UserListProps {
  users: CommuteConstraint[];
  onRemoveUser: (id: string) => void;
  onEditUser: (user: CommuteConstraint) => void;
  editingUserId?: string | null;
  isLoading?: boolean;
}

const TransportIcon = ({ mode }: { mode: string }) => {
  if (mode === 'driving') {
    return (
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
};

export default function UserList({ users, onRemoveUser, onEditUser, editingUserId, isLoading = false }: UserListProps) {
  if (users.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-800">Added Locations</h3>
      
      <div className="space-y-3">
        {users.map((user) => (
          <div
            key={user.id}
            className={`flex items-start justify-between p-3 rounded-lg ${
              editingUserId === user.id 
                ? 'bg-blue-50 border-2 border-blue-300' 
                : 'bg-gray-50'
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-800">{user.name}</span>
                <span 
                  className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-200 text-gray-700"
                  title={user.transportMode === 'driving' ? 'Car' : 'Bike'}
                >
                  <TransportIcon mode={user.transportMode} />
                  <span className="ml-1 capitalize">{user.transportMode}</span>
                </span>
                {editingUserId === user.id && (
                  <span className="text-xs text-blue-600 font-medium">Editing...</span>
                )}
              </div>
              <div className="text-sm text-gray-600 truncate">{user.address}</div>
              <div className="text-xs text-gray-500 mt-1">
                {user.maxMinutes} minute commute
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => onEditUser(user)}
                disabled={isLoading || editingUserId === user.id}
                className="text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed p-1"
                aria-label={`Edit ${user.name}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                </svg>
              </button>
              <button
                onClick={() => onRemoveUser(user.id)}
                disabled={isLoading}
                className="text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed p-1"
                aria-label={`Remove ${user.name}`}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="h-5 w-5"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path
                    fillRule="evenodd"
                    d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
