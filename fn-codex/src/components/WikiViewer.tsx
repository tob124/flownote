import ReactMarkdown from 'react-markdown';
import { WikiItem } from '../lib/wikiService';

interface WikiViewerProps {
  wikis: WikiItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function WikiViewer({ wikis, selectedId, onSelect }: WikiViewerProps) {
  const active = wikis.find((wiki) => wiki.id === selectedId) || wikis[0];

  return (
    <div className="flex h-full gap-4">
      <div className="flex w-1/3 flex-col gap-2 overflow-y-auto rounded border border-slate-200 p-3">
        {wikis.length === 0 ? (
          <p className="text-sm text-slate-500">没有 Wiki 文件可显示。</p>
        ) : (
          wikis.map((wiki) => (
            <button
              key={wiki.id}
              onClick={() => onSelect(wiki.id)}
              className={`w-full rounded px-3 py-2 text-left text-sm ${wiki.id === active?.id ? 'bg-slate-100 font-semibold' : 'hover:bg-slate-50'}`}
            >
              {wiki.name}
              <span className="ml-2 text-xs text-slate-400">{wiki.updatedAt}</span>
            </button>
          ))
        )}
      </div>
      <div className="flex-1 overflow-auto rounded border border-slate-200 p-4">
        {active ? (
          <div className="space-y-3">
            <h3 className="text-base font-semibold">{active.name}</h3>
            <ReactMarkdown className="prose max-w-none text-sm">{active.content || '空文件'}</ReactMarkdown>
          </div>
        ) : (
          <p className="text-sm text-slate-500">请选择一个 Wiki 文件。</p>
        )}
      </div>
    </div>
  );
}
