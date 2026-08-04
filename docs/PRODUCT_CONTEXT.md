# Contexto de produto

## O problema

Um aplicativo pode ter um vídeo gravado e editado por IA, mas ainda precisa de música de fundo que acompanhe a duração, o ritmo e os momentos importantes da demonstração. O Auto-MIDI transforma uma descrição musical curta em uma composição reproduzível e editável por código.

## Para quem é

- Harnesses que montam vídeos de uso de aplicativos, sites e programas.
- Agentes de IA que precisam solicitar música por tom, modo, estilo, duração e pontos de destaque.
- Desenvolvedores que querem inspecionar um MIDI antes de escolher ou construir um renderizador de áudio.

## Estágio atual

O repositório contém um MVP experimental, publicado inicialmente como `auto-midi@0.1.0`. A API e o CLI geram quatro trilhas General MIDI (`harmony`, `bass`, `melody`, `drums`) e um manifesto JSON com cues, seções, grade de batidas, versão do algoritmo e parâmetros resolvidos. O algoritmo 2 usa frases orientadas pelos acordes, padrões variados, controles de mix e acentos de cue próprios por estilo. A biblioteca publicada não gera som, mas scripts isolados permitem avaliar WAV/MP3 com SoundFont durante o desenvolvimento.

## Próximos marcos

1. Permitir leitura e edição de estruturas musicais geradas por outros componentes.
2. Transformar a renderização de prévia em uma API opcional somente após estabilizar qualidade, licença e tamanho de distribuição.
3. Integrar importação/exportação de eventos para harnesses de vídeo e automação de volume.
4. Ampliar estilos, modos e regras de transição sem quebrar o manifesto versionado.

## Linguagem editorial

Descrever recursos por comportamento verificável. Não prometer áudio pronto quando a saída é MIDI, não inventar marcos e registrar limitações junto da capacidade correspondente.
