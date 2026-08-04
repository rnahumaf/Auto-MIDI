# Contrato de agentes do Auto-MIDI

Auto-MIDI é um pacote TypeScript experimental para gerar música de fundo em MIDI, com cues sincronizadas a vídeos produzidos por IA.

## Regras globais

- Leia `docs/PRODUCT_CONTEXT.md` e a skill relevante em `.agents/skills/` antes de alterar comportamento musical ou documentação de produto.
- Preserve a API pública `generateMusic()` e o manifesto versionado; mudanças incompatíveis exigem atualizar README, contexto e skills na mesma alteração.
- Mantenha o núcleo sem filesystem e sem credenciais. A escrita de `.mid` e `.json` pertence ao CLI.
- Use PT-BR UTF-8 em documentação e textos; mantenha identificadores e nomes de campos da API em inglês.
- Trabalhe, commit e faça push diretamente em `main`; não crie branches sem pedido explícito.
- Não adicione WAV/MP3, sintetizador ou dependências de rede ao núcleo sem uma decisão de produto documentada.

## Comandos essenciais

```powershell
npm install
npm run typecheck
npm run build
npm run demo
npm run validate:skills
npm run pack:check
```

O atalho `auto-midi.cmd` reúne as ações mais frequentes no Windows.

## Contexto sob demanda

- [Contexto de produto](docs/PRODUCT_CONTEXT.md)
- [Estrutura musical](.agents/skills/design-musical-structure/SKILL.md)
- [Arranjos MIDI](.agents/skills/generate-midi-arrangements/SKILL.md)
- [Cues de vídeo](.agents/skills/synchronize-video-cues/SKILL.md)
- [README de uso](README.md)
