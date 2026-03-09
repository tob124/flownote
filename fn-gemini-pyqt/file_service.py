import os, json, time, re
from datetime import datetime
import config_manager

def get_sync_dir():
    return config_manager.load_config().get("sync_dir", "")

def ensure_directories():
    sync_dir = get_sync_dir()
    if not sync_dir: return False
    os.makedirs(os.path.join(sync_dir, 'notes'), exist_ok=True)
    os.makedirs(os.path.join(sync_dir, 'wikis'), exist_ok=True)
    inbox_path = os.path.join(sync_dir, 'inbox.txt')
    if not os.path.exists(inbox_path):
        open(inbox_path, 'w', encoding='utf-8').close()
    return True

def save_note(content, category="Inbox", tags=None, ai_status="pending"):
    sync_dir = get_sync_dir()
    if not sync_dir or not content.strip(): return
    
    ts = str(int(time.time() * 1000))
    dt = datetime.now().strftime("%Y-%m-%d")
    
    note_data = {
        "id": ts,
        "raw_content": content.strip(),
        "created_at": dt,
        "ai_status": ai_status,
        "retry_count": 0,
        "title": "",
        "category": category,
        "tags": tags or []
    }
    
    filepath = os.path.join(sync_dir, 'notes', f"{ts}.json")
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(note_data, f, ensure_ascii=False, indent=2)
    return ts

def load_all_notes():
    sync_dir = get_sync_dir()
    if not sync_dir: return []
    notes_dir = os.path.join(sync_dir, 'notes')
    if not os.path.exists(notes_dir): return []
    
    notes = []
    pattern = re.compile(r'^\d{13}\.json$')
    
    for fname in os.listdir(notes_dir):
        if pattern.match(fname):
            try:
                with open(os.path.join(notes_dir, fname), 'r', encoding='utf-8') as f:
                    notes.append(json.load(f))
            except Exception as e:
                print(f"[Warn] 跳过损坏文件 {fname}: {e}")
                
    notes.sort(key=lambda x: x.get('id', ''), reverse=True)
    return notes

def update_note(note_data):
    sync_dir = get_sync_dir()
    filepath = os.path.join(sync_dir, 'notes', f"{note_data['id']}.json")
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(note_data, f, ensure_ascii=False, indent=2)

def process_inbox():
    """原子消化Inbox"""
    sync_dir = get_sync_dir()
    if not sync_dir: return
    
    inbox_path = os.path.join(sync_dir, 'inbox.txt')
    processing_path = os.path.join(sync_dir, 'processing.txt')
    
    if not os.path.exists(inbox_path): return
    
    # 抢占锁机制
    try:
        os.rename(inbox_path, processing_path)
    except Exception:
        return
        
    # 立即创建空inbox让外部继续写入
    open(inbox_path, 'w', encoding='utf-8').close()
    
    try:
        with open(processing_path, 'r', encoding='utf-8') as f:
            content = f.read()
        blocks = [b.strip() for b in content.split('\n\n') if b.strip()]
        for block in blocks:
            save_note(block)
    except Exception as e:
        print(f"处理收集箱失败: {e}")
    finally:
        if os.path.exists(processing_path):
            try: os.remove(processing_path)
            except: pass