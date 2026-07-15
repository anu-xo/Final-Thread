// components/AIMessage.jsx  (confirm real path first)
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api'; // <- adjust once you confirm the real path

export function useConversationHistory(conversationId) {
  return useQuery({
    queryKey: ['ai-conversation', conversationId],
    queryFn: () => api.get(`/ai/conversations/${conversationId}/messages`).then((r) => r.data.data),
    enabled: !!conversationId,
  });
}

export function FeedbackButtons({ messageId, initialRating }) {
  // ...unchanged, exactly as you have it...
}

// Added `isStreaming` — true only for the in-progress assistant message
export default function AIMessage({ message, isStreaming = false }) {
  const navigate = useNavigate();
  const isAssistant = message.role === 'assistant';

  return (
    <div className={`message-bubble ${message.role}`}>
      {isAssistant && <div className="ai-message__avatar font-bold text-sm mb-1">AI</div>}

      <div className="ai-message__content">
        <p className="whitespace-pre-wrap">
          {message.content}
          {isAssistant && isStreaming && <span className="animate-pulse ml-0.5">▍</span>}
        </p>

        {isAssistant && message.sources?.length > 0 && (
          <div className="ai-message__sources mt-3 pt-2 border-t border-gray-200">
            <span className="text-xs text-gray-500 block mb-1">Based on:</span>
            <ul className="flex flex-col gap-1">
              {message.sources.map((s) => (
                <li key={s.postId}>
                  <button
                    className="text-xs text-blue-600 hover:underline text-left"
                    onClick={() => navigate(`/post/${s.postId}`)}
                  >
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Don't show feedback buttons while still streaming — nothing to rate yet */}
        {isAssistant && !isStreaming && (
          <FeedbackButtons messageId={message._id} initialRating={message.rating} />
        )}
      </div>
    </div>
  );
}