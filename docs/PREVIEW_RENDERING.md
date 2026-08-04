# Renderização de prévias

## Separação arquitetural

`generateMusic()` permanece universal, determinístico e sem filesystem. A renderização de áudio existe somente em `scripts/` para avaliação durante o desenvolvimento e não é incluída em `files` do pacote npm.

O fluxo é:

1. `generateMusic()` produz MIDI e manifesto.
2. `scripts/render-preview.mjs` carrega MIDI e SoundFont com SpessaSynth.
3. O sintetizador produz WAV estéreo em 48 kHz com dois segundos de cauda e fade-out.
4. Quando solicitado, FFmpeg converte o WAV em MP3 VBR.

## Componentes fixados

- `spessasynth_core@4.3.16`, Apache-2.0, dependência somente de desenvolvimento.
- GeneralUser GS no commit `684543d5e5efaef08d02be50dcda8d552478fa60`.
- SHA-256 esperado do arquivo `GeneralUser-GS.sf2`: `9575028c7a1f589f5770fccc8cff2734566af40cd26ed836944e9a5152688cfe`.
- URL de origem: <https://github.com/mrbumpy409/GeneralUser-GS>.
- Licença do SoundFont: <https://github.com/mrbumpy409/GeneralUser-GS/blob/main/documentation/LICENSE.txt>.

O SoundFont é baixado somente por `npm run preview:setup`, fica em `output/` e não deve ser commitado nem empacotado.

## Limites

- A ferramenta serve para avaliação e demonstração, não é ainda uma API pública de renderização.
- O WAV depende do SoundFont indicado. Outros bancos podem produzir timbres e balanços diferentes.
- MP3 depende de uma instalação externa do FFmpeg.
- O processamento final aplica fade-out e um limitador suave, mas não substitui mixagem específica para cada vídeo.
