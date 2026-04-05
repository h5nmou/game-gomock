const Sound = (() => {
  let ctx = null;

  function getContext() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  // 바둑돌이 나무 판 위에 놓이는 "탁" 소리
  function playStone() {
    const ac = getContext();
    const now = ac.currentTime;

    // 짧은 충격음 (노이즈 버스트)
    const duration = 0.08;
    const bufferSize = ac.sampleRate * duration;
    const buffer = ac.createBuffer(1, bufferSize, ac.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      // 빠르게 감쇠하는 노이즈
      const t = i / bufferSize;
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 8);
    }

    const noise = ac.createBufferSource();
    noise.buffer = buffer;

    // 밴드패스 필터로 나무 울림 느낌
    const filter = ac.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1800;
    filter.Q.value = 1.2;

    // 톤 (나무 판 공명)
    const osc = ac.createOscillator();
    osc.frequency.value = 400;
    const oscGain = ac.createGain();
    oscGain.gain.setValueAtTime(0.3, now);
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    // 마스터 볼륨
    const master = ac.createGain();
    master.gain.value = 0.5;

    noise.connect(filter);
    filter.connect(master);
    osc.connect(oscGain);
    oscGain.connect(master);
    master.connect(ac.destination);

    noise.start(now);
    noise.stop(now + duration);
    osc.start(now);
    osc.stop(now + 0.06);
  }

  return { playStone };
})();
