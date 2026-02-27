import * as vscode from 'vscode';
import { OllamaClient, OllamaMessage, ChatRequest } from './ollamaClient';

export class OllamaChatProvider implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private ollamaClient: OllamaClient;
    private messages: OllamaMessage[] = [];
    private terminal?: vscode.Terminal;
    private agentMode: boolean = true;
    private workspaceContext: string = '';
    private workspaceContextLoaded: boolean = false;
    private currentChatRequest?: ChatRequest;
    private isProcessing: boolean = false;

    // Extensões de arquivos que devem ser lidos para contexto
    private readonly codeExtensions = [
        '.ts', '.tsx', '.js', '.jsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
        '.cs', '.go', '.rs', '.rb', '.php', '.swift', '.kt', '.scala', '.vue',
        '.html', '.css', '.scss', '.sass', '.less', '.json', '.yaml', '.yml',
        '.xml', '.md', '.txt', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd',
        '.sql', '.graphql', '.prisma', '.dockerfile', '.env', '.gitignore',
        '.eslintrc', '.prettierrc', '.editorconfig', 'Makefile', 'Dockerfile'
    ];

    // Pastas que devem ser ignoradas
    private readonly ignoredFolders = [
        'node_modules', '.git', 'dist', 'build', 'out', '.next', '.nuxt',
        'coverage', '.nyc_output', '__pycache__', '.pytest_cache', 'venv',
        '.venv', 'env', '.env', 'vendor', 'target', 'bin', 'obj', '.idea',
        '.vscode', '.vs', 'packages', '.gradle', '.maven'
    ];

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
                    case 'setMode':
                        this.agentMode = message.agentMode;
                        this.messages = []; // Limpa histórico ao trocar de modo
                        console.log('[ChatProvider] Modo alterado para:', this.agentMode ? 'Agente' : 'Chat');
                        break;
                    case 'cancelRequest':
                        this.cancelCurrentRequest();
                        break;
                    case 'getActiveFileContext':
                        await this.sendActiveFileContext();
                        break;
                    case 'getSelectionContext':
                        await this.sendSelectionContext();
                        break;
                    case 'getDiagnostics':
                        await this.sendDiagnostics();
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

    /**
     * Método público para enviar mensagem programaticamente
     */
    public sendMessage(text: string) {
        this.handleUserMessage(text);
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
            
            // Cria os diretórios pai se necessário
            const parentDir = vscode.Uri.joinPath(fileUri, '..');
            try {
                await vscode.workspace.fs.stat(parentDir);
            } catch {
                // Diretório pai não existe, cria recursivamente
                await vscode.workspace.fs.createDirectory(parentDir);
            }
            
            const contentBytes = Buffer.from(content, 'utf8');
            await vscode.workspace.fs.writeFile(fileUri, contentBytes);

            console.log('[Agent] ✅ Arquivo criado com sucesso:', filePath);
            
            this.view?.webview.postMessage({
                command: 'fileCreated',
                path: filePath,
                success: true
            });

            vscode.window.showInformationMessage('✅ Arquivo criado: ' + filePath);
            
            // Abre o arquivo criado
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            console.error('[ChatProvider] ❌ Erro ao criar arquivo:', error);
            this.view?.webview.postMessage({
                command: 'fileCreated',
                path: filePath,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
            vscode.window.showErrorMessage('❌ Erro ao criar arquivo: ' + filePath);
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

            await vscode.workspace.fs.delete(fileUri, { recursive: true });

            console.log('[Agent] ✅ Arquivo deletado:', filePath);
            
            this.view?.webview.postMessage({
                command: 'fileDeleted',
                path: filePath,
                success: true
            });

            vscode.window.showInformationMessage('✅ Arquivo deletado: ' + filePath);
        } catch (error) {
            console.error('[ChatProvider] ❌ Erro ao deletar arquivo:', error);
            this.view?.webview.postMessage({
                command: 'fileDeleted',
                path: filePath,
                success: false
            });
            vscode.window.showErrorMessage('❌ Erro ao deletar arquivo: ' + filePath);
        }
    }

    private async processAgentActions(message: string) {
        console.log('[Agent] Processando ações na mensagem de', message.length, 'caracteres');
        
        // Regex mais flexível para capturar o padrão mesmo com markdown misturado
        const fileRegex = /\[CRIAR_ARQUIVO:([^\]]+)\]([\s\S]*?)\[\/CRIAR_ARQUIVO\]/gi;
        const editRegex = /\[EDITAR_ARQUIVO:([^\]]+)\]\s*\[BUSCAR\]([\s\S]*?)\[\/BUSCAR\]\s*\[SUBSTITUIR\]([\s\S]*?)\[\/SUBSTITUIR\]\s*\[\/EDITAR_ARQUIVO\]/gi;
        const cmdRegex = /\[EXECUTAR_COMANDO\]([\s\S]*?)\[\/EXECUTAR_COMANDO\]/gi;
        const readRegex = /\[LER_ARQUIVO:([^\]]+)\]\s*\[\/LER_ARQUIVO\]/gi;
        const listRegex = /\[LISTAR_DIRETORIO:([^\]]*)\]\s*\[\/LISTAR_DIRETORIO\]/gi;
        const deleteRegex = /\[DELETAR_ARQUIVO:([^\]]+)\]\s*\[\/DELETAR_ARQUIVO\]/gi;

        let actionsFound = 0;
        let match;

        // Processa criação de arquivos automaticamente
        while ((match = fileRegex.exec(message)) !== null) {
            actionsFound++;
            const filePath = match[1].trim();
            let content = match[2];
            // Limpa markdown do conteúdo
            content = this.cleanMarkdownFromContent(content);
            
            console.log('[Agent] ✅ Criando arquivo:', filePath);
            await this.createFile(filePath, content);
        }

        // Processa edição de arquivos
        while ((match = editRegex.exec(message)) !== null) {
            actionsFound++;
            const filePath = match[1].trim();
            const searchText = match[2];
            const replaceText = match[3];
            
            console.log('[Agent] ✅ Editando arquivo:', filePath);
            await this.editFile(filePath, searchText, replaceText);
        }

        // Processa comandos de terminal automaticamente
        while ((match = cmdRegex.exec(message)) !== null) {
            actionsFound++;
            const cmd = match[1].trim();
            console.log('[Agent] ✅ Executando comando:', cmd);
            await this.runTerminalCommand(cmd);
        }

        // Processa leitura de arquivos
        while ((match = readRegex.exec(message)) !== null) {
            actionsFound++;
            const filePath = match[1].trim();
            console.log('[Agent] ✅ Lendo arquivo:', filePath);
            await this.readFile(filePath);
        }

        // Processa listagem de diretórios
        while ((match = listRegex.exec(message)) !== null) {
            actionsFound++;
            const dirPath = match[1].trim();
            console.log('[Agent] ✅ Listando diretório:', dirPath);
            await this.listDirectory(dirPath);
        }

        // Processa deleção de arquivos
        while ((match = deleteRegex.exec(message)) !== null) {
            actionsFound++;
            const filePath = match[1].trim();
            console.log('[Agent] ✅ Deletando arquivo:', filePath);
            await this.deleteFile(filePath);
        }
        
        if (actionsFound === 0) {
            console.log('[Agent] ⚠️ Nenhuma ação encontrada na resposta');
            // Verifica se há padrões parciais para debug
            if (message.includes('[CRIAR_ARQUIVO') || message.includes('[EDITAR_ARQUIVO') || 
                message.includes('[EXECUTAR_COMANDO') || message.includes('CRIAR_ARQUIVO') ||
                message.includes('EDITAR_ARQUIVO') || message.includes('EXECUTAR_COMANDO')) {
                console.log('[Agent] Padrões parciais detectados - modelo pode estar usando formato incorreto');
                console.log('[Agent] Primeiros 500 chars:', message.substring(0, 500));
            }
        } else {
            console.log('[Agent] Total de ações executadas:', actionsFound);
        }
    }

    private async runTerminalCommand(command: string) {
        try {
            if (!this.terminal || this.terminal.exitStatus !== undefined) {
                this.terminal = vscode.window.createTerminal('Ollama Agent');
            }
            this.terminal.show();
            this.terminal.sendText(command);
            
            console.log('[Agent] ✅ Comando executado:', command);
            
            this.view?.webview.postMessage({
                command: 'commandExecuted',
                text: command,
                success: true
            });
            
            vscode.window.showInformationMessage('✅ Comando executado: ' + command);
        } catch (error) {
            console.error('[ChatProvider] ❌ Erro ao executar comando:', error);
            vscode.window.showErrorMessage('❌ Erro ao executar comando: ' + command);
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

    /**
     * Verifica se a mensagem do usuário requer contexto do workspace
     */
    private needsWorkspaceContext(text: string): boolean {
        const lowerText = text.toLowerCase();
        const contextKeywords = [
            'analise', 'analisar', 'analisa', 'análise',
            'código', 'codigo', 'code',
            'projeto', 'project',
            'workspace', 'repositório', 'repositorio',
            'arquivos', 'files',
            'estrutura', 'structure',
            'entenda', 'entender', 'understand',
            'explique', 'explicar', 'explain',
            'revise', 'revisar', 'review',
            'melhore', 'melhorar', 'improve',
            'refatore', 'refatorar', 'refactor',
            'bug', 'erro', 'error', 'problema', 'problem',
            'funciona', 'funcionando', 'working',
            'implementação', 'implementacao', 'implementation',
            'como está', 'como esta', 'how is',
            'o que faz', 'what does', 'como funciona'
        ];
        
        return contextKeywords.some(keyword => lowerText.includes(keyword));
    }

    /**
     * Verifica se um arquivo deve ser incluído no contexto baseado na extensão
     */
    private shouldIncludeFile(fileName: string): boolean {
        const lowerName = fileName.toLowerCase();
        return this.codeExtensions.some(ext => 
            lowerName.endsWith(ext) || lowerName === ext.replace('.', '')
        );
    }

    /**
     * Escaneia recursivamente o workspace e coleta arquivos de código
     */
    private async scanWorkspaceRecursive(
        uri: vscode.Uri, 
        relativePath: string = ''
    ): Promise<{ path: string; content: string }[]> {
        const results: { path: string; content: string }[] = [];
        
        try {
            const entries = await vscode.workspace.fs.readDirectory(uri);
            
            for (const [name, type] of entries) {
                const fullPath = relativePath ? `${relativePath}/${name}` : name;
                const fileUri = vscode.Uri.joinPath(uri, name);
                
                if (type === vscode.FileType.Directory) {
                    // Ignora pastas na lista de ignorados
                    if (this.ignoredFolders.includes(name.toLowerCase())) {
                        continue;
                    }
                    
                    // Escaneia recursivamente
                    const subResults = await this.scanWorkspaceRecursive(fileUri, fullPath);
                    results.push(...subResults);
                } else if (type === vscode.FileType.File) {
                    // Verifica se é um arquivo de código
                    if (this.shouldIncludeFile(name)) {
                        try {
                            const contentBytes = await vscode.workspace.fs.readFile(fileUri);
                            const content = Buffer.from(contentBytes).toString('utf8');
                            
                            // Limita tamanho do arquivo (máximo 50KB por arquivo)
                            if (content.length <= 50000) {
                                results.push({ path: fullPath, content });
                            }
                        } catch (e) {
                            console.warn('[ChatProvider] Erro ao ler arquivo:', fullPath, e);
                        }
                    }
                }
            }
        } catch (e) {
            console.warn('[ChatProvider] Erro ao escanear diretório:', uri.path, e);
        }
        
        return results;
    }

    /**
     * Carrega o contexto completo do workspace
     */
    private async loadWorkspaceContext(): Promise<string> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return '';
        }

        console.log('[ChatProvider] Iniciando leitura do workspace...');
        
        const workspaceRoot = workspaceFolders[0].uri;
        const files = await this.scanWorkspaceRecursive(workspaceRoot);
        
        if (files.length === 0) {
            return '';
        }

        // Limita o contexto total para não sobrecarregar o modelo (max 100KB)
        const maxContextSize = 100000;
        let currentSize = 0;
        const includedFiles: typeof files = [];
        
        // Prioriza arquivos menores primeiro para incluir mais arquivos
        const sortedFiles = files.sort((a, b) => a.content.length - b.content.length);
        
        for (const file of sortedFiles) {
            if (currentSize + file.content.length > maxContextSize) {
                break;
            }
            includedFiles.push(file);
            currentSize += file.content.length;
        }

        // Monta o contexto com os arquivos incluídos
        let context = '=== CONTEXTO DO WORKSPACE ===\n';
        context += `Arquivos incluídos: ${includedFiles.length}/${files.length}\n\n`;
        
        for (const file of includedFiles) {
            context += `--- ${file.path} ---\n`;
            context += file.content;
            context += '\n\n';
        }
        
        context += '=== FIM DO CONTEXTO ===';
        
        console.log(`[ChatProvider] Workspace carregado: ${includedFiles.length}/${files.length} arquivos (${Math.round(currentSize/1024)}KB)`);
        
        return context;
    }

    /**
     * Obtém ou carrega o contexto do workspace
     */
    private async getWorkspaceContext(): Promise<string> {
        if (!this.workspaceContextLoaded) {
            this.workspaceContext = await this.loadWorkspaceContext();
            this.workspaceContextLoaded = true;
        }
        return this.workspaceContext;
    }

    /**
     * Invalida o cache do contexto do workspace (para quando arquivos mudarem)
     */
    public invalidateWorkspaceContext() {
        this.workspaceContextLoaded = false;
        this.workspaceContext = '';
    }

    /**
     * Cancela a requisição de chat atual
     */
    private cancelCurrentRequest() {
        if (this.currentChatRequest) {
            this.currentChatRequest.abort();
            this.currentChatRequest = undefined;
            this.isProcessing = false;
            
            this.view?.webview.postMessage({
                command: 'requestCancelled'
            });
            
            console.log('[ChatProvider] Requisição cancelada pelo usuário');
        }
    }

    /**
     * Envia o contexto do arquivo ativo para o webview
     */
    private async sendActiveFileContext() {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            this.view?.webview.postMessage({
                command: 'activeFileContext',
                hasFile: false,
                content: ''
            });
            return;
        }

        const document = editor.document;
        const fileName = document.fileName;
        const relativePath = vscode.workspace.asRelativePath(fileName);
        const content = document.getText();
        const languageId = document.languageId;

        this.view?.webview.postMessage({
            command: 'activeFileContext',
            hasFile: true,
            fileName: relativePath,
            languageId: languageId,
            content: content
        });
    }

    /**
     * Envia o texto selecionado no editor para o webview
     */
    private async sendSelectionContext() {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor || editor.selection.isEmpty) {
            this.view?.webview.postMessage({
                command: 'selectionContext',
                hasSelection: false,
                content: ''
            });
            return;
        }

        const document = editor.document;
        const selection = editor.selection;
        const selectedText = document.getText(selection);
        const fileName = vscode.workspace.asRelativePath(document.fileName);
        const startLine = selection.start.line + 1;
        const endLine = selection.end.line + 1;
        const languageId = document.languageId;

        this.view?.webview.postMessage({
            command: 'selectionContext',
            hasSelection: true,
            fileName: fileName,
            startLine: startLine,
            endLine: endLine,
            languageId: languageId,
            content: selectedText
        });
    }

    /**
     * Envia os diagnósticos (erros/warnings) do VS Code para o webview
     */
    private async sendDiagnostics() {
        const allDiagnostics = vscode.languages.getDiagnostics();
        const diagnosticsList: Array<{
            file: string;
            line: number;
            severity: string;
            message: string;
            source?: string;
        }> = [];

        for (const [uri, diagnostics] of allDiagnostics) {
            const relativePath = vscode.workspace.asRelativePath(uri);
            
            for (const diagnostic of diagnostics) {
                let severity = 'info';
                switch (diagnostic.severity) {
                    case vscode.DiagnosticSeverity.Error:
                        severity = 'error';
                        break;
                    case vscode.DiagnosticSeverity.Warning:
                        severity = 'warning';
                        break;
                    case vscode.DiagnosticSeverity.Information:
                        severity = 'info';
                        break;
                    case vscode.DiagnosticSeverity.Hint:
                        severity = 'hint';
                        break;
                }

                diagnosticsList.push({
                    file: relativePath,
                    line: diagnostic.range.start.line + 1,
                    severity: severity,
                    message: diagnostic.message,
                    source: diagnostic.source
                });
            }
        }

        this.view?.webview.postMessage({
            command: 'diagnosticsContext',
            hasDiagnostics: diagnosticsList.length > 0,
            diagnostics: diagnosticsList,
            errorCount: diagnosticsList.filter(d => d.severity === 'error').length,
            warningCount: diagnosticsList.filter(d => d.severity === 'warning').length
        });
    }

    /**
     * Obtém o contexto do arquivo ativo como string formatada
     */
    private async getActiveFileContextString(): Promise<string> {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor) {
            return '';
        }

        const document = editor.document;
        const relativePath = vscode.workspace.asRelativePath(document.fileName);
        const content = document.getText();
        const languageId = document.languageId;

        return `\n\n=== ARQUIVO ATIVO: ${relativePath} (${languageId}) ===\n${content}\n=== FIM DO ARQUIVO ATIVO ===`;
    }

    /**
     * Obtém o texto selecionado como string formatada
     */
    private async getSelectionContextString(): Promise<string> {
        const editor = vscode.window.activeTextEditor;
        
        if (!editor || editor.selection.isEmpty) {
            return '';
        }

        const document = editor.document;
        const selection = editor.selection;
        const selectedText = document.getText(selection);
        const relativePath = vscode.workspace.asRelativePath(document.fileName);
        const startLine = selection.start.line + 1;
        const endLine = selection.end.line + 1;
        const languageId = document.languageId;

        return `\n\n=== CÓDIGO SELECIONADO: ${relativePath} (linhas ${startLine}-${endLine}, ${languageId}) ===\n${selectedText}\n=== FIM DA SELEÇÃO ===`;
    }

    /**
     * Obtém os diagnósticos como string formatada
     */
    private async getDiagnosticsContextString(): Promise<string> {
        const allDiagnostics = vscode.languages.getDiagnostics();
        let result = '';
        let errorCount = 0;
        let warningCount = 0;

        for (const [uri, diagnostics] of allDiagnostics) {
            const relativePath = vscode.workspace.asRelativePath(uri);
            
            for (const diagnostic of diagnostics) {
                let severity = 'INFO';
                switch (diagnostic.severity) {
                    case vscode.DiagnosticSeverity.Error:
                        severity = 'ERRO';
                        errorCount++;
                        break;
                    case vscode.DiagnosticSeverity.Warning:
                        severity = 'AVISO';
                        warningCount++;
                        break;
                }

                if (diagnostic.severity <= vscode.DiagnosticSeverity.Warning) {
                    result += `[${severity}] ${relativePath}:${diagnostic.range.start.line + 1} - ${diagnostic.message}\n`;
                }
            }
        }

        if (!result) {
            return '';
        }

        return `\n\n=== DIAGNÓSTICOS DO PROJETO (${errorCount} erros, ${warningCount} avisos) ===\n${result}=== FIM DOS DIAGNÓSTICOS ===`;
    }

    /**
     * Edita um arquivo existente substituindo texto
     */
    private async editFile(filePath: string, searchText: string, replaceText: string) {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('Nenhum workspace aberto');
            }

            const workspaceRoot = workspaceFolders[0].uri;
            const fileUri = vscode.Uri.joinPath(workspaceRoot, filePath);
            
            // Lê o arquivo atual
            const contentBytes = await vscode.workspace.fs.readFile(fileUri);
            let content = Buffer.from(contentBytes).toString('utf8');
            
            // Limpa o searchText de possíveis marcações markdown
            const cleanSearchText = searchText.trim();
            const cleanReplaceText = replaceText.trim();
            
            console.log('[Agent] Buscando texto:', cleanSearchText.substring(0, 100));
            
            // Verifica se o texto a buscar existe
            if (!content.includes(cleanSearchText)) {
                // Tenta busca mais flexível (ignorando espaços extras)
                const normalizedContent = content.replace(/\s+/g, ' ');
                const normalizedSearch = cleanSearchText.replace(/\s+/g, ' ');
                
                if (!normalizedContent.includes(normalizedSearch)) {
                    throw new Error('Texto não encontrado no arquivo. Verifique se o texto está exatamente igual ao original.');
                }
                // Se encontrou com normalização, usa regex para substituir
                const searchRegex = new RegExp(cleanSearchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'g');
                content = content.replace(searchRegex, cleanReplaceText);
            } else {
                // Substituição normal
                content = content.replace(cleanSearchText, cleanReplaceText);
            }
            
            // Salva o arquivo
            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
            
            console.log('[Agent] ✅ Arquivo editado com sucesso:', filePath);
            
            this.view?.webview.postMessage({
                command: 'fileEdited',
                path: filePath,
                success: true
            });

            vscode.window.showInformationMessage('✅ Arquivo editado: ' + filePath);
            
            // Abre o arquivo editado
            const document = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(document);
        } catch (error) {
            console.error('[ChatProvider] ❌ Erro ao editar arquivo:', error);
            this.view?.webview.postMessage({
                command: 'fileEdited',
                path: filePath,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
            vscode.window.showErrorMessage('❌ Erro ao editar arquivo: ' + (error instanceof Error ? error.message : String(error)));
        }
    }

    private async handleUserMessage(text: string) {
        if (!text.trim()) return;
        if (this.isProcessing) {
            vscode.window.showWarningMessage('Aguarde a resposta atual terminar ou cancele-a.');
            return;
        }

        this.isProcessing = true;
        console.log('[ChatProvider] Processando mensagem:', text.substring(0, 50));

        // Coleta contextos adicionais
        let additionalContext = '';
        
        // Sempre inclui o arquivo ativo e seleção quando disponíveis
        const activeFileContext = await this.getActiveFileContextString();
        const selectionContext = await this.getSelectionContextString();
        const diagnosticsContext = await this.getDiagnosticsContextString();
        
        if (activeFileContext) {
            additionalContext += activeFileContext;
        }
        if (selectionContext) {
            additionalContext += selectionContext;
        }
        if (diagnosticsContext) {
            additionalContext += diagnosticsContext;
        }

        // Verifica se precisa carregar contexto do workspace
        let workspaceContext = '';
        if (this.agentMode && this.needsWorkspaceContext(text)) {
            // Mostra indicador discreto de loading
            this.view?.webview.postMessage({
                command: 'thinking',
                text: 'Analisando workspace...'
            });
            
            workspaceContext = await this.getWorkspaceContext();
            
            // Remove indicador
            this.view?.webview.postMessage({
                command: 'thinkingComplete'
            });
        }

        if (this.messages.length === 0) {
            // Instruções do agente - serão colocadas no FINAL do system prompt
            const agentInstructions = `Você é um agente de programação. Você pode executar ações reais no sistema de arquivos do usuário.

IMPORTANTE: Para fazer qualquer modificação, você DEVE usar estes comandos especiais na sua resposta:

Para CRIAR um arquivo novo, escreva exatamente assim:
[CRIAR_ARQUIVO:caminho/do/arquivo.ts]
seu código aqui
[/CRIAR_ARQUIVO]

Para EDITAR um arquivo existente, escreva exatamente assim:
[EDITAR_ARQUIVO:caminho/do/arquivo.ts]
[BUSCAR]
código exato que existe no arquivo
[/BUSCAR]
[SUBSTITUIR]
código novo que vai substituir
[/SUBSTITUIR]
[/EDITAR_ARQUIVO]

Para EXECUTAR um comando no terminal, escreva assim:
[EXECUTAR_COMANDO]npm install express[/EXECUTAR_COMANDO]

REGRAS:
- Quando pedirem para criar arquivo, USE [CRIAR_ARQUIVO]
- Quando pedirem para editar/modificar, USE [EDITAR_ARQUIVO]  
- Quando pedirem para instalar/rodar algo, USE [EXECUTAR_COMANDO]
- NÃO mostre código em blocos markdown quando for modificar arquivos
- Os comandos serão executados automaticamente pelo sistema`;

            const chatInstructions = 'Você é um assistente de programação amigável. Use blocos de código markdown para exemplos.';

            let systemPrompt = '';
            
            // Primeiro: contexto do workspace (se houver)
            if (workspaceContext) {
                systemPrompt += workspaceContext + '\n\n';
            }
            
            // Segundo: contexto adicional (arquivo ativo, seleção, erros)
            if (additionalContext) {
                systemPrompt += additionalContext + '\n\n';
            }
            
            // Terceiro: instruções do agente (no final para serem mais "frescas" na memória do modelo)
            systemPrompt += this.agentMode ? agentInstructions : chatInstructions;
            
            // Quarto: lembrete final - bem direto
            if (this.agentMode) {
                systemPrompt += '\n\nLembre-se: Use [CRIAR_ARQUIVO:...], [EDITAR_ARQUIVO:...] ou [EXECUTAR_COMANDO] para executar ações.';
            }
            
            this.messages.push({
                role: 'system',
                content: systemPrompt
            });
        } else {
            // Atualiza contextos no system prompt existente
            // Mantém as instruções no final
            let systemContent = this.messages[0].content;
            
            // Encontra onde começam as instruções do agente
            const instructionsStart = systemContent.indexOf('Você é um agente de programação');
            const chatInstructionsStart = systemContent.indexOf('Você é um assistente de programação');
            const splitPoint = instructionsStart > -1 ? instructionsStart : (chatInstructionsStart > -1 ? chatInstructionsStart : systemContent.length);
            
            // Parte das instruções (final)
            const instructionsPart = systemContent.substring(splitPoint);
            
            // Reconstrói o system prompt
            let newSystemContent = '';
            
            // Adiciona contexto do workspace se necessário
            if (workspaceContext && !systemContent.includes('=== CONTEXTO DO WORKSPACE ===')) {
                newSystemContent += workspaceContext + '\n\n';
            } else {
                // Mantém contexto existente do workspace
                const wsMatch = systemContent.match(/=== CONTEXTO DO WORKSPACE ===[\s\S]*?=== FIM DO CONTEXTO ===/);
                if (wsMatch) {
                    newSystemContent += wsMatch[0] + '\n\n';
                }
            }
            
            // Adiciona contextos atualizados
            if (additionalContext) {
                newSystemContent += additionalContext + '\n\n';
            }
            
            // Adiciona instruções no final
            newSystemContent += instructionsPart;
            
            this.messages[0].content = newSystemContent;
        }

        this.messages.push({ role: 'user', content: text });

        this.view?.webview.postMessage({ command: 'userMessage', text });

        let assistantMessage = '';

        try {
            // Usa a nova API com suporte a cancelamento
            this.currentChatRequest = this.ollamaClient.chat(this.messages, (chunk: string) => {
                assistantMessage += chunk;
                this.view?.webview.postMessage({
                    command: 'assistantChunk',
                    text: chunk
                });
            });

            await this.currentChatRequest.promise;

            this.messages.push({ role: 'assistant', content: assistantMessage });
            
            // Processa ações apenas no modo agente
            if (this.agentMode) {
                await this.processAgentActions(assistantMessage);
            }
            
            this.view?.webview.postMessage({ command: 'assistantComplete' });

        } catch (error) {
            console.error('[ChatProvider] Erro no chat:', error);
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Não mostra erro se foi cancelamento
            if (!errorMessage.includes('cancelada')) {
                this.view?.webview.postMessage({
                    command: 'error',
                    text: errorMessage
                });
            }
        } finally {
            this.isProcessing = false;
            this.currentChatRequest = undefined;
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
'        .input-wrapper {\n' +
'            padding: 8px 12px 12px;\n' +
'        }\n' +
'        .input-container {\n' +
'            background: var(--vscode-input-background);\n' +
'            border: 1px solid var(--vscode-input-border);\n' +
'            border-radius: 8px;\n' +
'            overflow: hidden;\n' +
'        }\n' +
'        .input-container:focus-within {\n' +
'            border-color: var(--vscode-focusBorder);\n' +
'        }\n' +
'        .input-top {\n' +
'            display: flex;\n' +
'            align-items: flex-start;\n' +
'            padding: 8px 10px 4px;\n' +
'            gap: 8px;\n' +
'        }\n' +
'        .input-top .attach-btn {\n' +
'            background: none;\n' +
'            border: none;\n' +
'            color: var(--vscode-foreground);\n' +
'            opacity: 0.6;\n' +
'            cursor: pointer;\n' +
'            padding: 4px;\n' +
'            font-size: 14px;\n' +
'        }\n' +
'        .input-top .attach-btn:hover {\n' +
'            opacity: 1;\n' +
'        }\n' +
'        #messageInput {\n' +
'            flex: 1;\n' +
'            background: transparent;\n' +
'            color: var(--vscode-input-foreground);\n' +
'            border: none;\n' +
'            outline: none;\n' +
'            font-size: 13px;\n' +
'            resize: none;\n' +
'            min-height: 24px;\n' +
'            max-height: 120px;\n' +
'            font-family: var(--vscode-font-family);\n' +
'            line-height: 1.5;\n' +
'        }\n' +
'        #messageInput::placeholder {\n' +
'            color: var(--vscode-input-placeholderForeground);\n' +
'        }\n' +
'        .input-bottom {\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            justify-content: space-between;\n' +
'            padding: 6px 10px 8px;\n' +
'            border-top: 1px solid var(--vscode-panel-border);\n' +
'            gap: 8px;\n' +
'        }\n' +
'        .input-bottom-left {\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            gap: 4px;\n' +
'        }\n' +
'        .input-bottom-right {\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            gap: 6px;\n' +
'        }\n' +
'        .mode-dropdown {\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            gap: 4px;\n' +
'            padding: 4px 8px;\n' +
'            background: transparent;\n' +
'            border: none;\n' +
'            color: var(--vscode-foreground);\n' +
'            font-size: 12px;\n' +
'            cursor: pointer;\n' +
'            border-radius: 4px;\n' +
'        }\n' +
'        .mode-dropdown:hover {\n' +
'            background: var(--vscode-toolbar-hoverBackground);\n' +
'        }\n' +
'        .mode-dropdown .arrow {\n' +
'            font-size: 8px;\n' +
'            opacity: 0.6;\n' +
'        }\n' +
'        .icon-btn-sm {\n' +
'            background: none;\n' +
'            border: none;\n' +
'            color: var(--vscode-foreground);\n' +
'            opacity: 0.6;\n' +
'            cursor: pointer;\n' +
'            padding: 4px 6px;\n' +
'            font-size: 14px;\n' +
'            border-radius: 4px;\n' +
'        }\n' +
'        .icon-btn-sm:hover {\n' +
'            opacity: 1;\n' +
'            background: var(--vscode-toolbar-hoverBackground);\n' +
'        }\n' +
'        .send-btn {\n' +
'            background: var(--vscode-button-background);\n' +
'            border: none;\n' +
'            color: var(--vscode-button-foreground);\n' +
'            width: 28px;\n' +
'            height: 28px;\n' +
'            border-radius: 6px;\n' +
'            cursor: pointer;\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            justify-content: center;\n' +
'            font-size: 14px;\n' +
'        }\n' +
'        .send-btn:hover {\n' +
'            background: var(--vscode-button-hoverBackground);\n' +
'        }\n' +
'        .send-btn:disabled {\n' +
'            opacity: 0.4;\n' +
'            cursor: not-allowed;\n' +
'        }\n' +
'        .cancel-btn {\n' +
'            background: var(--vscode-button-secondaryBackground);\n' +
'            border: none;\n' +
'            color: var(--vscode-button-secondaryForeground);\n' +
'            width: 28px;\n' +
'            height: 28px;\n' +
'            border-radius: 6px;\n' +
'            cursor: pointer;\n' +
'            display: none;\n' +
'            align-items: center;\n' +
'            justify-content: center;\n' +
'            font-size: 14px;\n' +
'        }\n' +
'        .cancel-btn:hover {\n' +
'            background: var(--vscode-button-secondaryHoverBackground);\n' +
'        }\n' +
'        .cancel-btn.visible {\n' +
'            display: flex;\n' +
'        }\n' +
'        .context-indicator {\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            gap: 4px;\n' +
'            font-size: 10px;\n' +
'            opacity: 0.7;\n' +
'            padding: 2px 6px;\n' +
'            background: var(--vscode-badge-background);\n' +
'            color: var(--vscode-badge-foreground);\n' +
'            border-radius: 3px;\n' +
'        }\n' +
'        .thinking-indicator {\n' +
'            display: flex;\n' +
'            align-items: center;\n' +
'            gap: 4px;\n' +
'            font-size: 12px;\n' +
'            opacity: 0.7;\n' +
'            padding: 8px 12px;\n' +
'            color: var(--vscode-descriptionForeground);\n' +
'        }\n' +
'        .thinking-dots {\n' +
'            display: inline-flex;\n' +
'        }\n' +
'        .thinking-dots span {\n' +
'            animation: thinking 1.4s infinite;\n' +
'            opacity: 0.3;\n' +
'        }\n' +
'        .thinking-dots span:nth-child(2) { animation-delay: 0.2s; }\n' +
'        .thinking-dots span:nth-child(3) { animation-delay: 0.4s; }\n' +
'        @keyframes thinking {\n' +
'            0%, 100% { opacity: 0.3; }\n' +
'            50% { opacity: 1; }\n' +
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
'            </div>\n' +
'            <div>\n' +
'                <button class="icon-btn" id="reloadBtn" title="Reconectar">🔄</button>\n' +
'                <button class="icon-btn" id="clearBtn" title="Limpar conversa">🗑️</button>\n' +
'            </div>\n' +
'        </div>\n' +
'    </div>\n' +
'\n' +
'    <div class="chat-container" id="chatContainer">\n' +
'        <div class="empty-state">\n' +
'            <div class="icon">🤖</div>\n' +
'            <div>Descreva o que você quer construir</div>\n' +
'        </div>\n' +
'    </div>\n' +
'\n' +
'    <div class="input-wrapper">\n' +
'        <div class="input-container">\n' +
'            <div class="input-top">\n' +
'                <button class="attach-btn" id="attachBtn" title="Anexar arquivo">📎</button>\n' +
'                <textarea id="messageInput" placeholder="Descreva o que você quer construir..." rows="1"></textarea>\n' +
'            </div>\n' +
'            <div class="input-bottom">\n' +
'                <div class="input-bottom-left">\n' +
'                    <button class="mode-dropdown" id="modeBtn">\n' +
'                        <span id="modeIcon">🤖</span>\n' +
'                        <span id="modeText">Agente</span>\n' +
'                        <span class="arrow">▼</span>\n' +
'                    </button>\n' +
'                    <select class="model-select" id="modelSelect" style="font-size:11px;padding:2px 4px;max-width:150px;">\n' +
'                        <option value="">Modelo...</option>\n' +
'                    </select>\n' +
'                </div>\n' +
'                <div class="input-bottom-right">\n' +
'                    <button class="icon-btn-sm" id="settingsBtn" title="Configurações">⚙️</button>\n' +
'                    <button class="cancel-btn" id="cancelBtn" title="Cancelar">⏹</button>\n' +
'                    <button class="send-btn" id="sendBtn" title="Enviar">➤</button>\n' +
'                </div>\n' +
'            </div>\n' +
'        </div>\n' +
'    </div>\n' +
'\n' +
'    <script>\n' +
'        (function() {\n' +
'            var vscode = acquireVsCodeApi();\n' +
'            \n' +
'            var chatContainer = document.getElementById("chatContainer");\n' +
'            var messageInput = document.getElementById("messageInput");\n' +
'            var sendBtn = document.getElementById("sendBtn");\n' +
'            var cancelBtn = document.getElementById("cancelBtn");\n' +
'            var clearBtn = document.getElementById("clearBtn");\n' +
'            var settingsBtn = document.getElementById("settingsBtn");\n' +
'            var reloadBtn = document.getElementById("reloadBtn");\n' +
'            var modelSelect = document.getElementById("modelSelect");\n' +
'            var statusDot = document.getElementById("statusDot");\n' +
'            var statusText = document.getElementById("statusText");\n' +
'            var modeBtn = document.getElementById("modeBtn");\n' +
'            var modeIcon = document.getElementById("modeIcon");\n' +
'            var modeText = document.getElementById("modeText");\n' +
'            var chatLabel = document.getElementById("chatLabel");\n' +
'            var agentLabel = document.getElementById("agentLabel");\n' +
'\n' +
'            var isProcessing = false;\n' +
'            var currentAssistantContent = null;\n' +
'            var isAgentMode = true;\n' +
'\n' +
'            console.log("[WebView] Inicializado");\n' +
'            \n' +
'            console.log("[WebView] Solicitando teste de conexão...");\n' +
'            vscode.postMessage({ command: "testConnection" });\n' +
'            \n' +
'            console.log("[WebView] Solicitando lista de modelos...");\n' +
'            vscode.postMessage({ command: "listModels" });\n' +
'\n' +
'            // Botão de cancelar\n' +
'            cancelBtn.addEventListener("click", function() {\n' +
'                vscode.postMessage({ command: "cancelRequest" });\n' +
'            });\n' +
'\n' +
'            // Toggle de modo via botão dropdown\n' +
'            modeBtn.addEventListener("click", function() {\n' +
'                isAgentMode = !isAgentMode;\n' +
'                modeIcon.textContent = isAgentMode ? "🤖" : "💬";\n' +
'                modeText.textContent = isAgentMode ? "Agente" : "Chat";\n' +
'                vscode.postMessage({ command: "setMode", agentMode: isAgentMode });\n' +
'                messageInput.placeholder = isAgentMode ? "Descreva o que você quer construir..." : "Digite sua mensagem...";\n' +
'                // Limpa o chat ao trocar de modo\n' +
'                chatContainer.innerHTML = \'<div class="empty-state"><div class="icon">\' + (isAgentMode ? "🤖" : "💬") + \'</div><div>\' + (isAgentMode ? "Modo Agente: posso criar e modificar arquivos" : "Modo Chat: apenas conversa") + \'</div></div>\';\n' +
'            });\n' +
'\n' +
'            // Mudança de modelo\n' +
'            modelSelect.addEventListener("change", function() {\n' +
'                vscode.postMessage({ command: "updateModel", model: this.value });\n' +
'            });\n' +
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
'                this.style.height = Math.min(this.scrollHeight, 120) + "px";\n' +
'            });\n' +
'\n' +
'            clearBtn.addEventListener("click", function() {\n' +
'                chatContainer.innerHTML = \'<div class="empty-state"><div class="icon">\' + (isAgentMode ? "🤖" : "💬") + \'</div><div>Descreva o que você quer construir</div></div>\';\n' +
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
'                cancelBtn.classList.add("visible");\n' +
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
'\n' +'            var thinkingElement = null;\n' +
'            function showThinking(text) {\n' +
'                if (thinkingElement) {\n' +
'                    return;\n' +
'                }\n' +
'                var div = document.createElement("div");\n' +
'                div.className = "thinking-indicator";\n' +
'                div.innerHTML = \'<span class="thinking-dots"><span>.</span><span>.</span><span>.</span></span> \' + text;\n' +
'                chatContainer.appendChild(div);\n' +
'                thinkingElement = div;\n' +
'                chatContainer.scrollTop = chatContainer.scrollHeight;\n' +
'            }\n' +
'\n' +'            function hideThinking() {\n' +
'                if (thinkingElement) {\n' +
'                    thinkingElement.remove();\n' +
'                    thinkingElement = null;\n' +
'                }\n' +
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
'                cancelBtn.classList.remove("visible");\n' +
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
'                    case "thinking":\n' +
'                        showThinking(msg.text);\n' +
'                        break;\n' +
'                    case "thinkingComplete":\n' +
'                        hideThinking();\n' +
'                        break;\n' +
'                    case "requestCancelled":\n' +
'                        if (currentAssistantContent) {\n' +
'                            currentAssistantContent.textContent += "\\n\\n⏹ Cancelado pelo usuário";\n' +
'                        }\n' +
'                        completeMessage();\n' +
'                        break;\n' +
'                    case "fileEdited":\n' +
'                        if (msg.success) {\n' +
'                            addSystemMessage("✅ Arquivo editado: " + msg.path);\n' +
'                        } else {\n' +
'                            addSystemMessage("❌ Erro ao editar: " + msg.error);\n' +
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
