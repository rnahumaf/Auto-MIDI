# Contrato de harmonia

## Presets do MVP

| Estilo | BPM | Maior | Menor | Intenção |
| --- | ---: | --- | --- | --- |
| `ambient` | 72 | `I V vim IV` | `im bVI bIII bVII` | Pads longos e poucos ataques |
| `lofi` | 82 | `IIm7 V7 IMaj7 VIm7` | `im7 ivm7 bVII bIII` | Acordes macios e pulso atrasado |
| `upbeat` | 120 | `I V vim IV` | `im bVI bIII bVII` | Ataques curtos para demonstrações |

## Interface

- `tonic` é uma nota sem oitava, por exemplo `D`, `F#` ou `Bb`.
- `mode` é `major` ou `minor`.
- `progression` é uma lista de strings romanas. Graus minúsculos isolados recebem sufixo `m` durante a resolução.
- O manifesto preserva `progression` como entrada e `resolvedChords` como saída de Tonal. A tônica e o modo também ficam no manifesto; o MVP não grava o meta-evento de armadura de clave por uma limitação conhecida do encoder MIDI usado.

## Voicing

Use notas do acorde em torno da oitava 4 para harmonia, a fundamental na oitava 2 para baixo e a escala na oitava 4/5 para melodia. Transponha somente o necessário para manter as quatro trilhas audíveis e previsíveis.
