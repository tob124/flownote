import sys, os
from datetime import datetime
import markdown
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, 
                             QListWidget, QStackedWidget, QLabel, QTextEdit, QLineEdit, 
                             QPushButton, QComboBox, QFileDialog, QScrollArea, QFrame, 
                             QTextBrowser, QMessageBox, QListWidgetItem, QInputDialog,
                             QSizePolicy)
from PyQt6.QtCore import Qt, QThread, pyqtSignal
from PyQt6.QtGui import QKeyEvent

import config_manager
import file_service
import style
from ai_worker import AIQueueThread

class QuickInputEdit(QTextEdit):
    submitted = pyqtSignal(str)
    def __init__(self):
        super().__init__()
        self.setPlaceholderText("💡 记录灵感... (Shift + Enter 保存)")
        self.setFixedHeight(80)

    def keyPressEvent(self, e: QKeyEvent):
        if e.key() == Qt.Key.Key_Return and e.modifiers() == Qt.KeyboardModifier.ShiftModifier:
            text = self.toPlainText().strip()
            if text:
                self.submitted.emit(text)
                self.clear()
            return
        super().keyPressEvent(e)

class InboxWorker(QThread):
    finished = pyqtSignal()
    def run(self):
        file_service.process_inbox()
        self.finished.emit()

class NoteCard(QFrame):
    def __init__(self, note):
        super().__init__()
        self.setObjectName("NoteCard")
        layout = QVBoxLayout(self)
        
        header = QHBoxLayout()
        dt_label = QLabel(note.get('created_at', ''))
        dt_label.setStyleSheet("color: #888888; font-size: 12px;")
        
        cat_label = QLabel(f"[{note.get('category', 'Inbox')}]")
        cat_label.setStyleSheet("color: #4CAF50; font-weight: bold; font-size: 12px;")
        
        st = note.get('ai_status', 'pending')
        status_icon = "⏳ Processing" if st in ['pending', 'processing'] else "✅ Done" if st == 'done' else "❌ Failed"
        status_label = QLabel(status_icon)
        status_label.setStyleSheet("font-size: 12px;")
        
        header.addWidget(cat_label)
        header.addWidget(dt_label)
        header.addStretch()
        header.addWidget(status_label)
        layout.addLayout(header)
        
        # ... 前面的代码保持不变 ...
        
        content = QTextEdit()
        content.setPlainText(note.get('raw_content', ''))
        
        # 【关键修改】移除所有高度限制
        # content.setMaximumHeight(120)  <-- 确保这行被删除或注释掉
        
        # 设置为只读（根据你的业务逻辑，未完成状态可能需要编辑）
        if st == 'done':
            content.setReadOnly(True)
        else:
            content.setReadOnly(False) # 或者 True，看你需求
            
        # 【核心技巧】让 QTextEdit 高度自适应内容
        # 1. 先设置为不限制高度
        content.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        
        # 2. 禁用滚动条，迫使它撑开容器显示所有内容
        # 如果你希望内容极长时出现滚动条而不是把窗口撑爆，可以保留 ScrollBarAsNeeded
        # 但为了“灵活显示”，通常先尝试 AlwaysOff 看看效果
        content.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff) 
        content.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        
        # 3. 【最重要的一步】根据文档内容调整控件大小
        # 这会计算文本实际需要的高度，并设置给控件
        content.document().adjustSize() 
        doc_size = content.document().size()
        
        # 4. 设置一个基于内容高度的固定高度，或者最小高度
        # 这里我们设置最小高度为内容高度 + 一些边距，允许它更大但不会更小
        # 注意：document().size().height() 返回的是浮点数，需要转 int
        min_height = int(doc_size.height()) + 20 # +20 是为了 padding
        content.setMinimumHeight(min_height)
        
        # 5. 同时，为了确保布局能正确计算，也可以直接设置固定高度（如果不打算让用户拉伸它）
        # content.setFixedHeight(min_height) 
        
        # 设置边距，让文字不贴边
        content.document().setDocumentMargin(10)
        
        layout.addWidget(content)
        
        # ... 后面的代码保持不变 ...
        
        tags = note.get('tags', [])
        if tags:
            tag_label = QLabel("  ".join([f"#{t}" for t in tags]))
            tag_label.setStyleSheet("color: #666666; font-size: 12px;")
            layout.addWidget(tag_label)

class FlowNoteApp(QMainWindow):
    def __init__(self):
        super().__init__()
        self.setWindowTitle("FlowNote")
        self.resize(1100, 750)
        self.setStyleSheet(style.QSS)
        
        self.config = config_manager.load_config()
        self.init_ui()
        
        # 线程与初始化
        self.ai_thread = AIQueueThread()
        self.ai_thread.note_updated.connect(self.load_notes)
        self.ai_thread.start()
        
        self.inbox_worker = InboxWorker()
        self.inbox_worker.finished.connect(self.load_notes)
        
        if not self.config.get('sync_dir'):
            self.stack.setCurrentIndex(2) # 强制展示 Settings
        else:
            file_service.ensure_directories()
            self.inbox_worker.start()

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
        for item in ["📝 All Notes", "📚 Wikis", "⚙️ Settings"]:
            self.sidebar.addItem(item)
        self.sidebar.currentRowChanged.connect(self.switch_page)
        main_layout.addWidget(self.sidebar)
        
        # 右侧内容区
        self.stack = QStackedWidget()
        main_layout.addWidget(self.stack)
        
        self.setup_notes_page()
        self.setup_wikis_page()
        self.setup_settings_page()
        
        self.sidebar.setCurrentRow(0)

    def setup_notes_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(20, 20, 20, 20)
        
        self.input_box = QuickInputEdit()
        self.input_box.submitted.connect(self.handle_new_note)
        layout.addWidget(self.input_box)
        
        self.notes_scroll = QScrollArea()
        self.notes_scroll.setWidgetResizable(True)
        self.notes_container = QWidget()
        self.notes_layout = QVBoxLayout(self.notes_container)
        self.notes_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        self.notes_scroll.setWidget(self.notes_container)
        layout.addWidget(self.notes_scroll)
        
        self.stack.addWidget(page)

    def setup_wikis_page(self):
        page = QWidget()
        layout = QHBoxLayout(page)
        
        self.wiki_list = QListWidget()
        self.wiki_list.setFixedWidth(200)
        self.wiki_list.currentRowChanged.connect(self.load_wiki_content)
        
        self.wiki_browser = QTextBrowser()
        self.wiki_browser.setOpenExternalLinks(True)
        
        layout.addWidget(self.wiki_list)
        layout.addWidget(self.wiki_browser)
        self.stack.addWidget(page)

    def setup_settings_page(self):
        page = QWidget()
        layout = QVBoxLayout(page)
        layout.setContentsMargins(40, 40, 40, 40)
        layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        
        # 同步目录
        layout.addWidget(QLabel("📂 数据库同步目录:"))
        dir_layout = QHBoxLayout()
        self.dir_input = QLineEdit(self.config.get('sync_dir', ''))
        self.dir_input.setReadOnly(True)
        btn_dir = QPushButton("选择目录")
        btn_dir.clicked.connect(self.select_directory)
        dir_layout.addWidget(self.dir_input)
        dir_layout.addWidget(btn_dir)
        layout.addLayout(dir_layout)
        
        # API设置
        layout.addSpacing(20)
        layout.addWidget(QLabel("🤖 AI Provider:"))
        self.api_provider = QComboBox()
        self.api_provider.addItems(["DeepSeek", "Gemini"])
        self.api_provider.setCurrentText(self.config.get('api_provider', 'DeepSeek'))
        layout.addWidget(self.api_provider)
        
        layout.addWidget(QLabel("🔑 API Key:"))
        self.api_key = QLineEdit(self.config.get('api_key', ''))
        self.api_key.setEchoMode(QLineEdit.EchoMode.Password)
        layout.addWidget(self.api_key)
        
        save_btn = QPushButton("💾 保存配置")
        save_btn.setObjectName("PrimaryBtn")
        save_btn.clicked.connect(self.save_settings)
        layout.addWidget(save_btn)
        
        # --- 分类管理面板 ---
        layout.addSpacing(30)
        layout.addWidget(QLabel("🗂️ 分类管理中心:"))
        
        cat_layout = QHBoxLayout()
        self.cat_list_widget = QListWidget()
        self.cat_list_widget.setFixedHeight(120)
        cat_layout.addWidget(self.cat_list_widget)
        
        cat_actions = QVBoxLayout()
        self.new_cat_input = QLineEdit()
        self.new_cat_input.setPlaceholderText("新分类名称...")
        add_cat_btn = QPushButton("➕ 添加分类")
        add_cat_btn.clicked.connect(self.add_category)
        
        del_cat_btn = QPushButton("🗑️ 删除选中 (迁入Inbox)")
        del_cat_btn.setObjectName("DangerBtn")
        del_cat_btn.clicked.connect(self.delete_category)
        
        merge_layout = QHBoxLayout()
        self.merge_target = QComboBox()
        merge_btn = QPushButton("合并至 ->")
        merge_btn.clicked.connect(self.merge_category)
        
        merge_layout.addWidget(merge_btn)
        merge_layout.addWidget(self.merge_target)
        
        cat_actions.addWidget(self.new_cat_input)
        cat_actions.addWidget(add_cat_btn)
        cat_actions.addStretch()
        cat_actions.addWidget(del_cat_btn)
        cat_actions.addLayout(merge_layout)
        
        cat_layout.addLayout(cat_actions)
        layout.addLayout(cat_layout)
        
        # 修复：确保在此处（所有组件创建完毕后）再调用刷新
        self.refresh_cat_list()
        
        self.stack.addWidget(page)

    def switch_page(self, row):
        self.stack.setCurrentIndex(row)
        if row == 0: self.load_notes()
        elif row == 1: self.load_wikis_list()

    def handle_new_note(self, text):
        file_service.save_note(text)
        self.load_notes()

    def load_notes(self):
        # Clear layout
        while self.notes_layout.count():
            item = self.notes_layout.takeAt(0)
            if item.widget(): item.widget().deleteLater()
            
        notes = file_service.load_all_notes()
        for note in notes:
            self.notes_layout.addWidget(NoteCard(note))
        self.notes_layout.addStretch()

    def load_wikis_list(self):
        self.wiki_list.clear()
        sync_dir = file_service.get_sync_dir()
        if not sync_dir: return
        wiki_dir = os.path.join(sync_dir, 'wikis')
        if not os.path.exists(wiki_dir): return
        
        for fname in sorted(os.listdir(wiki_dir), reverse=True):
            if fname.endswith('.md'):
                self.wiki_list.addItem(fname)

    def load_wiki_content(self):
        item = self.wiki_list.currentItem()
        if not item: return
        
        path = os.path.join(file_service.get_sync_dir(), 'wikis', item.text())
        try:
            with open(path, 'r', encoding='utf-8') as f:
                md_text = f.read()
            html = markdown.markdown(md_text, extensions=['fenced_code', 'tables'])
            css = """<style>
            body { font-family: sans-serif; line-height: 1.6; color: #D4D4D4; }
            h1, h2, h3 { color: #FFFFFF; border-bottom: 1px solid #333; padding-bottom: 5px; }
            code { background: #2D2D2D; padding: 2px 5px; border-radius: 4px; font-family: monospace; }
            pre { background: #202020; padding: 12px; border-radius: 8px; overflow-x: auto; border: 1px solid #333; }
            blockquote { border-left: 4px solid #4CAF50; padding-left: 10px; color: #A0A0A0; margin-left: 0; }
            </style>"""
            self.wiki_browser.setHtml(f"{css}\n{html}")
        except: pass

    # --- 配置与分类管理逻辑 ---
    def select_directory(self):
        d = QFileDialog.getExistingDirectory(self, "选择同步目录")
        if d:
            self.dir_input.setText(d)

    def save_settings(self):
        self.config['sync_dir'] = self.dir_input.text()
        self.config['api_provider'] = self.api_provider.currentText()
        self.config['api_key'] = self.api_key.text()
        config_manager.save_config(self.config)
        if file_service.ensure_directories():
            self.inbox_worker.start() # Config Ready, run inbox
            QMessageBox.information(self, "成功", "设置已保存，数据结构就绪！")

    def refresh_cat_list(self):
        self.cat_list_widget.clear()
        self.merge_target.clear()
        cats = self.config.get('categories', [])
        self.cat_list_widget.addItems(cats)
        self.merge_target.addItems(cats)

    def add_category(self):
        new_c = self.new_cat_input.text().strip()
        if new_c and new_c not in self.config['categories']:
            self.config['categories'].append(new_c)
            config_manager.save_config(self.config)
            self.new_cat_input.clear()
            self.refresh_cat_list()

    def delete_category(self):
        item = self.cat_list_widget.currentItem()
        if not item: return
        cat = item.text()
        if cat == "Inbox": return # 保护Inbox
        
        self.config['categories'].remove(cat)
        config_manager.save_config(self.config)
        self.refresh_cat_list()
        
        # 物理迁移
        for note in file_service.load_all_notes():
            if note.get('category') == cat:
                note['category'] = 'Inbox'
                file_service.update_note(note)
        self.load_notes()

    def merge_category(self):
        item = self.cat_list_widget.currentItem()
        if not item: return
        cat_a = item.text()
        cat_b = self.merge_target.currentText()
        if cat_a == cat_b or cat_a == "Inbox": return
        
        # 1. 迁移Note JSON
        for note in file_service.load_all_notes():
            if note.get('category') == cat_a:
                note['category'] = cat_b
                file_service.update_note(note)
                
        # 2. 拼接 Wiki
        sync_dir = file_service.get_sync_dir()
        month = datetime.now().strftime("%Y_%m")
        wiki_a = os.path.join(sync_dir, 'wikis', f"{cat_a}_{month}.md")
        wiki_b = os.path.join(sync_dir, 'wikis', f"{cat_b}_{month}.md")
        
        try:
            if os.path.exists(wiki_a):
                with open(wiki_a, 'r', encoding='utf-8') as f:
                    content_a = f.read()
                with open(wiki_b, 'a', encoding='utf-8') as f:
                    f.write(f"\n\n---\n> 来自分类 [{cat_a}] 的合并\n\n{content_a}")
                os.remove(wiki_a)
        except Exception as e:
            print(f"[Warn] Wiki合并出错: {e}")
            
        # 3. 移除旧分类
        if cat_a in self.config['categories']:
            self.config['categories'].remove(cat_a)
            config_manager.save_config(self.config)
            self.refresh_cat_list()
            self.load_notes()

if __name__ == '__main__':
    app = QApplication(sys.argv)
    window = FlowNoteApp()
    window.show()
    sys.exit(app.exec())