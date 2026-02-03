#!/bin/sh

# Script de teste para ollama-agent.sh
# Verifica se o script está funcionando corretamente

echo "=== Teste do Ollama Agent Shell Script ==="
echo ""

# Cores
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCRIPT="$SCRIPT_DIR/ollama-agent.sh"

# Contador de testes
TOTAL_TESTS=0
PASSED_TESTS=0

run_test() {
    local test_name="$1"
    local test_command="$2"
    
    TOTAL_TESTS=$((TOTAL_TESTS + 1))
    
    printf "Teste %d: %s... " "$TOTAL_TESTS" "$test_name"
    
    if eval "$test_command" > /dev/null 2>&1; then
        printf "${GREEN}✓ PASSOU${NC}\n"
        PASSED_TESTS=$((PASSED_TESTS + 1))
        return 0
    else
        printf "${RED}✗ FALHOU${NC}\n"
        return 1
    fi
}

echo "Diretório: $SCRIPT_DIR"
echo "Script: $SCRIPT"
echo ""

# Teste 1: Script existe
run_test "Script existe" "test -f '$SCRIPT'"

# Teste 2: Script é executável
run_test "Script é executável" "test -x '$SCRIPT'"

# Teste 3: curl está instalado
run_test "curl está instalado" "command -v curl"

# Teste 4: Script tem sintaxe válida
run_test "Sintaxe do script válida" "sh -n '$SCRIPT'"

# Teste 5: Help funciona
run_test "Comando --help funciona" "'$SCRIPT' --help"

# Teste 6: Aceita servidor customizado
run_test "Aceita opção -s" "'$SCRIPT' -s http://localhost:11434 --help"

# Teste 7: Aceita modelo customizado
run_test "Aceita opção -m" "'$SCRIPT' -m llama2:latest --help"

# Teste 8: Aceita token
run_test "Aceita opção -t" "'$SCRIPT' -t test-token --help"

# Teste 9: Aceita temperatura
run_test "Aceita opção -T" "'$SCRIPT' -T 0.5 --help"

# Teste 10: Variáveis de ambiente funcionam
run_test "Aceita variáveis de ambiente" "OLLAMA_SERVER_URL=http://test:11434 '$SCRIPT' --help"

echo ""
echo "=== Resultado dos Testes ==="
echo "Total: $TOTAL_TESTS testes"
echo "${GREEN}Passaram: $PASSED_TESTS${NC}"

FAILED_TESTS=$((TOTAL_TESTS - PASSED_TESTS))
if [ $FAILED_TESTS -gt 0 ]; then
    echo "${RED}Falharam: $FAILED_TESTS${NC}"
    echo ""
    echo "${YELLOW}Alguns testes falharam. Verifique a instalação.${NC}"
    exit 1
else
    echo ""
    echo "${GREEN}✓ Todos os testes passaram!${NC}"
    echo ""
    echo "Próximos passos:"
    echo "1. Teste a conexão: $SCRIPT --test-connection"
    echo "2. Liste modelos: $SCRIPT --list-models"
    echo "3. Envie uma mensagem: $SCRIPT \"Olá!\""
    echo "4. Modo interativo: $SCRIPT -i"
    exit 0
fi
