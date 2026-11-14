import { useEffect, useRef, useState } from 'react';
import { ArrowUp } from 'lucide-react';
import { useAskAi, type AskMessage } from '@/hooks/useAskAi';
import Markdown from '@/components/next/Markdown';

/** The messages of an Ask AI conversation: the person's on the right, the answers as text. */
export function Conversation({ messages, busy }: { messages: AskMessage[]; busy: boolean }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (messages.length) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [messages, busy]);
  return (
    <div className="space-y-4" aria-live="polite">
      {messages.map((m, i) => (
        m.role === 'user'
          ? <p key={i} className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-surface-3 px-3.5 py-2 text-[15px] text-fg">{m.content}</p>
          : <Markdown key={i}>{m.content}</Markdown>
      ))}
      {busy && messages[messages.length - 1]?.role === 'user' && <p className="ez-num text-[12.5px] text-faint">Reading your bills</p>}
      <div ref={endRef} />
    </div>
  );
}

/** The question box: a pill input and a round send button. */
export function AskBox({ onSend, busy, placeholder, autoFocus = false }: { onSend: (text: string) => void; busy: boolean; placeholder: string; autoFocus?: boolean }) {
  const [input, setInput] = useState('');
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (input.trim() && !busy) { onSend(input); setInput(''); } }} className="flex items-center gap-2">
      <input value={input} onChange={(e) => setInput(e.target.value)} placeholder={placeholder} aria-label={placeholder} autoFocus={autoFocus}
        className="h-12 min-w-0 flex-1 rounded-full border border-line-soft bg-surface-2 px-5 text-[15.5px] text-fg outline-none placeholder:text-faint focus:border-brand" />
      <button type="submit" disabled={busy || !input.trim()} aria-label="Send"
        className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-brand text-on-brand hover:bg-brand-hover disabled:opacity-40">
        <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
      </button>
    </form>
  );
}

export function StarterQuestions({ questions, onPick }: { questions: string[]; onPick: (q: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {questions.map((q) => (
        <button key={q} type="button" onClick={() => onPick(q)}
          className="rounded-full border border-line-soft px-3.5 py-2 text-left text-[13.5px] text-dim hover:border-line hover:text-fg">{q}</button>
      ))}
    </div>
  );
}

/**
 * Ask AI, already briefed on this month's leaks. The numbers it is given come
 * from the leak engine, so it explains figures rather than inventing them.
 */
export default function LeakAdvisor({ context, suggestions }: { context: string; suggestions: string[] }) {
  const { messages, busy, send } = useAskAi(context);
  return (
    <div className="ez-card p-4">
      {messages.length === 0
        ? <StarterQuestions questions={suggestions} onPick={send} />
        : <div className="max-h-[420px] overflow-y-auto pr-1"><Conversation messages={messages} busy={busy} /></div>}
      <div className="mt-4"><AskBox onSend={send} busy={busy} placeholder="Ask about this month" /></div>
    </div>
  );
}
