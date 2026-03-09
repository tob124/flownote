# -*- coding: utf-8 -*-
"""FlowNote 主窗口：左侧导航 + QStackedWidget，未配置 sync_dir 时强制 Settings。"""

import os
import sys

from PyQt6.QtWidgets import (
    QApplication,
    QFileDialog,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QPushButton,
    QStackedWidget,
    QWidget,
    QComboBox,
    QVBoxLayout,
    QHBoxLayout,
    QFrame,
    QScrollArea,
    QTextEdit,
    QGroupBox,
    QTextBrowser,
    QLineEdit,
)
from PyQt6.QtCore import Qt, QThread, pyqtSignal

import config_manager
from file_service import ensure_sync_dir_structure, save_note, load_all_notes, process_inbox
from ai_worker import AIQueueThread


def _resource_path(relative_path):
    """开发时用脚本目录，打包后用 PyInstaller 的 _MEIPASS。"""
    if getattr(sys, "frozen", False):
        base = sys._MEIPASS
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, relative_path)


def load_stylesheet():
    path = _resource_path("style.qss")
    if os.path.isfile(path):
        with open(path, "r", encoding="utf-8") as f:
            return f.read()
    return ""


class InboxProcessThread(QThread):
    finished_signal = pyqtSignal()

    def __init__(self, sync_dir):
        super().__init__()
        self.sync_dir = sync_dir

    def run(self):
        if self.sync_dir:
            process_inbox(self.sync_dir)
        self.finished_signal.emit()


class NoteCard(QFrame):
    def __init__(self, note_data, parent=None):
        super().__init__(parent)
        self.note_data = note_data
        self.setObjectName("noteCard")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)

        self.content_edit = QTextEdit()
        self.content_edit.setPlaceholderText("内容...")
        self.content_edit.setMaximumHeight(120)
        raw = note_data.get("raw_content", "")
        self.content_edit.setPlainText(raw)
        self.content_edit.setReadOnly(note_data.get("ai_status") == "done")
        layout.addWidget(self.content_edit)

        meta = QLabel()
        created = note_data.get("created_at", "")
        category = note_data.get("category", "Inbox")
        tags = note_data.get("tags", [])
        tags_str = ", ".join(tags) if isinstance(tags, list) else str(tags)
        status = note_data.get("ai_status", "pending")
        icon = "✅" if status == "done" else "⏳"
        meta.setText(f"🕐 {created}  |  {category}  |  #{tags_str}  {icon}")
        meta.setStyleSheet("color: #888; font-size: 12px;")
        layout.addWidget(meta)

        self.save_btn = QPushButton("保存")
        self.save_btn.setMaximumWidth(80)
        layout.addWidget(self.save_btn)


class NotesPage(QWidget):
    def __init__(self, filter_inbox_only=False, parent=None):
        super().__init__(parent)
        self.filter_inbox_only = filter_inbox_only
        self.sync_dir = ""
        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 24, 24, 24)

        self.input_edit = QTextEdit()
        self.input_edit.setPlaceholderText("输入笔记，Shift+Enter 提交...")
        self.input_edit.setMaximumHeight(80)
        self.input_edit.setFrameShape(QFrame.Shape.NoFrame)
        layout.addWidget(self.input_edit)
        self.input_edit.keyPressEvent = self._wrap_key_press(self.input_edit.keyPressEvent)

        self.cards_scroll = QScrollArea()
        self.cards_scroll.setWidgetResizable(True)
        self.cards_widget = QWidget()
        self.cards_layout = QVBoxLayout(self.cards_widget)
        self.cards_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.cards_scroll.setWidget(self.cards_widget)
        layout.addWidget(self.cards_scroll)

    def _wrap_key_press(self, base_key_press):
        def key_press(event):
            if event.key() == Qt.Key.Key_Return and event.modifiers() & Qt.KeyboardModifier.ShiftModifier:
                self._submit_note()
                return
            base_key_press(event)
        return key_press

    def _submit_note(self):
        text = self.input_edit.toPlainText().strip()
        if not text or not self.sync_dir:
            return
        save_note(self.sync_dir, text)
        self.input_edit.clear()
        self.refresh_cards()

    def set_sync_dir(self, sync_dir):
        self.sync_dir = sync_dir

    def refresh_cards(self):
        for i in reversed(range(self.cards_layout.count())):
            w = self.cards_layout.takeAt(i).widget()
            if w:
                w.deleteLater()
        if not self.sync_dir:
            return
        notes = load_all_notes(self.sync_dir)
        if self.filter_inbox_only:
            notes = [n for n in notes if n.get("category") == "Inbox"]
        for nd in notes:
            card = NoteCard(nd)
            card.save_btn.clicked.connect(lambda checked=False, c=card: self._save_card(c))
            self.cards_layout.addWidget(card)

    def _save_card(self, card):
        if not self.sync_dir:
            return
        import json
        path = os.path.join(self.sync_dir, "notes", card.note_data.get("id", "") + ".json")
        if not os.path.isfile(path):
            return
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            data["raw_content"] = card.content_edit.toPlainText()
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            print(f"[save card] {e}")
        self.refresh_cards()


class WikisPage(QWidget):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.sync_dir = ""
        layout = QHBoxLayout(self)
        layout.setContentsMargins(24, 24, 24, 24)

        self.file_list = QListWidget()
        self.file_list.setMaximumWidth(220)
        layout.addWidget(self.file_list)
        self.file_list.currentTextChanged.connect(self._on_file_selected)

        self.browser = QTextBrowser()
        self.browser.setOpenExternalLinks(True)
        layout.addWidget(self.browser)

    def set_sync_dir(self, sync_dir):
        self.sync_dir = sync_dir
        self._refresh_list()

    def _refresh_list(self):
        self.file_list.clear()
        if not self.sync_dir:
            return
        wikis_dir = os.path.join(self.sync_dir, "wikis")
        if not os.path.isdir(wikis_dir):
            return
        try:
            files = sorted([f for f in os.listdir(wikis_dir) if f.endswith(".md")])
            for f in files:
                self.file_list.addItem(f)
        except Exception as e:
            print(f"[wikis list] {e}")

    def _on_file_selected(self, name):
        if not name or not self.sync_dir:
            return
        path = os.path.join(self.sync_dir, "wikis", name)
        if not os.path.isfile(path):
            return
        try:
            with open(path, "r", encoding="utf-8") as f:
                md = f.read()
        except Exception as e:
            self.browser.setHtml(f"<p style='color:#888'>读取失败: {e}</p>")
            return
        try:
            import markdown
            html = markdown.markdown(md, extensions=["extra"])
        except Exception:
            html = md.replace("\n", "<br>")
        style = """
        <style>
        body { background: #191919; color: #D4D4D4; font-family: sans-serif; padding: 16px; line-height: 1.6; }
        h1,h2,h3 { color: #e0e0e0; }
        pre { background: #252525; padding: 12px; border-radius: 6px; overflow-x: auto; }
        code { background: #252525; padding: 2px 6px; border-radius: 4px; }
        ul,ol { margin: 0.5em 0; }
        </style>
        """
        self.browser.setHtml(style + "<body>" + html + "</body>")


class SettingsPage(QWidget):
    sync_dir_changed = pyqtSignal(str)
    config_saved = pyqtSignal()

    def __init__(self, parent=None):
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 24, 24, 24)

        api_group = QGroupBox("API 设置")
        api_layout = QVBoxLayout(api_group)
        api_layout.addWidget(QLabel("Provider"))
        self.provider_combo = QComboBox()
        self.provider_combo.addItems(["Gemini", "DeepSeek"])
        api_layout.addWidget(self.provider_combo)
        api_layout.addWidget(QLabel("API Key"))
        self.api_key_edit = QLineEdit()
        self.api_key_edit.setEchoMode(QLineEdit.EchoMode.Password)
        api_layout.addWidget(self.api_key_edit)
        layout.addWidget(api_group)

        dir_group = QGroupBox("同步目录")
        dir_layout = QVBoxLayout(dir_group)
        self.sync_dir_label = QLabel("未选择")
        self.sync_dir_label.setStyleSheet("color: #888;")
        dir_layout.addWidget(self.sync_dir_label)
        self.choose_dir_btn = QPushButton("选择同步目录")
        self.choose_dir_btn.clicked.connect(self._choose_sync_dir)
        dir_layout.addWidget(self.choose_dir_btn)
        layout.addWidget(dir_group)

        cat_group = QGroupBox("分类管理 (Category Management)")
        cat_layout = QVBoxLayout(cat_group)
        self.cat_list = QListWidget()
        self.cat_list.setMaximumHeight(120)
        cat_layout.addWidget(self.cat_list)

        cat_btn_layout = QHBoxLayout()
        self.new_cat_edit = QLineEdit()
        self.new_cat_edit.setPlaceholderText("新分类名称")
        self.new_cat_edit.setMaximumWidth(160)
        cat_btn_layout.addWidget(self.new_cat_edit)
        self.new_cat_btn = QPushButton("新建分类")
        self.new_cat_btn.clicked.connect(self._add_category)
        cat_btn_layout.addWidget(self.new_cat_btn)
        cat_layout.addLayout(cat_btn_layout)

        merge_layout = QHBoxLayout()
        self.merge_a_combo = QComboBox()
        self.merge_a_combo.setMinimumWidth(100)
        merge_layout.addWidget(self.merge_a_combo)
        merge_layout.addWidget(QLabel("→"))
        self.merge_b_combo = QComboBox()
        self.merge_b_combo.setMinimumWidth(100)
        merge_layout.addWidget(self.merge_b_combo)
        self.merge_btn = QPushButton("合并 A→B")
        self.merge_btn.clicked.connect(self._merge_category)
        merge_layout.addWidget(self.merge_btn)
        cat_layout.addLayout(merge_layout)

        self.del_cat_btn = QPushButton("删除选中分类")
        self.del_cat_btn.clicked.connect(self._delete_category)
        cat_layout.addWidget(self.del_cat_btn)

        layout.addWidget(cat_group)

        self.save_cfg_btn = QPushButton("保存配置")
        self.save_cfg_btn.clicked.connect(self._save_config)
        layout.addWidget(self.save_cfg_btn)
        layout.addStretch()

    def _choose_sync_dir(self):
        d = QFileDialog.getExistingDirectory(self, "选择同步目录")
        if not d:
            return
        ensure_sync_dir_structure(d)
        self.sync_dir_label.setText(d)
        cfg = config_manager.load_config()
        cfg["sync_dir"] = d
        config_manager.save_config(cfg)
        self.sync_dir_changed.emit(d)

    def _save_config(self):
        cfg = config_manager.load_config()
        cfg["api_provider"] = self.provider_combo.currentText()
        cfg["api_key"] = self.api_key_edit.text()
        if self.sync_dir_label.text() and self.sync_dir_label.text() != "未选择":
            cfg["sync_dir"] = self.sync_dir_label.text()
        config_manager.save_config(cfg)
        self.config_saved.emit()

    def load_config_into_ui(self):
        cfg = config_manager.load_config()
        self.provider_combo.setCurrentText(cfg.get("api_provider", "Gemini"))
        self.api_key_edit.setText(cfg.get("api_key", ""))
        sd = cfg.get("sync_dir", "")
        self.sync_dir_label.setText(sd if sd else "未选择")
        self._refresh_categories()

    def _refresh_categories(self):
        self.cat_list.clear()
        self.merge_a_combo.clear()
        self.merge_b_combo.clear()
        cfg = config_manager.load_config()
        cats = cfg.get("categories", [])
        for c in cats:
            self.cat_list.addItem(c)
            self.merge_a_combo.addItem(c)
            self.merge_b_combo.addItem(c)

    def _add_category(self):
        name = self.new_cat_edit.text().strip()
        if not name:
            return
        cfg = config_manager.load_config()
        cats = cfg.get("categories", [])
        if name in cats:
            return
        cats.append(name)
        cfg["categories"] = cats
        config_manager.save_config(cfg)
        self.new_cat_edit.clear()
        self._refresh_categories()
        self.config_saved.emit()

    def _delete_category(self):
        row = self.cat_list.currentRow()
        if row < 0:
            return
        cfg = config_manager.load_config()
        cats = cfg.get("categories", [])
        if row >= len(cats):
            return
        to_remove = cats[row]
        if to_remove == "Inbox":
            return
        cats = [c for c in cats if c != to_remove]
        cfg["categories"] = cats
        config_manager.save_config(cfg)
        sync_dir = cfg.get("sync_dir", "")
        if sync_dir and os.path.isdir(sync_dir):
            from file_service import migrate_notes_category
            migrate_notes_category(sync_dir, to_remove, "Inbox")
        self._refresh_categories()
        self.config_saved.emit()

    def _merge_category(self):
        a = self.merge_a_combo.currentText()
        b = self.merge_b_combo.currentText()
        if not a or not b or a == b:
            return
        cfg = config_manager.load_config()
        if a not in cfg.get("categories", []) or b not in cfg.get("categories", []):
            return
        sync_dir = cfg.get("sync_dir", "")
        if sync_dir:
            from file_service import merge_categories
            merge_categories(sync_dir, a, b)
        cats = [c for c in cfg.get("categories", []) if c != a]
        cfg["categories"] = cats
        config_manager.save_config(cfg)
        self._refresh_categories()
        self.config_saved.emit()

    def set_sync_dir_display(self, path):
        self.sync_dir_label.setText(path if path else "未选择")


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("FlowNote")
        self.setMinimumSize(900, 600)
        self.resize(1000, 700)

        cfg = config_manager.load_config()
        self.sync_dir = cfg.get("sync_dir", "")

        central = QWidget()
        self.setCentralWidget(central)
        main_layout = QHBoxLayout(central)
        main_layout.setContentsMargins(0, 0, 0, 0)

        self.nav_list = QListWidget()
        self.nav_list.setObjectName("navList")
        self.nav_list.setMaximumWidth(180)
        for label in ["Inbox", "All Notes", "Wikis", "Settings"]:
            self.nav_list.addItem(QListWidgetItem(label))
        self.nav_list.currentRowChanged.connect(self._on_nav_changed)
        main_layout.addWidget(self.nav_list)

        self.stack = QStackedWidget()
        self.notes_inbox = NotesPage(filter_inbox_only=True)
        self.notes_all = NotesPage(filter_inbox_only=False)
        self.wikis_page = WikisPage()
        self.settings_page = SettingsPage()

        self.stack.addWidget(self.notes_inbox)
        self.stack.addWidget(self.notes_all)
        self.stack.addWidget(self.wikis_page)
        self.stack.addWidget(self.settings_page)
        main_layout.addWidget(self.stack)

        self.settings_page.sync_dir_changed.connect(self._on_sync_dir_changed)
        self.settings_page.config_saved.connect(self._on_config_saved)
        self.settings_page.load_config_into_ui()

        if not self.sync_dir:
            self.nav_list.setCurrentRow(3)
            self.stack.setCurrentIndex(3)
        else:
            self._apply_sync_dir_to_pages()

        self.inbox_thread = None
        self.ai_thread = None
        self._start_inbox_then_ai()

        self._apply_sync_dir_to_pages()
        self.notes_inbox.refresh_cards()
        self.notes_all.refresh_cards()
        self.wikis_page._refresh_list()

    def _start_inbox_then_ai(self):
        def on_inbox_done():
            self.notes_inbox.refresh_cards()
            self.notes_all.refresh_cards()
            if self.sync_dir:
                self.ai_thread = AIQueueThread(self.sync_dir)
                self.ai_thread.note_updated.connect(self._on_note_updated)
                self.ai_thread.start()

        self.inbox_thread = InboxProcessThread(self.sync_dir)
        self.inbox_thread.finished_signal.connect(on_inbox_done)
        self.inbox_thread.start()

    def _on_note_updated(self):
        self.notes_inbox.refresh_cards()
        self.notes_all.refresh_cards()
        self.wikis_page._refresh_list()

    def _on_sync_dir_changed(self, path):
        self.sync_dir = path
        self.settings_page.set_sync_dir_display(path)
        self._apply_sync_dir_to_pages()
        self.notes_inbox.refresh_cards()
        self.notes_all.refresh_cards()
        self.wikis_page._refresh_list()

    def _on_config_saved(self):
        cfg = config_manager.load_config()
        self.sync_dir = cfg.get("sync_dir", "")
        self._apply_sync_dir_to_pages()

    def _apply_sync_dir_to_pages(self):
        self.notes_inbox.set_sync_dir(self.sync_dir)
        self.notes_all.set_sync_dir(self.sync_dir)
        self.wikis_page.set_sync_dir(self.sync_dir)

    def _on_nav_changed(self, row):
        if row >= 0:
            self.stack.setCurrentIndex(row)
            if row == 0:
                self.notes_inbox.refresh_cards()
            elif row == 1:
                self.notes_all.refresh_cards()
            elif row == 2:
                self.wikis_page._refresh_list()


def main():
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    app.setStyleSheet(load_stylesheet())
    w = MainWindow()
    w.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
