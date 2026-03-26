# 🤖 Skills do Ollama Chat Agent

## Comparação: Antes vs Depois

### ✅ Skills Antigos (Mantidos e Funcionais)
1. **CRIAR_ARQUIVO** - Cria novos arquivos no projeto
2. **LER_ARQUIVO** - Lê conteúdo de arquivos existentes
3. **LISTAR_DIRETORIO** - Lista conteúdo de diretórios
4. **DELETAR_ARQUIVO** - Remove arquivos
5. **EXECUTAR_COMANDO** - Executa comandos no terminal

### 🆕 Skills Novos (Adicionados - Copilot Parity)
1. **EDITAR_ARQUIVO** - Modifica conteúdo de arquivos existentes
2. **BUSCAR_SIMBOLOS** - Busca funções, classes, métodos no workspace
3. **BUSCAR_REFS** - Encontra todas as referências de um símbolo
4. **BUSCAR_TEXTO** - Realiza busca de texto em múltiplos arquivos
5. **EXPLORAR_PROJETO** - Mapeia e exibe a estrutura do projeto
6. **EXECUTAR_VSCODE** - Executa comandos nativos do VS Code

---

## 📋 Sintaxe Completa dos Comandos

### 1. Criar Arquivo
```
[CRIAR_ARQUIVO:caminho/arquivo.ext]
conteúdo do arquivo aqui
[/CRIAR_ARQUIVO]
```

### 2. Editar Arquivo
```
[EDITAR_ARQUIVO:caminho/arquivo.ext]
novo conteúdo completo
[/EDITAR_ARQUIVO]
```

### 3. Ler Arquivo
```
[LER_ARQUIVO:caminho/arquivo.ext][/LER_ARQUIVO]
```

### 4. Listar Diretório
```
[LISTAR_DIRETORIO:caminho/para/dir][/LISTAR_DIRETORIO]
```

### 5. Deletar Arquivo
```
[DELETAR_ARQUIVO:caminho/arquivo.ext][/DELETAR_ARQUIVO]
```

### 6. Buscar Símbolos
```
[BUSCAR_SIMBOLOS:nome_da_funcao][/BUSCAR_SIMBOLOS]
[BUSCAR_SIMBOLOS:ClassesName][/BUSCAR_SIMBOLOS]
```

### 7. Buscar Referências
```
[BUSCAR_REFS:variableName][/BUSCAR_REFS]
```

### 8. Buscar Texto
```
[BUSCAR_TEXTO:texto para buscar][/BUSCAR_TEXTO]
```

### 9. Explorar Projeto
```
[EXPLORAR_PROJETO][/EXPLORAR_PROJETO]
```

### 10. Executar Comando VS Code
```
[EXECUTAR_VSCODE:workbench.action.quickOpen][/EXECUTAR_VSCODE]
[EXECUTAR_VSCODE:editor.action.formatDocument][/EXECUTAR_VSCODE]
```

### 11. Executar Comando Terminal
```
[EXECUTAR_COMANDO]npm install express[/EXECUTAR_COMANDO]
[EXECUTAR_COMANDO]git status[/EXECUTAR_COMANDO]
```

---

## 🎯 Exemplos de Uso

### Exemplo 1: Criar e Editar um Arquivo
```
Usuário: Crie um arquivo utils.ts com uma função de validação

[CRIAR_ARQUIVO:src/utils.ts]
export function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}
[/CRIAR_ARQUIVO]

Depois:
Usuário: Adicione uma função de validação de senha

[EDITAR_ARQUIVO:src/utils.ts]
export function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

export function validatePassword(password: string): boolean {
  return password.length >= 8;
}
[/EDITAR_ARQUIVO]
```

### Exemplo 2: Explorar e Buscar
```
Usuário: Me mostre a estrutura do projeto

[EXPLORAR_PROJETO][/EXPLORAR_PROJETO]

Depois:
Usuário: Busque onde a função "handleSubmit" é usada

[BUSCAR_REFS:handleSubmit][/BUSCAR_REFS]

Depois:
Usuário: Procure por "TODO" em todo o código

[BUSCAR_TEXTO:TODO][/BUSCAR_TEXTO]
```

### Exemplo 3: Automação Completa
```
Usuário: Configure o projeto com a estrutura padrão

[EXPLORAR_PROJETO][/EXPLORAR_PROJETO]
[CRIAR_ARQUIVO:src/index.ts]
import express from 'express';
const app = express();
app.listen(3000);
[/CRIAR_ARQUIVO]
[EXECUTAR_COMANDO]npm install express[/EXECUTAR_COMANDO]
[EXECUTAR_VSCODE:workbench.action.openFolder][/EXECUTAR_VSCODE]
```

---

## 🔍 Mapeamento de Símbolos (BUSCAR_SIMBOLOS)

Os ícones mostrados representam:
- 📁 **File** - Arquivo
- 📦 **Module** - Módulo
- 🔷 **Namespace** - Namespace
- 🔶 **Package** - Pacote
- ⚡ **Class** - Classe
- 🔑 **Method** - Método
- 📌 **Property** - Propriedade
- 📄 **Field** - Campo
- 🎯 **Variable** - Variável
- 📝 **Constant** - Constante
- 🎨 **String** - String
- 🎪 **Number** - Número
- 🔗 **Boolean** - Boolean
- 📊 **Array** - Array

---

## ⚙️ Comandos VS Code Úteis

| Comando | Descrição |
|---------|-----------|
| `workbench.action.quickOpen` | Abre a paleta de comandos |
| `editor.action.formatDocument` | Formata o documento |
| `workbench.action.newUntitledFile` | Cria novo arquivo vazio |
| `workbench.action.findInFiles` | Abre busca de arquivo |
| `workbench.action.openSettings` | Abre configurações |
| `workbench.action.files.save` | Salva arquivo ativo |
| `workbench.action.closeEditor` | Fecha editor ativo |
| `git.sync` | Sincroniza git (se disponível) |

---

## 🎓 Regras Importantes

✅ **FAÇA:**
- Use `[CRIAR_ARQUIVO]` para novos arquivos
- Use `[EDITAR_ARQUIVO]` para modificar existentes
- Use `[EXPLORAR_PROJETO]` antes de fazer mudanças grandes
- Use `[BUSCAR_SIMBOLOS]` para encontrar definições
- Use `[BUSCAR_REFS]` para entender o contexto
- Combine múltiplos comandos em sequência
- Sempre confirme deletações

❌ **NÃO FAÇA:**
- Não use ```código markdown quando criar/editar arquivos
- Não delete sem confirmar com BUSCAR_REFS primeiro
- Não execute comandos aleatórios sem entender o contexto
- Não edite arquivos gerados automaticamente
- Não misture sintaxes de comandos

---

## 📊 Status de Implementação

| Skill | Status | Função |
|-------|--------|--------|
| Criar Arquivo | ✅ Implementado | `createFile()` |
| Ler Arquivo | ✅ Implementado | `readFile()` |
| Editar Arquivo | ✅ **NOVO** | `editFile()` |
| Listar Diretório | ✅ Implementado | `listDirectory()` |
| Deletar Arquivo | ✅ Implementado | `deleteFile()` |
| Buscar Símbolos | ✅ **NOVO** | `findSymbols()` |
| Buscar Refs | ✅ **NOVO** | `findReferences()` |
| Buscar Texto | ✅ **NOVO** | `findText()` |
| Explorar Projeto | ✅ **NOVO** | `exploreProject()` |
| Executar VS Code | ✅ **NOVO** | `executeVsCodeCommand()` |
| Executar Comando | ✅ Implementado | `runTerminalCommand()` |

---

## 🚀 Próximas Melhorias Possíveis

- [ ] Editar arquivo com ranges (linhas específicas)
- [ ] Adicionar formatação automática ao criar/editar
- [ ] Suportar criação de pastas
- [ ] Copiar/mover arquivos
- [ ] Merge de conteúdo
- [ ] Histórico de mudanças
- [ ] Desfazer/Refazer
- [ ] Integração com Git
- [ ] Análise de código (linter)
- [ ] Sugestões automáticas de refactoring

---

**Data de Atualização:** 01 de Março de 2026  
**Versão do Agente:** 0.2.0+
**Compatibilidade VS Code:** ^1.85.0
