import * as vscode from 'vscode';
import { OllamaChatProvider } from './chatProvider';

export function activate(context: vscode.ExtensionContext) {
    const provider = new OllamaChatProvider(context);

    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('ollamaChat', provider, {
            webviewOptions: { retainContextWhenHidden: true }
        })
    );
}

export function deactivate() {}
