import * as http from 'http';
import * as vscode from 'vscode';
import { URL } from 'url';

export interface OllamaMessage {
    role: string;
    content: string;
}

export class OllamaClient {
    private serverUrl: string;

    constructor() {
        const config = vscode.workspace.getConfiguration('ollamaAgent');
        this.serverUrl = config.get<string>('serverUrl', 'http://192.168.1.86:11434');
    }

    public updateServerUrl(url: string) {
        this.serverUrl = url;
    }

    public async testConnection(): Promise<boolean> {
        try {
            await this.makeRequest('GET', '/api/tags');
            return true;
        } catch (e) {
            console.error('Connection test failed:', e);
            return false;
        }
    }

    public async listModels(): Promise<string[]> {
        try {
            const response = await this.makeRequest('GET', '/api/tags');
            const data = JSON.parse(response);
            return data.models ? data.models.map((m: any) => m.name) : [];
        } catch (e) {
            console.error('List models failed:', e);
            return [];
        }
    }

    public async chat(messages: OllamaMessage[], onChunk: (chunk: string) => void): Promise<void> {
        const config = vscode.workspace.getConfiguration('ollamaAgent');
        const model = config.get<string>('model', 'qwen2.5-coder:latest');
        const temperature = config.get<number>('temperature', 0.7);

        const body = JSON.stringify({
            model,
            messages,
            stream: true,
            options: { temperature },
            keep_alive: "5m"
        });

        return new Promise((resolve, reject) => {
            const url = new URL(this.serverUrl);
            const options = {
                hostname: url.hostname,
                port: url.port ? parseInt(url.port, 10) : 11434,
                path: '/api/chat',
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(body)
                }
            };

            const req = http.request(options, (res) => {
                if (res.statusCode !== 200) {
                    reject(new Error(`Status Code: ${res.statusCode}`));
                    return;
                }

                res.setEncoding('utf8');
                let buffer = '';
                
                res.on('data', (chunk) => {
                    buffer += chunk;
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    
                    for (const line of lines) {
                        if (line.trim() === '') continue;
                        try {
                            const json = JSON.parse(line);
                            if (json.message && json.message.content) {
                                onChunk(json.message.content);
                            }
                            if (json.done) {
                                resolve();
                            }
                        } catch (e) {
                            // Ignore parse errors for partial chunks
                        }
                    }
                });

                res.on('end', () => {
                    if (buffer.trim()) {
                        try {
                            const json = JSON.parse(buffer);
                            if (json.message && json.message.content) {
                                onChunk(json.message.content);
                            }
                        } catch (e) {
                            // Ignore
                        }
                    }
                    resolve();
                });
            });

            req.on('error', (e) => reject(e));
            req.write(body);
            req.end();
        });
    }

    private makeRequest(method: string, path: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const url = new URL(this.serverUrl);
            const options = {
                hostname: url.hostname,
                port: url.port ? parseInt(url.port, 10) : 11434,
                path: path,
                method: method
            };

            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) resolve(data);
                    else reject(new Error(`Status: ${res.statusCode}`));
                });
            });

            req.on('error', (e) => reject(e));
            req.end();
        });
    }
}
