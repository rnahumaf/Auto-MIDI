# Contrato de cues

```json
{
  "id": "cta",
  "timeSeconds": 23.75,
  "intensity": 1
}
```

O resultado contém:

```json
{
  "id": "cta",
  "requestedTimeSeconds": 23.75,
  "actualTimeSeconds": 23.75,
  "tick": 22800,
  "driftSeconds": 0,
  "intensity": 1
}
```

O valor efetivo depende de BPM e PPQ. Para decidir se uma cue está sincronizada, compare `Math.abs(driftSeconds)` com a duração de meio tick, não com zero exato. Na fronteira final, o gerador limita o ataque a `endTick - 1`; nesse caso isolado, aceite desvio de até um tick para manter todas as notas dentro da música.
