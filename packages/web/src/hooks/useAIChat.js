// web/src/hooks/useAIChat.js
import { useState, useCallback } from 'react';

export function useAIChat(communityId, communityName) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);

  const sendMessage = useCallback((text) => {
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setStreaming(true);

    const eventSource = new EventSource(
      `/api/ai/chat?message=${encodeURIComponent(text)}&communityId=${communityId}`,
      { withCredentials: true }
    );
    // Note: for POST-based SSE, use fetch + ReadableStream instead of EventSource
    // (EventSource only supports GET) — swap to fetch-based streaming reader.

    let assistantText = '';
    eventSource.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === 'token') {
        assistantText += data.token;
        setMessages(prev => {
          const copy = [...prev];
          if (copy[copy.length - 1]?.role === 'assistant') {
            copy[copy.length - 1].content = assistantText;
          } else {
            copy.push({ role: 'assistant', content: assistantText });
          }
          return copy;
        });
      }
      
      if (data.type === 'done' || data.type === 'error') {
        setStreaming(false);
        eventSource.close();

        // Trigger Electron notification if running in the desktop environment
        if (data.type === 'done' && window.electronAPI) {
          window.electronAPI.notifyAIResponse(communityName);
        }
      }
    };
  }, [communityId, communityName]);

  return { messages, streaming, sendMessage };
}