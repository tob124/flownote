import * as Dialog from '@radix-ui/react-dialog';
import { open } from '@tauri-apps/api/dialog';
import { useEffect, useState } from 'react';
import { FlowNoteConfig, saveConfig } from '../lib/configStore';
import { Settings } from 'lucide-react';

interface SettingsDialogProps {
  config: FlowNoteConfig;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (config: FlowNoteConfig) => void;
}

export function SettingsDialog({ config, open, onOpenChange, onSaved }: SettingsDialogProps) {
  const [draft, setDraft] = useState(config);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  const handleSave = async () => {
    await saveConfig(draft);
    onSaved(draft);
    onOpenChange(false);
  };

  const chooseDirectory = async () => {
    const result = await open({ directory: true });
    if (typeof result === 'string') {
      setDraft((prev) => ({ ...prev, syncDirectory: result }));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Trigger asChild>
        <button className="flex items-center gap-2 rounded-md bg-slate-900 px-3 py-2 text-sm text-white">
          <Settings size={16} /> 设置
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50" />
        <Dialog.Content className="fixed left-1/2 top-1/2 max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-lg bg-white p-6 shadow-lg">
          <Dialog.Title className="text-lg font-semibold">FlowNote 设置</Dialog.Title>
          <div className="mt-4 space-y-4 text-sm text-slate-800">
            <label className="flex flex-col gap-1">
              同步目录
              <div className="flex gap-2">
                <input
                  value={draft.syncDirectory}
                  onChange={(event) => setDraft((prev) => ({ ...prev, syncDirectory: event.target.value }))}
                  className="flex-1 rounded border border-slate-200 px-3 py-2"
                />
                <button type="button" onClick={chooseDirectory} className="rounded border px-3 py-2 text-sm">
                  选择
                </button>
              </div>
            </label>
            <label className="flex flex-col gap-1">
              AI 服务提供商
              <select
                value={draft.aiProvider}
                onChange={(event) => setDraft((prev) => ({ ...prev, aiProvider: event.target.value as FlowNoteConfig['aiProvider'] }))}
                className="rounded border border-slate-200 px-3 py-2"
              >
                <option value="Gemini">Gemini</option>
                <option value="DeepSeek">DeepSeek</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              API Key
              <input
                value={draft.apiKey}
                onChange={(event) => setDraft((prev) => ({ ...prev, apiKey: event.target.value }))}
                className="rounded border border-slate-200 px-3 py-2"
              />
            </label>
          </div>
          <div className="mt-6 flex justify-end gap-3 text-sm">
            <Dialog.Close asChild>
              <button className="rounded border px-4 py-2">取消</button>
            </Dialog.Close>
            <button onClick={handleSave} className="rounded bg-slate-900 px-4 py-2 text-white">
              保存
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
