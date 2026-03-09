import json
import os
from dataclasses import dataclass, asdict

@dataclass
class Config:
    sync_dir: str = ""
    api_provider: str = "Gemini"
    api_key: str = ""
    categories: list = None  # 预设分类列表

    def __post_init__(self):
        if self.categories is None:
            # 默认6个分类
            self.categories = ["工作", "个人", "想法", "项目", "日记", "学习", "待整理"]

CONFIG_PATH = os.path.expanduser('~/.flownote_config.json')

def load_config() -> Config:
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                return Config(**data)
        except Exception as e:
            print(f"Error reading config: {e}")
    return Config()

def save_config(config: Config):
    try:
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(asdict(config), f, indent=4)
    except Exception as e:
        print(f"Error saving config: {e}")