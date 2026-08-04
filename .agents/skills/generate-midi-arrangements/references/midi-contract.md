# Contrato MIDI e manifesto

## Trilha

Cada trilha declara no manifesto `name`, `role`, `channel` e `instrument`:

| Nome | Canal | Função |
| --- | ---: | --- |
| `harmony` | 0 | Acordes sustentados ou stabs |
| `bass` | 1 | Fundamentais e pulso grave |
| `melody` | 2 | Motivo melódico |
| `drums` | 9 | Kit General MIDI |

O arquivo usa PPQ 480 e compasso `[4, 4]`. O manifesto contém `algorithmVersion`, duração solicitada, duração efetiva do MIDI, BPM, volume, seed, progressão, seções, grade de batidas, trilhas e cues resolvidas. A grade numera compassos e tempos a partir de 1 e classifica a força como `strong`, `secondary` ou `weak`. O comportamento musical atual usa `algorithmVersion: 2`.

`volume` é escrito em CC7 nas quatro trilhas. CC10 controla panorama, CC11 expressão por seção, CC91 reverb e CC93 chorus. Velocity representa a dinâmica relativa do arranjo e não deve ser multiplicada novamente pelo volume global.

O algoritmo 2 diferencia compassos pares e ímpares, reduz camadas na introdução e no outro, cria motivos melódicos com alvos harmônicos, movimenta o baixo e adiciona fills determinísticos. Alterar essas regras exige incrementar `algorithmVersion`.

## Determinismo

Passe `seed` para obter uma composição reproduzível. A seed omitida é criada pelo gerador e devolvida no manifesto. Não use `Math.random()` diretamente nos padrões; use a fonte criada em `src/random.ts`.

## Saída

`generateMusic()` retorna `Uint8Array`. O CLI serializa esse valor em `.mid` e o manifesto em JSON. O MVP não renderiza WAV/MP3 e não promete que um arquivo MIDI tenha o mesmo timbre em todos os players.

O repositório possui renderização de prévia em `scripts/`, fora do pacote. Ela usa um SoundFont validado e não altera o contrato de saída de `generateMusic()`.
