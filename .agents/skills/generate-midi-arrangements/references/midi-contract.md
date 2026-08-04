# Contrato MIDI e manifesto

## Trilha

Cada trilha declara no manifesto `name`, `role`, `channel` e `instrument`:

| Nome | Canal | Função |
| --- | ---: | --- |
| `harmony` | 0 | Acordes sustentados ou stabs |
| `bass` | 1 | Fundamentais e pulso grave |
| `melody` | 2 | Motivo melódico |
| `drums` | 9 | Kit General MIDI |

O arquivo usa PPQ 480 e compasso `[4, 4]`. O manifesto contém a duração solicitada, a duração efetiva do MIDI, BPM, volume, seed, progressão, seções, trilhas e cues resolvidas.

## Determinismo

Passe `seed` para obter uma composição reproduzível. A seed omitida é criada pelo gerador e devolvida no manifesto. Não use `Math.random()` diretamente nos padrões; use a fonte criada em `src/random.ts`.

## Saída

`generateMusic()` retorna `Uint8Array`. O CLI serializa esse valor em `.mid` e o manifesto em JSON. O MVP não renderiza WAV/MP3 e não promete que um arquivo MIDI tenha o mesmo timbre em todos os players.
