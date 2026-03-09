import time
import json
import re
import os
import requests
from PyQt6.QtCore import QThread, pyqtSignal
from datetime import datetime

from config_manager import load_config
from file_service import _get_notes_dir, _get_wikis_dir

def safe_parse_json(text: str) -> dict:
    try:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
    except Exception as e:
        print(f"Failed to parse JSON: {e}")
    return {}

def call_llm(provider: str, api_key: str, prompt: str) -> str:
    if not api_key:
        return ""
    
    try:
        if provider == "Gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={api_key}"
            headers = {'Content-Type': 'application/json'}
            data = {"contents": [{"parts": [{"text": prompt}]}]}
            response = requests.post(url, headers=headers, json=data)
            response.raise_for_status()
            res_json = response.json()
            return res_json.get("candidates", [{}])[0].get("content", {}).get("parts", [{}])[0].get("text", "")
            
        elif provider == "DeepSeek":
            url = "https://api.deepseek.com/chat/completions"
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            data = {
                "model": "deepseek-chat",
                "messages": [{"role": "user", "content": prompt}],
                "stream": False
            }
            response = requests.post(url, headers=headers, json=data)
            response.raise_for_status()
            res_json = response.json()
            return res_json.get("choices", [{}])[0].get("message", {}).get("content", "")
    except Exception as e:
        print(f"LLM API Error: {e}")
        return ""
        
    return ""

class AIQueueThread(QThread):
    note_updated = pyqtSignal(str) # Emits note_id when updated
    
    def __init__(self):
        super().__init__()
        self.running = True

    def run(self):
        while self.running:
            self.process_queue()
            time.sleep(15)
            
    def stop(self):
        self.running = False
            
    def process_queue(self):
        notes_dir = _get_notes_dir()
        if not notes_dir:
            return
            
        pending_files = []
        try:
            for filename in os.listdir(notes_dir):
                if re.match(r'^\d{13}\.json$', filename):
                    filepath = os.path.join(notes_dir, filename)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        if data.get('ai_status') == 'pending':
                            pending_files.append((filepath, data))
                            if len(pending_files) >= 3:
                                break
                    except Exception:
                        pass
                        
            config = load_config()
            provider = config.api_provider
            api_key = config.api_key
            
            for filepath, data in pending_files:
                # Lock
                data['ai_status'] = 'processing'
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                    
                self.note_updated.emit(data['id'])
                
                # Fetch tags and category
                prompt = (
                    f"Analyze this note: '{data.get('raw_content', '')}'. "
                    "Output ONLY a valid JSON object with: title (string), category (string), tags (array of strings). Do NOT wrap in markdown blocks, just the raw JSON."
                )
                
                response_text = call_llm(provider, api_key, prompt)
                parsed = safe_parse_json(response_text)
                
                if parsed and 'title' in parsed:
                    data['title'] = parsed.get('title', '')
                    data['category'] = parsed.get('category', 'Inbox')
                    data['tags'] = parsed.get('tags', [])
                    data['ai_status'] = 'done'
                    
                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                        
                    self.note_updated.emit(data['id'])
                    
                    # Wiki dynamic update
                    if data['category'] != 'Inbox' and data['category'].strip():
                        self.update_wiki(data['category'], data['raw_content'], data['id'], provider, api_key)
                        
                else:
                    data['retry_count'] = data.get('retry_count', 0) + 1
                    if data['retry_count'] >= 3:
                        data['ai_status'] = 'failed'
                    else:
                        data['ai_status'] = 'pending'
                        
                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                        
                    self.note_updated.emit(data['id'])
                        
        except Exception as e:
            print(f"Error processing AI queue: {e}")

    def update_wiki(self, category: str, content: str, note_id: str, provider: str, api_key: str):
        wikis_dir = _get_wikis_dir()
        if not wikis_dir:
            return
            
        current_month = datetime.now().strftime("%Y_%m")
        wiki_filename = f"{category}_{current_month}.md"
        
        # Replace invalid chars
        wiki_filename = re.sub(r'[\\/*?:"<>|]', "", wiki_filename)
        wiki_path = os.path.join(wikis_dir, wiki_filename)
        
        old_content = ""
        if os.path.exists(wiki_path):
            try:
                with open(wiki_path, 'r', encoding='utf-8') as f:
                    old_content = f.read()
            except Exception:
                pass
                
        prompt = (
             f"You are updating a Wiki page for the category '{category}'.\n"
             f"Current wiki content:\n{old_content}\n\n"
             f"New note to add: '{content}'\n\n"
             "Please rewrite or append to the current wiki content to gracefully incorporate this new note. "
             f"IMPORTANT REQUIREMENT: You MUST include the exact markdown link `[细节]({note_id})` near the inserted content so the user can trace it back to the original note.\n"
             "Return ONLY the markdown string (including existing content and new modifications)."
        )
        
        new_content = call_llm(provider, api_key, prompt)
        if new_content:
            try:
                with open(wiki_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
            except Exception as e:
                print(f"Error saving wiki: {e}")
