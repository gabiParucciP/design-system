Você é responsável por sincronizar os tokens do Figma Design System com `tailwind.config.ts` e `src/components/Button.tsx` neste projeto.

## Arquivo Figma

- File key: `Lt10bBK2NAbygocsLpxtIM`

## Processo

Siga exatamente estas etapas em ordem:

### 1. Carregar snapshot anterior

Leia o arquivo `.figma-snapshot.json` (se existir). Ele contém o estado das variáveis do Figma da última sincronização. Se não existir, faça sync completo.

### 2. Buscar variáveis atuais do Figma

Use a ferramenta `mcp__figma-remote__get_variable_defs` com o fileKey `Lt10bBK2NAbygocsLpxtIM`.

Consolide todas as variáveis encontradas em um único mapa `{ "NomeVariavel__NomeModo": valorHex }`.

### 3. Calcular o diff

Compare as variáveis coletadas com o snapshot anterior:

- **Variáveis alteradas**: existem nos dois, mas com valores diferentes
- **Variáveis novas**: existem no Figma mas não no snapshot
- **Variáveis removidas**: existem no snapshot mas não foram encontradas no Figma

**Se não há snapshot anterior**: use todas as variáveis como "novas" (sync completo inicial).

### 4. Apresentar apenas as diferenças

Exiba um resumo claro com **somente o que mudou**:

```
=== Alterado (N) ===
  Colors/Primary/500__Default
    antes: #D9D9D9
    agora: #da3063

=== Novo (N) ===
  Colors/Accent__Default: #3B82F6

=== Removido do Figma (N) ===
  Colors/Deprecated__Default
```

**Pare aqui e pergunte ao usuário se deseja prosseguir com as alterações.**

Se não houver nenhuma diferença, informe que os tokens estão sincronizados e encerre.

### 5. Ler os arquivos afetados

Leia os dois arquivos que serão modificados:

- `globals.css` — contém o mapeamento de cores do Tailwind
- `src/components/Button.tsx` — usa as classes Tailwind definidas no config

### 6. Aplicar as alterações

Após confirmação do usuário, atualize os arquivos seguindo estas regras:

**tailwind.config.ts:**

- Mapeie os nomes das variáveis do Figma para nomes semânticos do Tailwind:
  - `Colors/Primary/500__Default` → `colors.primary`
  - `Colors/Secondary/500__Default` → `colors.secondary`
  - `Colors/Label__Default` → `colors.label`
  - `Colors/Title__Default` → `colors.title`
- Use o valor do modo `__Default` (ou primeiro modo disponível)
- Preserve toda a estrutura, comentários e configurações não relacionadas a cores
- Para variáveis removidas do Figma: mantenha o valor mas adicione comentário `/* deprecated — removed from Figma */`
- Para variáveis novas: adicione no bloco `colors` seguindo a organização existente

**src/components/Button.tsx:**

- Atualize os valores de `className` apenas se os nomes das cores no Tailwind mudaram
- Não altere props, lógica ou estrutura do componente

### 7. Salvar o novo snapshot

Após aplicar as alterações, atualize `.figma-snapshot.json`:

```json
{
  "variables": {
    "Colors/Primary/500__Default": "#da3063",
    "Colors/Secondary/500__Default": "#a0213f"
  },
  "fetchedAt": "2026-01-01T00:00:00.000Z"
}
```

### 8. Reportar

Apresente um resumo final com:

- Quais arquivos foram modificados
- Quantos tokens foram alterados / adicionados / deprecados
