import json, re, time, os, requests
from datetime import datetime
from PyQt6.QtCore import QThread, pyqtSignal
import config_manager
import file_service

def safe_parse_json(text):
    match = re.search(r'\{.*\}', text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except: pass
    return None

def call_llm(provider, api_key, prompt, content, is_json=False):
    if not api_key: return None
    try:
        if provider == "DeepSeek":
            headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
            
            # 如果 content 为空，给一个默认提示，防止 DeepSeek 报 400 错误
            user_content = content if content.strip() else "请按系统提示词执行任务并生成内容。"
            
            data = {
                "model": "deepseek-chat",
                "messages": [
                    {"role": "system", "content": prompt},
                    {"role": "user", "content": user_content}
                ]
            }
            
            # 只有明确要求 JSON 解析时（如整理卡片），才开启 JSON Mode
            if is_json:
                data["response_format"] = {"type": "json_object"}
                
            resp = requests.post("https://api.deepseek.com/v1/chat/completions", headers=headers, json=data, timeout=30)
            
            # 打印详细错误信息，方便排查
            if resp.status_code != 200:
                print(f"[DeepSeek API 错误] {resp.text}")
                
            resp.raise_for_status()
            return resp.json()['choices'][0]['message']['content']
            
        elif provider == "Gemini":
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent?key={api_key}"
            data = {"contents": [{"parts": [{"text": prompt + "\n\n" + content}]}]}
            resp = requests.post(url, json=data, timeout=30)
            if resp.status_code != 200:
                print(f"[Gemini API 错误] {resp.text}")
            resp.raise_for_status()
            text = resp.json()['candidates'][0]['content']['parts'][0]['text']
            return text
            
    except Exception as e:
        print(f"LLM请求失败: {e}")
        return None


class AIQueueThread(QThread):
    note_updated = pyqtSignal()
    
    def run(self):
        while True:
            self.process_queue()
            time.sleep(15)
            
    def process_queue(self):
        sync_dir = file_service.get_sync_dir()
        if not sync_dir: return
        
        notes = file_service.load_all_notes()
        pending_notes = [n for n in notes if n.get('ai_status') == 'pending'][:3]
        if not pending_notes: return
        
        config = config_manager.load_config()
        api_key = config.get("api_key")
        provider = config.get("api_provider")
        categories = config.get("categories", [])
        
        if not api_key: return
        
        for note in pending_notes:
            note['ai_status'] = 'processing'
            file_service.update_note(note)
        self.note_updated.emit()
        
        prompt = f"""
        你是一个知识整理专家。请提取用户文本的标题并打标签。
        严格铁律：你必须且只能从以下列表中选择 category：{json.dumps(categories, ensure_ascii=False)}。
        绝不准创造新分类！如果你觉得都不符合，直接输出 'Inbox'。
        必须且只能返回纯 JSON 格式：{{"title": "提取标题", "category": "分类名", "tags": ["tag1", "tag2"]}}
        """
        
        for note in pending_notes:
            # 修改点 1：打标签时，明确告诉函数开启 JSON 模式
            res_text = call_llm(provider, api_key, prompt, note['raw_content'], is_json=True)
            
            if res_text:
                parsed = safe_parse_json(res_text)
                if parsed:
                    note['title'] = parsed.get('title', '无题')
                    cat = parsed.get('category', 'Inbox')
                    note['category'] = cat if cat in categories else 'Inbox'
                    note['tags'] = parsed.get('tags', [])
                    note['ai_status'] = 'done'
                else:
                    self.fail_note(note)
            else:
                self.fail_note(note)
                
            file_service.update_note(note)
            
            if note['ai_status'] == 'done' and note['category'] != 'Inbox':
                self.generate_wiki(note, provider, api_key)
                
            self.note_updated.emit()

    def fail_note(self, note):
        note['retry_count'] = note.get('retry_count', 0) + 1
        note['ai_status'] = 'failed' if note['retry_count'] >= 3 else 'pending'

    def generate_wiki(self, note, provider, api_key):
        sync_dir = file_service.get_sync_dir()
        cat, month = note['category'], datetime.now().strftime("%Y_%m")
        wiki_path = os.path.join(sync_dir, 'wikis', f"{cat}_{month}.md")
        
        old_summary = ""
        if os.path.exists(wiki_path):
            try:
                with open(wiki_path, 'r', encoding='utf-8') as f:
                    old_summary = f.read()
            except: pass
                
        prompt = f"你是一个知识库增量整理助手。这是【{cat}】此前的知识：\n{old_summary}\n\n用户新增了记录：\n{note['raw_content']}\n\n请将新记录无缝融合进旧知识中，重写为结构清晰、排版优美的 Markdown 长文。直接输出 Markdown 文本，绝不要包裹代码块符号（如 ```markdown）。"
        
        # 修改点 2：生成 Wiki 时，关闭 JSON 模式 (is_json=False)
        new_md = call_llm(provider, api_key, prompt, "", is_json=False)
        
        if new_md:
            new_md = re.sub(r'^```[a-zA-Z]*\n', '', new_md)
            new_md = re.sub(r'\n```$', '', new_md)
            try:
                with open(wiki_path, 'w', encoding='utf-8') as f:
                    f.write(new_md.strip())
            except: pass