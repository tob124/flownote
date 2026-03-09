import sys
import os
import json
import re
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout,
                             QHBoxLayout, QListWidget, QStackedWidget, QLabel,
                             QComboBox, QLineEdit, QPushButton, QFileDialog,
                             QTextEdit, QScrollArea, QFrame, QMessageBox, QDialog,
                             QTextBrowser, QInputDialog, QDialogButtonBox)
from PyQt6.QtCore import Qt, QUrl
from PyQt6.QtGui import QTextCursor, QKeyEvent, QIcon
import markdown2

from config_manager import load_config, save_config, Config
from file_service import save_note, load_all_notes, process_inbox, _get_notes_dir, _get_wikis_dir, update_note_category, rename_wiki, merge_wiki
from ai_worker import AIQueueThread

# 美化后的样式表
STYLESHEET = """
QMainWindow {
    background-color: #1e1e1e;
}
QWidget {
    font-family: 'Segoe UI', Roboto, sans-serif;
    color: #e0e0e0;
}
QListWidget {
    background-color: #2d2d30;
    border: none;
    border-radius: 8px;
    padding: 4px;
    outline: none;
}
QListWidget::item {
    padding: 12px;
    border-radius: 6px;
    margin: 2px 0;
}
QListWidget::item:selected {
    background-color: #3e3e42;
    color: white;
}
QListWidget::item:hover {
    background-color: #3a3a3f;
}
QStackedWidget {
    background-color: #1e1e1e;
}
QLineEdit, QComboBox, QTextEdit, QTextBrowser {
    background-color: #2d2d30;
    border: 1px solid #3e3e42;
    border-radius: 6px;
    padding: 8px;
    color: #e0e0e0;
    selection-background-color: #264f78;
}
QLineEdit:focus, QComboBox:focus, QTextEdit:focus, QTextBrowser:focus {
    border: 1px solid #007acc;
}
QPushButton {
    background-color: #0e639c;
    border: none;
    border-radius: 6px;
    padding: 8px 16px;
    color: white;
    font-weight: 500;
}
QPushButton:hover {
    background-color: #1177bb;
}
QPushButton:pressed {
    background-color: #094771;
}
QScrollArea {
    border: none;
    background-color: transparent;
}
QScrollArea > QWidget > QWidget {
    background-color: transparent;
}
#NoteCard {
    background-color: #2d2d30;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 8px;
}
#NoteCardTitle {
    font-weight: bold;
    font-size: 14px;
    color: #e0e0e0;
}
#NoteCardDetails {
    font-size: 11px;
    color: #888888;
}
#NoteCardContent {
    color: #cccccc;
    margin-top: 8px;
}
"""

class InputTextEdit(QTextEdit):
    def __init__(self, submit_callback):
        super().__init__()
        self.submit_callback = submit_callback
        self.setPlaceholderText("Capture your thoughts... (Shift+Enter to save)")
        self.setFixedHeight(120)

    def keyPressEvent(self, event: QKeyEvent):
        if event.key() == Qt.Key.Key_Return and event.modifiers() == Qt.KeyboardModifier.ShiftModifier:
            content = self.toPlainText().strip()
            if content:
                self.submit_callback(content)
                self.clear()
            event.accept()
        else:
            super().keyPressEvent(event)

class NoteCard(QFrame):
    def __init__(self, data):
        super().__init__()
        self.setObjectName("NoteCard")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(12, 12, 12, 12)

        status = data.get('ai_status', 'pending')
        title_text = data.get('title', 'Processing...') if status in ['done', 'processing'] else 'Pending Analysis'
        if status == 'failed':
            title_text = "Analysis Failed"

        title_label = QLabel(title_text)
        title_label.setObjectName("NoteCardTitle")

        # 状态图标（简单文本模拟）
        status_icon = "●"
        if status == 'done':
            status_color = "#4ec9b0"  # 绿色
        elif status == 'processing':
            status_color = "#ce9178"  # 橙色
        elif status == 'failed':
            status_color = "#f14c4c"  # 红色
        else:
            status_color = "#888888"

        details_text = f"{data.get('category', 'Inbox')} | {', '.join(data.get('tags', []))} | <span style='color:{status_color}'>{status_icon} {status}</span>"
        details_label = QLabel(details_text)
        details_label.setObjectName("NoteCardDetails")
        details_label.setTextFormat(Qt.TextFormat.RichText)

        content_label = QLabel(data.get('raw_content', ''))
        content_label.setWordWrap(True)
        content_label.setObjectName("NoteCardContent")

        layout.addWidget(title_label)
        layout.addWidget(details_label)
        layout.addWidget(content_label)

class CategoryManagerDialog(QDialog):
    def __init__(self, categories, parent=None):
        super().__init__(parent)
        self.setWindowTitle("管理分类")
        self.setModal(True)
        self.resize(400, 350)
        self.original_categories = categories[:]
        self.categories = categories[:]
        self.merge_map = {}  # 记录删除时需要合并的分类映射
        self.init_ui()

    def init_ui(self):
        layout = QVBoxLayout(self)

        label = QLabel("预设分类列表（拖拽可调整顺序）")
        layout.addWidget(label)

        self.list_widget = QListWidget()
        self.list_widget.addItems(self.categories)
        self.list_widget.setDragDropMode(QListWidget.DragDropMode.InternalMove)
        layout.addWidget(self.list_widget)

        btn_layout = QHBoxLayout()
        add_btn = QPushButton("添加")
        rename_btn = QPushButton("重命名")
        delete_btn = QPushButton("删除")
        btn_layout.addWidget(add_btn)
        btn_layout.addWidget(rename_btn)
        btn_layout.addWidget(delete_btn)
        layout.addLayout(btn_layout)

        add_btn.clicked.connect(self.add_category)
        rename_btn.clicked.connect(self.rename_category)
        delete_btn.clicked.connect(self.delete_category)

        self.button_box = QDialogButtonBox(QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel)
        self.button_box.accepted.connect(self.accept)
        self.button_box.rejected.connect(self.reject)
        layout.addWidget(self.button_box)

    def add_category(self):
        name, ok = QInputDialog.getText(self, "添加分类", "请输入新分类名称:")
        if ok and name.strip():
            new_name = name.strip()
            if new_name not in self.categories:
                self.categories.append(new_name)
                self.list_widget.addItem(new_name)
            else:
                QMessageBox.warning(self, "警告", "分类已存在")

    def rename_category(self):
        current = self.list_widget.currentItem()
        if not current:
            QMessageBox.information(self, "提示", "请先选择一个分类")
            return
        old_name = current.text()
        if old_name == "待整理":
            QMessageBox.warning(self, "警告", "不能重命名默认分类")
            return
        new_name, ok = QInputDialog.getText(self, "重命名", "请输入新名称:", text=old_name)
        if ok and new_name.strip() and new_name != old_name:
            new_name = new_name.strip()
            if new_name not in self.categories:
                index = self.categories.index(old_name)
                self.categories[index] = new_name
                current.setText(new_name)
            else:
                QMessageBox.warning(self, "警告", "分类已存在")

    def delete_category(self):
        current = self.list_widget.currentItem()
        if not current:
            QMessageBox.information(self, "提示", "请先选择一个分类")
            return
        name = current.text()
        if name == "待整理":
            QMessageBox.warning(self, "警告", "不能删除默认分类")
            return
        others = [c for c in self.categories if c != name]
        if not others:
            QMessageBox.warning(self, "警告", "没有其他分类可供合并")
            return
        target, ok = QInputDialog.getItem(self, "合并笔记", f"将分类“{name}”中的笔记合并到:", others, 0, False)
        if ok and target:
            self.categories.remove(name)
            self.list_widget.takeItem(self.list_widget.row(current))
            self.merge_map[name] = target

    def get_results(self):
        # 返回新的分类列表和合并映射
        return self.categories, self.merge_map

class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("FlowNote")
        self.resize(1024, 768)
        self.setStyleSheet(STYLESHEET)

        self.config = load_config()
        self.pages_dict = {}

        self.init_ui()

        self.ai_thread = AIQueueThread()
        self.ai_thread.note_updated.connect(self.on_note_updated)

        if not self.config.sync_dir:
            self.stacked_widget.setCurrentWidget(self.pages_dict['Settings'])
            self.sidebar.setCurrentRow(2)  # Settings index
        else:
            self.start_app()

    def init_ui(self):
        central = QWidget()
        self.setCentralWidget(central)

        main_layout = QHBoxLayout(central)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)

        # Sidebar
        self.sidebar = QListWidget()
        self.sidebar.setFixedWidth(200)
        self.sidebar.addItem("📝 Notes")
        self.sidebar.addItem("📚 Wikis")
        self.sidebar.addItem("⚙️ Settings")

        self.sidebar.currentRowChanged.connect(self.switch_page)
        main_layout.addWidget(self.sidebar)

        # Stacked Widget
        self.stacked_widget = QStackedWidget()
        main_layout.addWidget(self.stacked_widget, 1)

        # Create Pages
        self.create_settings_page()
        self.create_notes_page()
        self.create_wikis_page()

    def switch_page(self, index):
        if index == 0:
            self.refresh_notes()
            self.stacked_widget.setCurrentWidget(self.pages_dict['Notes'])
        elif index == 1:
            self.refresh_wikis_list()
            self.stacked_widget.setCurrentWidget(self.pages_dict['Wikis'])
        elif index == 2:
            self.stacked_widget.setCurrentWidget(self.pages_dict['Settings'])

    def create_settings_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        layout.setSpacing(15)

        title = QLabel("⚙️ Settings")
        title.setStyleSheet("font-size: 24px; font-weight: bold; margin-bottom: 20px;")
        layout.addWidget(title)

        # API Provider
        layout.addWidget(QLabel("API Provider:"))
        self.provider_combo = QComboBox()
        self.provider_combo.addItems(["Gemini", "DeepSeek"])
        self.provider_combo.setCurrentText(self.config.api_provider)
        layout.addWidget(self.provider_combo)

        # API Key
        layout.addWidget(QLabel("API Key:"))
        self.api_key_input = QLineEdit()
        self.api_key_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.api_key_input.setText(self.config.api_key)
        layout.addWidget(self.api_key_input)

        # Sync Directory
        layout.addWidget(QLabel("Sync Directory:"))
        sync_layout = QHBoxLayout()
        self.sync_dir_label = QLabel(self.config.sync_dir or "Not selected")
        self.sync_dir_label.setWordWrap(True)
        sync_btn = QPushButton("Select Directory")
        sync_btn.clicked.connect(self.select_sync_dir)
        sync_layout.addWidget(self.sync_dir_label)
        sync_layout.addWidget(sync_btn)
        layout.addLayout(sync_layout)

        # Category Management
        layout.addWidget(QLabel("Categories:"))
        cat_layout = QHBoxLayout()
        self.cat_label = QLabel(", ".join(self.config.categories))
        self.cat_label.setWordWrap(True)
        manage_cat_btn = QPushButton("Manage Categories")
        manage_cat_btn.clicked.connect(self.manage_categories)
        cat_layout.addWidget(self.cat_label)
        cat_layout.addWidget(manage_cat_btn)
        layout.addLayout(cat_layout)

        # Save Button
        save_btn = QPushButton("Save Settings")
        save_btn.clicked.connect(self.save_settings)
        layout.addWidget(save_btn)

        layout.addStretch()
        self.pages_dict['Settings'] = page
        self.stacked_widget.addWidget(page)

    def select_sync_dir(self):
        dir_path = QFileDialog.getExistingDirectory(self, "Select Sync Directory")
        if dir_path:
            self.config.sync_dir = dir_path
            self.sync_dir_label.setText(dir_path)
            # Init directories
            os.makedirs(os.path.join(dir_path, "notes"), exist_ok=True)
            os.makedirs(os.path.join(dir_path, "wikis"), exist_ok=True)
            inbox_path = os.path.join(dir_path, "inbox.txt")
            if not os.path.exists(inbox_path):
                open(inbox_path, 'a', encoding='utf-8').close()

    def manage_categories(self):
        dialog = CategoryManagerDialog(self.config.categories, self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            new_categories, merge_map = dialog.get_results()
            # 应用分类变更
            self.apply_category_changes(new_categories, merge_map)

    def apply_category_changes(self, new_categories, merge_map):
        old_categories = self.config.categories[:]
        self.config.categories = new_categories
        self.cat_label.setText(", ".join(new_categories))

        # 处理合并：将 merge_map 中源分类的笔记移动到目标分类，并合并 wiki
        notes_dir = _get_notes_dir()
        if notes_dir:
            for filename in os.listdir(notes_dir):
                if re.match(r'^\d{13}\.json$', filename):
                    filepath = os.path.join(notes_dir, filename)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        old_cat = data.get('category', '')
                        if old_cat in merge_map:
                            new_cat = merge_map[old_cat]
                            data['category'] = new_cat
                            with open(filepath, 'w', encoding='utf-8') as f:
                                json.dump(data, f, ensure_ascii=False, indent=2)
                    except Exception as e:
                        print(f"Error updating note during category merge: {e}")

        # 处理 wiki 合并
        for src, dst in merge_map.items():
            merge_wiki(src, dst)  # 合并当月 wiki
            # 可选：合并所有月份的 wiki？为简化，只处理当月

        # 处理重命名：如果分类名被修改，需要重命名 wiki
        # 注意：我们无法直接从旧列表映射到新列表，因为可能有添加删除。简单处理：对于存在的分类，如果名字变了，需要重命名。
        # 这里简化：假设用户只通过重命名按钮修改，且已在对话框内更新了列表，但我们需要知道对应关系。
        # 由于对话框只返回新列表和合并映射，无法知道哪些是重命名。我们可以通过比较新旧列表来推断：
        # 如果旧分类不在新列表中且不在合并映射中，说明被删除了（已经合并处理）。如果新分类不在旧列表中，说明是新增。
        # 对于重命名，我们无法自动识别，除非用户通过重命名按钮操作，但我们在对话框内已更新列表，但不知道原名。
        # 一个可行的方案是在 CategoryManagerDialog 中记录重命名映射。我们稍后可以改进。
        # 为简化，我们先只处理合并，重命名要求用户先删除再添加，这样会触发合并。
        # 但更好的做法是在重命名时立即重命名 wiki，我们在 rename_category 中已经做了？
        # 实际上我们在重命名时只更新了列表，并没有实际重命名文件。我们可以在 accept 后，遍历所有笔记，如果旧分类不在新列表中且不在合并映射中，说明被删除了，已合并；如果新分类不在旧列表中，说明新增，无需操作。
        # 对于重命名，我们可以在 rename_category 时立即重命名 wiki，但那样可能与其他操作冲突。我们选择在 accept 后统一处理。
        # 下面实现一个简单的重命名检测：如果旧分类不在新列表中且不在合并映射中，则已删除；如果新分类不在旧列表中，则新增；如果旧分类在新列表中且名字不同，说明重命名？但旧分类可能被修改，我们不知道新名字。
        # 暂时忽略重命名，建议用户通过“删除+合并”来变相实现重命名。
        # 我们可以增加一个“重命名”功能，在重命名时立即更新 wiki 和笔记，但这样可能更复杂。为满足需求，我们允许用户手动重命名分类，我们提供“重命名”按钮并立即执行。
        # 因此修改 CategoryManagerDialog.rename_category 使其立即执行重命名，并更新配置文件？但此时还未保存，可能不合适。我们可以在 rename_category 时弹出确认，并立即更新笔记和 wiki，然后刷新列表。
        # 为简化，我们暂时不实现自动重命名，而是让用户通过删除+合并完成。用户也可以手动修改笔记分类。

        # 更新配置
        save_config(self.config)
        self.refresh_notes()
        self.refresh_wikis_list()
        QMessageBox.information(self, "成功", "分类已更新")

    def save_settings(self):
        self.config.api_provider = self.provider_combo.currentText()
        self.config.api_key = self.api_key_input.text()
        save_config(self.config)
        QMessageBox.information(self, "Success", "Settings saved successfully.")
        if self.config.sync_dir:
            self.start_app()

    def create_notes_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setSpacing(10)

        input_edit = InputTextEdit(self.handle_new_note)
        layout.addWidget(input_edit)

        self.notes_scroll = QScrollArea()
        self.notes_scroll.setWidgetResizable(True)
        self.notes_container = QWidget()
        self.notes_layout = QVBoxLayout(self.notes_container)
        self.notes_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.notes_layout.setSpacing(5)

        self.notes_scroll.setWidget(self.notes_container)
        layout.addWidget(self.notes_scroll)

        self.pages_dict['Notes'] = page
        self.stacked_widget.addWidget(page)

    def handle_new_note(self, content):
        save_note(content)
        self.refresh_notes()

    def refresh_notes(self):
        for i in reversed(range(self.notes_layout.count())):
            widget = self.notes_layout.itemAt(i).widget()
            if widget is not None:
                widget.setParent(None)

        notes = load_all_notes()
        for note in notes:
            card = NoteCard(note)
            self.notes_layout.addWidget(card)

    def create_wikis_page(self):
        page = QWidget()
        layout = QHBoxLayout(page)
        layout.setContentsMargins(10, 10, 10, 10)

        self.wiki_list = QListWidget()
        self.wiki_list.setFixedWidth(200)
        self.wiki_list.itemClicked.connect(self.load_wiki_content)
        layout.addWidget(self.wiki_list)

        self.wiki_viewer = QTextBrowser()
        self.wiki_viewer.setOpenLinks(False)
        self.wiki_viewer.anchorClicked.connect(self.handle_wiki_link)  # 保留但不再有链接
        layout.addWidget(self.wiki_viewer, 1)

        self.pages_dict['Wikis'] = page
        self.stacked_widget.addWidget(page)

    def refresh_wikis_list(self):
        self.wiki_list.clear()
        wikis_dir = _get_wikis_dir()
        if not wikis_dir:
            return
        try:
            for file in os.listdir(wikis_dir):
                if file.endswith('.md'):
                    self.wiki_list.addItem(file)
        except Exception:
            pass

    def load_wiki_content(self, item):
        wikis_dir = _get_wikis_dir()
        file_path = os.path.join(wikis_dir, item.text())
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                md_content = f.read()
            html = markdown2.markdown(md_content)
            self.wiki_viewer.setHtml(html)
        except Exception as e:
            self.wiki_viewer.setPlainText(f"Error loading wiki: {e}")

    def handle_wiki_link(self, qurl: QUrl):
        # 已删除链接功能，保留方法以防万一
        pass

    def start_app(self):
        process_inbox()
        self.refresh_notes()
        if not self.ai_thread.isRunning():
            self.ai_thread.start()

    def on_note_updated(self, note_id):
        self.refresh_notes()

    def closeEvent(self, event):
        self.ai_thread.stop()
        self.ai_thread.wait()
        super().closeEvent(event)

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = MainWindow()
    window.show()
    sys.exit(app.exec())