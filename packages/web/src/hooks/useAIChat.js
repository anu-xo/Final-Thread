// web/src/hooks/useAIChat.js
import { useState, useCallback, useRef } from 'react';

export function useAIChat(communityId, communityName) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [warning, setWarning] = useState(null);
  const [error, setError] = useState(null);
  const lastMessageRef = useRef(null); // so retry can resend the same text

  const sendMessage = useCallback(async (text) => {
    lastMessageRef.current = text;
    setError(null);
    setWarning(null);
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setStreaming(true);

    let assistantText = '';

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // add Authorization header here if your Axios instance normally injects it —
          // fetch doesn't share Axios interceptors, so the token has to be added manually
        },
        credentials: 'include',
        body: JSON.stringify({ message: text, communityId }),
      });

      if (!response.ok || !response.body) {
        setError('Connection lost — tap to retry');
        setStreaming(false);
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop(); // incomplete trailing event, kept for next read

        for (const line of events) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'token') {
            assistantText += data.text; // matches your backend's { type: 'token', text: chunk }
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

          if (data.type === 'warning') {
            setWarning(data.message); // small inline banner, doesn't stop the stream
          }

          if (data.type === 'error') {
            setError(data.message);
          }

          if (data.type === 'done') {
            setStreaming(false);
            if (window.electronAPI) {
              window.electronAPI.notifyAIResponse(communityName);
            }
          }
        }
      }
    } catch (err) {
      // network-level failure mid-stream — same bucket as the old eventSource.onerror
      setError('Connection lost — tap to retry');
    } finally {
      setStreaming(false);
    }
  }, [communityId, communityName]);

  const retry = useCallback(() => {
    if (lastMessageRef.current) {
      // remove the failed assistant placeholder before resending, if one was added
      setMessages(prev => prev[prev.length - 1]?.role === 'assistant' ? prev.slice(0, -1) : prev);
      sendMessage(lastMessageRef.current);
    }
  }, [sendMessage]);

  return { messages, streaming, warning, error, sendMessage, retry };
}