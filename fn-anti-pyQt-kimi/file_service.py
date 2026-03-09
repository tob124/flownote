import os
import json
import time
import re
import shutil
from typing import List, Dict

from config_manager import load_config, get_category_names

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

def load_notes_by_category(category: str) -> List[Dict]:
    """加载指定category的所有笔记"""
    all_notes = load_all_notes()
    return [note for note in all_notes if note.get('category') == category]

def update_note_category(note_id: str, new_category: str) -> bool:
    """更新单个笔记的category"""
    notes_dir = _get_notes_dir()
    if not notes_dir:
        return False
    
    file_path = os.path.join(notes_dir, f"{note_id}.json")
    if not os.path.exists(file_path):
        return False
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        
        old_category = data.get('category', '')
        data['category'] = new_category
        
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        return True
    except Exception as e:
        print(f"Error updating note category: {e}")
        return False

def batch_update_category(old_category: str, new_category: str) -> int:
    """批量更新笔记的category，返回更新的笔记数量"""
    notes = load_all_notes()
    count = 0
    
    for note in notes:
        if note.get('category') == old_category:
            if update_note_category(note['id'], new_category):
                count += 1
    
    return count

def batch_delete_category(category: str) -> int:
    """批量删除指定category的所有笔记，返回删除的笔记数量"""
    notes = load_all_notes()
    notes_dir = _get_notes_dir()
    count = 0
    
    for note in notes:
        if note.get('category') == category:
            file_path = os.path.join(notes_dir, f"{note['id']}.json")
            try:
                if os.path.exists(file_path):
                    os.remove(file_path)
                    count += 1
            except Exception as e:
                print(f"Error deleting note {note['id']}: {e}")
    
    return count

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

def get_wiki_path(category: str) -> str:
    """获取category对应的wiki文件路径"""
    wikis_dir = _get_wikis_dir()
    if not wikis_dir:
        return ""
    
    # 使用category名称作为文件名（清理非法字符）
    safe_name = re.sub(r'[\\/*?:"<>|]', "", category)
    return os.path.join(wikis_dir, f"{safe_name}.md")

def init_category_wikis():
    """初始化所有category的wiki文件"""
    config = load_config()
    wikis_dir = _get_wikis_dir()
    
    if not wikis_dir:
        return
    
    for cat in config.categories:
        wiki_path = get_wiki_path(cat['name'])
        if wiki_path and not os.path.exists(wiki_path):
            # 创建空的wiki文件，添加标题
            try:
                with open(wiki_path, 'w', encoding='utf-8') as f:
                    f.write(f"# {cat['name']}\n\n")
                    if cat.get('description'):
                        f.write(f"*{cat['description']}*\n\n")
                    f.write("---\n\n")
            except Exception as e:
                print(f"Error creating wiki for {cat['name']}: {e}")

def delete_wiki(category: str):
    """删除category对应的wiki文件"""
    wiki_path = get_wiki_path(category)
    if wiki_path and os.path.exists(wiki_path):
        try:
            os.remove(wiki_path)
        except Exception as e:
            print(f"Error deleting wiki for {category}: {e}")

def rename_wiki(old_category: str, new_category: str):
    """重命名wiki文件"""
    old_path = get_wiki_path(old_category)
    new_path = get_wiki_path(new_category)
    
    if old_path and new_path and os.path.exists(old_path):
        try:
            # 如果目标文件已存在，合并内容
            if os.path.exists(new_path):
                with open(old_path, 'r', encoding='utf-8') as f:
                    old_content = f.read()
                with open(new_path, 'a', encoding='utf-8') as f:
                    f.write(f"\n\n---\n\n{old_content}")
                os.remove(old_path)
            else:
                os.rename(old_path, new_path)
        except Exception as e:
            print(f"Error renaming wiki: {e}")
