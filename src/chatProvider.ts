import * as vscode from 'vscode';
import { OllamaClient, OllamaMessage } from './ollamaClient';

export class OllamaChatProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private ollamaClient: OllamaClient;
    private messages: OllamaMessage[] = [];
    private terminal?: vscode.Terminal;

    constructor(private context: vscode.ExtensionContext) {
        this.ollamaClient = new OllamaClient();
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        token: vscode.CancellationToken
    ) {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.context.extensionUri]
        };

        webviewView.webview.html = this.getHtmlContent();

        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log('[ChatProvider] Mensagem recebida:', message.command);
            
            try {
                switch (message.command) {
                    case 'send':
                        await this.handleUserMessage(message.text);
                        break;
                    case 'clear':
                        this.messages = [];
                        break;
                    case 'testConnection':
                        await this.testConnection();
                        break;
                    case 'listModels':
                        await this.listModels();
                        break;
                    case 'updateServer':
                        await this.updateServerUrl(message.serverUrl);
                        break;
                    case 'updateModel':
                        await this.updateModel(message.model);
                        break;
                    case 'reconnect':
                        await this.reconnect();
                        break;
                    case 'openSettings':
                        vscode.commands.executeCommand('workbench.action.openSettings', 'ollamaAgent');
                        break;
                    case 'createFile':
                        await this.createFile(message.path, message.content);
                        break;
                    case 'runCommand':
                        await this.runTerminalCommand(message.cmd);
                        break;
                    case 'readFile':
                        await this.readFile(message.path);
                        break;
                    case 'listDir':
                        await this.listDirectory(message.path);
                        break;
                    default:
                        console.warn('[ChatProvider] Comando desconhecido:', message.command);
                }
            } catch (error) {
                console.error('[ChatProvider] Erro ao processar comando:', error);
            }
        });

        // Inicializa conexão e modelos
        setTimeout(() => {
            this.testConnection();
            this.listModels();
        }, 500);
    }

    public show() {
        vscode.commands.executeCommand('ollamaChat.focus');
    }

    private async testConnection() {
        try {
            console.log('[ChatProvider] Testando conexão...');
            const connected = await this.ollamaClient.testConnection();
            console.log('[ChatProvider] Status da conexão:', connected);
            
            this.view?.webview.postMessage({
                command: 'connectionStatus',
                connected
            });
        } catch (error) {
            console.error('[ChatProvider] Erro ao testar conexão:', error);
            this.view?.webview.postMessage({
                command: 'connectionStatus',
                connected: false
            });
        }
    }

    private async listModels() {
        try {
            console.log('[ChatProvider] Listando modelos...');
            const models = await this.ollamaClient.listModels();
            const config = vscode.workspace.getConfiguration('ollamaAgent');
            const currentModel = config.get<string>('model', 'qwen2.5-coder:latest');
            
            console.log('[ChatProvider] Modelos encontrados:', models);
            
            this.view?.webview.postMessage({
                command: 'modelsList',
                models,
                currentModel
            });
        } catch (error) {
            console.error('[ChatProvider] Erro ao listar modelos:', error);
            this.view?.webview.postMessage({
                command: 'modelsList',
                models: [],
                currentModel: ''
            });
        }
    }

    private async updateModel(model: string) {
        try {
            const config = vscode.workspace.getConfiguration('ollamaAgent');
            await config.update('model', model, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage('Modelo atualizado: ' + model);
        } catch (error) {
            console.error('[ChatProvider] Erro ao atualizar modelo:', error);
        }
    }

    private async updateServerUrl(serverUrl: string) {
        try {
            const config = vscode.workspace.getConfiguration('ollamaAgent');
            await config.update('serverUrl', serverUrl, vscode.ConfigurationTarget.Global);
            this.ollamaClient.updateServerUrl(serverUrl);
            vscode.window.showInformationMessage('Servidor atualizado: ' + serverUrl);
            await this.testConnection();
            await this.listModels();
        } catch (error) {
            console.error('[ChatProvider] Erro ao atualizar servidor:', error);
        }
    }

    private async reconnect() {
        console.log('[ChatProvider] Reconectando...');
        
        // Notifica que está reconectando
        this.view?.webview.postMessage({
            command: 'connectionStatus',
            connected: false
        });
        
        // Recarrega configuração
        const config = vscode.workspace.getConfiguration('ollamaAgent');
        const serverUrl = config.get<string>('serverUrl', 'http://192.168.1.86:11434');
        
        // Atualiza o cliente
        this.ollamaClient.updateServerUrl(serverUrl);
        
        // Testa conexão e lista modelos
        await this.testConnection();
        await this.listModels();
        
        vscode.window.showInformationMessage('Reconectado ao servidor: ' + serverUrl);
    }

    private async createFile(filePath: string, content: string) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('Nenhum workspace aberto');
            }

            const workspaceRoot = workspaceFolders[0].uri;
            const fileUri = vscode.Uri.joinPath(workspaceRoot, filePath);
            const contentBytes = Buffer.from(content, 'utf8');
            await vscode.workspace.fs.writeFile(fileUri, contentBytes);

            this.view?.webview.postMessage({
                command: 'fileCreated',
                path: filePath,
                success: true
            });

            vscode.window.showInformationMessage('Arquivo criado: ' + filePath);
            
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            console.error('[ChatProvider] Erro ao criar arquivo:', error);
            this.view?.webview.postMessage({
                command: 'fileCreated',
                path: filePath,
                success: false
            });
        }
    }

    private cleanMarkdownFromContent(content: string): string {
        // Remove blocos de código markdown (```language ... ```)
        let cleaned = content.replace(/^```[\w]*\n?/gm, '').replace(/```$/gm, '');
        // Remove espaços extras no início e fim
        cleaned = cleaned.trim();
        return cleaned;
    }

    private async deleteFile(filePath: string) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('Nenhum workspace aberto');
            }

            const workspaceRoot = workspaceFolders[0].uri;
            const fileUri = vscode.Uri.joinPath(workspaceRoot, filePath);
            
            // Verifica se o arquivo existe antes de deletar
            try {
                await vscode.workspace.fs.stat(fileUri);
            } catch {
                throw new Error('Arquivo não encontrado: ' + filePath);
            }

            await vscode.workspace.fs.delete(fileUri, { recursive: false });

            this.view?.webview.postMessage({
                command: 'fileDeleted',
                path: filePath,
                success: true
            });

            vscode.window.showInformationMessage('Arquivo deletado: ' + filePath);
        } catch (error) {
            console.error('[ChatProvider] Erro ao deletar arquivo:', error);
            this.view?.webview.postMessage({
                command: 'fileDeleted',
                path: filePath,
                success: false
            });
            vscode.window.showErrorMessage('Erro ao deletar arquivo: ' + filePath);
        }
    }

    private async processAgentActions(message: string) {
        // Regex mais flexível para capturar o padrão mesmo com markdown misturado
        const fileRegex = /\[CRIAR_ARQUIVO:([^\]]+)\]([\s\S]*?)\[\/CRIAR_ARQUIVO\]/g;
        const cmdRegex = /\[EXECUTAR_COMANDO\]([\s\S]*?)\[\/EXECUTAR_COMANDO\]/g;
        const readRegex = /\[LER_ARQUIVO:([^\]]+)\]\[\/LER_ARQUIVO\]/g;
        const listRegex = /\[LISTAR_DIRETORIO:([^\]]*)\]\[\/LISTAR_DIRETORIO\]/g;
        const deleteRegex = /\[DELETAR_ARQUIVO:([^\]]+)\]\[\/DELETAR_ARQUIVO\]/g;

        let match;

        // Processa criação de arquivos automaticamente
        while ((match = fileRegex.exec(message)) !== null) {
            const filePath = match[1].trim();
            let content = match[2];
            // Limpa markdown do conteúdo
            content = this.cleanMarkdownFromContent(content);
            
            console.log('[Agent] Criando arquivo:', filePath);
            await this.createFile(filePath, content);
        }

        // Processa comandos de terminal automaticamente
        while ((match = cmdRegex.exec(message)) !== null) {
            const cmd = match[1].trim();
            console.log('[Agent] Executando comando:', cmd);
            await this.runTerminalCommand(cmd);
        }

        // Processa leitura de arquivos
        while ((match = readRegex.exec(message)) !== null) {
            const filePath = match[1].trim();
            console.log('[Agent] Lendo arquivo:', filePath);
            await this.readFile(filePath);
        }

        // Processa listagem de diretórios
        while ((match = listRegex.exec(message)) !== null) {
            const dirPath = match[1].trim();
            console.log('[Agent] Listando diretório:', dirPath);
            await this.listDirectory(dirPath);
        }

        // Processa deleção de arquivos
        while ((match = deleteRegex.exec(message)) !== null) {
            const filePath = match[1].trim();
            console.log('[Agent] Deletando arquivo:', filePath);
            await this.deleteFile(filePath);
        }
    }

    private async runTerminalCommand(command: string) {
        try {
            if (!this.terminal || this.terminal.exitStatus !== undefined) {
                this.terminal = vscode.window.createTerminal('Ollama Agent');
            }
            this.terminal.show();
            this.terminal.sendText(command);
            
            this.view?.webview.postMessage({
                command: 'commandExecuted',
                success: true
            });
        } catch (error) {
            console.error('[ChatProvider] Erro ao executar comando:', error);
        }
    }

    private async readFile(filePath: string) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('Nenhum workspace aberto');
            }

            const workspaceRoot = workspaceFolders[0].uri;
            const fileUri = vscode.Uri.joinPath(workspaceRoot, filePath);
            const contentBytes = await vscode.workspace.fs.readFile(fileUri);
            const content = Buffer.from(contentBytes).toString('utf8');

            // Adiciona o conteúdo do arquivo ao contexto e envia para o chat
            const fileInfo = '📄 Conteúdo de ' + filePath + ':\n```\n' + content + '\n```';
            this.messages.push({ role: 'user', content: '[Arquivo lido: ' + filePath + ']\n' + content });
            
            this.view?.webview.postMessage({
                command: 'fileRead',
                path: filePath,
                content: fileInfo,
                success: true
            });
        } catch (error) {
            console.error('[ChatProvider] Erro ao ler arquivo:', error);
            this.view?.webview.postMessage({
                command: 'fileRead',
                path: filePath,
                content: 'Erro ao ler arquivo: ' + (error instanceof Error ? error.message : String(error)),
                success: false
            });
        }
    }

    private async listDirectory(dirPath: string) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('Nenhum workspace aberto');
            }

            const workspaceRoot = workspaceFolders[0].uri;
            const targetPath = dirPath ? vscode.Uri.joinPath(workspaceRoot, dirPath) : workspaceRoot;
            const entries = await vscode.workspace.fs.readDirectory(targetPath);

            const fileList = entries.map(([name, type]) => {
                const icon = type === vscode.FileType.Directory ? '📁' : '📄';
                return icon + ' ' + name;
            }).join('\n');

            const listInfo = '📂 Conteúdo de ' + (dirPath || '/') + ':\n' + fileList;
            this.messages.push({ role: 'user', content: '[Listagem de diretório: ' + (dirPath || '/') + ']\n' + fileList });

            this.view?.webview.postMessage({
                command: 'dirListed',
                path: dirPath || '/',
                content: listInfo,
                success: true
            });
        } catch (error) {
            console.error('[ChatProvider] Erro ao listar diretório:', error);
            this.view?.webview.postMessage({
                command: 'dirListed',
                path: dirPath,
                content: 'Erro ao listar diretório: ' + (error instanceof Error ? error.message : String(error)),
                success: false
            });
        }
    }

    private async handleUserMessage(text: string) {
        if (!text.trim()) return;

        console.log('[ChatProvider] Processando mensagem:', text.substring(0, 50));

        if (this.messages.length === 0) {
            this.messages.push({
                role: 'system',
                content: 'Você é um agente de programação com acesso REAL ao sistema de arquivos do usuário.\n\nVocê DEVE usar os comandos especiais abaixo para executar ações REAIS. NÃO use blocos de código markdown para criar arquivos - use APENAS os comandos especiais.\n\n## COMANDOS DISPONÍVEIS:\n\n### Criar arquivo (OBRIGATÓRIO usar este formato):\n[CRIAR_ARQUIVO:nome-do-arquivo.ext]\nconteúdo completo do arquivo aqui\n[/CRIAR_ARQUIVO]\n\n### Executar comando no terminal:\n[EXECUTAR_COMANDO]npm install express[/EXECUTAR_COMANDO]\n\n### Ler arquivo existente:\n[LER_ARQUIVO:caminho/arquivo.ext][/LER_ARQUIVO]\n\n### Listar diretório:\n[LISTAR_DIRETORIO:caminho][/LISTAR_DIRETORIO]\n\n### Deletar arquivo:\n[DELETAR_ARQUIVO:caminho/arquivo.ext][/DELETAR_ARQUIVO]\n\n## REGRAS IMPORTANTES:\n1. Quando pedirem para criar um arquivo, USE SEMPRE [CRIAR_ARQUIVO:...][/CRIAR_ARQUIVO]\n2. NUNCA mostre código em blocos markdown (```) quando for criar arquivos\n3. O conteúdo entre as tags será salvo EXATAMENTE como está\n4. Para a raiz do projeto, use [LISTAR_DIRETORIO:][/LISTAR_DIRETORIO]\n5. CUIDADO ao deletar arquivos - confirme antes se necessário\n\n## EXEMPLO:\nUsuário: crie um arquivo hello.js\nResposta correta:\n[CRIAR_ARQUIVO:hello.js]\nconsole.log("Hello World!");\n[/CRIAR_ARQUIVO]'
            });
        }

        this.messages.push({ role: 'user', content: text });

        this.view?.webview.postMessage({ command: 'userMessage', text });

        let assistantMessage = '';

        try {
            await this.ollamaClient.chat(this.messages, (chunk: string) => {
                assistantMessage += chunk;
                this.view?.webview.postMessage({
                    command: 'assistantChunk',
                    text: chunk
                });
            });

            this.messages.push({ role: 'assistant', content: assistantMessage });
            
            // Processa ações automaticamente
            await this.processAgentActions(assistantMessage);
            
            this.view?.webview.postMessage({ command: 'assistantComplete' });

        } catch (error) {
            console.error('[ChatProvider] Erro no chat:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.view?.webview.postMessage({
                command: 'error',
                text: errorMessage
            });
        }
    }

    private getHtmlContent(): string {
        const config = vscode.workspace.getConfiguration('ollamaAgent');
        const serverUrl = config.get<string>('serverUrl', 'http://192.168.1.86:11434');

        return '<!DOCTYPE html>\n' +
'<html lang="pt-BR">\n' +
'<head>\n' +
'    <meta charset="UTF-8">\n' +
'    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'    <title>Ollama Chat</title>\n' +
'    <style>\n' +
'        * { margin: 0; padding: 0; box-sizing: border-box; }\n' +
'        body {\n' +
'            font-family: var(--vscode-font-family);\n' +
'            color: var(--vscode-foreground);\n' +
'            background: var(--vscode-editor-background);\n' +
'            height: 100vh;\n' +
'            display: flex;\n' +
'            flex-direction: column;\n' +
'        }\n' +
'        .header {\n' +
'            padding: 8px 12px;\n' +
'            background: var(--vscode-titleBar-activeBackground);\n' +
'            border-bottom: 1px solid var(--vscode-panel-border);\n' +
'            display: flex;\n' +
'            flex-direction: column;\n' +
'            gap: 8px;\n' +
'        }\n' +
'        .header-row {\n' +
'            display: flex;\n' +
'            justify-content: space-between;\n' +
'            align-items: center;\n' +
'        }\n' +
'        .header-left {\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            gap: 8px;\n' +
'        }\n' +
'        .status {\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            gap: 4px;\n' +
'            font-size: 10px;\n' +
'        }\n' +
'        .status-dot {\n' +
'            width: 8px;\n' +
'            height: 8px;\n' +
'            border-radius: 50%;\n' +
'            background: var(--vscode-testing-iconFailed);\n' +
'        }\n' +
'        .status-dot.connected {\n' +
'            background: var(--vscode-testing-iconPassed);\n' +
'        }\n' +
'        .model-select {\n' +
'            padding: 4px 8px;\n' +
'            background: var(--vscode-input-background);\n' +
'            color: var(--vscode-input-foreground);\n' +
'            border: 1px solid var(--vscode-input-border);\n' +
'            border-radius: 3px;\n' +
'            font-size: 11px;\n' +
'            max-width: 150px;\n' +
'        }\n' +
'        .icon-btn {\n' +
'            background: none;\n' +
'            border: none;\n' +
'            color: var(--vscode-foreground);\n' +
'            cursor: pointer;\n' +
'            padding: 4px;\n' +
'            border-radius: 4px;\n' +
'            opacity: 0.8;\n' +
'        }\n' +
'        .icon-btn:hover {\n' +
'            background: var(--vscode-toolbar-hoverBackground);\n' +
'            opacity: 1;\n' +
'        }\n' +
'        .server-config {\n' +
'            display: none;\n' +
'            gap: 6px;\n' +
'            align-items: center;\n' +
'        }\n' +
'        .server-config.visible {\n' +
'            display: flex;\n' +
'        }\n' +
'        .server-input {\n' +
'            flex: 1;\n' +
'            padding: 4px 8px;\n' +
'            background: var(--vscode-input-background);\n' +
'            color: var(--vscode-input-foreground);\n' +
'            border: 1px solid var(--vscode-input-border);\n' +
'            border-radius: 3px;\n' +
'            font-size: 11px;\n' +
'        }\n' +
'        .btn {\n' +
'            padding: 4px 10px;\n' +
'            background: var(--vscode-button-background);\n' +
'            color: var(--vscode-button-foreground);\n' +
'            border: none;\n' +
'            border-radius: 3px;\n' +
'            cursor: pointer;\n' +
'            font-size: 11px;\n' +
'        }\n' +
'        .btn:hover {\n' +
'            background: var(--vscode-button-hoverBackground);\n' +
'        }\n' +
'        .btn:disabled {\n' +
'            opacity: 0.5;\n' +
'            cursor: not-allowed;\n' +
'        }\n' +
'        .chat-container {\n' +
'            flex: 1;\n' +
'            overflow-y: auto;\n' +
'            padding: 12px;\n' +
'            display: flex;\n' +
'            flex-direction: column;\n' +
'            gap: 12px;\n' +
'        }\n' +
'        .message {\n' +
'            max-width: 90%;\n' +
'            display: flex;\n' +
'            flex-direction: column;\n' +
'            gap: 4px;\n' +
'        }\n' +
'        .message.user {\n' +
'            align-self: flex-end;\n' +
'        }\n' +
'        .message.assistant {\n' +
'            align-self: flex-start;\n' +
'        }\n' +
'        .message-header {\n' +
'            font-size: 10px;\n' +
'            opacity: 0.6;\n' +
'        }\n' +
'        .message-content {\n' +
'            padding: 10px 12px;\n' +
'            border-radius: 6px;\n' +
'            font-size: 12px;\n' +
'            line-height: 1.5;\n' +
'            white-space: pre-wrap;\n' +
'            word-break: break-word;\n' +
'        }\n' +
'        .message.user .message-content {\n' +
'            background: var(--vscode-button-background);\n' +
'            color: var(--vscode-button-foreground);\n' +
'        }\n' +
'        .message.assistant .message-content {\n' +
'            background: var(--vscode-input-background);\n' +
'            border: 1px solid var(--vscode-input-border);\n' +
'        }\n' +
'        .input-container {\n' +
'            padding: 8px 12px;\n' +
'            border-top: 1px solid var(--vscode-panel-border);\n' +
'            display: flex;\n' +
'            gap: 6px;\n' +
'        }\n' +
'        #messageInput {\n' +
'            flex: 1;\n' +
'            padding: 8px 10px;\n' +
'            background: var(--vscode-input-background);\n' +
'            color: var(--vscode-input-foreground);\n' +
'            border: 1px solid var(--vscode-input-border);\n' +
'            border-radius: 4px;\n' +
'            font-size: 12px;\n' +
'            resize: none;\n' +
'            min-height: 36px;\n' +
'            max-height: 100px;\n' +
'            font-family: var(--vscode-font-family);\n' +
'        }\n' +
'        .empty-state {\n' +
'            flex: 1;\n' +
'            display: flex;\n' +
'            flex-direction: column;\n' +
'            align-items: center;\n' +
'            justify-content: center;\n' +
'            opacity: 0.5;\n' +
'            gap: 8px;\n' +
'        }\n' +
'        .empty-state .icon { font-size: 32px; }\n' +
'        .action-btn {\n' +
'            margin-top: 8px;\n' +
'            padding: 6px 12px;\n' +
'            background: var(--vscode-button-secondaryBackground);\n' +
'            color: var(--vscode-button-secondaryForeground);\n' +
'            border: none;\n' +
'            border-radius: 4px;\n' +
'            cursor: pointer;\n' +
'            font-size: 11px;\n' +
'        }\n' +
'        .action-btn:hover {\n' +
'            background: var(--vscode-button-secondaryHoverBackground);\n' +
'        }\n' +
'    </style>\n' +
'</head>\n' +
'<body>\n' +
'    <div class="header">\n' +
'        <div class="header-row">\n' +
'            <div class="header-left">\n' +
'                <div class="status">\n' +
'                    <div class="status-dot" id="statusDot"></div>\n' +
'                    <span id="statusText">Verificando...</span>\n' +
'                </div>\n' +
'                <select class="model-select" id="modelSelect">\n' +
'                    <option value="">Carregando...</option>\n' +
'                </select>\n' +
'            </div>\n' +
'            <div>\n' +
'                <button class="icon-btn" id="settingsBtn" title="Configurações">⚙️</button>\n' +
'                <button class="icon-btn" id="reloadBtn" title="Reconectar">🔄</button>\n' +
'            </div>\n' +
'        </div>\n' +
'    </div>\n' +
'\n' +
'    <div class="chat-container" id="chatContainer">\n' +
'        <div class="empty-state">\n' +
'            <div class="icon">💬</div>\n' +
'            <div>Envie uma mensagem para começar</div>\n' +
'        </div>\n' +
'    </div>\n' +
'\n' +
'    <div class="input-container">\n' +
'        <textarea id="messageInput" placeholder="Digite sua mensagem..." rows="1"></textarea>\n' +
'        <button class="btn" id="sendBtn">Enviar</button>\n' +
'        <button class="btn" id="clearBtn" style="background: transparent; border: 1px solid var(--vscode-input-border); color: var(--vscode-foreground);">🗑️</button>\n' +
'    </div>\n' +
'\n' +
'    <script>\n' +
'        (function() {\n' +
'            var vscode = acquireVsCodeApi();\n' +
'            \n' +
'            var chatContainer = document.getElementById("chatContainer");\n' +
'            var messageInput = document.getElementById("messageInput");\n' +
'            var sendBtn = document.getElementById("sendBtn");\n' +
'            var clearBtn = document.getElementById("clearBtn");\n' +
'            var settingsBtn = document.getElementById("settingsBtn");\n' +
'            var reloadBtn = document.getElementById("reloadBtn");\n' +
'            var modelSelect = document.getElementById("modelSelect");\n' +
'            var statusDot = document.getElementById("statusDot");\n' +
'            var statusText = document.getElementById("statusText");\n' +
'\n' +
'            var isProcessing = false;\n' +
'            var currentAssistantContent = null;\n' +
'\n' +
'            console.log("[WebView] Inicializado");\n' +
'            \n' +
'            console.log("[WebView] Solicitando teste de conexão...");\n' +
'            vscode.postMessage({ command: "testConnection" });\n' +
'            \n' +
'            console.log("[WebView] Solicitando lista de modelos...");\n' +
'            vscode.postMessage({ command: "listModels" });\n' +
'\n' +
'            sendBtn.addEventListener("click", sendMessage);\n' +
'            \n' +
'            messageInput.addEventListener("keydown", function(e) {\n' +
'                if (e.key === "Enter" && !e.shiftKey) {\n' +
'                    e.preventDefault();\n' +
'                    sendMessage();\n' +
'                }\n' +
'            });\n' +
'\n' +
'            messageInput.addEventListener("input", function() {\n' +
'                this.style.height = "auto";\n' +
'                this.style.height = this.scrollHeight + "px";\n' +
'            });\n' +
'\n' +
'            clearBtn.addEventListener("click", function() {\n' +
'                chatContainer.innerHTML = \'<div class="empty-state"><div class="icon">💬</div><div>Envie uma mensagem para começar</div></div>\';\n' +
'                vscode.postMessage({ command: "clear" });\n' +
'            });\n' +
'\n' +
'            settingsBtn.addEventListener("click", function() {\n' +
'                vscode.postMessage({ command: "openSettings" });\n' +
'            });\n' +
'\n' +
'            reloadBtn.addEventListener("click", function() {\n' +
'                reloadBtn.disabled = true;\n' +
'                reloadBtn.textContent = "⏳";\n' +
'                statusText.textContent = "Reconectando...";\n' +
'                statusDot.className = "status-dot";\n' +
'                vscode.postMessage({ command: "reconnect" });\n' +
'                setTimeout(function() {\n' +
'                    reloadBtn.disabled = false;\n' +
'                    reloadBtn.textContent = "🔄";\n' +
'                }, 2000);\n' +
'            });\n' +
'\n' +

'            modelSelect.addEventListener("change", function() {\n' +
'                var model = modelSelect.value;\n' +
'                if (model) {\n' +
'                    vscode.postMessage({ command: "updateModel", model: model });\n' +
'                }\n' +
'            });\n' +
'\n' +
'            function sendMessage() {\n' +
'                var text = messageInput.value.trim();\n' +
'                if (!text || isProcessing) return;\n' +
'\n' +
'                console.log("[WebView] Enviando mensagem:", text.substring(0, 30));\n' +
'                vscode.postMessage({ command: "send", text: text });\n' +
'                \n' +
'                messageInput.value = "";\n' +
'                messageInput.style.height = "auto";\n' +
'                isProcessing = true;\n' +
'                sendBtn.disabled = true;\n' +
'            }\n' +
'\n' +
'            function removeEmptyState() {\n' +
'                var empty = chatContainer.querySelector(".empty-state");\n' +
'                if (empty) empty.remove();\n' +
'            }\n' +
'\n' +
'            function addUserMessage(text) {\n' +
'                removeEmptyState();\n' +
'                var div = document.createElement("div");\n' +
'                div.className = "message user";\n' +
'                div.innerHTML = \'<div class="message-header">Você</div><div class="message-content"></div>\';\n' +
'                div.querySelector(".message-content").textContent = text;\n' +
'                chatContainer.appendChild(div);\n' +
'                chatContainer.scrollTop = chatContainer.scrollHeight;\n' +
'            }\n' +
'\n' +'            function addSystemMessage(text) {\n' +
'                removeEmptyState();\n' +
'                var div = document.createElement("div");\n' +
'                div.className = "message assistant";\n' +
'                div.innerHTML = \'<div class="message-header">📋 Sistema</div><div class="message-content" style="font-family:monospace;font-size:11px;white-space:pre-wrap;"></div>\';\n' +
'                div.querySelector(".message-content").textContent = text;\n' +
'                chatContainer.appendChild(div);\n' +
'                chatContainer.scrollTop = chatContainer.scrollHeight;\n' +
'            }\n' +
'\n' +'            function startAssistantMessage() {\n' +
'                removeEmptyState();\n' +
'                var div = document.createElement("div");\n' +
'                div.className = "message assistant";\n' +
'                div.innerHTML = \'<div class="message-header">Assistente</div><div class="message-content"></div>\';\n' +
'                chatContainer.appendChild(div);\n' +
'                currentAssistantContent = div.querySelector(".message-content");\n' +
'                chatContainer.scrollTop = chatContainer.scrollHeight;\n' +
'            }\n' +
'\n' +
'            function appendChunk(text) {\n' +
'                if (currentAssistantContent) {\n' +
'                    currentAssistantContent.textContent += text;\n' +
'                    chatContainer.scrollTop = chatContainer.scrollHeight;\n' +
'                }\n' +
'            }\n' +
'\n' +
'            function completeMessage() {\n' +
'                if (currentAssistantContent) {\n' +
'                    cleanAndFormatMessage(currentAssistantContent);\n' +
'                }\n' +
'                currentAssistantContent = null;\n' +
'                isProcessing = false;\n' +
'                sendBtn.disabled = false;\n' +
'                messageInput.focus();\n' +
'            }\n' +
'\n' +
'            function cleanAndFormatMessage(element) {\n' +
'                var content = element.textContent;\n' +
'                var html = content;\n' +
'                \n' +
'                // Extrai e substitui CRIAR_ARQUIVO - captura nome e conteúdo\n' +
'                var fileRegex = /\\[CRIAR_ARQUIVO:([^\\]]+)\\]([\\s\\S]*?)\\[\\/CRIAR_ARQUIVO\\]/g;\n' +
'                html = html.replace(fileRegex, function(match, fileName, fileContent) {\n' +
'                    var cleanContent = fileContent.trim().replace(/^```[\\w]*\\n?/, "").replace(/```$/, "").trim();\n' +
'                    return "✅ ARQUIVO_CRIADO: " + fileName.trim() + "\\n___CODE_START___" + cleanContent + "___CODE_END___";\n' +
'                });\n' +
'                \n' +
'                // Extrai e substitui EXECUTAR_COMANDO\n' +
'                var cmdRegex = /\\[EXECUTAR_COMANDO\\]([\\s\\S]*?)\\[\\/EXECUTAR_COMANDO\\]/g;\n' +
'                html = html.replace(cmdRegex, function(match, cmd) {\n' +
'                    return "⚡ COMANDO_EXECUTADO: " + cmd.trim();\n' +
'                });\n' +
'                \n' +
'                // Extrai e substitui LER_ARQUIVO\n' +
'                var readRegex = /\\[LER_ARQUIVO:([^\\]]+)\\]\\[\\/LER_ARQUIVO\\]/g;\n' +
'                html = html.replace(readRegex, function(match, fileName) {\n' +
'                    return "📖 ARQUIVO_LIDO: " + fileName.trim();\n' +
'                });\n' +
'                \n' +
'                // Extrai e substitui LISTAR_DIRETORIO\n' +
'                var listRegex = /\\[LISTAR_DIRETORIO:([^\\]]*)\\]\\[\\/LISTAR_DIRETORIO\\]/g;\n' +
'                html = html.replace(listRegex, function(match, dir) {\n' +
'                    return "📂 DIRETORIO_LISTADO: " + (dir.trim() || "/");\n' +
'                });\n' +
'                \n' +
'                // Extrai e substitui DELETAR_ARQUIVO\n' +
'                var deleteRegex = /\\[DELETAR_ARQUIVO:([^\\]]+)\\]\\[\\/DELETAR_ARQUIVO\\]/g;\n' +
'                html = html.replace(deleteRegex, function(match, fileName) {\n' +
'                    return "🗑️ ARQUIVO_DELETADO: " + fileName.trim();\n' +
'                });\n' +
'                \n' +
'                // Formata blocos de código markdown\n' +
'                html = html.replace(/```([\\w]*)\\n?([\\s\\S]*?)```/g, function(match, lang, code) {\n' +
'                    return "___CODEBLOCK_START___" + (lang || "") + "___CODELANG___" + code.trim() + "___CODEBLOCK_END___";\n' +
'                });\n' +
'                \n' +
'                // Escapa HTML e formata\n' +
'                var escaped = escapeHtml(html);\n' +
'                \n' +
'                // Formata blocos de código markdown\n' +
'                escaped = escaped.replace(/___CODEBLOCK_START___(\\w*)___CODELANG___([\\s\\S]*?)___CODEBLOCK_END___/g, function(match, lang, code) {\n' +
'                    var langLabel = lang ? \'<span style="position:absolute;top:4px;right:8px;font-size:10px;color:rgba(255,255,255,0.5);text-transform:uppercase;">\' + lang + \'</span>\' : "";\n' +
'                    return \'<div style="position:relative;margin:8px 0;"><pre style="margin:0;padding:12px;background:rgba(0,0,0,0.3);border-radius:6px;overflow-x:auto;font-family:monospace;font-size:12px;white-space:pre-wrap;">\' + langLabel + \'<code>\' + code + \'</code></pre></div>\';\n' +
'                });\n' +
'                \n' +
'                // Formata o bloco de código do CRIAR_ARQUIVO (antes de escapar o resto)\n' +
'                escaped = escaped.replace(/✅ ARQUIVO_CRIADO: ([^\\n]+)\\n___CODE_START___([\\s\\S]*?)___CODE_END___/g, function(match, fileName, code) {\n' +
'                    return \'<div style="margin:8px 0;padding:10px;background:rgba(0,200,0,0.1);border-left:3px solid #4CAF50;border-radius:4px;"><strong>✅ Arquivo criado:</strong><code style="display:block;margin-top:6px;padding:4px 8px;background:rgba(0,0,0,0.2);border-radius:3px;">\' + fileName + \'</code><pre style="margin-top:8px;padding:10px;background:rgba(0,0,0,0.3);border-radius:4px;overflow-x:auto;font-family:monospace;font-size:12px;white-space:pre-wrap;"><code>\' + code + \'</code></pre></div>\';\n' +
'                });\n' +
'                \n' +
'                // Formata os outros marcadores\n' +
'                escaped = escaped.replace(/⚡ COMANDO_EXECUTADO: ([^\\n]+)/g, \'<div style="margin:8px 0;padding:10px;background:rgba(0,150,255,0.1);border-left:3px solid #2196F3;border-radius:4px;"><strong>⚡ Comando executado:</strong><code style="display:block;margin-top:6px;padding:8px;background:rgba(0,0,0,0.2);border-radius:3px;font-family:monospace;">$1</code></div>\');\n' +
'                escaped = escaped.replace(/📖 ARQUIVO_LIDO: ([^\\n]+)/g, \'<div style="margin:8px 0;padding:10px;background:rgba(255,200,0,0.1);border-left:3px solid #FF9800;border-radius:4px;"><strong>📖 Arquivo lido:</strong><code style="display:block;margin-top:6px;padding:8px;background:rgba(0,0,0,0.2);border-radius:3px;">$1</code></div>\');\n' +
'                escaped = escaped.replace(/📂 DIRETORIO_LISTADO: ([^\\n]+)/g, \'<div style="margin:8px 0;padding:10px;background:rgba(150,0,255,0.1);border-left:3px solid #9C27B0;border-radius:4px;"><strong>📂 Diretório listado:</strong><code style="display:block;margin-top:6px;padding:8px;background:rgba(0,0,0,0.2);border-radius:3px;">$1</code></div>\');\n' +
'                escaped = escaped.replace(/🗑️ ARQUIVO_DELETADO: ([^\\n]+)/g, \'<div style="margin:8px 0;padding:10px;background:rgba(255,0,0,0.1);border-left:3px solid #F44336;border-radius:4px;"><strong>🗑️ Arquivo deletado:</strong><code style="display:block;margin-top:6px;padding:8px;background:rgba(0,0,0,0.2);border-radius:3px;">$1</code></div>\');\n' +
'                \n' +
'                element.innerHTML = escaped;\n' +
'            }\n' +
'\n' +
'            function escapeHtml(text) {\n' +
'                var div = document.createElement("div");\n' +
'                div.textContent = text;\n' +
'                return div.innerHTML;\n' +
'            }\n' +
'\n' +
'            function updateStatus(connected) {\n' +
'                statusDot.className = "status-dot" + (connected ? " connected" : "");\n' +
'                statusText.textContent = connected ? "Conectado" : "Desconectado";\n' +
'            }\n' +
'\n' +
'            function updateModels(models, currentModel) {\n' +
'                console.log("[WebView] Modelos recebidos:", models);\n' +
'                modelSelect.innerHTML = "";\n' +
'                \n' +
'                if (!models || models.length === 0) {\n' +
'                    var opt = document.createElement("option");\n' +
'                    opt.value = "";\n' +
'                    opt.textContent = "Nenhum modelo";\n' +
'                    modelSelect.appendChild(opt);\n' +
'                    return;\n' +
'                }\n' +
'\n' +
'                for (var i = 0; i < models.length; i++) {\n' +
'                    var opt = document.createElement("option");\n' +
'                    opt.value = models[i];\n' +
'                    opt.textContent = models[i];\n' +
'                    if (models[i] === currentModel) opt.selected = true;\n' +
'                    modelSelect.appendChild(opt);\n' +
'                }\n' +
'            }\n' +
'\n' +
'            window.addEventListener("message", function(event) {\n' +
'                var msg = event.data;\n' +
'                console.log("[WebView] Mensagem recebida:", msg.command);\n' +
'\n' +
'                switch (msg.command) {\n' +
'                    case "connectionStatus":\n' +
'                        updateStatus(msg.connected);\n' +
'                        break;\n' +
'                    case "modelsList":\n' +
'                        updateModels(msg.models, msg.currentModel);\n' +
'                        break;\n' +
'                    case "userMessage":\n' +
'                        addUserMessage(msg.text);\n' +
'                        startAssistantMessage();\n' +
'                        break;\n' +
'                    case "assistantChunk":\n' +
'                        appendChunk(msg.text);\n' +
'                        break;\n' +
'                    case "assistantComplete":\n' +
'                        completeMessage();\n' +
'                        break;\n' +
'                    case "error":\n' +
'                        if (currentAssistantContent) {\n' +
'                            currentAssistantContent.textContent = "❌ Erro: " + msg.text;\n' +
'                        }\n' +
'                        completeMessage();\n' +
'                        break;\n' +
'                    case "fileCreated":\n' +
'                        var fileBtns = document.querySelectorAll(".file-btn");\n' +
'                        for (var i = 0; i < fileBtns.length; i++) {\n' +
'                            if (fileBtns[i].disabled) {\n' +
'                                fileBtns[i].textContent = msg.success ? "✅ Criado!" : "❌ Erro";\n' +
'                            }\n' +
'                        }\n' +
'                        break;\n' +
'                    case "commandExecuted":\n' +
'                        var cmdBtns = document.querySelectorAll(".cmd-btn");\n' +
'                        for (var i = 0; i < cmdBtns.length; i++) {\n' +
'                            if (cmdBtns[i].disabled) {\n' +
'                                cmdBtns[i].textContent = msg.success ? "✅ Executado!" : "❌ Erro";\n' +
'                            }\n' +
'                        }\n' +
'                        break;\n' +
'                    case "fileRead":\n' +
'                        var readBtns = document.querySelectorAll(".read-btn");\n' +
'                        for (var i = 0; i < readBtns.length; i++) {\n' +
'                            if (readBtns[i].disabled) {\n' +
'                                readBtns[i].textContent = msg.success ? "✅ Lido!" : "❌ Erro";\n' +
'                            }\n' +
'                        }\n' +
'                        if (msg.success) {\n' +
'                            addSystemMessage(msg.content);\n' +
'                        }\n' +
'                        break;\n' +
'                    case "dirListed":\n' +
'                        var listBtns = document.querySelectorAll(".list-btn");\n' +
'                        for (var i = 0; i < listBtns.length; i++) {\n' +
'                            if (listBtns[i].disabled) {\n' +
'                                listBtns[i].textContent = msg.success ? "✅ Listado!" : "❌ Erro";\n' +
'                            }\n' +
'                        }\n' +
'                        if (msg.success) {\n' +
'                            addSystemMessage(msg.content);\n' +
'                        }\n' +
'                        break;\n' +
'                }\n' +
'            });\n' +
'\n' +
'            messageInput.focus();\n' +
'        })();\n' +
'    </script>\n' +
'</body>\n' +
'</html>';
    }
}
