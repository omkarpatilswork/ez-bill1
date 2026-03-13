import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, Sparkles, Bot, User, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';

type Msg = { role: 'user' | 'assistant'; content: string };

const CHAT_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-ai`;

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: 'Copied to clipboard' });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
      title="Copy message"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function AskAI() {
  const { session } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: 'suggestions' }),
        });
        if (res.ok) {
          const data = await res.json();
          setSuggestions(data.suggestions || []);
        }
      } catch {
        // Silently fail
      } finally {
        setLoadingSuggestions(false);
      }
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
        if (last?.role === 'assistant') {
          return prev.map((m, i) => i === prev.length - 1 ? { ...m, content: assistantSoFar } : m);
        }
        return [...prev, { role: 'assistant', content: assistantSoFar }];
      });
    };

    try {
      const resp = await fetch(CHAT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
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
          } catch {
            buffer = line + '\n' + buffer;
            break;
          }
        }
      }
      if (buffer.trim()) {
        for (let raw of buffer.split('\n')) {
          if (!raw || !raw.startsWith('data: ')) continue;
          const json = raw.slice(6).trim();
          if (json === '[DONE]') continue;
          try {
            const parsed = JSON.parse(json);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) upsertAssistant(content);
          } catch { /* ignore */ }
        }
      }
    } catch (e) {
      console.error(e);
      toast({ title: 'Error', description: 'Failed to get AI response', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-theme(spacing.12)-theme(spacing.6)*2)] sm:h-[calc(100vh-theme(spacing.14)-theme(spacing.6)*2)]">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-foreground">Ask AI</h1>
        <p className="text-sm text-muted-foreground">Ask anything about your expenses</p>
      </div>

      <ScrollArea className="flex-1 rounded-lg border bg-card px-4">
        <div className="py-4 space-y-4">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Sparkles className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-lg font-semibold text-foreground mb-1">Expense AI Assistant</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-sm">
                I have access to all your expense data. Ask me anything about spending, categories, trends, or specific transactions.
              </p>
              {loadingSuggestions ? (
                <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                  {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="h-9 w-40 rounded-full" />
                  ))}
                </div>
              ) : suggestions.length > 0 ? (
                <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                  {suggestions.map((s, i) => (
                    <Button key={i} variant="outline" size="sm" className="rounded-full" onClick={() => sendMessage(s)}>
                      {s}
                    </Button>
                  ))}
                </div>
              ) : null}
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`group flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={`relative max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-foreground'
              }`}>
                {msg.role === 'assistant' ? (
                  <div className="ai-response">
                    <ReactMarkdown
                      components={{
                        h1: ({ children }) => <h3 className="text-base font-bold text-foreground mt-4 mb-2 first:mt-0">{children}</h3>,
                        h2: ({ children }) => <h4 className="text-sm font-bold text-foreground mt-3 mb-1.5 first:mt-0">{children}</h4>,
                        h3: ({ children }) => <h5 className="text-sm font-semibold text-foreground mt-3 mb-1 first:mt-0">{children}</h5>,
                        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="mb-2 last:mb-0 space-y-1 pl-4">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-2 last:mb-0 space-y-1 pl-4 list-decimal">{children}</ol>,
                        li: ({ children }) => <li className="relative pl-2 before:content-['•'] before:absolute before:-left-0 before:text-muted-foreground list-none">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        em: ({ children }) => <em className="italic text-muted-foreground">{children}</em>,
                        table: ({ children }) => (
                          <div className="my-2 overflow-x-auto rounded-lg border border-border">
                            <table className="w-full text-sm">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
                        th: ({ children }) => <th className="px-3 py-2 text-left font-semibold text-foreground border-b border-border">{children}</th>,
                        td: ({ children }) => <td className="px-3 py-2 border-b border-border last:border-b-0">{children}</td>,
                        tr: ({ children }) => <tr className="hover:bg-muted/30 transition-colors">{children}</tr>,
                        code: ({ children, className }) => {
                          const isBlock = className?.includes('language-');
                          return isBlock ? (
                            <pre className="my-2 rounded-lg bg-background p-3 overflow-x-auto border border-border">
                              <code className="text-xs">{children}</code>
                            </pre>
                          ) : (
                            <code className="rounded bg-background px-1.5 py-0.5 text-xs font-mono border border-border">{children}</code>
                          );
                        },
                        hr: () => <hr className="my-3 border-border" />,
                        blockquote: ({ children }) => (
                          <blockquote className="my-2 border-l-2 border-primary/40 pl-3 italic text-muted-foreground">{children}</blockquote>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                )}
                {/* Copy button */}
                <div className="absolute -bottom-1 right-1 translate-y-full">
                  <CopyButton text={msg.content} />
                </div>
              </div>
              {msg.role === 'user' && (
                <div className="h-8 w-8 rounded-full bg-secondary flex items-center justify-center shrink-0 mt-0.5">
                  <User className="h-4 w-4 text-secondary-foreground" />
                </div>
              )}
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl px-4 py-3">
                <div className="flex gap-1">
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:0ms]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/40 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      <div className="mt-3 flex gap-2">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your expenses..."
          rows={1}
          className="flex-1 resize-none rounded-xl border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          disabled={isLoading}
        />
        <Button
          size="icon"
          className="h-[46px] w-[46px] rounded-xl shrink-0"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isLoading}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
