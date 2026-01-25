import * as vscode from 'vscode';
import { OllamaChatProvider } from './chatProvider';

export function activate(context: vscode.ExtensionContext) {
    const provider = new OllamaChatProvider(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('ollamaChat', provider, {
            webviewOptions: { retainContextWhenHidden: true }
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
