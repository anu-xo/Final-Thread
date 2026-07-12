// components/AIChat/AIMessage.jsx
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api'; // Adjust based on your actual API utility path

// 1. Hook to load previous conversation on chat panel open
// (Exported so your main Chat Window/Panel can import and use it)
export function useConversationHistory(conversationId) {
  return useQuery({
    queryKey: ['ai-conversation', conversationId],
    queryFn: () => api.get(`/ai/conversations/${conversationId}/messages`).then((r) => r.data.data),
    enabled: !!conversationId,
  });
}

// 2. The sub-component for handling user thumbs up/down feedback
export function FeedbackButtons({ messageId, initialRating }) {
  const [rating, setRating] = useState(initialRating);
  
  const mutation = useMutation({
    mutationFn: (value) => api.post(`/ai/messages/${messageId}/feedback`, { rating: value }),
    onMutate: (value) => setRating(value),
    onError: () => setRating(initialRating), // Simple fallback rollback if API errors out
  });

  return (
    <div className="flex gap-2 mt-2">
      <button
        aria-label="Good response"
        className={rating === 1 ? 'text-green-600' : 'text-gray-400 transition-colors'}
        onClick={() => mutation.mutate(1)}
      >
        👍
      </button>
      <button
        aria-label="Poor response"
        className={rating === -1 ? 'text-red-600' : 'text-gray-400 transition-colors'}
        onClick={() => mutation.mutate(-1)}
      >
        👎
      </button>
    </div>
  );
}

// 3. Your main message layout component (Consolidated)
export default function AIMessage({ message }) {
  const navigate = useNavigate();
  const isAssistant = message.role === 'assistant';

  return (
    <div className={`message-bubble ${message.role}`}>
      {isAssistant && <div className="ai-message__avatar font-bold text-sm mb-1">AI</div>}
      
      <div className="ai-message__content">
        <p className="whitespace-pre-wrap">{message.content}</p>

        {/* Render Source Links if available */}
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

        {/* Conditionally render feedback buttons only on assistant responses */}
        {isAssistant && (
          <FeedbackButtons 
            messageId={message._id} 
            initialRating={message.rating} 
          />
        )}
      </div>
    </div>
  );
}