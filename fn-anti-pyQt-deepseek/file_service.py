import os
import json
import time
import re
from typing import List, Dict
from datetime import datetime  # 新增导入

from config_manager import load_config

# ---------- 原有函数 ----------
def _get_notes_dir() -> str:
    config = load_config()
    if not config.sync_dir:
        return ""
    notes_dir = os.path.join(config.sync_dir, "notes")
    os.makedirs(notes_dir, exist_ok=True)
    return notes_dir

def _get_wikis_dir() -> str:
    config = load_config()
    if not config.sync_dir:
        return ""
    wikis_dir = os.path.join(config.sync_dir, "wikis")
    os.makedirs(wikis_dir, exist_ok=True)
    return wikis_dir

def _get_inbox_path() -> str:
    config = load_config()
    if not config.sync_dir:
        return ""
    inbox_path = os.path.join(config.sync_dir, "inbox.txt")
    if not os.path.exists(inbox_path):
        open(inbox_path, 'a', encoding='utf-8').close()
    return inbox_path

def save_note(content: str):
    notes_dir = _get_notes_dir()
    if not notes_dir:
        return
    
    timestamp = str(int(time.time() * 1000))
    note_id = timestamp
    note_data = {
        "id": note_id,
        "raw_content": content,
        "created_at": time.strftime("%Y-%m-%d"),
        "ai_status": "pending",
        "retry_count": 0,
        "title": "",
        "category": "Inbox",
        "tags": []
    }
    
    file_path = os.path.join(notes_dir, f"{note_id}.json")
    with open(file_path, 'w', encoding='utf-8') as f:
        json.dump(note_data, f, ensure_ascii=False, indent=2)

def load_all_notes() -> List[Dict]:
    notes_dir = _get_notes_dir()
    if not notes_dir:
        return []
    
    notes = []
    pattern = re.compile(r'^\d{13}\.json$')
    
    try:
        filenames = os.listdir(notes_dir)
        for filename in filenames:
            if pattern.match(filename):
                file_path = os.path.join(notes_dir, filename)
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                        notes.append(data)
                except Exception as e:
                    print(f"Error reading note {filename}: {e}")
    except Exception as e:
        print(f"Error reading notes directory: {e}")
        
    notes.sort(key=lambda x: x.get('id', ""), reverse=True)
    return notes

def process_inbox():
    config = load_config()
    if not config.sync_dir:
        return
        
    inbox_path = _get_inbox_path()
    processing_path = os.path.join(config.sync_dir, "processing.txt")
    
    try:
        os.rename(inbox_path, processing_path)
    except Exception as e:
        return  # Probably locked or doesn't exist
        
    try:
        # Recreate empty inbox immediately
        open(inbox_path, 'w', encoding='utf-8').close()
        
        with open(processing_path, 'r', encoding='utf-8') as f:
            content = f.read()
            
        # Split by consecutive empty lines
        parts = re.split(r'\n\s*\n', content)
        for part in parts:
            part = part.strip()
            if part:
                save_note(part)
                
    finally:
        if os.path.exists(processing_path):
            try:
                os.remove(processing_path)
            except Exception as e:
                print(f"Error removing processing file: {e}")

# ---------- 新增函数（分类管理）----------
def update_note_category(note_id: str, new_category: str):
    """更新单条笔记的分类"""
    notes_dir = _get_notes_dir()
    if not notes_dir:
        return
    filepath = os.path.join(notes_dir, f"{note_id}.json")
    try:
        with open(filepath, 'r+', encoding='utf-8') as f:
            data = json.load(f)
            data['category'] = new_category
            f.seek(0)
            json.dump(data, f, ensure_ascii=False, indent=2)
            f.truncate()
    except Exception as e:
        print(f"Error updating note category: {e}")

def rename_wiki(old_category: str, new_category: str, month: str = None):
    """重命名 wiki 文件（分类重命名时调用）"""
    wikis_dir = _get_wikis_dir()
    if not wikis_dir:
        return
    if month is None:
        month = datetime.now().strftime("%Y_%m")
    old_name = f"{old_category}_{month}.md"
    new_name = f"{new_category}_{month}.md"
    old_path = os.path.join(wikis_dir, old_name)
    new_path = os.path.join(wikis_dir, new_name)
    if os.path.exists(old_path):
        try:
            os.rename(old_path, new_path)
        except Exception as e:
            print(f"Error renaming wiki: {e}")

def merge_wiki(source_category: str, target_category: str, month: str = None):
    """合并两个 wiki 的内容（将源分类的 wiki 内容追加到目标分类）"""
    wikis_dir = _get_wikis_dir()
    if not wikis_dir:
        return
    if month is None:
        month = datetime.now().strftime("%Y_%m")
    source_path = os.path.join(wikis_dir, f"{source_category}_{month}.md")
    target_path = os.path.join(wikis_dir, f"{target_category}_{month}.md")
    if os.path.exists(source_path):
        try:
            with open(source_path, 'r', encoding='utf-8') as f:
                source_content = f.read()
            if os.path.exists(target_path):
                with open(target_path, 'a', encoding='utf-8') as f:
                    f.write("\n\n" + source_content)
            else:
                with open(target_path, 'w', encoding='utf-8') as f:
                    f.write(source_content)
            os.remove(source_path)
        except Exception as e:
            print(f"Error merging wiki: {e}")