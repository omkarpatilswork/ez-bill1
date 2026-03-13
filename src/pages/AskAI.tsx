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
    <div className="flex flex-col h-[calc(100vh-theme(spacing.12)-theme(spacing.6)*2)] sm:h-[calc(100vh-theme(spacing.14)-theme(spacing.6)*2)] max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Ask AI</h1>
          <p className="text-sm text-muted-foreground">Your intelligent expense assistant</p>
        </div>
      </div>

      {/* Chat area */}
      <ScrollArea className="flex-1 rounded-xl border border-border/60 bg-card shadow-sm px-5">
        <div className="py-5 space-y-5">
          {messages.length === 0 && !isLoading && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-5 shadow-sm">
                <Bot className="h-10 w-10 text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground mb-2">How can I help you?</h2>
              <p className="text-sm text-muted-foreground mb-8 max-w-md leading-relaxed">
                I have access to all your expense data. Ask me about spending patterns, category breakdowns, approval statuses, or specific transactions.
              </p>
              {loadingSuggestions ? (
                <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
                  {[1, 2, 3, 4].map(i => (
                    <Skeleton key={i} className="h-12 rounded-xl" />
                  ))}
                </div>
              ) : suggestions.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
                  {suggestions.map((s, i) => (
                    <Button
                      key={i}
                      variant="outline"
                      className="h-auto py-3 px-4 rounded-xl text-left text-sm font-normal whitespace-normal border-border/60 hover:bg-accent hover:border-primary/30 transition-all"
                      onClick={() => sendMessage(s)}
                    >
                      <Sparkles className="h-3.5 w-3.5 mr-2 shrink-0 text-primary/60" />
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
                <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-1">
                  <Bot className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className={`relative max-w-[75%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                msg.role === 'user'
                  ? 'bg-primary text-primary-foreground rounded-br-md'
                  : 'bg-muted/60 text-foreground border border-border/40 rounded-bl-md'
              }`}>
                {msg.role === 'assistant' ? (
                  <div className="ai-response leading-relaxed">
                    <ReactMarkdown
                      components={{
                        h1: ({ children }) => <h3 className="text-base font-bold text-foreground mt-4 mb-2 first:mt-0">{children}</h3>,
                        h2: ({ children }) => <h4 className="text-sm font-bold text-foreground mt-3 mb-1.5 first:mt-0">{children}</h4>,
                        h3: ({ children }) => <h5 className="text-sm font-semibold text-foreground mt-3 mb-1 first:mt-0">{children}</h5>,
                        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
                        ul: ({ children }) => <ul className="mb-2 last:mb-0 space-y-1.5 pl-4">{children}</ul>,
                        ol: ({ children }) => <ol className="mb-2 last:mb-0 space-y-1.5 pl-4 list-decimal">{children}</ol>,
                        li: ({ children }) => <li className="relative pl-2 before:content-['•'] before:absolute before:-left-0 before:text-primary/50 before:font-bold list-none">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
                        em: ({ children }) => <em className="italic text-muted-foreground">{children}</em>,
                        table: ({ children }) => (
                          <div className="my-3 overflow-x-auto rounded-lg border border-border shadow-sm">
                            <table className="w-full text-sm">{children}</table>
                          </div>
                        ),
                        thead: ({ children }) => <thead className="bg-muted/70">{children}</thead>,
                        th: ({ children }) => <th className="px-3 py-2.5 text-left font-semibold text-foreground border-b border-border">{children}</th>,
                        td: ({ children }) => <td className="px-3 py-2.5 border-b border-border/50">{children}</td>,
                        tr: ({ children }) => <tr className="hover:bg-muted/30 transition-colors">{children}</tr>,
                        code: ({ children, className }) => {
                          const isBlock = className?.includes('language-');
                          return isBlock ? (
                            <pre className="my-2 rounded-lg bg-background p-3 overflow-x-auto border border-border">
                              <code className="text-xs">{children}</code>
                            </pre>
                          ) : (
                            <code className="rounded-md bg-background px-1.5 py-0.5 text-xs font-mono border border-border">{children}</code>
                          );
                        },
                        hr: () => <hr className="my-3 border-border" />,
                        blockquote: ({ children }) => (
                          <blockquote className="my-2 border-l-3 border-primary/40 pl-3 italic text-muted-foreground">{children}</blockquote>
                        ),
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                )}
                <div className="absolute -bottom-1 right-1 translate-y-full">
                  <CopyButton text={msg.content} />
                </div>
              </div>
              {msg.role === 'user' && (
                <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shrink-0 mt-1">
                  <User className="h-4 w-4 text-primary-foreground" />
                </div>
              )}
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex gap-3">
              <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted/60 border border-border/40 rounded-2xl rounded-bl-md px-4 py-3">
                <div className="flex gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:0ms]" />
                  <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:150ms]" />
                  <span className="h-2 w-2 rounded-full bg-primary/40 animate-bounce [animation-delay:300ms]" />
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Input area */}
      <div className="mt-4 flex gap-2 items-end">
        <textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about your expenses..."
          rows={1}
          className="flex-1 resize-none rounded-xl border border-border/60 bg-card shadow-sm px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring transition-shadow"
          disabled={isLoading}
        />
        <Button
          size="icon"
          className="h-[46px] w-[46px] rounded-xl shrink-0 shadow-sm"
          onClick={() => sendMessage(input)}
          disabled={!input.trim() || isLoading}
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
