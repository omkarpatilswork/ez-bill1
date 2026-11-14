import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { ArrowUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface Message { role: 'user' | 'assistant'; content: string }

/**
 * Ask AI, already briefed on this month's leaks. The numbers it is given come
 * from the leak engine, so it explains figures rather than inventing them.
 * Streams the reply from the ask-ai function.
 */
export default function LeakAdvisor({ context, suggestions }: { context: string; suggestions: string[] }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messages.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, busy]);

  const send = async (override?: string) => {
    const text = (override ?? input).trim();
    if (!text || busy) return;
    const history: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(history);
    setInput('');
    setBusy(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ messages: context ? [{ role: 'system', content: context }, ...history] : history }),
      });
      if (!res.ok || !res.body) throw new Error('failed');
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '', reply = '';
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
    } catch {
      setMessages([...history, { role: 'assistant', content: 'Ask AI did not answer. Try again in a moment.' }]);
    }
    setBusy(false);
  };

  return (
    <div className="ez-card p-4">
      {messages.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((q) => (
            <button key={q} type="button" onClick={() => send(q)}
              className="rounded-full border border-line-soft px-3.5 py-2 text-left text-[13.5px] text-dim hover:border-line hover:text-fg">{q}</button>
          ))}
        </div>
      ) : (
        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1" aria-live="polite">
          {messages.map((m, i) => (
            m.role === 'user' ? (
              <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-surface-3 px-3.5 py-2 text-[14.5px] text-fg">{m.content}</p>
            ) : (
              <div key={i} className="prose prose-sm max-w-none text-[14.5px] leading-relaxed text-fg prose-headings:text-fg prose-strong:text-fg prose-th:text-dim prose-td:text-fg prose-a:text-brand-text">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
              </div>
            )
          ))}
          {busy && messages[messages.length - 1]?.role === 'user' && <p className="ez-num text-[12.5px] text-faint">Reading your bills</p>}
          <div ref={endRef} />
        </div>
      )}
      <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mt-4 flex items-center gap-2">
        <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this month" aria-label="Ask AI about this month"
          className="h-11 min-w-0 flex-1 rounded-full border border-line-soft bg-surface px-4 text-[15px] text-fg outline-none placeholder:text-faint focus:border-brand" />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-on-brand hover:bg-brand-hover disabled:opacity-40">
          <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
        </button>
      </form>
    </div>
  );
}
