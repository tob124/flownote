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
    note_updated = pyqtSignal(str)

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

        config = load_config()
        provider = config.api_provider
        api_key = config.api_key
        categories = config.categories  # 从配置读取预设分类

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

            for filepath, data in pending_files:
                # 锁定
                data['ai_status'] = 'processing'
                with open(filepath, 'w', encoding='utf-8') as f:
                    json.dump(data, f, ensure_ascii=False, indent=2)
                self.note_updated.emit(data['id'])

                # 构建提示词，限制分类范围
                categories_str = ', '.join(categories)
                prompt = (
                    f"分析这条笔记: '{data.get('raw_content', '')}'. "
                    f"从以下分类中选择一个最合适的：{categories_str}。"
                    "仅输出一个有效的 JSON 对象，包含: title (string), category (string), tags (array of strings). 不要使用 markdown 代码块包裹，只输出原始 JSON。"
                )

                response_text = call_llm(provider, api_key, prompt)
                parsed = safe_parse_json(response_text)

                if parsed and 'title' in parsed:
                    category = parsed.get('category', '')
                    # 如果返回的分类不在预设列表中，归为“待整理”
                    if category not in categories:
                        category = '待整理'
                    data['title'] = parsed.get('title', '')
                    data['category'] = category
                    data['tags'] = parsed.get('tags', [])
                    data['ai_status'] = 'done'

                    with open(filepath, 'w', encoding='utf-8') as f:
                        json.dump(data, f, ensure_ascii=False, indent=2)
                    self.note_updated.emit(data['id'])

                    # 更新 wiki（不再插入链接）
                    if data['category'] != '待整理' and data['category'].strip():
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

    def update_wiki(self, category: str, content: str, provider: str, api_key: str):
        """将笔记内容合并到对应分类的 wiki 中，不再插入链接"""
        wikis_dir = _get_wikis_dir()
        if not wikis_dir:
            return

        current_month = datetime.now().strftime("%Y_%m")
        wiki_filename = f"{category}_{current_month}.md"
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
            f"你正在更新类别为 '{category}' 的 Wiki 页面。\n"
            f"当前 Wiki 内容:\n{old_content}\n\n"
            f"待添加的新笔记: '{content}'\n\n"
            "请重写或追加当前 Wiki 内容，以自然流畅地融入这条新笔记。"
            "仅返回 markdown 字符串（包含现有内容和新修改的部分）。"
        )

        new_content = call_llm(provider, api_key, prompt)
        if new_content:
            try:
                with open(wiki_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
            except Exception as e:
                print(f"Error saving wiki: {e}")