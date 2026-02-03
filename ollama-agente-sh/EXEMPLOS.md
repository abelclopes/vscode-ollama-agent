# Exemplos de Uso - Ollama Agent Shell Script

Este documento contém exemplos práticos de uso do `ollama-agent.sh`.

## Índice
- [Uso Básico](#uso-básico)
- [Configuração](#configuração)
- [Modo Interativo](#modo-interativo)
- [Autenticação com Token](#autenticação-com-token)
- [Tarefas Comuns](#tarefas-comuns)
- [Integração com Outros Scripts](#integração-com-outros-scripts)

## Uso Básico

### Primeira execução - Verificar conexão

```bash
cd ollama-agente-sh
./ollama-agent.sh --test-connection
```

### Listar modelos disponíveis

```bash
./ollama-agent.sh --list-models
```

### Enviar uma pergunta simples

```bash
./ollama-agent.sh "O que é inteligência artificial?"
```

## Configuração

### Usar servidor local

```bash
./ollama-agent.sh -s http://localhost:11434 "Olá!"
```

### Usar modelo específico

```bash
./ollama-agent.sh -m llama2:latest "Explique sobre REST APIs"
```

### Configurar via variáveis de ambiente

```bash
export OLLAMA_SERVER_URL="http://localhost:11434"
export OLLAMA_MODEL="qwen2.5-coder:latest"
export OLLAMA_TEMPERATURE="0.3"

./ollama-agent.sh "Crie uma função Python para calcular fibonacci"
```

### Usar arquivo de configuração

```bash
# 1. Criar configuração
cp ollama-agent.conf.example ~/.ollama-agent.conf

# 2. Editar as configurações
nano ~/.ollama-agent.conf

# 3. Carregar e usar
source ~/.ollama-agent.conf
./ollama-agent.sh "Sua pergunta aqui"
```

## Modo Interativo

### Iniciar modo interativo básico

```bash
./ollama-agent.sh -i
```

Saída:
```
=== Ollama Agent - Modo Interativo ===
Digite suas mensagens (ou 'sair' para terminar)
Servidor: http://192.168.1.86:11434
Modelo: qwen2.5-coder:latest

Você: _
```

### Modo interativo com configurações customizadas

```bash
./ollama-agent.sh -s http://localhost:11434 -m codellama:latest -i
```

### Exemplo de conversa interativa

```
Você: Como criar um servidor HTTP em Node.js?
Assistente: Para criar um servidor HTTP em Node.js, você pode usar o módulo 'http' nativo...

Você: Pode mostrar um exemplo de código?
Assistente: Claro! Aqui está um exemplo simples...

Você: sair
Até logo!
```

## Autenticação com Token

### Token via linha de comando

```bash
./ollama-agent.sh -t "meu-token-secreto" "Pergunta aqui"
```

### Token via variável de ambiente

```bash
export OLLAMA_API_TOKEN="meu-token-secreto"
./ollama-agent.sh "Pergunta aqui"
```

### Token em arquivo de configuração seguro

```bash
# 1. Criar arquivo de configuração
cat > ~/.ollama-agent.conf << 'EOF'
export OLLAMA_SERVER_URL="http://api.empresa.com:11434"
export OLLAMA_MODEL="qwen2.5-coder:latest"
export OLLAMA_API_TOKEN="seu-token-seguro-aqui"
EOF

# 2. Configurar permissões restritas
chmod 600 ~/.ollama-agent.conf

# 3. Usar quando necessário
source ~/.ollama-agent.conf
./ollama-agent.sh -i
```

### Token para servidor corporativo

```bash
# Servidor com autenticação
./ollama-agent.sh \
  -s https://ollama.empresa.com:443 \
  -t "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -m qwen2.5-coder:latest \
  "Sua pergunta"
```

## Tarefas Comuns

### Programação - Gerar código

```bash
./ollama-agent.sh "Crie uma função JavaScript que valida email usando regex"
```

```bash
./ollama-agent.sh "Escreva um script Python para ler arquivo CSV e calcular média"
```

### Explicações técnicas

```bash
./ollama-agent.sh "Explique a diferença entre REST e GraphQL"
```

```bash
./ollama-agent.sh "O que é Docker e para que serve?"
```

### Debugging e resolução de problemas

```bash
./ollama-agent.sh "Por que estou recebendo 'CORS error' na minha aplicação web?"
```

```bash
./ollama-agent.sh "Como resolver erro 'ECONNREFUSED' no Node.js?"
```

### Documentação

```bash
./ollama-agent.sh "Escreva um README para um projeto de API REST em Express"
```

### Code Review

```bash
./ollama-agent.sh "Revise este código: function add(a,b){return a+b;}"
```

### Refatoração

```bash
./ollama-agent.sh -T 0.2 "Refatore esta função para usar arrow functions e destructuring: function getUserName(user) { return user.name; }"
```

Nota: Temperatura baixa (0.2) para refatoração mais determinística.

## Integração com Outros Scripts

### Usar em pipeline

```bash
echo "O que é Git?" | xargs ./ollama-agent.sh
```

### Processar múltiplas perguntas de arquivo

```bash
# Criar arquivo com perguntas
cat > perguntas.txt << 'EOF'
O que é Python?
Como instalar Node.js?
Explique sobre Docker
EOF

# Processar cada linha
while IFS= read -r pergunta; do
    echo "=== Pergunta: $pergunta ==="
    ./ollama-agent.sh "$pergunta"
    echo ""
done < perguntas.txt
```

### Script de automação

```bash
#!/bin/bash
# analyze-code.sh - Analisa código usando Ollama

CODE_FILE="$1"

if [ ! -f "$CODE_FILE" ]; then
    echo "Uso: $0 <arquivo-codigo>"
    exit 1
fi

CODE_CONTENT=$(cat "$CODE_FILE")

./ollama-agent.sh "Analise este código e sugira melhorias: $CODE_CONTENT"
```

### Criar alias para uso rápido

Adicione ao `~/.bashrc` ou `~/.zshrc`:

```bash
# Ollama aliases
alias ask='cd /path/to/ollama-agente-sh && ./ollama-agent.sh'
alias chat='cd /path/to/ollama-agente-sh && ./ollama-agent.sh -i'
alias code='cd /path/to/ollama-agente-sh && ./ollama-agent.sh -m qwen2.5-coder:latest'
```

Uso:
```bash
ask "Qual a diferença entre var, let e const?"
chat  # Inicia modo interativo
code "Crie uma API REST em Express"
```

### Função Bash customizada

```bash
# Adicione ao ~/.bashrc
ollama-ask() {
    local model="${OLLAMA_MODEL:-qwen2.5-coder:latest}"
    local server="${OLLAMA_SERVER_URL:-http://localhost:11434}"
    
    /path/to/ollama-agent.sh -s "$server" -m "$model" "$@"
}

# Uso
ollama-ask "Como usar git rebase?"
```

### Script de produtividade - Gerador de commits

```bash
#!/bin/bash
# git-smart-commit.sh

# Obter diff das mudanças
CHANGES=$(git diff --staged)

if [ -z "$CHANGES" ]; then
    echo "Nenhuma mudança staged para commit"
    exit 1
fi

echo "Gerando mensagem de commit..."
COMMIT_MSG=$(./ollama-agent.sh -T 0.3 "Com base nestas mudanças de código, sugira uma mensagem de commit concisa e descritiva seguindo conventional commits: $CHANGES")

echo ""
echo "Mensagem sugerida:"
echo "$COMMIT_MSG"
echo ""
read -p "Usar esta mensagem? (s/n) " -n 1 -r
echo

if [[ $REPLY =~ ^[Ss]$ ]]; then
    git commit -m "$COMMIT_MSG"
fi
```

### Integração com editor de texto

```bash
#!/bin/bash
# vim-ollama.sh - Integração com Vim/Neovim

SELECTED_TEXT="$1"

if [ -z "$SELECTED_TEXT" ]; then
    echo "Nenhum texto selecionado"
    exit 1
fi

./ollama-agent.sh "Explique este código: $SELECTED_TEXT"
```

## Dicas e Truques

### 1. Ajustar criatividade com temperatura

```bash
# Mais determinístico (bom para código)
./ollama-agent.sh -T 0.1 "Crie função de ordenação"

# Balanceado (padrão)
./ollama-agent.sh -T 0.7 "Explique REST API"

# Mais criativo (bom para texto)
./ollama-agent.sh -T 0.9 "Escreva um poema sobre código"
```

### 2. Perguntas longas de arquivo

```bash
./ollama-agent.sh "$(cat minha-pergunta-longa.txt)"
```

### 3. Salvar resposta em arquivo

```bash
./ollama-agent.sh "Explique Docker" > resposta.txt
```

### 4. Combinar comandos

```bash
# Verificar conexão antes de perguntar
./ollama-agent.sh --test-connection && ./ollama-agent.sh "Sua pergunta"
```

### 5. Debug de problemas

```bash
# Ver requisições curl detalhadas
# Edite o script e adicione -v ao curl para debug
```

## Exemplos Avançados

### Sistema multi-agente simples

```bash
#!/bin/bash
# multi-agent.sh - Diferentes agentes para diferentes tarefas

code_agent() {
    OLLAMA_MODEL="qwen2.5-coder:latest" \
    OLLAMA_TEMPERATURE="0.2" \
    ./ollama-agent.sh "$@"
}

creative_agent() {
    OLLAMA_MODEL="llama2:latest" \
    OLLAMA_TEMPERATURE="0.9" \
    ./ollama-agent.sh "$@"
}

# Uso
code_agent "Crie uma API REST"
creative_agent "Escreva documentação criativa para esta API"
```

### Pipeline de processamento

```bash
#!/bin/bash
# code-pipeline.sh - Gera, revisa e documenta código

echo "1. Gerando código..."
CODE=$(./ollama-agent.sh -T 0.2 "Crie uma função JavaScript para validar CPF")

echo "2. Revisando código..."
REVIEW=$(./ollama-agent.sh -T 0.3 "Revise este código e sugira melhorias: $CODE")

echo "3. Gerando documentação..."
DOCS=$(./ollama-agent.sh -T 0.5 "Crie documentação JSDoc para: $CODE")

echo "=== CÓDIGO ==="
echo "$CODE"
echo ""
echo "=== REVISÃO ==="
echo "$REVIEW"
echo ""
echo "=== DOCUMENTAÇÃO ==="
echo "$DOCS"
```

## Conclusão

Este script oferece uma interface flexível e poderosa para interagir com o Ollama via linha de comando. Experimente diferentes combinações de opções para encontrar o fluxo de trabalho ideal para suas necessidades!
