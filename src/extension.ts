import * as vscode from "vscode";

// Types
enum TimerState {
  STOPPED,
  WORK,
  SHORT_BREAK,
  LONG_BREAK,
}

interface PomodoroState {
  state: TimerState;
  timeRemaining: number;
  workSessionsCompleted: number;
  isRunning: boolean;
}

interface PomodoroConfig {
  workDuration: number;
  breakDuration: number;
  longBreakDuration: number;
  longBreakInterval: number;
}

// Pure functions for state management
const createInitialState = (): PomodoroState => ({
  state: TimerState.STOPPED,
  timeRemaining: 0,
  workSessionsCompleted: 0,
  isRunning: false,
});

const getConfig = (): PomodoroConfig => {
  const config = vscode.workspace.getConfiguration("pomodoro");
  return {
    workDuration: config.get<number>("workDuration", 25),
    breakDuration: config.get<number>("breakDuration", 5),
    longBreakDuration: config.get<number>("longBreakDuration", 15),
    longBreakInterval: config.get<number>("longBreakInterval", 4),
  };
};

// State transitions
const startWorkSession = (
  state: PomodoroState,
  config: PomodoroConfig
): PomodoroState => ({
  ...state,
  state: TimerState.WORK,
  timeRemaining: config.workDuration * 60,
  isRunning: true,
});

const startBreak = (
  state: PomodoroState,
  config: PomodoroConfig
): PomodoroState => {
  const newSessionCount = state.workSessionsCompleted + 1;
  const isLongBreak = newSessionCount % config.longBreakInterval === 0;

  return {
    ...state,
    state: isLongBreak ? TimerState.LONG_BREAK : TimerState.SHORT_BREAK,
    timeRemaining:
      (isLongBreak ? config.longBreakDuration : config.breakDuration) * 60,
    workSessionsCompleted: newSessionCount,
    isRunning: true,
  };
};

const pauseTimer = (state: PomodoroState): PomodoroState => ({
  ...state,
  isRunning: false,
});

const resumeTimer = (state: PomodoroState): PomodoroState => ({
  ...state,
  isRunning: true,
});

const resetTimer = (): PomodoroState => createInitialState();

const tickTimer = (state: PomodoroState): PomodoroState => ({
  ...state,
  timeRemaining: Math.max(0, state.timeRemaining - 1),
});

// Pure functions for UI
const formatTime = (seconds: number): string => {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${secs
    .toString()
    .padStart(2, "0")}`;
};

const getTimerEmoji = (state: TimerState): string => {
  switch (state) {
    case TimerState.WORK:
      return "🍅";
    case TimerState.SHORT_BREAK:
      return "☕";
    case TimerState.LONG_BREAK:
      return "🎉";
    default:
      return "🍅";
  }
};

const getActivityName = (state: TimerState): string => {
  switch (state) {
    case TimerState.WORK:
      return "Work";
    case TimerState.SHORT_BREAK:
      return "Break";
    case TimerState.LONG_BREAK:
      return "Long Break";
    default:
      return "Ready";
  }
};

const createStatusBarText = (pomodoroState: PomodoroState): string => {
  if (pomodoroState.state === TimerState.STOPPED) {
    return "🍅 Pomodoro: Ready";
  }

  const emoji = getTimerEmoji(pomodoroState.state);
  const timeString = formatTime(pomodoroState.timeRemaining);
  const activity = getActivityName(pomodoroState.state);

  return `${emoji} ${timeString} - ${activity}`;
};

const createStatusBarTooltip = (pomodoroState: PomodoroState): string => {
  if (pomodoroState.state === TimerState.STOPPED) {
    return "Click to start Pomodoro timer";
  }

  const activity = getActivityName(pomodoroState.state);
  return `Pomodoro Timer: ${activity} (${pomodoroState.workSessionsCompleted} sessions completed)`;
};

const createStatusMessage = (pomodoroState: PomodoroState): string => {
  if (pomodoroState.state === TimerState.STOPPED) {
    return `Pomodoro timer is ready. Sessions completed: ${pomodoroState.workSessionsCompleted}`;
  }

  const timeString = formatTime(pomodoroState.timeRemaining);
  const activity = getActivityName(pomodoroState.state);

  return `${activity} in progress. Time remaining: ${timeString}. Sessions completed: ${pomodoroState.workSessionsCompleted}`;
};

// Notification messages
const getStartMessage = (state: TimerState): string => {
  switch (state) {
    case TimerState.WORK:
      return "🍅 Work session started! Stay focused!";
    case TimerState.SHORT_BREAK:
      return "☕ Time for a short break!";
    case TimerState.LONG_BREAK:
      return "🎉 Time for a long break! You deserve it!";
    default:
      return "";
  }
};

// Higher-order function for creating timer manager
const createTimerManager = () => {
  let currentState = createInitialState();
  let timer: NodeJS.Timeout | undefined;
  let statusBarItem: vscode.StatusBarItem;
  let stateChangeCallbacks: Array<(state: PomodoroState) => void> = [];

  // State management functions
  const setState = (newState: PomodoroState) => {
    currentState = newState;
    stateChangeCallbacks.forEach((callback) => callback(currentState));
  };

  const getState = () => currentState;

  const subscribe = (callback: (state: PomodoroState) => void) => {
    stateChangeCallbacks.push(callback);
    return () => {
      stateChangeCallbacks = stateChangeCallbacks.filter(
        (cb) => cb !== callback
      );
    };
  };

  // Timer functions
  const startTicking = () => {
    if (timer) clearInterval(timer);

    timer = setInterval(() => {
      const newState = tickTimer(getState());
      setState(newState);

      if (newState.timeRemaining <= 0) {
        handleTimerComplete();
      }
    }, 1000);
  };

  const stopTicking = () => {
    if (timer) {
      clearInterval(timer);
      timer = undefined;
    }
  };

  const handleTimerComplete = () => {
    stopTicking();
    const config = getConfig();
    const state = getState();

    const nextState =
      state.state === TimerState.WORK
        ? startBreak(state, config)
        : startWorkSession(state, config);

    setState(nextState);
    vscode.window.showInformationMessage(getStartMessage(nextState.state));
    startTicking();
  };

  // Public API
  const start = () => {
    const state = getState();
    const config = getConfig();

    if (state.state === TimerState.STOPPED) {
      const newState = startWorkSession(state, config);
      setState(newState);
      vscode.window.showInformationMessage(getStartMessage(newState.state));
      startTicking();
    } else if (!state.isRunning) {
      setState(resumeTimer(state));
      startTicking();
    }
  };

  const stop = () => {
    const state = getState();
    stopTicking();

    if (state.state !== TimerState.STOPPED) {
      setState(pauseTimer(state));
      vscode.window.showInformationMessage(
        'Pomodoro timer paused. Use "Start" to resume.'
      );
    }
  };

  const reset = () => {
    stopTicking();
    setState(resetTimer());
    vscode.window.showInformationMessage("Pomodoro timer reset.");
  };

  const showStatus = () => {
    const message = createStatusMessage(getState());
    vscode.window.showInformationMessage(message);
  };

  const initializeStatusBar = () => {
    statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Left,
      100
    );
    statusBarItem.command = "pomodoro.showStatus";
    statusBarItem.show();

    // Subscribe to state changes to update status bar
    subscribe((state) => {
      statusBarItem.text = createStatusBarText(state);
      statusBarItem.tooltip = createStatusBarTooltip(state);
    });

    // Initial update
    statusBarItem.text = createStatusBarText(getState());
    statusBarItem.tooltip = createStatusBarTooltip(getState());
  };

  const dispose = () => {
    stopTicking();
    if (statusBarItem) {
      statusBarItem.dispose();
    }
    stateChangeCallbacks = [];
  };

  return {
    start,
    stop,
    reset,
    showStatus,
    initializeStatusBar,
    dispose,
    getState,
    subscribe,
  };
};

// Extension activation
let timerManager: ReturnType<typeof createTimerManager>;

export function activate(context: vscode.ExtensionContext) {
  timerManager = createTimerManager();
  timerManager.initializeStatusBar();

  // Register commands using currying/partial application
  const createCommand = (action: any) =>
    vscode.commands.registerCommand.bind(null, action);

  const commands = [
    vscode.commands.registerCommand("pomodoro.start", timerManager.start),
    vscode.commands.registerCommand("pomodoro.stop", timerManager.stop),
    vscode.commands.registerCommand("pomodoro.reset", timerManager.reset),
    vscode.commands.registerCommand(
      "pomodoro.showStatus",
      timerManager.showStatus
    ),
  ];

  // Add all commands to subscriptions
  context.subscriptions.push(...commands);

  // Add disposal cleanup
  context.subscriptions.push({
    dispose: timerManager.dispose,
  });
}

export function deactivate() {
  if (timerManager) {
    timerManager.dispose();
  }
}
