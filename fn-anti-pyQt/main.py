import sys
import os
import json
import re
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                             QHBoxLayout, QListWidget, QStackedWidget, QLabel,
                             QComboBox, QLineEdit, QPushButton, QFileDialog,
                             QTextEdit, QScrollArea, QFrame, QMessageBox, QDialog,
                             QTextBrowser)
from PyQt6.QtCore import Qt, QUrl
from PyQt6.QtGui import QTextCursor, QKeyEvent
import markdown2

from config_manager import load_config, save_config, Config
from file_service import save_note, load_all_notes, process_inbox, _get_notes_dir, _get_wikis_dir
from ai_worker import AIQueueThread

STYLESHEET = """
QMainWindow {
    background-color: #1E1E1E;
}
QWidget {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #CCCCCC;
}
QListWidget {
    background-color: #252526;
    border: none;
    outline: none;
}
QListWidget::item {
    padding: 12px 16px;
    border-radius: 6px;
    margin: 4px;
}
QListWidget::item:selected {
    background-color: #37373D;
    color: #FFFFFF;
}
QStackedWidget {
    background-color: #1E1E1E;
}
QLineEdit, QComboBox, QTextEdit, QTextBrowser {
    background-color: #2D2D30;
    border: 1px solid #3E3E42;
    border-radius: 6px;
    padding: 8px;
    color: #CCCCCC;
}
QLineEdit:focus, QComboBox:focus, QTextEdit:focus, QTextBrowser:focus {
    border: 1px solid #007ACC;
}
QPushButton {
    background-color: #0E639C;
    border: none;
    border-radius: 6px;
    padding: 8px 16px;
    color: white;
    font-weight: bold;
}
QPushButton:hover {
    background-color: #1177BB;
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
    background-color: #252526;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 8px;
}
#NoteCardTitle {
    font-weight: bold;
    font-size: 14px;
    color: #E0E0E0;
}
#NoteCardDetails {
    font-size: 11px;
    color: #888888;
}
#NoteCardContent {
    color: #CCCCCC;
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
        
        details_text = f"{data.get('category', 'Inbox')} | {', '.join(data.get('tags', []))} | Status: {status}"
        details_label = QLabel(details_text)
        details_label.setObjectName("NoteCardDetails")
        
        content_label = QLabel(data.get('raw_content', ''))
        content_label.setWordWrap(True)
        content_label.setObjectName("NoteCardContent")
        
        layout.addWidget(title_label)
        layout.addWidget(details_label)
        layout.addWidget(content_label)
        
        if status == 'done':
            # Optionally disable entirely to prevent edits if we had them
            pass

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
            self.sidebar.setCurrentRow(3)
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
        for item in ["Notes", "Wikis", "Settings"]:
            self.sidebar.addItem(item)
            
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
        
        title = QLabel("Settings")
        title.setStyleSheet("font-size: 24px; font-weight: bold; margin-bottom: 20px;")
        layout.addWidget(title)
        
        self.provider_combo = QComboBox()
        self.provider_combo.addItems(["Gemini", "DeepSeek"])
        self.provider_combo.setCurrentText(self.config.api_provider)
        layout.addWidget(QLabel("API Provider:"))
        layout.addWidget(self.provider_combo)
        
        self.api_key_input = QLineEdit()
        self.api_key_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.api_key_input.setText(self.config.api_key)
        layout.addWidget(QLabel("API Key:"))
        layout.addWidget(self.api_key_input)
        
        sync_layout = QHBoxLayout()
        self.sync_dir_label = QLabel(self.config.sync_dir or "Not selected")
        sync_btn = QPushButton("Select Sync Directory")
        sync_btn.clicked.connect(self.select_sync_dir)
        sync_layout.addWidget(self.sync_dir_label)
        sync_layout.addWidget(sync_btn)
        layout.addWidget(QLabel("Sync Directory:"))
        layout.addLayout(sync_layout)
        
        save_btn = QPushButton("Save Settings")
        save_btn.clicked.connect(self.save_settings)
        layout.addWidget(save_btn)
        
        self.pages_dict['Settings'] = page
        self.stacked_widget.addWidget(page)
        
    def select_sync_dir(self):
        dir_path = QFileDialog.getExistingDirectory(self, "Select Sync Directory")
        if dir_path:
            self.config.sync_dir = dir_path
            self.sync_dir_label.setText(dir_path)
            
            # Init expected hierarchy
            os.makedirs(os.path.join(dir_path, "notes"), exist_ok=True)
            os.makedirs(os.path.join(dir_path, "wikis"), exist_ok=True)
            inbox_path = os.path.join(dir_path, "inbox.txt")
            if not os.path.exists(inbox_path):
                open(inbox_path, 'a', encoding='utf-8').close()

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
        
        input_edit = InputTextEdit(self.handle_new_note)
        layout.addWidget(input_edit)
        
        self.notes_scroll = QScrollArea()
        self.notes_scroll.setWidgetResizable(True)
        self.notes_container = QWidget()
        self.notes_layout = QVBoxLayout(self.notes_container)
        self.notes_layout.setAlignment(Qt.AlignmentFlag.AlignTop)
        
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
        
        self.wiki_list = QListWidget()
        self.wiki_list.setFixedWidth(200)
        self.wiki_list.itemClicked.connect(self.load_wiki_content)
        layout.addWidget(self.wiki_list)
        
        self.wiki_viewer = QTextBrowser()
        self.wiki_viewer.setOpenLinks(False)
        self.wiki_viewer.anchorClicked.connect(self.handle_wiki_link)
        layout.addWidget(self.wiki_viewer, 1)
        
        self.pages_dict['Wikis'] = page
        self.stacked_widget.addWidget(page)
        
    def refresh_wikis_list(self):
        self.wiki_list.clear()
        wikis_dir = _get_wikis_dir()
        if not wikis_dir: return
        
        try:
            for file in os.listdir(wikis_dir):
                if file.endswith('.md'):
                    self.wiki_list.addItem(file)
        except Exception: pass
            
    def load_wiki_content(self, item):
        wikis_dir = _get_wikis_dir()
        file_path = os.path.join(wikis_dir, item.text())
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                md_content = f.read()
            html = markdown2.markdown(md_content)
            self.wiki_viewer.setHtml(html)
        except Exception as e:
            self.wiki_viewer.setPlainText(f"Error loading wifi: {e}")

    def handle_wiki_link(self, qurl: QUrl):
        url_str = qurl.toString()
        # Expecting format ID from [细节](id)
        note_id = url_str
        
        notes_dir = _get_notes_dir()
        note_path = os.path.join(notes_dir, f"{note_id}.json")
        if os.path.exists(note_path):
            try:
                with open(note_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    QMessageBox.information(
                        self,
                        "Original Note",
                        f"Title: {data.get('title', '')}\nCategory: {data.get('category', '')}\n\nContent:\n{data.get('raw_content', '')}"
                    )
            except Exception as e:
                pass
                
    def start_app(self):
        process_inbox()
        self.refresh_notes()
        if not self.ai_thread.isRunning():
            self.ai_thread.start()
            
    def on_note_updated(self, note_id):
        # Could optimize to update only one card, but refreshing all for now
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
