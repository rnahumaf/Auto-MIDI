---
name: synchronize-video-cues
description: Alinhe ataques musicais a momentos de vídeo no Auto-MIDI e mantenha o manifesto verificável. Use ao alterar cues, arredondamento de segundos para ticks, duração, seções, desvio temporal ou integração do CLI com um harness.
---

# Sincronização de cues de vídeo

Trate o tempo do vídeo como fonte de verdade para ataques especiais. O MVP mantém o BPM global e arredonda cada momento apenas à resolução MIDI disponível.

## Fluxo

1. Valide `timeSeconds` como número finito em `[0, durationSeconds)` e `intensity` em `[0, 1]`.
2. Ordene as cues por tempo sem alterar seus identificadores.
3. Converta segundos usando `midi.header.secondsToTicks()` depois de configurar o BPM e o PPQ.
4. Insira no tick resolvido um acento de bateria, harmonia e melodia; aplique intensidade à velocity.
5. Converta o tick de volta com `ticksToSeconds()` e registre `requestedTimeSeconds`, `actualTimeSeconds`, `tick` e `driftSeconds`.
6. Preserve o tick final da duração e informe no manifesto qualquer diferença entre a duração pedida e a duração efetiva do MIDI.

## Contrato de integração

- Identificadores ausentes recebem `cue-1`, `cue-2` e assim por diante após a ordenação.
- O desvio esperado é no máximo meio tick, com pequenas diferenças de ponto flutuante.
- Não crie mudanças locais de BPM para uma cue. A sincronia exata do MVP significa ataque no tick mais próximo dentro do BPM global.
- Use o manifesto JSON como ponte para o harness; o MIDI sozinho não carrega a intenção da cue de forma suficiente para uma automação confiável.

## Gotchas

- Validar `timeSeconds >= durationSeconds` evita acentos que não podem soar dentro do vídeo.
- `secondsToTicks` arredonda para inteiro; comparar diretamente segundos solicitados e efetivos sem tolerância gera falso erro.
- Ordenar as cues antes de gerar IDs padrão muda a numeração, portanto IDs fornecidos pelo usuário devem ser preservados.
- Uma nota longa anterior pode mascarar um ataque de cue em alguns sintetizadores; mantenha o acento em trilhas e velocity próprias.

## Referências

- [Contrato de tempo e manifesto](references/cue-contract.md)
- [Arranjos MIDI](../generate-midi-arrangements/SKILL.md)
