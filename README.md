# Auto-MIDI

Auto-MIDI é um pacote TypeScript experimental para gerar música de fundo programaticamente para vídeos gravados e editados por IA. A primeira saída é MIDI multitrilha, acompanhada por um manifesto JSON que permite ao harness localizar cues, seções e parâmetros musicais.

O projeto está em desenvolvimento. Ele ainda não sintetiza som, não produz WAV/MP3 e não foi publicado no registro npm.

## O que já funciona

- API sem filesystem, utilizável no núcleo em Node ou browser.
- Builds ESM e CommonJS, com tipos TypeScript.
- Presets `ambient`, `lofi` e `upbeat`.
- Tonalidade maior/menor, tônica, BPM, volume, seed e progressão em graus romanos.
- Trilhas separadas de harmonia, baixo, melodia e bateria.
- Cues com ataque MIDI no tempo solicitado, arredondado ao tick mais próximo.
- CLI que grava `.mid` e `.json` para inspeção e integração.

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
npm run demo            # smoke test e exemplo reproduzível
npm run validate:skills # valida as skills locais
npm run pack:check      # mostra o conteúdo do pacote sem publicar
```

No Windows, `auto-midi.cmd` oferece um menu para essas ações. O fluxo atual usa typecheck, build e smoke checks; não há suíte automatizada de testes neste marco.

## Publicação futura

Antes de publicar, atualize a versão, rode todos os checks, revise `npm pack --dry-run` e confirme o conteúdo de `dist/`. A publicação planejada será:

```powershell
npm publish --access public
```

Este primeiro marco publica somente o repositório público no GitHub. Não são necessárias variáveis de ambiente ou credenciais para gerar MIDI.

## Documentação do projeto

- [Contrato de agentes](AGENTS.md)
- [Contexto de produto](docs/PRODUCT_CONTEXT.md)
- [Skill de estrutura musical](.agents/skills/design-musical-structure/SKILL.md)
- [Skill de arranjos MIDI](.agents/skills/generate-midi-arrangements/SKILL.md)
- [Skill de sincronização](.agents/skills/synchronize-video-cues/SKILL.md)

## Licença

MIT. Consulte [LICENSE](LICENSE).
