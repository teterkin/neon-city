export function detectWebGL(createCanvas = () => document.createElement('canvas')) {
  try {
    const canvas = createCanvas();
    if (canvas.getContext('webgl2')) return { supported: true, version: 2 };
    if (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')) {
      return { supported: true, version: 1 };
    }
  } catch {
    return { supported: false, version: 0 };
  }
  return { supported: false, version: 0 };
}
