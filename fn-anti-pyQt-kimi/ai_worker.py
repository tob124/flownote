import time
import json
import re
import os
import requests
from PyQt6.QtCore import QThread, pyqtSignal
from datetime import datetime

from config_manager import load_config, get_category_names, is_valid_category
from file_service import _get_notes_dir, _get_wikis_dir, get_wiki_path

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
            valid_categories = get_category_names(config)
            
            for filepath, data in pending_files:
                # Lock
                data['ai_status'] = 'processing'
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                    
                self.note_updated.emit(data['id'])
                
                # 构建category列表供AI选择
                categories_str = ", ".join([f'"{cat}"' for cat in valid_categories])
                
                # Fetch tags and category - AI必须从预设列表中选择
                prompt = (
                    f"分析这条笔记: '{data.get('raw_content', '')}'. "
                    f"仅输出一个有效的 JSON 对象，包含: title (string), category (string), tags (array of strings)。"
                    f"category 必须从以下预设列表中选择（必须完全匹配）: [{categories_str}]。"
                    f"如果笔记内容不符合任何category，选择最接近的一个。"
                    f"不要使用 markdown 代码块包裹，只输出原始 JSON。"
                )
                
                response_text = call_llm(provider, api_key, prompt)
                parsed = safe_parse_json(response_text)
                
                if parsed and 'title' in parsed:
                    data['title'] = parsed.get('title', '')
                    
                    # 验证category是否在预设列表中
                    ai_category = parsed.get('category', 'Inbox')
                    if is_valid_category(config, ai_category):
                        data['category'] = ai_category
                    else:
                        # 如果AI返回了无效的category，选择最接近的
                        data['category'] = self._find_best_category(ai_category, valid_categories)
                    
                    data['tags'] = parsed.get('tags', [])
                    data['ai_status'] = 'done'
                    
                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                        
                    self.note_updated.emit(data['id'])
                    
                    # Wiki dynamic update - 只更新到已有的category wiki
                    if data['category'] != 'Inbox' and data['category'].strip():
                        self.update_wiki(data['category'], data['raw_content'], provider, api_key)
                        
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

    def _find_best_category(self, ai_category: str, valid_categories: list) -> str:
        """找到最接近的预设category"""
        # 简单的模糊匹配
        ai_lower = ai_category.lower()
        for cat in valid_categories:
            if cat.lower() in ai_lower or ai_lower in cat.lower():
                return cat
        # 默认返回第一个category
        return valid_categories[0] if valid_categories else "Inbox"

    def update_wiki(self, category: str, content: str, provider: str, api_key: str):
        """更新wiki内容 - 不再包含细节链接"""
        wiki_path = get_wiki_path(category)
        if not wiki_path:
            return
            
        old_content = ""
        if os.path.exists(wiki_path):
            try:
                with open(wiki_path, 'r', encoding='utf-8') as f:
                    old_content = f.read()
            except Exception:
                pass
                
        prompt = (
            f"你正在更新类别为 '{category}' 的 Wiki 页面。\n"
            f"当前 Wiki 内容:\n{old_content}\n\n"
            f"待添加的新笔记: '{content}'\n\n"
            "请重写或追加当前 Wiki 内容，以自然流畅地融入这条新笔记。"
            "直接返回更新后的完整 markdown 内容，不要添加任何元数据或说明。"
        )
        
        new_content = call_llm(provider, api_key, prompt)
        if new_content:
            try:
                with open(wiki_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
            except Exception as e:
                print(f"Error saving wiki: {e}")
