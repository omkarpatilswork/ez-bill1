import SEO from '@/components/SEO';
import { AskBox, Conversation, StarterQuestions } from '@/components/next/LeakAdvisor';
import { useAskAi } from '@/hooks/useAskAi';

const STARTERS = [
  'What did I spend the most on this month?',
  'Which shops do I pay most often?',
  'How does this month compare with last month?',
  'Where could I cut back without noticing?',
  'How much went on food delivery in the last 30 days?',
  'Which bills this month were unusually large?',
];

/** Ask AI: questions about your own bills, answered from the bills themselves. */
export default function AskAi() {
  const { messages, busy, send, reset } = useAskAi();
  const started = messages.length > 0;

  return (
    <>
      <SEO title="Ask AI" description="Ask about your own spending. Answers come from your bills." path="/ask-ai" />
      <div className="flex min-h-[calc(100dvh-230px)] max-w-[760px] flex-col lg:min-h-[calc(100dvh-190px)]">
        <header className="flex flex-wrap items-end justify-between gap-4 pt-6 lg:pt-9">
          <div>
            <h1 className="ez-display text-[38px] text-fg lg:text-[54px]">Ask AI</h1>
            {!started && <p className="mt-2 text-[15px] text-dim">Ask about your own spending. Answers come from your last 200 bills, and nothing else.</p>}
          </div>
          {started && <button type="button" className="ez-btn ez-btn--ghost ez-btn--sm mb-1 lg:mb-2.5" onClick={reset}>New question</button>}
        </header>

        <div className="mt-7 flex-1">
          {started ? <Conversation messages={messages} busy={busy} /> : (
            <>
              <p className="ez-label !text-dim">Try one</p>
              <div className="mt-3"><StarterQuestions questions={STARTERS} onPick={send} /></div>
            </>
          )}
        </div>

        <div className="sticky bottom-[92px] mt-6 bg-surface pb-2 pt-3 lg:bottom-0 lg:pb-6">
          <AskBox onSend={send} busy={busy} placeholder="Ask about your bills" />
          <p className="mt-2 text-center text-[12px] text-faint">AI can misread a question. Check a figure against the bill before you act on it.</p>
        </div>
      </div>
    </>
  );
}
