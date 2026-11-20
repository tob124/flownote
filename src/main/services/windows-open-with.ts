import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const CANCELLED = -2147023673 // HRESULT_FROM_WIN32(ERROR_CANCELLED)
const openWithScript = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class FlowNoteFileDialog {
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct OpenAsInfo {
        [MarshalAs(UnmanagedType.LPWStr)] public string File;
        public IntPtr ClassName;
        public uint Flags;
    }
    [DllImport("shell32.dll", ExactSpelling = true)]
    public static extern int SHOpenWithDialog(IntPtr parent, ref OpenAsInfo info);
}
'@
$info = New-Object FlowNoteFileDialog+OpenAsInfo
$info.File = $env:FLOWNOTE_OPEN_WITH_PATH
$info.Flags = 4
$owner = [IntPtr]::new([long]$env:FLOWNOTE_OPEN_WITH_OWNER)
[Console]::WriteLine([FlowNoteFileDialog]::SHOpenWithDialog($owner, [ref]$info))
`

/** S_OK acknowledges the picker, including Windows versions that do not report dismissal separately. */
export async function openWithWindows(path: string, owner?: Buffer): Promise<'closed' | 'cancelled'> {
  const handle = owner && (owner.length === 8 ? owner.readBigInt64LE() : owner.readInt32LE())
  const powershell = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  const encoded = Buffer.from(openWithScript, 'utf16le').toString('base64')
  const { stdout } = await run(powershell, ['-NoProfile', '-NonInteractive', '-STA', '-EncodedCommand', encoded], {
    windowsHide: true,
    env: { ...process.env, FLOWNOTE_OPEN_WITH_PATH: path, FLOWNOTE_OPEN_WITH_OWNER: String(handle ?? 0) }
  })
  const result = stdout.trim()
  if (result === '0') return 'closed'
  if (result === String(CANCELLED)) return 'cancelled'
  throw new Error(/^[-]?\d+$/.test(result) ? `Windows 错误 0x${(Number(result) >>> 0).toString(16).toUpperCase()}` : '系统未返回打开结果')
}
