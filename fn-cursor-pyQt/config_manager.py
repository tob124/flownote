# -*- coding: utf-8 -*-
"""FlowNote 配置管理：读写 ~/.flownote_config.json"""

import json
import os

CONFIG_PATH = os.path.expanduser("~/.flownote_config.json")

DEFAULT_CATEGORIES = ["工作", "个人", "学习", "灵感", "摘录", "Inbox"]


def load_config():
    """读取配置，不存在则返回默认配置（不写文件）。"""
    if not os.path.isfile(CONFIG_PATH):
        return {
            "sync_dir": "",
            "api_provider": "Gemini",
            "api_key": "",
            "categories": DEFAULT_CATEGORIES.copy(),
        }
    try:
        with open(CONFIG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        if "categories" not in data or not data["categories"]:
            data["categories"] = DEFAULT_CATEGORIES.copy()
        return data
    except Exception as e:
        print(f"[config] load error: {e}")
        return {
            "sync_dir": "",
            "api_provider": "Gemini",
            "api_key": "",
            "categories": DEFAULT_CATEGORIES.copy(),
        }


def save_config(config):
    """保存配置到 ~/.flownote_config.json。"""
    try:
        with open(CONFIG_PATH, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        print(f"[config] save error: {e}")
        return False
