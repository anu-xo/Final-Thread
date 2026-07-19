import { useState, useCallback, useRef, useEffect } from 'react';

const STREAM_IDLE_TIMEOUT_MS = 30_000;

export function useAIChat(communityId, communityName, isOnline = true) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [warning, setWarning] = useState(null);
  const [error, setError] = useState(null);
  const lastMessageRef = useRef(null);
  const abortRef = useRef(null);
  const idleTimerRef = useRef(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearTimeout(idleTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isOnline && streaming) {
      abortRef.current?.abort();
      setError('You went offline — message could not be delivered');
      setStreaming(false);
    }
  }, [isOnline, streaming]);

  const resetIdleTimer = useCallback((signal) => {
    clearTimeout(idleTimerRef.current);
    idleTimerRef.current = setTimeout(() => {
      signal.abort();
    }, STREAM_IDLE_TIMEOUT_MS);
  }, []);

  const sendMessage = useCallback(async (text) => {
    lastMessageRef.current = text;
    setError(null);
    setWarning(null);
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;
    resetIdleTimer(controller.signal);

    let assistantText = '';

    try {
      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message: text, communityId }),
        signal: controller.signal,
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

        resetIdleTimer(controller.signal);

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop();

        for (const line of events) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'token') {
            assistantText += data.text;
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
            setWarning(data.message);
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
      if (err.name === 'AbortError') {
        if (!isOnline) {
          setError('You went offline — message could not be delivered');
        } else {
          setError('Response timed out — tap to retry');
        }
      } else {
        setError('Connection lost — tap to retry');
      }
    } finally {
      clearTimeout(idleTimerRef.current);
      abortRef.current = null;
      setStreaming(false);
    }
  }, [communityId, communityName, isOnline, resetIdleTimer]);

  const retry = useCallback(() => {
    if (lastMessageRef.current) {
      setMessages(prev => prev[prev.length - 1]?.role === 'assistant' ? prev.slice(0, -1) : prev);
      sendMessage(lastMessageRef.current);
    }
  }, [sendMessage]);

  return { messages, streaming, warning, error, sendMessage, retry };
}
