# Ollama Chat Agent

Uma extensão VS Code para chat com modelos Ollama rodando na sua rede local.

## Funcionalidades

🤖 **Chat com IA** - Converse com modelos Ollama diretamente no VS Code

📁 **Agente de Código** - O assistente pode:
- ✅ Criar arquivos no seu projeto
- 📖 Ler arquivos existentes
- 📂 Listar diretórios
- 🗑️ Deletar arquivos
- ⚡ Executar comandos no terminal

## Requisitos

- [Ollama](https://ollama.ai) instalado e rodando (local ou na rede)
- Pelo menos um modelo instalado (ex: `ollama pull qwen2.5-coder`)

## Configuração

Acesse as configurações do VS Code e configure:

- `ollamaAgent.serverUrl`: URL do servidor Ollama (padrão: `http://192.168.1.86:11434`)
- `ollamaAgent.model`: Modelo a ser usado (padrão: `qwen2.5-coder:latest`)
- `ollamaAgent.temperature`: Temperatura do modelo (padrão: `0.7`)

## Como usar

1. Clique no ícone do Ollama Chat na barra lateral
2. Digite sua mensagem e pressione Enter
3. O assistente pode criar e modificar arquivos automaticamente quando solicitado

## Exemplos de uso

```
"Crie um arquivo hello.js que imprime Hello World"
"Liste os arquivos na pasta src"
"Leia o conteúdo do package.json"
"Execute npm install express"
```

## Licença

MIT
