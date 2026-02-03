#!/bin/sh

# Ollama Agent Shell Script
# Script para conectar na API Ollama usando token de autenticação
# Uso: ./ollama-agent.sh [mensagem]

# Configurações padrão
OLLAMA_SERVER_URL="${OLLAMA_SERVER_URL:-http://192.168.1.86:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-qwen2.5-coder:latest}"
OLLAMA_TEMPERATURE="${OLLAMA_TEMPERATURE:-0.7}"
OLLAMA_API_TOKEN="${OLLAMA_API_TOKEN:-}"

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função para exibir uso
show_usage() {
    echo "Uso: $0 [opções] [mensagem]"
    echo ""
    echo "Opções:"
    echo "  -h, --help           Exibir esta ajuda"
    echo "  -s, --server URL     URL do servidor Ollama (padrão: $OLLAMA_SERVER_URL)"
    echo "  -m, --model MODEL    Modelo a usar (padrão: $OLLAMA_MODEL)"
    echo "  -t, --token TOKEN    Token de autenticação da API"
    echo "  -T, --temperature N  Temperatura (padrão: $OLLAMA_TEMPERATURE)"
    echo "  -i, --interactive    Modo interativo"
    echo "  --test-connection    Testar conexão com servidor"
    echo "  --list-models        Listar modelos disponíveis"
    echo ""
    echo "Variáveis de Ambiente:"
    echo "  OLLAMA_SERVER_URL    URL do servidor Ollama"
    echo "  OLLAMA_MODEL         Modelo padrão"
    echo "  OLLAMA_API_TOKEN     Token de autenticação"
    echo "  OLLAMA_TEMPERATURE   Temperatura (0.0-1.0)"
    echo ""
    echo "Exemplos:"
    echo "  $0 \"Olá, como você está?\""
    echo "  $0 -t seu-token-aqui \"Crie um hello world em Python\""
    echo "  $0 -s http://localhost:11434 --test-connection"
    echo "  OLLAMA_API_TOKEN=token123 $0 -i"
}

# Função para fazer requisições HTTP
http_request() {
    local method="$1"
    local path="$2"
    local data="$3"
    local headers=""
    
    # Adiciona token se disponível
    if [ -n "$OLLAMA_API_TOKEN" ]; then
        headers="Authorization: Bearer $OLLAMA_API_TOKEN"
    fi
    
    if [ "$method" = "GET" ]; then
        if [ -n "$headers" ]; then
            curl -s -X GET "$OLLAMA_SERVER_URL$path" -H "$headers"
        else
            curl -s -X GET "$OLLAMA_SERVER_URL$path"
        fi
    elif [ "$method" = "POST" ]; then
        if [ -n "$headers" ]; then
            curl -s -X POST "$OLLAMA_SERVER_URL$path" \
                -H "Content-Type: application/json" \
                -H "$headers" \
                -d "$data"
        else
            curl -s -X POST "$OLLAMA_SERVER_URL$path" \
                -H "Content-Type: application/json" \
                -d "$data"
        fi
    fi
}

# Função para testar conexão
test_connection() {
    echo "${BLUE}Testando conexão com $OLLAMA_SERVER_URL...${NC}"
    response=$(http_request "GET" "/api/tags" "")
    
    if [ $? -eq 0 ] && [ -n "$response" ]; then
        echo "${GREEN}✓ Conexão bem-sucedida!${NC}"
        return 0
    else
        echo "${RED}✗ Falha na conexão${NC}"
        return 1
    fi
}

# Função para listar modelos
list_models() {
    echo "${BLUE}Listando modelos disponíveis...${NC}"
    response=$(http_request "GET" "/api/tags" "")
    
    if [ $? -eq 0 ] && [ -n "$response" ]; then
        echo "$response" | grep -o '"name":"[^"]*"' | sed 's/"name":"//g' | sed 's/"//g'
    else
        echo "${RED}Erro ao listar modelos${NC}"
        return 1
    fi
}

# Função para processar resposta em streaming
process_stream() {
    local line
    while IFS= read -r line; do
        if [ -n "$line" ]; then
            # Extrai o conteúdo da mensagem do JSON
            # Nota: Esta regex simples não suporta aspas escapadas dentro do conteúdo.
            # Para parsing JSON robusto, considere instalar 'jq' e usar: echo "$line" | jq -r '.message.content // empty'
            content=$(echo "$line" | grep -o '"content":"[^"]*"' | sed 's/"content":"//g' | sed 's/"//g' | sed 's/\\n/\n/g')
            if [ -n "$content" ]; then
                printf "%s" "$content"
            fi
        fi
    done
    echo "" # Nova linha no final
}

# Função para enviar mensagem
send_message() {
    local message="$1"
    local json_data
    
    # Escapa caracteres especiais JSON na mensagem
    # Nota: Para escaping JSON completo, considere usar uma ferramenta como jq
    message=$(echo "$message" | sed 's/\\/\\\\/g' | sed 's/"/\\"/g' | sed 's/\t/\\t/g')
    
    # Cria o JSON da requisição
    json_data=$(cat <<EOF
{
    "model": "$OLLAMA_MODEL",
    "messages": [
        {
            "role": "system",
            "content": "Você é um assistente de programação útil e amigável."
        },
        {
            "role": "user",
            "content": "$message"
        }
    ],
    "stream": true,
    "options": {
        "temperature": $OLLAMA_TEMPERATURE
    },
    "keep_alive": "5m"
}
EOF
)
    
    echo "${YELLOW}Enviando mensagem para $OLLAMA_MODEL...${NC}"
    echo ""
    
    # Envia requisição e processa streaming
    http_request "POST" "/api/chat" "$json_data" | process_stream
    
    echo ""
}

# Modo interativo
interactive_mode() {
    echo "${GREEN}=== Ollama Agent - Modo Interativo ===${NC}"
    echo "Digite suas mensagens (ou 'sair' para terminar)"
    echo "Servidor: $OLLAMA_SERVER_URL"
    echo "Modelo: $OLLAMA_MODEL"
    if [ -n "$OLLAMA_API_TOKEN" ]; then
        echo "Autenticação: Ativa (token configurado)"
    fi
    echo ""
    
    while true; do
        printf "${BLUE}Você: ${NC}"
        read -r user_input
        
        if [ "$user_input" = "sair" ] || [ "$user_input" = "exit" ] || [ "$user_input" = "quit" ]; then
            echo "${GREEN}Até logo!${NC}"
            break
        fi
        
        if [ -n "$user_input" ]; then
            printf "${GREEN}Assistente: ${NC}"
            send_message "$user_input"
        fi
    done
}

# Verifica se curl está instalado
if ! command -v curl >/dev/null 2>&1; then
    echo "${RED}Erro: curl não está instalado${NC}"
    echo "Instale com: sudo apt-get install curl"
    exit 1
fi

# Parse de argumentos
INTERACTIVE=0
TEST_CONNECTION=0
LIST_MODELS=0

while [ $# -gt 0 ]; do
    case "$1" in
        -h|--help)
            show_usage
            exit 0
            ;;
        -s|--server)
            OLLAMA_SERVER_URL="$2"
            shift 2
            ;;
        -m|--model)
            OLLAMA_MODEL="$2"
            shift 2
            ;;
        -t|--token)
            OLLAMA_API_TOKEN="$2"
            shift 2
            ;;
        -T|--temperature)
            OLLAMA_TEMPERATURE="$2"
            shift 2
            ;;
        -i|--interactive)
            INTERACTIVE=1
            shift
            ;;
        --test-connection)
            TEST_CONNECTION=1
            shift
            ;;
        --list-models)
            LIST_MODELS=1
            shift
            ;;
        -*)
            echo "${RED}Opção desconhecida: $1${NC}"
            show_usage
            exit 1
            ;;
        *)
            # Primeira opção sem hífen é a mensagem
            MESSAGE="$*"
            break
            ;;
    esac
done

# Executa ação baseada nos argumentos
if [ $TEST_CONNECTION -eq 1 ]; then
    test_connection
    exit $?
elif [ $LIST_MODELS -eq 1 ]; then
    list_models
    exit $?
elif [ $INTERACTIVE -eq 1 ]; then
    interactive_mode
    exit 0
elif [ -n "$MESSAGE" ]; then
    send_message "$MESSAGE"
    exit 0
else
    show_usage
    exit 1
fi
