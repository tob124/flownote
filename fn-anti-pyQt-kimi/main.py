import sys
import os
import json
import re
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QHBoxLayout, QListWidget, QStackedWidget, QLabel,
                             QComboBox, QLineEdit, QPushButton, QFileDialog,
                             QTextEdit, QScrollArea, QFrame, QMessageBox, QDialog,
                             QTextBrowser, QGridLayout, QSplitter, QSizePolicy,
                             QDialogButtonBox, QListWidgetItem, QMenu)
from PyQt6.QtCore import Qt, QUrl, QSize
from PyQt6.QtGui import QTextCursor, QKeyEvent, QFont, QIcon, QAction
import markdown2

from config_manager import (load_config, save_config, Config, 
                            add_category, delete_category, merge_categories,
                            get_category_names, DEFAULT_CATEGORIES)
from file_service import (save_note, load_all_notes, process_inbox, 
                          _get_notes_dir, _get_wikis_dir, get_wiki_path,
                          init_category_wikis, batch_update_category,
                          batch_delete_category, delete_wiki, rename_wiki,
                          load_notes_by_category)
from ai_worker import AIQueueThread

# 现代化样式表 - 使用更柔和的配色
STYLESHEET = """
QMainWindow {
    background-color: #f5f5f7;
}
QWidget {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #1d1d1f;
}

/* 侧边栏样式 */
QListWidget#Sidebar {
    background-color: #ffffff;
    border: none;
    outline: none;
    padding: 8px;
}
QListWidget#Sidebar::item {
    padding: 12px 16px;
    border-radius: 8px;
    margin: 4px 0;
    font-size: 14px;
    color: #666666;
}
QListWidget#Sidebar::item:hover {
    background-color: #f0f0f2;
    color: #1d1d1f;
}
QListWidget#Sidebar::item:selected {
    background-color: #0071e3;
    color: #ffffff;
}

/* 卡片样式 */
QFrame#NoteCard {
    background-color: #ffffff;
    border-radius: 12px;
    border: 1px solid #e5e5e7;
}
QFrame#NoteCard:hover {
    border: 1px solid #0071e3;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

/* 输入框样式 */
QLineEdit, QComboBox, QTextEdit, QTextBrowser {
    background-color: #ffffff;
    border: 1px solid #d2d2d7;
    border-radius: 8px;
    padding: 10px 12px;
    color: #1d1d1f;
    font-size: 14px;
}
QLineEdit:focus, QComboBox:focus, QTextEdit:focus, QTextBrowser:focus {
    border: 2px solid #0071e3;
    outline: none;
}
QLineEdit::placeholder {
    color: #999999;
}

/* 按钮样式 */
QPushButton {
    background-color: #0071e3;
    border: none;
    border-radius: 8px;
    padding: 10px 20px;
    color: white;
    font-weight: 500;
    font-size: 14px;
}
QPushButton:hover {
    background-color: #0077ed;
}
QPushButton:pressed {
    background-color: #005bb5;
}
QPushButton:disabled {
    background-color: #d2d2d7;
    color: #999999;
}
QPushButton#SecondaryBtn {
    background-color: #f5f5f7;
    color: #0071e3;
    border: 1px solid #d2d2d7;
}
QPushButton#SecondaryBtn:hover {
    background-color: #e8e8ed;
}
QPushButton#DangerBtn {
    background-color: #ff3b30;
}
QPushButton#DangerBtn:hover {
    background-color: #ff453a;
}

/* 滚动区域样式 */
QScrollArea {
    border: none;
    background-color: transparent;
}
QScrollArea > QWidget > QWidget {
    background-color: transparent;
}

/* 标签样式 */
QLabel#PageTitle {
    font-size: 28px;
    font-weight: 700;
    color: #1d1d1f;
    margin-bottom: 8px;
}
QLabel#SectionTitle {
    font-size: 18px;
    font-weight: 600;
    color: #1d1d1f;
    margin-bottom: 4px;
}
QLabel#NoteCardTitle {
    font-weight: 600;
    font-size: 15px;
    color: #1d1d1f;
}
QLabel#NoteCardDetails {
    font-size: 12px;
    color: #86868b;
    margin-top: 4px;
}
QLabel#NoteCardContent {
    color: #1d1d1f;
    margin-top: 8px;
    font-size: 14px;
    line-height: 1.5;
}
QLabel#StatusBadge {
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 500;
}
QLabel#StatusBadge[status="done"] {
    background-color: #34c759;
    color: white;
}
QLabel#StatusBadge[status="pending"] {
    background-color: #ff9500;
    color: white;
}
QLabel#StatusBadge[status="processing"] {
    background-color: #0071e3;
    color: white;
}
QLabel#StatusBadge[status="failed"] {
    background-color: #ff3b30;
    color: white;
}

/* Category卡片样式 */
QFrame#CategoryCard {
    background-color: #ffffff;
    border-radius: 12px;
    border: 1px solid #e5e5e7;
    padding: 16px;
}
QFrame#CategoryCard:hover {
    border: 1px solid #0071e3;
}

/* Wiki列表样式 */
QListWidget#WikiList {
    background-color: #ffffff;
    border: 1px solid #e5e5e7;
    border-radius: 8px;
    padding: 8px;
}
QListWidget#WikiList::item {
    padding: 12px;
    border-radius: 6px;
    margin: 2px 0;
}
QListWidget#WikiList::item:selected {
    background-color: #0071e3;
    color: white;
}

/* 分隔线 */
QFrame#HLine {
    background-color: #e5e5e7;
    max-height: 1px;
}
"""

class InputTextEdit(QTextEdit):
    def __init__(self, submit_callback):
        super().__init__()
        self.submit_callback = submit_callback
        self.setPlaceholderText("记录你的想法... (Shift+Enter 保存)")
        self.setFixedHeight(100)
        self.setStyleSheet("""
            QTextEdit {
                background-color: #ffffff;
                border: 1px solid #d2d2d7;
                border-radius: 12px;
                padding: 16px;
                font-size: 15px;
                line-height: 1.5;
            }
            QTextEdit:focus {
                border: 2px solid #0071e3;
            }
        """)

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
        self.setFixedWidth(320)
        self.setMinimumHeight(150)
        
        layout = QVBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        layout.setSpacing(8)
        
        status = data.get('ai_status', 'pending')
        
        # 标题行
        title_layout = QHBoxLayout()
        title_text = data.get('title', '处理中...') if status in ['done', 'processing'] else '等待分析'
        if status == 'failed':
            title_text = "分析失败"
            
        title_label = QLabel(title_text)
        title_label.setObjectName("NoteCardTitle")
        title_label.setWordWrap(True)
        title_layout.addWidget(title_label, 1)
        
        # 状态标签
        status_label = QLabel(status.upper())
        status_label.setObjectName("StatusBadge")
        status_label.setProperty("status", status)
        status_label.setStyleSheet(f"""
            QLabel {{
                padding: 4px 10px;
                border-radius: 12px;
                font-size: 10px;
                font-weight: 600;
                background-color: {self._get_status_color(status)};
                color: white;
            }}
        """)
        title_layout.addWidget(status_label)
        layout.addLayout(title_layout)
        
        # 详情行
        category = data.get('category', 'Inbox')
        tags = ', '.join(data.get('tags', [])) if data.get('tags') else '无标签'
        details_text = f"📁 {category}  •  🏷️ {tags}"
        details_label = QLabel(details_text)
        details_label.setObjectName("NoteCardDetails")
        layout.addWidget(details_label)
        
        # 分隔线
        line = QFrame()
        line.setObjectName("HLine")
        line.setStyleSheet("background-color: #e5e5e7; max-height: 1px;")
        line.setFrameShape(QFrame.Shape.HLine)
        layout.addWidget(line)
        
        # 内容
        content_label = QLabel(data.get('raw_content', ''))
        content_label.setWordWrap(True)
        content_label.setObjectName("NoteCardContent")
        layout.addWidget(content_label)
        
        layout.addStretch()
    
    def _get_status_color(self, status):
        colors = {
            'done': '#34c759',
            'pending': '#ff9500',
            'processing': '#0071e3',
            'failed': '#ff3b30'
        }
        return colors.get(status, '#999999')


class CategoryCard(QFrame):
    """Category管理卡片"""
    def __init__(self, category_data, note_count, parent=None):
        super().__init__(parent)
        self.setObjectName("CategoryCard")
        self.category_data = category_data
        self.setFixedHeight(100)
        
        layout = QHBoxLayout(self)
        layout.setContentsMargins(16, 16, 16, 16)
        
        # 左侧信息
        info_layout = QVBoxLayout()
        
        name_label = QLabel(category_data['name'])
        name_label.setStyleSheet("font-size: 18px; font-weight: 600; color: #1d1d1f;")
        info_layout.addWidget(name_label)
        
        desc_label = QLabel(category_data.get('description', '暂无描述'))
        desc_label.setStyleSheet("font-size: 13px; color: #86868b;")
        info_layout.addWidget(desc_label)
        
        count_label = QLabel(f"{note_count} 条笔记")
        count_label.setStyleSheet("font-size: 12px; color: #0071e3;")
        info_layout.addWidget(count_label)
        
        layout.addLayout(info_layout, 1)
        
        # 右侧操作按钮
        btn_layout = QVBoxLayout()
        
        self.merge_btn = QPushButton("合并")
        self.merge_btn.setObjectName("SecondaryBtn")
        self.merge_btn.setFixedWidth(70)
        btn_layout.addWidget(self.merge_btn)
        
        self.delete_btn = QPushButton("删除")
        self.delete_btn.setObjectName("DangerBtn")
        self.delete_btn.setFixedWidth(70)
        btn_layout.addWidget(self.delete_btn)
        
        layout.addLayout(btn_layout)


class MergeCategoryDialog(QDialog):
    """合并Category对话框"""
    def __init__(self, source_category, all_categories, parent=None):
        super().__init__(parent)
        self.setWindowTitle("合并 Category")
        self.setFixedSize(400, 200)
        
        layout = QVBoxLayout(self)
        
        info_label = QLabel(f'将 "{source_category}" 合并到:')
        info_label.setStyleSheet("font-size: 14px; color: #1d1d1f;")
        layout.addWidget(info_label)
        
        self.target_combo = QComboBox()
        # 排除源category
        for cat in all_categories:
            if cat != source_category:
                self.target_combo.addItem(cat)
        layout.addWidget(self.target_combo)
        
        warning_label = QLabel("⚠️ 合并后，原category的所有笔记将归属到新category，且原category将被删除。")
        warning_label.setWordWrap(True)
        warning_label.setStyleSheet("color: #ff9500; font-size: 12px;")
        layout.addWidget(warning_label)
        
        layout.addStretch()
        
        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)
    
    def get_target(self):
        return self.target_combo.currentText()


class AddCategoryDialog(QDialog):
    """添加Category对话框"""
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("添加 Category")
        self.setFixedSize(400, 250)
        
        layout = QVBoxLayout(self)
        
        layout.addWidget(QLabel("名称:"))
        self.name_input = QLineEdit()
        self.name_input.setPlaceholderText("输入category名称")
        layout.addWidget(self.name_input)
        
        layout.addWidget(QLabel("描述:"))
        self.desc_input = QTextEdit()
        self.desc_input.setPlaceholderText("输入描述（可选）")
        self.desc_input.setFixedHeight(80)
        layout.addWidget(self.desc_input)
        
        layout.addStretch()
        
        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(self.accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)
    
    def get_data(self):
        return {
            'name': self.name_input.text().strip(),
            'description': self.desc_input.toPlainText().strip()
        }


class MainWindow(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("FlowNote - AI笔记")
        self.resize(1400, 900)
        self.setStyleSheet(STYLESHEET)
        
        self.config = load_config()
        self.pages_dict = {}
        self.current_filter = "全部"  # 笔记筛选
        
        self.init_ui()
        
        self.ai_thread = AIQueueThread()
        self.ai_thread.note_updated.connect(self.on_note_updated)
        
        if not self.config.sync_dir:
            self.stacked_widget.setCurrentWidget(self.pages_dict['Settings'])
            self.sidebar.setCurrentRow(3)
        else:
            # 初始化category wikis
            init_category_wikis()
            self.start_app()

    def init_ui(self):
        central = QWidget()
        self.setCentralWidget(central)
        
        main_layout = QHBoxLayout(central)
        main_layout.setContentsMargins(0, 0, 0, 0)
        main_layout.setSpacing(0)
        
        # 侧边栏
        self.sidebar = QListWidget()
        self.sidebar.setObjectName("Sidebar")
        self.sidebar.setFixedWidth(220)
        
        sidebar_items = [
            ("📝 笔记", "Notes"),
            ("📚 Wiki", "Wikis"),
            ("📂 Categories", "Categories"),
            ("⚙️ 设置", "Settings")
        ]
        
        for display_text, key in sidebar_items:
            item = QListWidgetItem(display_text)
            item.setData(Qt.ItemDataRole.UserRole, key)
            self.sidebar.addItem(item)
            
        self.sidebar.currentRowChanged.connect(self.switch_page)
        main_layout.addWidget(self.sidebar)
        
        # 主内容区域
        self.stacked_widget = QStackedWidget()
        self.stacked_widget.setStyleSheet("background-color: #f5f5f7;")
        main_layout.addWidget(self.stacked_widget, 1)
        
        # 创建页面
        self.create_settings_page()
        self.create_notes_page()
        self.create_wikis_page()
        self.create_categories_page()
        
    def switch_page(self, index):
        item = self.sidebar.item(index)
        if item:
            page_key = item.data(Qt.ItemDataRole.UserRole)
            if page_key == 'Notes':
                self.refresh_notes()
                self.stacked_widget.setCurrentWidget(self.pages_dict['Notes'])
            elif page_key == 'Wikis':
                self.refresh_wikis_list()
                self.stacked_widget.setCurrentWidget(self.pages_dict['Wikis'])
            elif page_key == 'Categories':
                self.refresh_categories()
                self.stacked_widget.setCurrentWidget(self.pages_dict['Categories'])
            elif page_key == 'Settings':
                self.stacked_widget.setCurrentWidget(self.pages_dict['Settings'])

    def create_settings_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(40, 40, 40, 40)
        layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        
        title = QLabel("设置")
        title.setObjectName("PageTitle")
        layout.addWidget(title)
        
        subtitle = QLabel("配置你的AI笔记应用")
        subtitle.setStyleSheet("font-size: 14px; color: #86868b; margin-bottom: 30px;")
        layout.addWidget(subtitle)
        
        # API设置卡片
        settings_card = QFrame()
        settings_card.setStyleSheet("""
            QFrame {
                background-color: #ffffff;
                border-radius: 16px;
                padding: 24px;
            }
        """)
        card_layout = QVBoxLayout(settings_card)
        
        # API Provider
        card_layout.addWidget(QLabel("API 提供商:"))
        self.provider_combo = QComboBox()
        self.provider_combo.addItems(["Gemini", "DeepSeek"])
        self.provider_combo.setCurrentText(self.config.api_provider)
        card_layout.addWidget(self.provider_combo)
        card_layout.addSpacing(16)
        
        # API Key
        card_layout.addWidget(QLabel("API Key:"))
        self.api_key_input = QLineEdit()
        self.api_key_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.api_key_input.setText(self.config.api_key)
        card_layout.addWidget(self.api_key_input)
        card_layout.addSpacing(16)
        
        # Sync Directory
        card_layout.addWidget(QLabel("同步目录:"))
        sync_layout = QHBoxLayout()
        self.sync_dir_label = QLabel(self.config.sync_dir or "未选择")
        self.sync_dir_label.setStyleSheet("color: #666666;")
        sync_btn = QPushButton("选择目录")
        sync_btn.setObjectName("SecondaryBtn")
        sync_btn.clicked.connect(self.select_sync_dir)
        sync_layout.addWidget(self.sync_dir_label, 1)
        sync_layout.addWidget(sync_btn)
        card_layout.addLayout(sync_layout)
        
        layout.addWidget(settings_card)
        layout.addSpacing(24)
        
        # 保存按钮
        save_btn = QPushButton("保存设置")
        save_btn.setFixedWidth(150)
        save_btn.clicked.connect(self.save_settings)
        layout.addWidget(save_btn, alignment=Qt.AlignmentFlag.AlignLeft)
        
        layout.addStretch()
        
        self.pages_dict['Settings'] = page
        self.stacked_widget.addWidget(page)
        
    def select_sync_dir(self):
        dir_path = QFileDialog.getExistingDirectory(self, "选择同步目录")
        if dir_path:
            self.config.sync_dir = dir_path
            self.sync_dir_label.setText(dir_path)
            
            # 初始化目录结构
            os.makedirs(os.path.join(dir_path, "notes"), exist_ok=True)
            os.makedirs(os.path.join(dir_path, "wikis"), exist_ok=True)
            inbox_path = os.path.join(dir_path, "inbox.txt")
            if not os.path.exists(inbox_path):
                open(inbox_path, 'a', encoding='utf-8').close()
            
            # 初始化category wikis
            init_category_wikis()
            
    def save_settings(self):
        self.config.api_provider = self.provider_combo.currentText()
        self.config.api_key = self.api_key_input.text()
        save_config(self.config)
        QMessageBox.information(self, "成功", "设置已保存")
        
        if self.config.sync_dir:
            self.start_app()
            
    def create_notes_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(40, 40, 40, 40)
        
        # 标题
        title_layout = QHBoxLayout()
        title = QLabel("笔记")
        title.setObjectName("PageTitle")
        title_layout.addWidget(title)
        
        # 筛选器
        title_layout.addStretch()
        title_layout.addWidget(QLabel("筛选:"))
        self.filter_combo = QComboBox()
        self.filter_combo.addItem("全部")
        self.filter_combo.currentTextChanged.connect(self.on_filter_changed)
        title_layout.addWidget(self.filter_combo)
        
        layout.addLayout(title_layout)
        
        # 输入框
        input_edit = InputTextEdit(self.handle_new_note)
        layout.addWidget(input_edit)
        layout.addSpacing(20)
        
        # 笔记列表 - 使用流式布局
        self.notes_scroll = QScrollArea()
        self.notes_scroll.setWidgetResizable(True)
        self.notes_scroll.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        
        self.notes_container = QWidget()
        self.notes_layout = QGridLayout(self.notes_container)
        self.notes_layout.setSpacing(16)
        self.notes_layout.setAlignment(Qt.AlignmentFlag.AlignTop | Qt.AlignmentFlag.AlignLeft)
        
        self.notes_scroll.setWidget(self.notes_container)
        layout.addWidget(self.notes_scroll)
        
        self.pages_dict['Notes'] = page
        self.stacked_widget.addWidget(page)
        
    def on_filter_changed(self, text):
        self.current_filter = text
        self.refresh_notes()
        
    def handle_new_note(self, content):
        save_note(content)
        self.refresh_notes()

    def refresh_notes(self):
        # 清除现有笔记卡片
        for i in reversed(range(self.notes_layout.count())): 
            widget = self.notes_layout.itemAt(i).widget()
            if widget is not None:
                widget.setParent(None)
        
        # 更新筛选器选项
        current_filter = self.filter_combo.currentText()
        self.filter_combo.clear()
        self.filter_combo.addItem("全部")
        categories = get_category_names(self.config)
        self.filter_combo.addItems(categories)
        if current_filter in ["全部"] + categories:
            self.filter_combo.setCurrentText(current_filter)
        
        # 加载笔记
        notes = load_all_notes()
        
        # 应用筛选
        if self.current_filter != "全部":
            notes = [n for n in notes if n.get('category') == self.current_filter]
        
        # 创建卡片（每行3个）
        for i, note in enumerate(notes):
            card = NoteCard(note)
            row = i // 3
            col = i % 3
            self.notes_layout.addWidget(card, row, col)

    def create_wikis_page(self):
        page = QWidget()
        layout = QHBoxLayout(page)
        layout.setContentsMargins(40, 40, 40, 40)
        layout.setSpacing(20)
        
        # 左侧Wiki列表
        left_panel = QWidget()
        left_panel.setFixedWidth(250)
        left_layout = QVBoxLayout(left_panel)
        left_layout.setContentsMargins(0, 0, 0, 0)
        
        title = QLabel("Wiki")
        title.setObjectName("PageTitle")
        left_layout.addWidget(title)
        
        subtitle = QLabel("选择category查看wiki")
        subtitle.setStyleSheet("font-size: 13px; color: #86868b; margin-bottom: 16px;")
        left_layout.addWidget(subtitle)
        
        self.wiki_list = QListWidget()
        self.wiki_list.setObjectName("WikiList")
        self.wiki_list.itemClicked.connect(self.load_wiki_content)
        left_layout.addWidget(self.wiki_list)
        
        layout.addWidget(left_panel)
        
        # 右侧Wiki内容
        self.wiki_viewer = QTextBrowser()
        self.wiki_viewer.setStyleSheet("""
            QTextBrowser {
                background-color: #ffffff;
                padding: 32px;
                font-size: 15px;
                line-height: 1.8;
            }
            QTextBrowser h1 { color: #1d1d1f; }
            QTextBrowser h2 { color: #333333; border-bottom: 1px solid #e5e5e7; padding-bottom: 8px; }
            QTextBrowser p { margin: 12px 0; }
            QTextBrowser ul, QTextBrowser ol { margin: 12px 0; padding-left: 24px; }
            QTextBrowser li { margin: 6px 0; }
            QTextBrowser code { 
                background-color: #f5f5f7; 
                padding: 2px 6px; 
                border-radius: 4px;
                font-family: 'SF Mono', Monaco, monospace;
            }
            QTextBrowser pre {
                background-color: #f5f5f7;
                padding: 16px;
                border-radius: 8px;
                overflow-x: auto;
            }
        """)
        layout.addWidget(self.wiki_viewer, 1)
        
        self.pages_dict['Wikis'] = page
        self.stacked_widget.addWidget(page)
        
    def refresh_wikis_list(self):
        self.wiki_list.clear()
        categories = get_category_names(self.config)
        for cat in categories:
            self.wiki_list.addItem(cat)
            
    def load_wiki_content(self, item):
        wiki_path = get_wiki_path(item.text())
        if not wiki_path or not os.path.exists(wiki_path):
            self.wiki_viewer.setHtml("<p style='color: #86868b; text-align: center; margin-top: 100px;'>暂无内容</p>")
            return
            
        try:
            with open(wiki_path, 'r', encoding='utf-8') as f:
                md_content = f.read()
            html = markdown2.markdown(md_content, extras=['fenced-code-blocks', 'tables'])
            
            # 添加自定义样式
            styled_html = f"""
            <html>
            <head>
                <style>
                    body {{ 
                        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
                        max-width: 800px;
                        margin: 0 auto;
                        padding: 20px;
                        color: #1d1d1f;
                    }}
                    h1 {{ font-size: 32px; font-weight: 700; margin-bottom: 8px; }}
                    h2 {{ font-size: 24px; font-weight: 600; margin-top: 32px; }}
                    h3 {{ font-size: 20px; font-weight: 600; }}
                    p {{ line-height: 1.8; margin: 16px 0; }}
                    ul, ol {{ padding-left: 24px; }}
                    li {{ margin: 8px 0; }}
                    code {{ 
                        background-color: #f5f5f7; 
                        padding: 2px 6px; 
                        border-radius: 4px;
                        font-family: 'SF Mono', monospace;
                        font-size: 14px;
                    }}
                    pre {{ 
                        background-color: #f5f5f7;
                        padding: 16px;
                        border-radius: 12px;
                        overflow-x: auto;
                    }}
                    blockquote {{
                        border-left: 4px solid #0071e3;
                        margin: 16px 0;
                        padding-left: 16px;
                        color: #666666;
                    }}
                    hr {{
                        border: none;
                        border-top: 1px solid #e5e5e7;
                        margin: 32px 0;
                    }}
                </style>
            </head>
            <body>
                {html}
            </body>
            </html>
            """
            self.wiki_viewer.setHtml(styled_html)
        except Exception as e:
            self.wiki_viewer.setPlainText(f"加载失败: {e}")

    def create_categories_page(self):
        """创建Category管理页面"""
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(40, 40, 40, 40)
        
        # 标题行
        title_layout = QHBoxLayout()
        title = QLabel("Categories")
        title.setObjectName("PageTitle")
        title_layout.addWidget(title)
        
        title_layout.addStretch()
        
        add_btn = QPushButton("+ 添加 Category")
        add_btn.clicked.connect(self.on_add_category)
        title_layout.addWidget(add_btn)
        
        layout.addLayout(title_layout)
        
        # 说明文字
        desc = QLabel("管理你的笔记分类。AI只能将笔记归入以下预设或自定义的categories中。")
        desc.setStyleSheet("font-size: 13px; color: #86868b; margin-bottom: 20px;")
        desc.setWordWrap(True)
        layout.addWidget(desc)
        
        # Category列表
        self.categories_scroll = QScrollArea()
        self.categories_scroll.setWidgetResizable(True)
        
        self.categories_container = QWidget()
        self.categories_layout = QVBoxLayout(self.categories_container)
        self.categories_layout.setSpacing(12)
        self.categories_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        
        self.categories_scroll.setWidget(self.categories_container)
        layout.addWidget(self.categories_scroll)
        
        self.pages_dict['Categories'] = page
        self.stacked_widget.addWidget(page)
        
    def refresh_categories(self):
        """刷新Category列表"""
        # 清除现有卡片
        for i in reversed(range(self.categories_layout.count())): 
            widget = self.categories_layout.itemAt(i).widget()
            if widget is not None:
                widget.setParent(None)
        
        # 获取所有category和笔记数量
        all_notes = load_all_notes()
        category_counts = {}
        for note in all_notes:
            cat = note.get('category', 'Inbox')
            category_counts[cat] = category_counts.get(cat, 0) + 1
        
        # 创建卡片
        for cat in self.config.categories:
            note_count = category_counts.get(cat['name'], 0)
            card = CategoryCard(cat, note_count)
            card.merge_btn.clicked.connect(lambda checked, c=cat['name']: self.on_merge_category(c))
            card.delete_btn.clicked.connect(lambda checked, c=cat['name']: self.on_delete_category(c))
            self.categories_layout.addWidget(card)
    
    def on_add_category(self):
        """添加新category"""
        dialog = AddCategoryDialog(self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            data = dialog.get_data()
            if data['name']:
                if add_category(self.config, data['name'], data['description']):
                    # 创建对应的wiki文件
                    init_category_wikis()
                    self.refresh_categories()
                    QMessageBox.information(self, "成功", f'Category "{data["name"]}" 已添加')
                else:
                    QMessageBox.warning(self, "错误", "Category名称已存在")
    
    def on_merge_category(self, source_name):
        """合并category"""
        all_names = get_category_names(self.config)
        if len(all_names) <= 1:
            QMessageBox.warning(self, "错误", "至少需要保留一个category")
            return
        
        dialog = MergeCategoryDialog(source_name, all_names, self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            target_name = dialog.get_target()
            
            # 确认
            reply = QMessageBox.question(
                self, "确认合并",
                f'确定要将 "{source_name}" 合并到 "{target_name}" 吗？\n\n'
                f'所有 "{source_name}" 的笔记将归属到 "{target_name}"。',
                QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No
            )
            
            if reply == QMessageBox.StandardButton.Yes:
                # 执行合并
                source_id, target_id = merge_categories(self.config, source_name, target_name)
                
                if source_id and target_id:
                    # 批量更新笔记
                    count = batch_update_category(source_name, target_name)
                    
                    # 合并wiki文件
                    rename_wiki(source_name, target_name)
                    
                    self.refresh_categories()
                    QMessageBox.information(
                        self, "合并完成",
                        f'已成功合并 {count} 条笔记到 "{target_name}"'
                    )
    
    def on_delete_category(self, category_name):
        """删除category"""
        # 确认
        reply = QMessageBox.warning(
            self, "确认删除",
            f'确定要删除 "{category_name}" 吗？\n\n'
            '你可以选择：\n'
            '• "删除笔记" - 删除该category下的所有笔记\n'
            '• "保留笔记" - 保留笔记但标记为Inbox\n'
            '• "取消" - 取消操作',
            QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No | QMessageBox.StandardButton.Cancel
        )
        
        if reply == QMessageBox.StandardButton.Cancel:
            return
        
        # 删除category配置
        cat_id = delete_category(self.config, category_name)
        
        if cat_id:
            if reply == QMessageBox.StandardButton.Yes:
                # 删除笔记
                count = batch_delete_category(category_name)
                delete_wiki(category_name)
                QMessageBox.information(self, "删除完成", f'已删除 {count} 条笔记')
            else:
                # 保留笔记，改为Inbox
                count = batch_update_category(category_name, "Inbox")
                rename_wiki(category_name, "Inbox")
                QMessageBox.information(self, "操作完成", f'已将 {count} 条笔记移至 Inbox')
            
            self.refresh_categories()
                
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
