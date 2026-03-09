import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getConfig, setConfig, type FlowNoteConfig } from "@/lib/configStore";
import { initSyncDirectory } from "@/lib/fsService";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: () => void;
}

export function SettingsDialog({ open: isOpen, onOpenChange, onSaved }: SettingsDialogProps) {
  const [syncDirectory, setSyncDirectory] = useState("");
  const [aiProvider, setAiProvider] = useState<FlowNoteConfig["aiProvider"]>("Gemini");
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      getConfig().then((c) => {
        setSyncDirectory(c.syncDirectory);
        setAiProvider(c.aiProvider);
        setApiKey(c.apiKey);
      });
    }
  }, [isOpen]);

  const handleSelectDir = async () => {
    setLoading(true);
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected) {
        setSyncDirectory(selected);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!syncDirectory.trim()) return;
    setSaving(true);
    try {
      await initSyncDirectory(syncDirectory);
      await setConfig({ syncDirectory, aiProvider, apiKey });
      onSaved?.();
      onOpenChange(false);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>设置</DialogTitle>
          <DialogDescription>配置同步目录与 AI 服务。</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>同步目录</Label>
            <div className="flex gap-2">
              <Input value={syncDirectory} readOnly placeholder="选择文件夹" className="flex-1" />
              <Button type="button" variant="outline" onClick={handleSelectDir} disabled={loading}>
                {loading ? "选择中…" : "选择目录"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">将在此目录下创建 notes、wikis 与 inbox.txt</p>
          </div>
          <div className="grid gap-2">
            <Label>AI 服务商</Label>
            <Select value={aiProvider} onValueChange={(v) => setAiProvider(v as FlowNoteConfig["aiProvider"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Gemini">Gemini</SelectItem>
                <SelectItem value="DeepSeek">DeepSeek</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>API Key</Label>
            <Input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="填写 API Key"
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button type="button" onClick={handleSave} disabled={!syncDirectory.trim() || saving}>
            {saving ? "保存中…" : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
