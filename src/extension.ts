import * as vscode from 'vscode';
import { OllamaChatProvider } from './chatProvider';

export function activate(context: vscode.ExtensionContext) {
    const provider = new OllamaChatProvider(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('ollamaChat', provider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );

    // Comando para abrir o chat e focar nele
    context.subscriptions.push(
        vscode.commands.registerCommand('ollamaAgent.openChat', () => {
            vscode.commands.executeCommand('ollamaChat.focus');
        })
    );

    // Comando para explicar o código selecionado
    context.subscriptions.push(
        vscode.commands.registerCommand('ollamaAgent.explainSelection', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.selection.isEmpty) {
                vscode.window.showWarningMessage('Selecione um trecho de código primeiro.');
                return;
            }
            
            const selectedText = editor.document.getText(editor.selection);
            const fileName = vscode.workspace.asRelativePath(editor.document.fileName);
            
            // Foca no chat
            await vscode.commands.executeCommand('ollamaChat.focus');
            
            // Envia mensagem para explicar
            provider.sendMessage(`Explique o seguinte código de ${fileName}:\n\n\`\`\`\n${selectedText}\n\`\`\``);
        })
    );

    // Comando para refatorar código selecionado
    context.subscriptions.push(
        vscode.commands.registerCommand('ollamaAgent.refactorSelection', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor || editor.selection.isEmpty) {
                vscode.window.showWarningMessage('Selecione um trecho de código primeiro.');
                return;
            }
            
            const selectedText = editor.document.getText(editor.selection);
            const fileName = vscode.workspace.asRelativePath(editor.document.fileName);
            
            // Foca no chat
            await vscode.commands.executeCommand('ollamaChat.focus');
            
            // Envia mensagem para refatorar
            provider.sendMessage(`Refatore e melhore o seguinte código de ${fileName}:\n\n\`\`\`\n${selectedText}\n\`\`\``);
        })
    );

    // Comando para corrigir erros do projeto
    context.subscriptions.push(
        vscode.commands.registerCommand('ollamaAgent.fixErrors', async () => {
            // Foca no chat
            await vscode.commands.executeCommand('ollamaChat.focus');
            
            // Envia mensagem para corrigir erros
            provider.sendMessage('Analise os erros e warnings do projeto e sugira correções.');
        })
    );

    // Invalida o cache do contexto quando arquivos forem modificados
    const watcher = vscode.workspace.createFileSystemWatcher('**/*');
    watcher.onDidChange(() => provider.invalidateWorkspaceContext());
    watcher.onDidCreate(() => provider.invalidateWorkspaceContext());
    watcher.onDidDelete(() => provider.invalidateWorkspaceContext());
    context.subscriptions.push(watcher);
}

export function deactivate() {}
