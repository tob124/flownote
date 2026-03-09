# -*- coding: utf-8 -*-
"""FlowNote AI 工作线程：LLM 调用、JSON 解析、队列处理、Wiki 增量生成。"""

import json
import os
import re
import time
import logging
from datetime import datetime

import requests

from PyQt6.QtCore import QThread, pyqtSignal

import config_manager
from file_service import load_all_notes, _write_note_json

logger = logging.getLogger(__name__)

# 正则提取 JSON 对象（支持一层嵌套）
JSON_BLOCK_RE = re.compile(r"\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}", re.DOTALL)


def call_llm(provider, api_key, prompt, content):
    """
    调用 LLM API。Gemini / DeepSeek 使用简单 HTTP 接口。
    返回 (success: bool, text: str)。
    """
    if not api_key:
        return False, ""
    provider = (provider or "Gemini").strip().lower()
    if provider == "gemini":
        return _call_gemini(api_key, prompt, content)
    if provider == "deepseek":
        return _call_deepseek(api_key, prompt, content)
    return False, "Unknown provider"


def _call_gemini(api_key, prompt, content):
    """Gemini API (Google AI Studio)"""
    url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent"
    headers = {"Content-Type": "application/json"}
    payload = {
        "contents": [{"parts": [{"text": prompt + "\n\n" + content}]}],
        "generationConfig": {"temperature": 0.2},
    }
    try:
        r = requests.post(url + "?key=" + api_key, json=payload, headers=headers, timeout=60)
        if r.status_code != 200:
            return False, r.text or str(r.status_code)
        data = r.json()
        parts = data.get("candidates", [{}])[0].get("content", {}).get("parts", [])
        text = parts[0].get("text", "") if parts else ""
        return True, text.strip()
    except Exception as e:
        logger.warning("Gemini call failed: %s", e)
        return False, str(e)


def _call_deepseek(api_key, prompt, content):
    """DeepSeek API"""
    url = "https://api.deepseek.com/v1/chat/completions"
    headers = {"Content-Type": "application/json", "Authorization": "Bearer " + api_key}
    payload = {
        "model": "deepseek-chat",
        "messages": [{"role": "user", "content": prompt + "\n\n" + content}],
        "temperature": 0.2,
    }
    try:
        r = requests.post(url, json=payload, headers=headers, timeout=60)
        if r.status_code != 200:
            return False, r.text or str(r.status_code)
        data = r.json()
        text = data.get("choices", [{}])[0].get("message", {}).get("content", "")
        return True, text.strip()
    except Exception as e:
        logger.warning("DeepSeek call failed: %s", e)
        return False, str(e)


def safe_parse_json(text):
    """用正则或括号匹配提取 {} 内容再 json.loads，失败返回 None。"""
    if not text:
        return None
    start = text.find("{")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start : i + 1])
                except Exception:
                    break
    for m in JSON_BLOCK_RE.finditer(text):
        try:
            return json.loads(m.group(0))
        except Exception:
            continue
    return None


def update_wiki_for_note(sync_dir, note_data, provider, api_key):
    """
    当笔记 done 且 category 不是 Inbox 时：读 /wikis/{category}_{YYYY_MM}.md，
    用 LLM 将新记录融合进旧总结，覆盖写回。
    """
    if not sync_dir or not note_data:
        return
    if note_data.get("ai_status") != "done":
        return
    category = note_data.get("category", "Inbox")
    if category == "Inbox":
        return
    wikis_dir = os.path.join(sync_dir, "wikis")
    os.makedirs(wikis_dir, exist_ok=True)
    now = datetime.utcnow()
    suffix = now.strftime("%Y_%m") + ".md"
    filename = category + "_" + suffix
    path = os.path.join(wikis_dir, filename)
    old_summary = ""
    if os.path.isfile(path):
        try:
            with open(path, "r", encoding="utf-8") as f:
                old_summary = f.read()
        except Exception as e:
            logger.warning("read wiki %s: %s", path, e)
    new_notes = note_data.get("raw_content", "") or note_data.get("title", "")
    prompt = (
        "你是一个知识整理助手。这是【{}】的旧总结：\n{}\n用户新增了记录：\n{}\n"
        "请将新记录无缝融合进旧总结中，重写为结构清晰的 Markdown 长文。直接输出 Markdown 文本即可。"
    ).format(category, old_summary or "(无)", new_notes)
    ok, text = call_llm(provider, api_key, prompt, "")
    if not ok or not text:
        return
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(text)
    except Exception as e:
        logger.warning("write wiki %s: %s", path, e)


class AIQueueThread(QThread):
    """后台队列：每 15 秒扫描 notes 最多 3 条 pending，改 processing 后调 LLM，结果落盘并发射 note_updated。"""
    note_updated = pyqtSignal()

    def __init__(self, sync_dir):
        super().__init__()
        self.sync_dir = sync_dir
        self._stop = False

    def run(self):
        while not self._stop:
            time.sleep(15)
            if not self.sync_dir:
                continue
            cfg = config_manager.load_config()
            api_key = cfg.get("api_key", "")
            provider = cfg.get("api_provider", "Gemini")
            categories = cfg.get("categories", ["Inbox"])
            if not api_key:
                continue
            notes = load_all_notes(self.sync_dir)
            pending = [n for n in notes if n.get("ai_status") == "pending"][:3]
            for note in pending:
                note_id = note.get("id")
                if not note_id:
                    continue
                note_path = os.path.join(self.sync_dir, "notes", note_id + ".json")
                try:
                    with open(note_path, "r", encoding="utf-8") as f:
                        current = json.load(f)
                except Exception:
                    continue
                if current.get("ai_status") != "pending":
                    continue
                current["ai_status"] = "processing"
                try:
                    with open(note_path, "w", encoding="utf-8") as f:
                        json.dump(current, f, ensure_ascii=False, indent=2)
                except Exception:
                    continue

                cats_str = "、".join(categories)
                prompt = (
                    "你是一个笔记分类与摘要助手。请根据用户的一条笔记内容，输出一个 JSON 对象，且只输出这一个 JSON，不要其他说明。"
                    "格式：{\"title\": \"简短标题\", \"category\": \"分类名\", \"tags\": [\"标签1\", \"标签2\"]}。"
                    "你必须且只能从以下列表中选择 category：{}。绝不准创造新分类！如果你觉得都不符合，输出 'Inbox'。"
                ).format(cats_str)
                raw = current.get("raw_content", "")
                ok, text = call_llm(provider, api_key, prompt, raw)
                parsed = safe_parse_json(text) if ok else None
                if parsed and isinstance(parsed, dict):
                    cat = parsed.get("category")
                    if cat not in categories:
                        parsed["category"] = "Inbox"
                    current["title"] = parsed.get("title", "") or current.get("title", "")
                    current["category"] = parsed.get("category", "Inbox")
                    current["tags"] = parsed.get("tags", []) if isinstance(parsed.get("tags"), list) else current.get("tags", [])
                    current["ai_status"] = "done"
                    current["retry_count"] = 0
                    _write_note_json(self.sync_dir, current)
                    update_wiki_for_note(self.sync_dir, current, provider, api_key)
                    self.note_updated.emit()
                else:
                    retry = current.get("retry_count", 0) + 1
                    current["retry_count"] = retry
                    current["ai_status"] = "failed" if retry >= 3 else "pending"
                    if current["ai_status"] == "processing":
                        current["ai_status"] = "pending"
                    _write_note_json(self.sync_dir, current)
                    self.note_updated.emit()

    def stop(self):
        self._stop = True
