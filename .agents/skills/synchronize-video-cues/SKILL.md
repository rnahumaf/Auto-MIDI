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
4. Insira no tick resolvido o acento definido pelo estilo e aplique intensidade à velocity. Com intensidade zero, não adicione eventos audíveis.
5. Converta o tick de volta com `ticksToSeconds()` e registre `requestedTimeSeconds`, `actualTimeSeconds`, `tick` e `driftSeconds`.
6. Preserve o tick final da duração e informe no manifesto qualquer diferença entre a duração pedida e a duração efetiva do MIDI.

## Contrato de integração

- Identificadores ausentes recebem `cue-1`, `cue-2` e assim por diante após a ordenação.
- O desvio esperado é no máximo meio tick. Uma cue que arredondaria para o tick final é limitada ao tick anterior e pode desviar até um tick.
- Não crie mudanças locais de BPM para uma cue. A sincronia exata do MVP significa ataque no tick mais próximo dentro do BPM global.
- Use o manifesto JSON como ponte para o harness; o MIDI sozinho não carrega a intenção da cue de forma suficiente para uma automação confiável.
- `ambient` rearticula uma nota média da harmonia sem bateria; `lofi` usa side-stick e reserva kick para intensidade a partir de `0.72`; `upbeat` usa kick e reserva crash para intensidade a partir de `0.85`.
- Não imponha uma nota uma oitava acima da fundamental. Rearticule uma nota que já soa ou escolha uma nota do acorde próxima do registro atual.

## Gotchas

- Validar `timeSeconds >= durationSeconds` evita acentos que não podem soar dentro do vídeo.
- `secondsToTicks` arredonda para inteiro; comparar diretamente segundos solicitados e efetivos sem tolerância gera falso erro.
- Limite o tick resolvido a `endTick - 1`; iniciar uma cue no tick final estende o MIDI além da duração efetiva.
- Ordenar as cues antes de gerar IDs padrão muda a numeração, portanto IDs fornecidos pelo usuário devem ser preservados.
- Uma nota longa anterior pode mascarar o ataque; rearticule-a no tick da cue preservando seu fim original, sem deixar silêncio depois do acento.

## Referências

- [Contrato de tempo e manifesto](references/cue-contract.md)
- [Arranjos MIDI](../generate-midi-arrangements/SKILL.md)
