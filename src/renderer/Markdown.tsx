import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/** No raw HTML, remote images, executable links or embedded browser content. */
export function Markdown({ children }: { children: string }) {
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
    img: ({ alt }) => <span className="muted">[图片未加载：{alt || '外部图片'}]</span>,
    a: ({ href, children }) => <span title={href}>{children}<span className="muted">（{href?.startsWith('https://') ? href : '链接未开放'}）</span></span>
  }}>{children}</ReactMarkdown></div>;
}
