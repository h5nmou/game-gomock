const Sound = (() => {
  const files = ['sound/stone1.aac', 'sound/stone2.aac', 'sound/stone3.aac', 'sound/stone4.aac'];
  const audios = files.map(src => {
    const a = new Audio(src);
    a.preload = 'auto';
    return a;
  });

  function playStone() {
    const a = audios[Math.floor(Math.random() * audios.length)];
    a.currentTime = 0;
    a.play().catch(() => {});
  }

  return { playStone };
})();
