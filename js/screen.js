const Screen = (() => {
  const screens = {};

  function init() {
    ['home', 'setup', 'lobby', 'game', 'result'].forEach(id => {
      screens[id] = document.getElementById('screen-' + id);
    });
  }

  function show(name, data = {}) {
    Object.values(screens).forEach(el => el.classList.remove('active'));
    screens[name].classList.add('active');
    document.dispatchEvent(new CustomEvent('screen:' + name, { detail: data }));
  }

  return { init, show };
})();
