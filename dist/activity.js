export function activityPolicy(mode, {
  hidden = false,
  focused = true,
  frozen = false
} = {}) {
  const run = !frozen && (mode === 'background' || (!hidden && (mode !== 'focused' || focused)));
  return {
    run,
    draw: run && !hidden,
    reason: frozen ? 'frozen' : run ? (hidden ? 'background' : 'active') : 'waiting'
  };
}

export function createActivityLoop({
  onFrame,
  onStateChange,
  environment
} = {}) {
  const env = environment || {
    document,
    window,
    now: () => performance.now(),
    raf: callback => requestAnimationFrame(callback),
    cancelRaf: id => {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id);
    },
    delay: (cb, ms) => setTimeout(cb, ms),
    cancelDelay: id => clearTimeout(id)
  };
  let mode = 'visible',
    frozen = false,
    started = false,
    rafId = null,
    timerId = null,
    last = '',
    current = null;
  try {
    const stored = localStorage.getItem('dwl-activity');
    if (['visible', 'focused', 'background'].includes(stored)) mode = stored;
  } catch {}
  const decide = () => activityPolicy(mode, {
    hidden: env.document.hidden,
    focused: env.document.hasFocus?.() ?? true,
    frozen
  });

  function cancel() {
    if (rafId !== null) env.cancelRaf(rafId);
    if (timerId !== null) env.cancelDelay(timerId);
    rafId = timerId = null;
  }

  function schedule() {
    if (!started || !current.run) return;
    if (current.draw) rafId = env.raf(tick);
    else timerId = env.delay(() => tick(env.now()), 250);
  }

  function refresh() {
    cancel();
    current = decide();
    const key = JSON.stringify([mode, current]);
    if (key !== last) {
      last = key;
      onStateChange?.({
        ...current,
        mode
      }, env.now());
    }
    schedule();
  }

  function tick(now) {
    rafId = timerId = null;
    const next = decide();
    if (JSON.stringify(next) !== JSON.stringify(current)) {
      refresh();
      return;
    }
    if (!current.run) return;
    onFrame?.(now, current);
    schedule();
  }
  env.document.addEventListener('visibilitychange', refresh);
  env.window.addEventListener('focus', refresh);
  env.window.addEventListener('blur', refresh);
  env.document.addEventListener('freeze', () => {
    frozen = true;
    refresh();
  });
  env.document.addEventListener('resume', () => {
    frozen = false;
    refresh();
  });
  env.window.addEventListener('pagehide', () => {
    frozen = true;
    refresh();
  });
  env.window.addEventListener('pageshow', () => {
    frozen = false;
    refresh();
  });
  return {
    start() {
      started = true;
      refresh();
    },
    stop() {
      started = false;
      cancel();
    },
    setMode(value) {
      if (!['visible', 'focused', 'background'].includes(value)) return;
      mode = value;
      try {
        localStorage.setItem('dwl-activity', mode);
      } catch {}
      refresh();
    },
    getState() {
      return {
        ...(current || decide()),
        mode
      };
    }
  };
}
