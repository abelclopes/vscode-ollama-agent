# Ollama Agent - Shell Script

Script shell para conectar diretamente à API Ollama usando linha de comando do Linux com suporte a autenticação por token.

## Requisitos

- `curl` instalado no sistema
- Servidor Ollama rodando (local ou remoto)

## Instalação

```bash
# Tornar o script executável (se necessário)
chmod +x ollama-agent.sh

# Testar a instalação
./test.sh
```

## Início Rápido

```bash
# 1. Verificar se está tudo OK
./test.sh

# 2. Testar conexão com o servidor
./ollama-agent.sh --test-connection

# 3. Listar modelos disponíveis
./ollama-agent.sh --list-models

# 4. Enviar primeira mensagem
./ollama-agent.sh "Olá!"
```

## Arquivos

- `ollama-agent.sh` - Script principal
- `README.md` - Esta documentação
- `EXEMPLOS.md` - Exemplos práticos de uso
- `ollama-agent.conf.example` - Arquivo de configuração exemplo
- `test.sh` - Script para testar a instalação

## Uso Básico

### Enviar uma mensagem simples

```bash
./ollama-agent.sh "Olá, como você está?"
```

### Usar com token de autenticação

```bash
./ollama-agent.sh -t seu-token-aqui "Crie um hello world em Python"
```

### Modo interativo

```bash
./ollama-agent.sh -i
```

ou com token:

```bash
./ollama-agent.sh -t seu-token-aqui -i
```

## Opções

| Opção | Descrição | Padrão |
|-------|-----------|--------|
| `-h, --help` | Exibir ajuda | - |
| `-s, --server URL` | URL do servidor Ollama | `http://192.168.1.86:11434` |
| `-m, --model MODEL` | Modelo a usar | `qwen2.5-coder:latest` |
| `-t, --token TOKEN` | Token de autenticação da API | - |
| `-T, --temperature N` | Temperatura (0.0-1.0) | `0.7` |
| `-i, --interactive` | Modo interativo | - |
| `--test-connection` | Testar conexão com servidor | - |
| `--list-models` | Listar modelos disponíveis | - |

## Variáveis de Ambiente

Você pode configurar o script usando variáveis de ambiente:

```bash
export OLLAMA_SERVER_URL="http://localhost:11434"
export OLLAMA_MODEL="qwen2.5-coder:latest"
export OLLAMA_API_TOKEN="seu-token-aqui"
export OLLAMA_TEMPERATURE="0.7"

./ollama-agent.sh "Sua mensagem"
```

## Exemplos de Uso

### Testar conexão

```bash
./ollama-agent.sh --test-connection
```

### Listar modelos disponíveis

```bash
./ollama-agent.sh --list-models
```

### Usar servidor diferente

```bash
./ollama-agent.sh -s http://localhost:11434 "Explique o que é REST API"
```

### Usar modelo específico

```bash
./ollama-agent.sh -m llama2:latest "Escreva um poema sobre programação"
```

### Usar com token e servidor customizado

```bash
./ollama-agent.sh \
  -s http://api.ollama.example.com:11434 \
  -t "seu-token-secreto" \
  -m codellama:latest \
  "Crie uma função para ordenar array em JavaScript"
```

Nota: O script adiciona automaticamente o prefixo "Bearer " ao token. Forneça apenas o token em si.

### Modo interativo com todas as configurações

```bash
export OLLAMA_SERVER_URL="http://localhost:11434"
export OLLAMA_MODEL="qwen2.5-coder:latest"
export OLLAMA_API_TOKEN="seu-token-aqui"

./ollama-agent.sh -i
```

## Autenticação com Token

O script suporta autenticação via token de API. O token pode ser fornecido de duas formas:

1. **Pela linha de comando:**
   ```bash
   ./ollama-agent.sh -t "seu-token-aqui" "mensagem"
   ```

2. **Por variável de ambiente:**
   ```bash
   export OLLAMA_API_TOKEN="seu-token-aqui"
   ./ollama-agent.sh "mensagem"
   ```

O token é enviado no header HTTP como: `Authorization: Bearer <token>`

## Integração com Sistema

### Adicionar ao PATH

Para usar o script de qualquer diretório:

```bash
# Copiar para /usr/local/bin
sudo cp ollama-agent.sh /usr/local/bin/ollama-agent
sudo chmod +x /usr/local/bin/ollama-agent

# Agora pode usar de qualquer lugar
ollama-agent "Olá!"
```

### Criar alias

Adicione ao seu `~/.bashrc` ou `~/.zshrc`:

```bash
alias ollama="./path/to/ollama-agent.sh"
alias ollama-chat="./path/to/ollama-agent.sh -i"
```

## Streaming de Respostas

O script processa respostas em streaming, ou seja, exibe o texto conforme vai sendo gerado pelo modelo, proporcionando uma experiência mais interativa.

## Troubleshooting

### Erro: curl não está instalado

```bash
# Ubuntu/Debian
sudo apt-get install curl

# CentOS/RHEL
sudo yum install curl

# MacOS
brew install curl
```

### Erro de conexão

Verifique se:
1. O servidor Ollama está rodando
2. A URL está correta
3. A porta está acessível
4. O firewall não está bloqueando

```bash
# Testar conexão
./ollama-agent.sh --test-connection

# Verificar se o servidor responde
curl http://192.168.1.86:11434/api/tags
```

### Token inválido

Se estiver usando token de autenticação, verifique se:
1. O token está correto
2. O servidor Ollama suporta autenticação
3. O formato do token está correto (Bearer token)

## Notas

- O script usa `sh` puro (POSIX compliant), funcionando em qualquer sistema Unix/Linux
- Suporta streaming de respostas em tempo real
- Compatível com qualquer API que siga o formato do Ollama
- Pode ser facilmente integrado em scripts automatizados ou pipelines

## Mais Informações

- **Exemplos práticos**: Veja [EXEMPLOS.md](EXEMPLOS.md) para casos de uso avançados
- **Teste de instalação**: Execute `./test.sh` para verificar se tudo está funcionando

## Licença

MIT - Veja LICENSE no diretório raiz do projeto
