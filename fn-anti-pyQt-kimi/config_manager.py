import json
import os
from dataclasses import dataclass, asdict, field
from typing import List, Dict

# 预设的6个基本category
DEFAULT_CATEGORIES = [
    {"id": "work", "name": "工作", "description": "工作相关笔记"},
    {"id": "learning", "name": "学习", "description": "学习笔记和知识整理"},
    {"id": "ideas", "name": "灵感", "description": "创意和想法"},
    {"id": "life", "name": "生活", "description": "日常生活记录"},
    {"id": "projects", "name": "项目", "description": "项目管理和进度"},
    {"id": "resources", "name": "资源", "description": "收藏的资源链接"}
]

@dataclass
class Config:
    sync_dir: str = ""
    api_provider: str = "Gemini"
    api_key: str = ""
    categories: List[Dict] = field(default_factory=lambda: DEFAULT_CATEGORIES.copy())

CONFIG_PATH = os.path.expanduser('~/.flownote_config.json')

def load_config() -> Config:
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # 确保categories字段存在
                if 'categories' not in data or not data['categories']:
                    data['categories'] = DEFAULT_CATEGORIES.copy()
                return Config(**data)
        except Exception as e:
            print(f"Error reading config: {e}")
    return Config()

def save_config(config: Config):
    try:
        with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
            json.dump(asdict(config), f, indent=4, ensure_ascii=False)
    except Exception as e:
        print(f"Error saving config: {e}")

def get_category_names(config: Config) -> List[str]:
    """获取所有category的名称列表"""
    return [cat['name'] for cat in config.categories]

def get_category_by_name(config: Config, name: str) -> Dict:
    """根据名称获取category"""
    for cat in config.categories:
        if cat['name'] == name:
            return cat
    return None

def add_category(config: Config, name: str, description: str = "") -> bool:
    """添加新category，返回是否成功"""
    # 检查是否已存在
    if any(cat['name'] == name for cat in config.categories):
        return False
    
    # 生成唯一id
    import uuid
    cat_id = f"custom_{uuid.uuid4().hex[:8]}"
    
    config.categories.append({
        "id": cat_id,
        "name": name,
        "description": description
    })
    save_config(config)
    return True

def delete_category(config: Config, name: str) -> str:
    """删除category，返回被删除的category id"""
    for i, cat in enumerate(config.categories):
        if cat['name'] == name:
            cat_id = cat['id']
            config.categories.pop(i)
            save_config(config)
            return cat_id
    return None

def merge_categories(config: Config, source_name: str, target_name: str) -> tuple:
    """合并两个category，返回(source_id, target_id)"""
    source_cat = None
    target_cat = None
    
    for cat in config.categories:
        if cat['name'] == source_name:
            source_cat = cat
        elif cat['name'] == target_name:
            target_cat = cat
    
    if source_cat and target_cat:
        # 删除source category
        config.categories = [c for c in config.categories if c['name'] != source_name]
        save_config(config)
        return (source_cat['id'], target_cat['id'])
    
    return (None, None)

def is_valid_category(config: Config, name: str) -> bool:
    """检查category名称是否有效"""
    return any(cat['name'] == name for cat in config.categories)
