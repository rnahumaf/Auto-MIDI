---
name: generate-midi-arrangements
description: Crie e revise arranjos MIDI determinísticos do Auto-MIDI, incluindo trilhas de harmonia, baixo, melodia, bateria, velocity, volume, seed e serialização em Uint8Array. Use ao alterar o gerador, os padrões rítmicos, os instrumentos ou o CLI de demonstração.
---

# Arranjos MIDI determinísticos

Converta a estrutura musical em eventos MIDI curtos, repetíveis e fáceis de inspecionar. Preserve a separação entre o núcleo que retorna bytes e o CLI que grava arquivos.

## Fluxo

1. Leia `src/generator.ts`, `src/types.ts` e a referência do contrato MIDI antes de adicionar uma trilha ou campo de manifesto.
2. Construa o cabeçalho com BPM, compasso 4/4, armadura de clave e PPQ 480 antes de converter segundos em ticks.
3. Gere quatro trilhas nomeadas: `harmony`, `bass`, `melody` e `drums`.
4. Use a seed para decidir variações melódicas e rítmicas; com a mesma entrada e seed, mantenha os bytes e o manifesto iguais.
5. Use CC7 para `volume` e preserve velocities para a dinâmica musical, sem introduzir estado global.
6. Inicialize CC10, CC11, CC91 e CC93 para panorama, expressão, reverb e chorus, mantendo valores adequados ao papel de cada trilha.
7. Varie comping, baixo, melodia e bateria por seção e posição da frase; toda variação deve consumir apenas a fonte aleatória da seed.
8. Limite cada nota ao tick final da duração e mantenha uma resolução da tônica no final.
9. Use `midi.toArray()` para retornar `Uint8Array`; deixe `writeFile` exclusivamente no CLI.

## Padrões locais

- Use canais 0, 1 e 2 para harmonia, baixo e melodia. Use o canal MIDI 10, representado pelo índice 9, para bateria.
- Use programas General MIDI armazenados em `PRESETS`; bateria não precisa de programa melódico.
- Use ticks inteiros para ataques e durações. Prefira um tick mínimo a eventos com duração zero.
- Use CC7 no tick zero de cada trilha para representar volume programático; renderizadores podem escolher como aplicar esse controle.
- Não permita notas da mesma altura sobrepostas no mesmo canal; mescle ataques simultâneos e encerre a nota anterior antes de um novo ataque.
- Ao rearticular uma nota sustentada em uma cue, divida-a no tick e preserve o fim original na nova nota.
- Atualize o manifesto quando alterar quantidade, nomes, canais ou papéis das trilhas.
- Mantenha renderização SoundFont em `scripts/`; `spessasynth_core` é dependência de desenvolvimento e não entra nos exports do pacote.

## Gotchas

- O pacote `@tonejs/midi@2.0.28` expõe um bundle CommonJS no campo `main`; para o build ESM, importe o default e extraia `Midi`, em vez de depender de named export em runtime.
- `Track.addNote` recebe velocity normalizada entre 0 e 1, enquanto o arquivo MIDI final usa 0 a 127.
- O canal 10 é indexado como 9 na biblioteca. Usar 10 cria o canal 11 e remove a bateria do kit General MIDI.
- O encoder de armadura de clave de `@tonejs/midi@2.0.28` grava um deslocamento inválido; o gerador mantém tônica e modo no manifesto e omite esse meta-evento.
- O plugin de declarações embutido no `tsup@8.5.1` não funciona com TypeScript 7; mantenha `dts: false` no tsup e gere declarações com `tsc --emitDeclarationOnly`.
- `audioToWav()` normaliza para 0 dB por padrão; a prévia aplica o próprio ganho e precisa usar `normalizeAudio: false` para manter espaço de volume de música de fundo.

## Referências

- [Contrato MIDI e manifesto](references/midi-contract.md)
- [Estrutura musical](../design-musical-structure/SKILL.md)
