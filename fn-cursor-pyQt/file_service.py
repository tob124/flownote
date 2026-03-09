# -*- coding: utf-8 -*-
"""FlowNote 本地文件服务：笔记读写、Inbox 处理、分类迁移与合并。"""

import json
import os
import re
import logging

logger = logging.getLogger(__name__)

NOTE_PATTERN = re.compile(r"^\d{13}\.json$")


def ensure_sync_dir_structure(sync_dir):
    """在 sync_dir 下创建 notes、wikis 及空 inbox.txt。"""
    if not sync_dir:
        return
    try:
        notes_dir = os.path.join(sync_dir, "notes")
        wikis_dir = os.path.join(sync_dir, "wikis")
        os.makedirs(notes_dir, exist_ok=True)
        os.makedirs(wikis_dir, exist_ok=True)
        inbox_path = os.path.join(sync_dir, "inbox.txt")
        if not os.path.isfile(inbox_path):
            open(inbox_path, "w", encoding="utf-8").close()
    except Exception as e:
        logger.warning("ensure_sync_dir_structure failed: %s", e)


def save_note(sync_dir, content):
    """
    保存一条笔记：13 位时间戳 id，状态 pending，写入 sync_dir/notes/{id}.json。
    """
    if not sync_dir:
        return None
    import time
    from datetime import datetime
    ts = int(time.time() * 1000)
    note_id = str(ts)
    created_at = datetime.utcfromtimestamp(ts / 1000.0).strftime("%Y-%m-%d %H:%M")
    data = {
        "id": note_id,
        "raw_content": content,
        "created_at": created_at,
        "ai_status": "pending",
        "retry_count": 0,
        "title": "",
        "category": "Inbox",
        "tags": [],
    }
    notes_dir = os.path.join(sync_dir, "notes")
    path = os.path.join(notes_dir, note_id + ".json")
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return note_id
    except Exception as e:
        logger.warning("save_note failed: %s", e)
        return None


def load_all_notes(sync_dir):
    """
    遍历 sync_dir/notes，只读匹配 ^\\d{13}\\.json$ 的文件，按时间倒序返回列表。
    损坏的 JSON 打日志并跳过。
    """
    if not sync_dir:
        return []
    notes_dir = os.path.join(sync_dir, "notes")
    if not os.path.isdir(notes_dir):
        return []
    result = []
    try:
        files = [f for f in os.listdir(notes_dir) if NOTE_PATTERN.match(f)]
        for fn in files:
            path = os.path.join(notes_dir, fn)
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                data.setdefault("id", os.path.splitext(fn)[0])
                result.append(data)
            except Exception as e:
                logger.warning("skip corrupt note %s: %s", fn, e)
        result.sort(key=lambda x: x.get("id", "0"), reverse=True)
    except Exception as e:
        logger.warning("load_all_notes failed: %s", e)
    return result


def process_inbox(sync_dir):
    """
    Inbox 原子消化：rename(inbox.txt -> processing.txt) 抢占锁，
    写空 inbox.txt，按 \\n\\n 分割 processing.txt，每条 save_note，最后删除 processing.txt。
    必须在 QThread 或启动时调用，不阻塞主线程。
    """
    if not sync_dir:
        return
    inbox_path = os.path.join(sync_dir, "inbox.txt")
    processing_path = os.path.join(sync_dir, "processing.txt")
    try:
        os.rename(inbox_path, processing_path)
    except Exception as e:
        logger.debug("process_inbox rename failed (no lock): %s", e)
        return
    try:
        open(inbox_path, "w", encoding="utf-8").close()
        with open(processing_path, "r", encoding="utf-8") as f:
            text = f.read()
        blocks = [b.strip() for b in text.split("\n\n") if b.strip()]
        for block in blocks:
            save_note(sync_dir, block)
    except Exception as e:
        logger.warning("process_inbox read/save failed: %s", e)
    finally:
        try:
            if os.path.isfile(processing_path):
                os.remove(processing_path)
        except Exception as e:
            logger.warning("process_inbox remove processing failed: %s", e)


def _write_note_json(sync_dir, data):
    """将笔记 data 写回 sync_dir/notes/{id}.json。"""
    note_id = data.get("id")
    if not note_id or not sync_dir:
        return False
    path = os.path.join(sync_dir, "notes", note_id + ".json")
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return True
    except Exception as e:
        logger.warning("_write_note_json failed: %s", e)
        return False


def migrate_notes_category(sync_dir, from_category, to_category):
    """遍历 /notes，将 category == from_category 的笔记改为 to_category 并保存。"""
    notes_dir = os.path.join(sync_dir, "notes")
    if not os.path.isdir(notes_dir):
        return
    for fn in os.listdir(notes_dir):
        if not NOTE_PATTERN.match(fn):
            continue
        path = os.path.join(notes_dir, fn)
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("category") != from_category:
                continue
            data["category"] = to_category
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning("migrate_notes_category %s: %s", fn, e)


def merge_categories(sync_dir, category_a, category_b):
    """
    合并 A -> B：
    1) 笔记中 category==A 改为 B 并保存
    2) 同月 A_YYYY_MM.md 内容追加到 B_YYYY_MM.md，加分隔符，保存 B，删除 A 的 .md
    3) 调用方负责从 config 移除 A
    """
    migrate_notes_category(sync_dir, category_a, category_b)

    wikis_dir = os.path.join(sync_dir, "wikis")
    if not os.path.isdir(wikis_dir):
        return
    import datetime
    now = datetime.datetime.utcnow()
    suffix = now.strftime("%Y_%m") + ".md"
    prefix_a = category_a + "_"
    prefix_b = category_b + "_"

    for fn in os.listdir(wikis_dir):
        if not fn.startswith(prefix_a) or not fn.endswith(".md"):
            continue
        try:
            month = fn[len(prefix_a):]
            path_a = os.path.join(wikis_dir, fn)
            path_b = os.path.join(wikis_dir, prefix_b + month)
            with open(path_a, "r", encoding="utf-8") as f:
                content_a = f.read()
            content_b = ""
            if os.path.isfile(path_b):
                with open(path_b, "r", encoding="utf-8") as f:
                    content_b = f.read()
            sep = "\n\n---\n来自 {} 的合并\n\n".format(category_a)
            new_b = (content_b.rstrip() + sep + content_a) if content_b else content_a
            with open(path_b, "w", encoding="utf-8") as f:
                f.write(new_b)
            os.remove(path_a)
        except Exception as e:
            logger.warning("merge_categories wiki %s: %s", fn, e)


def read_note(sync_dir, note_id):
    """读取单条笔记 JSON，不存在或损坏返回 None。"""
    if not sync_dir or not note_id:
        return None
    path = os.path.join(sync_dir, "notes", note_id + ".json")
    if not os.path.isfile(path):
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning("read_note %s: %s", note_id, e)
        return None
