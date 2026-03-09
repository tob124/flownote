import json
from pathlib import Path

CONFIG_PATH = Path.home() / '.flownote_config.json'
DEFAULT_CATEGORIES = ["工作", "个人", "学习", "灵感", "摘录", "Inbox"]

def _default_config():
    return {
        "sync_dir": "",
        "api_provider": "DeepSeek",
        "api_key": "",
        "categories": DEFAULT_CATEGORIES
    }

def load_config():
    if not CONFIG_PATH.exists():
        return _default_config()
    try:
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            data = json.load(f)
            if 'categories' not in data:
                data['categories'] = DEFAULT_CATEGORIES
            return data
    except Exception:
        return _default_config()

def save_config(data):
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)