const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  TRIAL_GOAL,
  create_trial,
  start_trial,
  record_button_press,
  record_go_press,
  record_squeak,
  record_run_time,
  record_solve,
  trial_elapsed_ms,
  clock_text,
} = require("./trial.js");

function record_everything_once(trial) {
  record_button_press(trial);
  record_go_press(trial);
  record_squeak(trial);
  record_run_time(trial, 500);
  record_solve(trial, 1000);
}

describe("trial counters", () => {
  it("ignore everything before the trial starts", () => {
    const trial = create_trial();
    record_everything_once(trial);
    assert.deepStrictEqual(trial, create_trial());
  });

  it("count presses, squeaks, run time and solves while running", () => {
    const trial = create_trial();
    start_trial(trial, 0);
    record_everything_once(trial);
    record_button_press(trial);
    assert.strictEqual(trial.button_presses, 2);
    assert.strictEqual(trial.go_presses, 1);
    assert.strictEqual(trial.squeaks, 1);
    assert.strictEqual(trial.run_ms, 500);
    assert.strictEqual(trial.solved, 1);
    assert.strictEqual(trial.phase, "running");
  });

  it("stop counting once the goal is reached", () => {
    const trial = create_trial();
    start_trial(trial, 0);
    for (let i = 0; i < TRIAL_GOAL; i++) {
      record_solve(trial, 5000);
    }
    assert.strictEqual(trial.phase, "won");
    record_button_press(trial);
    record_solve(trial, 9000);
    assert.strictEqual(trial.button_presses, 0);
    assert.strictEqual(trial.solved, TRIAL_GOAL);
  });
});

describe("trial_elapsed_ms", () => {
  it("is zero while waiting", () => {
    assert.strictEqual(trial_elapsed_ms(create_trial(), 12345), 0);
  });

  it("ticks while running and freezes when won", () => {
    const trial = create_trial();
    start_trial(trial, 1000);
    assert.strictEqual(trial_elapsed_ms(trial, 4000), 3000);
    for (let i = 0; i < TRIAL_GOAL; i++) {
      record_solve(trial, 7000);
    }
    assert.strictEqual(trial_elapsed_ms(trial, 99000), 6000);
  });
});

describe("clock_text", () => {
  it("shows minutes, padded seconds and tenths", () => {
    assert.strictEqual(clock_text(0), "0:00.0");
    assert.strictEqual(clock_text(9999), "0:09.9");
    assert.strictEqual(clock_text(83450), "1:23.4");
    assert.strictEqual(clock_text(600000), "10:00.0");
  });
});
