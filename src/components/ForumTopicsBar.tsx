import React, { useRef } from 'react';
import { Layers, MessageSquare, Pin, Lock, RefreshCw, Hash } from 'lucide-react';
import { ForumTopicItem } from '../types';

interface ForumTopicsBarProps {
  topics: ForumTopicItem[];
  activeTopicId?: number;
  onSelectTopic: (topicId?: number) => void;
  isLoading?: boolean;
  onRefreshTopics?: () => void;
}

export const ForumTopicsBar: React.FC<ForumTopicsBarProps> = ({
  topics,
  activeTopicId,
  onSelectTopic,
  isLoading = false,
  onRefreshTopics,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (scrollContainerRef.current && e.deltaY !== 0) {
      scrollContainerRef.current.scrollLeft += e.deltaY;
    }
  };

  // Convert Telegram iconColor int to hex if available
  const formatIconColor = (colorNum?: number): string | undefined => {
    if (!colorNum) return undefined;
    return `#${colorNum.toString(16).padStart(6, '0')}`;
  };

  return (
    <div className="w-full bg-white/90 dark:bg-teleforge-surface/90 backdrop-blur-md border-b border-gray-200/80 dark:border-gray-800/80 px-3 py-2 flex items-center gap-2 z-10 select-none shadow-2xs">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400 pl-1 shrink-0">
        <Layers size={15} className="text-teleforge-primary" />
        <span className="hidden sm:inline">Topics:</span>
      </div>

      {/* Horizontally scrollable topics pill list */}
      <div
        ref={scrollContainerRef}
        onWheel={handleWheel}
        className="flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar scroll-smooth py-0.5"
      >
        {/* All Topics Pill */}
        <button
          type="button"
          onClick={() => onSelectTopic(undefined)}
          className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
            activeTopicId === undefined || activeTopicId === null
              ? 'bg-teleforge-primary text-white shadow-xs scale-102'
              : 'bg-gray-100 dark:bg-gray-800/90 text-gray-700 dark:text-gray-300 hover:bg-gray-200/80 dark:hover:bg-gray-750'
          }`}
        >
          <MessageSquare size={13} />
          <span>All Topics</span>
        </button>

        {/* Individual Topic Pills */}
        {topics.map((t) => {
          const isActive = activeTopicId === t.id;
          const colorHex = formatIconColor(t.iconColor);

          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelectTopic(t.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium shrink-0 transition-all flex items-center gap-1.5 cursor-pointer ${
                isActive
                  ? 'bg-teleforge-primary text-white shadow-xs scale-102'
                  : 'bg-gray-100 dark:bg-gray-800/90 text-gray-700 dark:text-gray-300 hover:bg-gray-200/80 dark:hover:bg-gray-750'
              }`}
            >
              {colorHex ? (
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ backgroundColor: colorHex }}
                />
              ) : (
                <Hash size={13} className={isActive ? 'text-white' : 'text-gray-400'} />
              )}

              <span className="truncate max-w-[140px]">{t.title}</span>

              {t.pinned && (
                <Pin size={11} className={isActive ? 'text-white/80' : 'text-gray-400'} />
              )}
              {t.closed && (
                <Lock size={11} className={isActive ? 'text-white/80' : 'text-gray-400'} />
              )}

              {typeof t.unreadCount === 'number' && t.unreadCount > 0 && (
                <span
                  className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full min-w-[16px] text-center ${
                    isActive
                      ? 'bg-white text-teleforge-primary'
                      : 'bg-teleforge-primary text-white'
                  }`}
                >
                  {t.unreadCount > 99 ? '99+' : t.unreadCount}
                </span>
              )}
            </button>
          );
        })}

        {topics.length === 0 && !isLoading && (
          <div className="text-xs text-gray-400 dark:text-gray-500 italic px-2">
            No topics found
          </div>
        )}
      </div>

      {/* Refresh Topics button */}
      {onRefreshTopics && (
        <button
          type="button"
          onClick={onRefreshTopics}
          disabled={isLoading}
          title="Refresh topics"
          className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors shrink-0"
        >
          <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
        </button>
      )}
    </div>
  );
};
