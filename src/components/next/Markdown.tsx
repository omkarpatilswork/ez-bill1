import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** An AI answer, set in the app's own type: tables, lists and bold, nothing louder. */
export default function Markdown({ children }: { children: string }) {
  return (
    <div className="prose prose-sm max-w-none text-[15px] leading-relaxed text-fg prose-headings:font-semibold prose-headings:text-fg prose-strong:text-fg prose-th:text-dim prose-td:text-fg prose-a:text-brand-text prose-li:marker:text-faint prose-hr:border-line-soft">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
}
