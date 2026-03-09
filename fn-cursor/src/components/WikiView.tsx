import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import { listWikiFiles, readWikiFile } from "@/lib/wikiFs";
import { Button } from "@/components/ui/button";

interface WikiViewProps {
  syncDir: string;
}

export function WikiView({ syncDir }: WikiViewProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [content, setContent] = useState("");

  const loadFiles = useCallback(async () => {
    if (!syncDir) return;
    const list = await listWikiFiles(syncDir);
    setFiles(list);
  }, [syncDir]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  useEffect(() => {
    if (!selected || !syncDir) {
      setContent("");
      return;
    }
    readWikiFile(syncDir, selected).then(setContent).catch(() => setContent(""));
  }, [selected, syncDir]);

  if (!syncDir) {
    return <div className="p-4 text-muted-foreground">请先在设置中选择同步目录</div>;
  }

  return (
    <div className="flex h-full">
      <div className="w-56 border-r border-border p-2 overflow-auto">
        <h3 className="font-medium mb-2">Wiki 文件</h3>
        {files.length === 0 && <p className="text-sm text-muted-foreground">暂无 .md 文件</p>}
        {files.map((f) => (
          <Button
            key={f}
            variant={selected === f ? "secondary" : "ghost"}
            className="w-full justify-start text-left"
            onClick={() => setSelected(f)}
          >
            {f}
          </Button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-6">
        {selected ? (
          <article className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown
              components={{
                a: ({ href, children, ...props }) => {
                  const idMatch = href?.match(/^\d{10,13}$/);
                  if (idMatch && href) {
                    return (
                      <button
                        type="button"
                        className="text-primary underline cursor-pointer bg-transparent border-none p-0 font-inherit"
                        onClick={() => {
                          window.dispatchEvent(new CustomEvent("flownote-open-note", { detail: { id: href } }));
                        }}
                      >
                        {children}
                      </button>
                    );
                  }
                  return <a href={href} {...props}>{children}</a>;
                },
              }}
            >
              {content}
            </ReactMarkdown>
          </article>
        ) : (
          <p className="text-muted-foreground">选择左侧文件查看</p>
        )}
      </div>
    </div>
  );
}
