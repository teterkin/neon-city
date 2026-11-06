export function createHoldRepeat(onStep, { delay = 320, interval = 90 } = {}) {
  let delayTimer = null;
  let repeatTimer = null;

  function stop() {
    if (delayTimer !== null) clearTimeout(delayTimer);
    if (repeatTimer !== null) clearInterval(repeatTimer);
    delayTimer = null;
    repeatTimer = null;
  }

  function start() {
    stop();
    onStep();
    delayTimer = setTimeout(() => {
      delayTimer = null;
      repeatTimer = setInterval(onStep, interval);
    }, delay);
  }

  return { start, stop };
}
