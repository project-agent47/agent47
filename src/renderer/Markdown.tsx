import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { EvidenceView } from '../shared/contracts';

/** No raw HTML, remote images, executable links or embedded browser content. */
export function Markdown({ children, sources = [], openSource }: { children: string; sources?: EvidenceView[]; openSource?: (id: string) => void }) {
  return <div className="markdown"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml urlTransform={value => /^agent47-source:s[a-f0-9]{16}$/.test(value) ? value : defaultUrlTransform(value)} components={{
    img: ({ alt }) => <span className="muted">[图片未加载：{alt || '外部图片'}]</span>,
    a: ({ href, children }) => {
      if (href?.startsWith('agent47-source:')) {
        const source = sources.find(s => s.uri === href);
        return source && openSource ? <button className="source-citation" title={`${source.name} · ${source.offset}–${source.end} · ${source.versionHash.slice(0, 8)} · ${source.observedAt}`} onClick={() => openSource(source.id)}>{children}<small> ↗</small></button> : <span className="muted" title="本次对话没有实际读取记录">[无效来源引用]</span>;
      }
      return <span title={href}>{children}<span className="muted">（{href?.startsWith('https://') ? href : '链接未开放'}）</span></span>;
    }
  }}>{children}</ReactMarkdown></div>;
}
