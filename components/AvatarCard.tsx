
import React from 'react';
import { Avatar } from '../types';

interface AvatarCardProps {
  avatar: Avatar;
  isSelected: boolean;
  onSelect: (avatar: Avatar) => void;
}

export const AvatarCard: React.FC<AvatarCardProps> = ({ avatar, isSelected, onSelect }) => {
  return (
    <div 
      onClick={() => onSelect(avatar)}
      className={`relative cursor-pointer transition-all duration-300 transform rounded-2xl p-4 overflow-hidden border-2 h-full flex flex-col items-center text-center
        ${isSelected 
          ? 'border-blue-500 bg-blue-900/30 scale-105 shadow-xl ring-4 ring-blue-500/20' 
          : 'border-slate-700 bg-slate-800/50 hover:bg-slate-700/50 hover:scale-102'
        }`}
    >
      <div className="w-24 h-24 mb-4 rounded-full overflow-hidden border-2 border-slate-600">
        <img src={avatar.image} alt={avatar.name} className="w-full h-full object-cover" />
      </div>
      <h3 className="text-xl font-bold text-white mb-1">{avatar.name}</h3>
      <p className="text-blue-400 text-sm font-medium mb-3">{avatar.role}</p>
      <p className="text-slate-400 text-xs leading-relaxed">{avatar.description}</p>
      
      {isSelected && (
        <div className="absolute top-3 right-3 bg-blue-500 rounded-full p-1">
          <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </div>
  );
};
