---
name: design-musical-structure
description: Modele tonalidades, modos maior/menor, progressões em graus romanos, voicings e presets do Auto-MIDI. Use ao criar ou revisar regras harmônicas, estilos, escalas, validação de tônicas ou a estrutura musical antes de escrever eventos MIDI.
---

# Estrutura musical programável

Modele a parte teórica da composição antes de escolher ritmos ou codificar eventos. Mantenha a seleção de tom simples para o agente e deixe detalhes repetitivos nos presets.

## Fluxo

1. Leia `src/types.ts`, `src/presets.ts` e `src/theory.ts` antes de alterar a API musical.
2. Normalize a tônica com `tonal` e aceite somente A-G com `#` ou `b` opcional.
3. Use `major` ou `minor` no MVP. Amplie modos somente com mudança documentada no contrato.
4. Use progressões em graus romanos; preserve a progressão recebida no manifesto e grave os acordes resolvidos separadamente.
5. Faça cada preset funcionar com uma progressão padrão e com uma progressão válida fornecida pelo usuário.
6. Mantenha voicings dentro de uma região MIDI confortável e resolva o último compasso na tônica.
7. Faça tempos métricos fortes da melodia apontarem para notas do acorde; use notas da escala e o motivo determinístico para conectar esses pontos.

## Regras locais

- Use `Scale.get` para obter as notas da escala e `Progression.fromRomanNumerals` para resolver graus.
- Normalize um grau romano minúsculo sem sufixo, como `vi`, para `vim`; a biblioteca Tonal não infere o acorde menor nesse caso.
- Use `bVI`, `bIII` e `bVII` quando uma progressão menor precisar dos graus rebaixados da tonalidade natural.
- Leia `PRESETS` como fonte dos BPMs, progressões e instrumentos; não espalhe números de preset pelo gerador.
- Mantenha a progressão como dado serializável, não como objeto mutável da biblioteca.
- Converta escalas para MIDI em ordem ascendente, elevando a oitava quando a escala atravessar C.
- Escolha inversões que minimizem o movimento em relação ao voicing anterior e mantenha a harmonia entre MIDI 48 e 84.
- Preserve o contorno entre compassos e escolha a oitava da resolução final mais próxima da última nota melódica.

## Gotchas

- `Chord.get("C")` é um acorde válido, mas `chord.root` fica vazio em uma tríade simples; use `chord.tonic` ou a primeira nota do acorde para encontrar a fundamental.
- `Progression.fromRomanNumerals` resolve o intervalo, mas não aplica automaticamente o modo escolhido; graus menores e acidentes devem aparecer no token romano.
- O encoder de armadura de clave de `@tonejs/midi@2.0.28` usa um deslocamento incorreto e pode gerar `key: undefined` ao reabrir o MIDI; mantenha tônica e modo no manifesto e não grave esse evento até a dependência ser atualizada.
- Mapear todas as classes de altura para a mesma oitava faz escalas como D maior terminarem em C#4, abaixo de D4; use uma sequência ascendente antes de gerar melodias.

## Referências

- [Contrato de harmonia e presets](references/harmony-contract.md)
- [Contexto de produto](../../../docs/PRODUCT_CONTEXT.md)
