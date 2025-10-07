const vscode = require('vscode');

// グローバルなチェックボックス装飾
let globalCheckedDecoration = null;

function activate(context) {
    console.log('Simple Checkbox Test Extension is active');
    
    // チェックボックス装飾を作成
    globalCheckedDecoration = vscode.window.createTextEditorDecorationType({
        textDecoration: 'line-through',
        opacity: '0.6',
        color: '#888888'
    });
    
    // 初回実行
    const editor = vscode.window.activeTextEditor;
    if (editor && editor.document.languageId === 'markdown') {
        updateCheckboxDecorations(editor);
    }
    
    // テキスト変更時
    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument(event => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.document !== event.document || 
                editor.document.languageId !== 'markdown') return;
            
            // 即座に更新
            updateCheckboxDecorations(editor);
        })
    );
    
    // エディタ変更時
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor && editor.document.languageId === 'markdown') {
                updateCheckboxDecorations(editor);
            }
        })
    );
}

function updateCheckboxDecorations(editor) {
    if (!editor || !globalCheckedDecoration) return;
    
    const document = editor.document;
    const checkedLineRanges = [];
    
    // 全行をスキャン
    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i).text;
        // チェック済みのパターン: - [x] または - [X]
        if (line.match(/^(\s*)-\s\[[xX]\]/)) {
            checkedLineRanges.push(new vscode.Range(
                new vscode.Position(i, 0),
                new vscode.Position(i, line.length)
            ));
            console.log(`Found checked at line ${i}: "${line}"`);
        }
    }
    
    console.log(`Applying decorations to ${checkedLineRanges.length} checked items`);
    editor.setDecorations(globalCheckedDecoration, checkedLineRanges);
}

function deactivate() {
    if (globalCheckedDecoration) {
        globalCheckedDecoration.dispose();
    }
}

module.exports = {
    activate,
    deactivate
};