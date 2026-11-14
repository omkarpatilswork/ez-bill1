import { useCallback, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AskMessage { role: 'user' | 'assistant'; content: string }

/**
 * A conversation with Ask AI. The ask-ai function reads the person's recent
 * bills itself and streams its answer; `context` adds figures the screen has
 * already worked out (the month's leaks, say) so the answer explains them
 * rather than recomputing them.
 */
export function useAskAi(context = '') {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const stop = useRef<AbortController | null>(null);

  const send = useCallback(async (text: string) => {
    const question = text.trim();
    if (!question || busy) return;
    const history: AskMessage[] = [...messages, { role: 'user', content: question }];
    setMessages(history);
    setBusy(true);
    stop.current = new AbortController();
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-ai`, {
        method: 'POST',
        signal: stop.current.signal,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ messages: context ? [{ role: 'system', content: context }, ...history] : history }),
      });
      if (!res.ok || !res.body) throw new Error('failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let reply = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let at: number;
        while ((at = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, at).replace(/\r$/, '');
          buffer = buffer.slice(at + 1);
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') break;
          try {
            const delta = JSON.parse(json).choices?.[0]?.delta?.content;
            if (delta) { reply += delta; setMessages([...history, { role: 'assistant', content: reply }]); }
          } catch { /* a partial line: the rest arrives in the next chunk */ }
        }
      }
      if (!reply) throw new Error('empty');
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setMessages([...history, { role: 'assistant', content: 'Ask AI did not answer. Try again in a moment.' }]);
    }
    setBusy(false);
  }, [messages, busy, context]);

  const reset = useCallback(() => { stop.current?.abort(); setMessages([]); setBusy(false); }, []);

  return { messages, busy, send, reset };
}
