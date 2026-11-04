import { gradePixels } from '../shared/presets.mjs';
let source, width, height;
self.onmessage = ({ data }) => {
  if (data.source) {
    source = new Uint8ClampedArray(data.source);
    width = data.width; height = data.height;
  }
  if (!source) return;
  const result = source.slice();
  gradePixels(result, data.preset, data.strength, data.adjustments, width, height);
  self.postMessage({ buffer: result.buffer, width, height, requestId: data.requestId }, [result.buffer]);
};
