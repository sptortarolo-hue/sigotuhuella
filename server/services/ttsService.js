import { EdgeTTS } from '@travisvn/edge-tts';

export async function synthesizeSpeech(text, voiceName, options = {}) {
  const tts = new EdgeTTS(text, voiceName, {
    rate: options.rate || '+0%',
    pitch: options.pitch || '+0Hz',
    volume: options.volume || '+0%',
  });
  const result = await tts.synthesize();
  return Buffer.from(await result.audio.arrayBuffer());
}

export async function listVoices() {
  const { listVoices } = await import('@travisvn/edge-tts');
  return listVoices();
}
