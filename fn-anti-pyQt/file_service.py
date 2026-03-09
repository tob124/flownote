import os
import json
import time
import re
from typing import List, Dict

from config_manager import load_config

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
