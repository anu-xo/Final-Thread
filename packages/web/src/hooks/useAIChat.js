import { useState, useCallback, useRef, useEffect } from 'react';
import { authFetch } from '../services/authFetch.js';

const STREAM_IDLE_TIMEOUT_MS = 30_000;

/**
 * Shared AI chat hook used by every chat surface (ChatPanel on /ai/chat,
 * AIChatInline on posts, and the standalone GlobalChatDrawer).
 *
 * `communityId` may be null — that's the standalone site-wide chat. The
 * current `conversationId` is threaded back on every message so the server
 * continues the same conversation (history is only useful if we keep it).
 */
export function useAIChat(communityId, communityName, isOnline = true, threadContext = null) {
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const [warning, setWarning] = useState(null);
  const [error, setError] = useState(null);
  const lastMessageRef = useRef(null);
  const abortRef = useRef(null);
  const idleTimerRef = useRef(null);
  const conversationIdRef = useRef(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      clearTimeout(idleTimerRef.current);
    };
  }, []);

  // New thread context (e.g. "Ask AI about this thread") starts a fresh chat
  useEffect(() => {
    abortRef.current?.abort();
    setMessages([]);
    setStreaming(false);
    setWarning(null);
    setError(null);
    conversationIdRef.current = null;
  }, [threadContext?.postId]);

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

  /** Start over: clear the current conversation and its server-side id. */
  const resetConversation = useCallback(() => {
    abortRef.current?.abort();
    clearTimeout(idleTimerRef.current);
    conversationIdRef.current = null;
    lastMessageRef.current = null;
    setMessages([]);
    setStreaming(false);
    setWarning(null);
    setError(null);
  }, []);

  /** Resume an existing conversation by loading its message history. */
  const resumeConversation = useCallback(async (conversationId) => {
    abortRef.current?.abort();
    clearTimeout(idleTimerRef.current);
    conversationIdRef.current = conversationId;
    lastMessageRef.current = null;
    setStreaming(false);
    setWarning(null);
    setError(null);

    try {
      const response = await authFetch(`/api/ai/conversations/${conversationId}/messages`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error(`Failed to load conversation: ${response.status}`);

      const { data } = await response.json();
      const loaded = (Array.isArray(data) ? data : []).map((m) => ({
        role: m.role,
        content: m.content,
        sources: m.sources || [],
      }));
      setMessages(loaded);
    } catch {
      // Non-fatal — fall back to a fresh chat rather than blocking the panel.
      conversationIdRef.current = null;
      setMessages([]);
    }
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
      const response = await authFetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: text,
          communityId,
          postId: threadContext?.postId,
          conversationId: conversationIdRef.current || undefined,
        }),
        signal: controller.signal,
      });

      if (!response.ok || !response.body) {
        let message = 'Connection lost — tap to retry';
        try {
          const body = await response.json();
          message = body?.error?.message || body?.error || message;
        } catch {
          /* keep default */
        }
        setError(message);
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

          if (data.data?.conversationId) {
            conversationIdRef.current = data.data.conversationId;
            setMessages(prev => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === 'assistant') {
                copy[copy.length - 1] = {
                  ...last,
                  sources: data.data.sources || [],
                  conversationId: data.data.conversationId,
                };
              }
              return copy;
            });
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
  }, [communityId, communityName, isOnline, threadContext, resetIdleTimer]);

  const retry = useCallback(() => {
    if (lastMessageRef.current) {
      setMessages(prev => prev[prev.length - 1]?.role === 'assistant' ? prev.slice(0, -1) : prev);
      sendMessage(lastMessageRef.current);
    }
  }, [sendMessage]);

  return {
    messages,
    streaming,
    warning,
    error,
    sendMessage,
    retry,
    resetConversation,
    resumeConversation,
  };
}
