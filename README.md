# Auto-MIDI

Auto-MIDI é um pacote TypeScript experimental para gerar música de fundo programaticamente para vídeos gravados e editados por IA. A primeira saída é MIDI multitrilha, acompanhada por um manifesto JSON que permite ao harness localizar cues, seções e parâmetros musicais.

O projeto está em desenvolvimento e ainda não foi publicado no registro npm. O pacote distribuível continua focado em MIDI; o repositório oferece uma ferramenta opcional de desenvolvimento para renderizar prévias WAV/MP3 com SoundFont.

## O que já funciona

- API sem filesystem, utilizável no núcleo em Node ou browser.
- Builds ESM e CommonJS, com tipos TypeScript.
- Presets `ambient`, `lofi` e `upbeat`.
- Tonalidade maior/menor, tônica, BPM, volume, seed e progressão em graus romanos.
- Trilhas separadas de harmonia, baixo, melodia e bateria.
- Arranjos com voicings conduzidos, frases orientadas pelos acordes, baixo com movimento, bateria variável e camadas por seção.
- Cues com acento próprio por estilo no tempo solicitado, arredondado ao tick mais próximo.
- Controles General MIDI de volume, expressão, panorama, reverb e chorus.
- Grade de batidas com compasso, tempo, tick e força para orientar cortes de vídeo.
- CLI que grava `.mid` e `.json` para inspeção e integração.
- Renderização opcional de prévias com SpessaSynth e GeneralUser GS, isolada do núcleo.

## Requisitos e instalação

O desenvolvimento usa Node.js 20 ou mais recente.

```powershell
git clone https://github.com/rnahumaf/Auto-MIDI.git
cd Auto-MIDI
npm install
```

Quando o pacote for publicado, a instalação será:

```powershell
npm install auto-midi
```

Dependências de runtime: [`@tonejs/midi`](https://github.com/Tonejs/Midi) para codificação MIDI e [`tonal`](https://github.com/tonaljs/tonal) para teoria musical.

## Uso pela API

```ts
import { writeFile } from "node:fs/promises";
import { generateMusic } from "auto-midi";

const result = generateMusic({
  durationSeconds: 30,
  style: "upbeat",
  tonic: "D",
  mode: "major",
  progression: ["I", "V", "vim", "IV"],
  bpm: 120,
  volume: 0.72,
  seed: "release-video-v1",
  cues: [
    { id: "feature-1", timeSeconds: 6.4, intensity: 0.8 },
    { id: "cta", timeSeconds: 23.75, intensity: 1 }
  ]
});

await writeFile("output/video.mid", result.midi);
await writeFile("output/video.json", JSON.stringify(result.manifest, null, 2));
```

Forneça `seed` quando precisar que uma composição volte a ser exatamente igual. Se ela for omitida, uma seed é criada e devolvida no manifesto.

O manifesto inclui `algorithmVersion`, a grade `beats` e as cues resolvidas. A versão atual do algoritmo é `2`. Compassos e tempos em `beats` são numerados a partir de 1; `strong`, `secondary` e `weak` indicam a importância métrica. Para reproduzir uma composição após futuras mudanças do gerador, preserve a seed e a versão do algoritmo.

`volume` controla o CC7 das quatro trilhas. As velocities continuam representando a dinâmica do arranjo, evitando aplicar o volume duas vezes em sintetizadores General MIDI.

As cues são articuladas sem impor o mesmo crash a todos os estilos: `ambient` rearticula suavemente a harmonia, `lofi` usa side-stick e `upbeat` reserva crash para intensidades a partir de `0.85`. Uma cue com `intensity: 0` fica somente no manifesto e não adiciona eventos audíveis. Notas sustentadas são rearticuladas sem perder o restante de sua duração.

Graus romanos em minúsculas representam acordes menores quando usados sem sufixo, por exemplo `vi` é normalizado para `vim`. Sufixos como `m7`, `7` e `Maj7` podem ser escritos explicitamente.

## Uso pelo CLI

O arquivo [examples/app-demo.json](examples/app-demo.json) contém uma composição completa:

```powershell
npm run demo
# ou, depois do build:
node dist/cli.js generate --config examples/app-demo.json --out output/app-demo
```

O comando cria `output/app-demo.mid` e `output/app-demo.json`. O diretório `output/` é local e ignorado pelo Git.

## Desenvolvimento

```powershell
npm run typecheck       # valida os tipos sem escrever dist
npm run build           # ESM, CommonJS e declarações
npm test                # build e suíte automatizada
npm run demo            # smoke test e exemplo reproduzível
npm run preview:demo    # baixa o SoundFont e cria três prévias WAV/MP3
npm run validate:skills # valida as skills locais
npm run pack:check      # mostra o conteúdo do pacote sem publicar
```

No Windows, `auto-midi.cmd` oferece um menu para essas ações. O fluxo atual usa TypeScript 7, typecheck, build, testes de regressão e smoke checks de API/CLI.

## Prévias de áudio com SoundFont

A ferramenta de prévia não faz parte dos exports nem do binário `auto-midi`. Ela usa `spessasynth_core` somente como dependência de desenvolvimento e baixa o GeneralUser GS para o diretório ignorado `output/soundfonts/`. O download é fixado por commit e validado por SHA-256; nenhum SoundFont é incluído no pacote npm.

```powershell
npm run preview:setup
npm run preview:demo

# Renderização manual; acrescente --mp3 quando FFmpeg estiver disponível
npm run preview:render -- --midi output/app-demo.mid `
  --soundfont output/soundfonts/GeneralUser-GS.sf2 `
  --out output/app-demo-preview --mp3
```

WAV é gerado diretamente pelo sintetizador. MP3 requer `ffmpeg` no `PATH`. Consulte [docs/PREVIEW_RENDERING.md](docs/PREVIEW_RENDERING.md) para arquitetura, versões e licenças.

Entradas recebidas pelo CLI são validadas em runtime. A duração máxima do MVP é 3.600 segundos, cada composição aceita até 1.000 cues e uma progressão aceita até 64 graus. Durações positivas menores que um tick MIDI são quantizadas para um tick e registradas em `midiDurationSeconds`.

## Publicação futura

Antes de publicar, atualize a versão, rode todos os checks, revise `npm pack --dry-run` e confirme o conteúdo de `dist/`. A publicação planejada será:

```powershell
npm publish --access public
```

Este primeiro marco publica somente o repositório público no GitHub. Não são necessárias variáveis de ambiente ou credenciais para gerar MIDI; somente o comando explícito `preview:setup` usa a rede.

## Documentação do projeto

- [Contrato de agentes](AGENTS.md)
- [Contexto de produto](docs/PRODUCT_CONTEXT.md)
- [Skill de estrutura musical](.agents/skills/design-musical-structure/SKILL.md)
- [Skill de arranjos MIDI](.agents/skills/generate-midi-arrangements/SKILL.md)
- [Skill de sincronização](.agents/skills/synchronize-video-cues/SKILL.md)

## Licença

MIT. Consulte [LICENSE](LICENSE).
