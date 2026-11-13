var TRIAL_GOAL = 10;

function create_trial() {
  return {
    phase: "waiting",
    started_at: null,
    finished_at: null,
    solved: 0,
    button_presses: 0,
    go_presses: 0,
    run_ms: 0,
    squeaks: 0,
  };
}

function is_trial_running(trial) {
  return trial.phase === "running";
}

function start_trial(trial, now) {
  if (trial.phase !== "waiting") {
    return;
  }
  trial.phase = "running";
  trial.started_at = now;
}

function record_button_press(trial) {
  if (is_trial_running(trial)) {
    trial.button_presses += 1;
  }
}

function record_go_press(trial) {
  if (is_trial_running(trial)) {
    trial.go_presses += 1;
  }
}

function record_squeak(trial) {
  if (is_trial_running(trial)) {
    trial.squeaks += 1;
  }
}

function record_run_time(trial, ms) {
  if (is_trial_running(trial)) {
    trial.run_ms += ms;
  }
}

function record_solve(trial, now) {
  if (!is_trial_running(trial)) {
    return;
  }
  trial.solved += 1;
  if (trial.solved >= TRIAL_GOAL) {
    trial.phase = "won";
    trial.finished_at = now;
  }
}

function trial_elapsed_ms(trial, now) {
  if (trial.phase === "waiting") {
    return 0;
  }
  if (trial.phase === "won") {
    return trial.finished_at - trial.started_at;
  }
  return now - trial.started_at;
}

function clock_text(ms) {
  var total_tenths = Math.floor(ms / 100);
  var tenths = total_tenths % 10;
  var total_seconds = Math.floor(total_tenths / 10);
  var seconds = total_seconds % 60;
  var minutes = Math.floor(total_seconds / 60);
  var padded_seconds = seconds < 10 ? "0" + seconds : String(seconds);
  return minutes + ":" + padded_seconds + "." + tenths;
}

if (typeof module !== "undefined") {
  module.exports = {
    TRIAL_GOAL,
    create_trial,
    is_trial_running,
    start_trial,
    record_button_press,
    record_go_press,
    record_squeak,
    record_run_time,
    record_solve,
    trial_elapsed_ms,
    clock_text,
  };
}
