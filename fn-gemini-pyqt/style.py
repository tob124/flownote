QSS = """
QWidget {
    background-color: #191919;
    color: #D4D4D4;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
    font-size: 14px;
}

/* 侧边栏 */
QListWidget#Sidebar {
    background-color: #202020;
    border: none;
    outline: none;
}
QListWidget#Sidebar::item {
    padding: 12px 15px;
    border-radius: 6px;
    margin: 4px 8px;
    color: #A0A0A0;
}
QListWidget#Sidebar::item:selected {
    background-color: #383838;
    color: #FFFFFF;
    font-weight: bold;
}

/* 输入框和下拉框 */
QLineEdit, QTextEdit, QComboBox {
    background-color: #252525;
    border: none;
    border-radius: 6px;
    padding: 10px;
    color: #FFFFFF;
    selection-background-color: #4CAF50;
}
QTextEdit[readOnly="true"] {
    background-color: #1E1E1E;
    color: #A0A0A0;
}

/* 按钮 */
QPushButton {
    background-color: #2D2D2D;
    color: #FFFFFF;
    border: none;
    border-radius: 6px;
    padding: 8px 16px;
}
QPushButton:hover { background-color: #3D3D3D; }
QPushButton#PrimaryBtn { background-color: #4CAF50; font-weight: bold; }
QPushButton#PrimaryBtn:hover { background-color: #45a049; }
QPushButton#DangerBtn { background-color: #F44336; }
QPushButton#DangerBtn:hover { background-color: #DA190B; }

/* 极其细致的半透明滚动条 */
QScrollBar:vertical {
    border: none;
    background: transparent;
    width: 6px;
    margin: 0px;
}
QScrollBar::handle:vertical {
    background: rgba(255, 255, 255, 0.15);
    min-height: 20px;
    border-radius: 3px;
}
QScrollBar::handle:vertical:hover {
    background: rgba(255, 255, 255, 0.3);
}
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0px; }
QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical { background: transparent; }

/* 笔记卡片容器 */
QFrame#NoteCard {
    background-color: #202020;
    border-radius: 8px;
    margin: 5px 10px 10px 5px;
}

/* Wiki渲染器 */
QTextBrowser {
    background-color: #191919;
    border: none;
}
"""