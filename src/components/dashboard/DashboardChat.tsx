import { useState, useRef, useCallback, useEffect } from 'react';
import { Send, Sparkles, Bot, User, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

type Msg = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-ai`;

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        toast({ title: 'Copied' });
        setTimeout(() => setCopied(false), 2000);
      }}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
    >
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export function DashboardChat() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  useEffect(() => {
    if (!session?.access_token) return;
    (async () => {
      try {
        const res = await fetch(CHAT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
          body: JSON.stringify({ action: 'suggestions' }),
        });
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions?.slice(0, 3) || []);
        }
      } catch { /* silent */ } finally { setLoadingSuggestions(false); }
    })();
  }, [session?.access_token]);

  const sendMessage = async (text: string) => {
    if (!text.trim() || isLoading || !session?.access_token) return;
    const userMsg: Msg = { role: 'user', content: text.trim() };
    const allMessages = [...messages, userMsg];
    setMessages(allMessages);
    setInput('');
    setIsLoading(true);

    let assistantSoFar = '';
    const upsertAssistant = (chunk: string) => {
      assistantSoFar += chunk;
      setMessages(prev => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant') return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        return [...prev, { role: 'assistant', content: assistantSoFar }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ messages: allMessages }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: 'Request failed' }));
        toast({ title: 'Error', description: err.error, variant: 'destructive' });
        setIsLoading(false);
        return;
      }
      const reader = resp.body?.getReader();
      if (!reader) throw new Error('No stream');
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let nlIdx: number;
        while ((nlIdx = buffer.indexOf('\n')) !== -1) {
          let line = buffer.slice(0, nlIdx);
          buffer = buffer.slice(nlIdx + 1);
          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;
          const json = line.slice(6).trim();
          if (json === '[DONE]') break;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch { buffer = line + '\n' + buffer; break; }
        }
      }
      if (buffer.trim()) {
        for (let raw of buffer.split('\n')) {
          if (!raw || !raw.startsWith('data: ')) continue;
          const json = raw.slice(6).trim();
          if (json === '[DONE]') continue;
          try { const p = JSON.parse(json); const c = p.choices?.[0]?.delta?.content; if (c) upsertAssistant(c); } catch {}
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to get AI response', variant: 'destructive' });
    } finally { setIsLoading(false); }
  };

  return (
    <Card className="shadow-md border-0 flex flex-col h-full">
      <CardHeader className="pb-2 flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <CardTitle className="text-sm font-semibold">Ask AI</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col min-h-0 p-3 pt-0">
        <ScrollArea className="flex-1 pr-2">
          <div className="space-y-3 py-2">
            {messages.length === 0 && !isLoading && (
              <div className="text-center py-4">
                <p className="text-xs text-muted-foreground mb-3">Ask anything about your expenses</p>
                {loadingSuggestions ? (
                  <div className="space-y-1.5">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-7 w-full rounded-md" />)}
                  </div>
                ) : suggestions.length > 0 ? (
                  <div className="space-y-1.5">
                    {suggestions.map((s, i) => (
                      <button key={i} onClick={() => sendMessage(s)}
                        className="w-full text-left text-xs px-2.5 py-1.5 rounded-md border border-border bg-background hover:bg-accent transition-colors truncate">
                        {s}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`group flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <Bot className="h-3 w-3 text-primary" />
                  </div>
                )}
                <div className={`relative max-w-[85%] rounded-xl px-3 py-2 text-xs leading-relaxed ${
                  msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="ai-response">
                      <ReactMarkdown components={{
                        h1: ({ children }) => <h3 className="text-xs font-bold mt-2 mb-1 first:mt-0">{children}</h3>,
                        h2: ({ children }) => <h4 className="text-xs font-bold mt-2 mb-1 first:mt-0">{children}</h4>,
                        h3: ({ children }) => <h5 className="text-xs font-semibold mt-2 mb-1 first:mt-0">{children}</h5>,
                        p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="mb-1.5 last:mb-0 space-y-0.5 pl-3">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-1.5 last:mb-0 space-y-0.5 pl-3 list-decimal">{children}</ol>,
                        li: ({ children }) => <li className="relative pl-1.5 before:content-['•'] before:absolute before:-left-0 before:text-muted-foreground list-none">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        table: ({ children }) => <div className="my-1 overflow-x-auto rounded border border-border"><table className="w-full text-xs">{children}</table></div>,
                        thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
                        th: ({ children }) => <th className="px-2 py-1 text-left font-semibold border-b border-border">{children}</th>,
                        td: ({ children }) => <td className="px-2 py-1 border-b border-border">{children}</td>,
                        code: ({ children, className }) => {
                          const isBlock = className?.includes('language-');
                          return isBlock ? <pre className="my-1 rounded bg-background p-2 overflow-x-auto border border-border text-[10px]"><code>{children}</code></pre>
                            : <code className="rounded bg-background px-1 py-0.5 text-[10px] font-mono border border-border">{children}</code>;
                        },
                      }}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : <p className="whitespace-pre-wrap">{msg.content}</p>}
                  <div className="absolute -bottom-0.5 right-0.5 translate-y-full"><CopyBtn text={msg.content} /></div>
                </div>
                {msg.role === 'user' && (
                  <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                    <User className="h-3 w-3 text-secondary-foreground" />
                  </div>
                )}
              </div>
            ))}

            {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
              <div className="flex gap-2">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Bot className="h-3 w-3 text-primary" />
                </div>
                <div className="bg-muted rounded-xl px-3 py-2">
                  <div className="flex gap-1">
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        <div className="mt-2 flex gap-1.5 flex-shrink-0">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
            placeholder="Ask about expenses..."
            className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            disabled={isLoading}
          />
          <Button size="icon" className="h-8 w-8 rounded-lg shrink-0" onClick={() => sendMessage(input)} disabled={!input.trim() || isLoading}>
            <Send className="h-3 w-3" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
