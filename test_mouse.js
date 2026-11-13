const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  create_mouse,
  turn_right,
  turn_left,
  step_forward,
  step_backward,
  apply_step,
  create_program,
  add_step,
  clear_program,
  steps_in_range,
  replace_range,
  remove_range,
  replace_matching_sequences,
  selection_range,
  selection_after_tap,
  expand_program,
  count_expanded_steps,
  reached_cheese,
  start_playback,
  playback_tick,
  angle_for_direction,
  shortest_angle_delta,
  interpolated_pose,
} = require("./mouse.js");

const grid = { rows: 5, cols: 7 };

describe("create_mouse", () => {
  it("returns the given row, col, and direction", () => {
    const mouse = create_mouse(4, 0, 0);
    assert.deepStrictEqual(mouse, { row: 4, col: 0, direction: 0, level: 0 });
  });
});

describe("turn_right", () => {
  it("advances direction by one, wrapping from 3 to 0", () => {
    assert.strictEqual(turn_right(create_mouse(0, 0, 0)).direction, 1);
    assert.strictEqual(turn_right(create_mouse(0, 0, 3)).direction, 0);
  });

  it("does not change row or col", () => {
    const turned = turn_right(create_mouse(2, 3, 0));
    assert.strictEqual(turned.row, 2);
    assert.strictEqual(turned.col, 3);
  });
});

describe("turn_left", () => {
  it("steps direction back by one, wrapping from 0 to 3", () => {
    assert.strictEqual(turn_left(create_mouse(0, 0, 1)).direction, 0);
    assert.strictEqual(turn_left(create_mouse(0, 0, 0)).direction, 3);
  });
});

describe("step_forward", () => {
  it("moves one cell toward up, right, down, and left", () => {
    assert.deepStrictEqual(step_forward(create_mouse(2, 2, 0), grid), { row: 1, col: 2, direction: 0, level: 0 });
    assert.deepStrictEqual(step_forward(create_mouse(2, 2, 1), grid), { row: 2, col: 3, direction: 1, level: 0 });
    assert.deepStrictEqual(step_forward(create_mouse(2, 2, 2), grid), { row: 3, col: 2, direction: 2, level: 0 });
    assert.deepStrictEqual(step_forward(create_mouse(2, 2, 3), grid), { row: 2, col: 1, direction: 3, level: 0 });
  });

  it("stops at the grid edge instead of leaving it", () => {
    assert.deepStrictEqual(step_forward(create_mouse(0, 0, 0), grid), { row: 0, col: 0, direction: 0, level: 0 });
    assert.deepStrictEqual(
      step_forward(create_mouse(grid.rows - 1, grid.cols - 1, 1), grid),
      { row: grid.rows - 1, col: grid.cols - 1, direction: 1, level: 0 },
    );
  });
});

describe("step_backward", () => {
  it("moves one cell opposite the facing direction", () => {
    assert.deepStrictEqual(step_backward(create_mouse(2, 2, 0), grid), { row: 3, col: 2, direction: 0, level: 0 });
  });

  it("stops at the grid edge instead of leaving it", () => {
    assert.deepStrictEqual(step_backward(create_mouse(grid.rows - 1, 2, 0), grid), {
      row: grid.rows - 1,
      col: 2,
      direction: 0,
      level: 0,
    });
  });
});

describe("apply_step", () => {
  it("dispatches forward, backward, turn_right, and turn_left", () => {
    const mouse = create_mouse(2, 2, 0);
    assert.strictEqual(apply_step(mouse, { type: "forward" }, grid).row, 1);
    assert.strictEqual(apply_step(mouse, { type: "backward" }, grid).row, 3);
    assert.strictEqual(apply_step(mouse, { type: "turn_right" }, grid).direction, 1);
    assert.strictEqual(apply_step(mouse, { type: "turn_left" }, grid).direction, 3);
  });

  it("leaves the mouse unchanged for a squeak step", () => {
    const mouse = create_mouse(2, 2, 1);
    assert.deepStrictEqual(apply_step(mouse, { type: "squeak" }, grid), mouse);
  });
});

describe("create_program / add_step / clear_program", () => {
  it("starts empty", () => {
    assert.deepStrictEqual(create_program(), { steps: [] });
  });

  it("appends steps without mutating the original program", () => {
    const program = create_program();
    const updated = add_step(program, { type: "forward" });
    assert.strictEqual(program.steps.length, 0);
    assert.deepStrictEqual(updated.steps, [{ type: "forward" }]);
  });

  it("has no cap on how many steps can be added", () => {
    let program = create_program();
    for (let i = 0; i < 50; i++) {
      program = add_step(program, { type: "forward" });
    }
    assert.strictEqual(program.steps.length, 50);
  });

  it("clears steps", () => {
    let program = create_program();
    program = add_step(program, { type: "forward" });
    const cleared = clear_program(program);
    assert.deepStrictEqual(cleared, { steps: [] });
  });
});

function program_of(types) {
  let program = create_program();
  types.forEach((type) => {
    program = add_step(program, { type: type });
  });
  return program;
}

function types_of(program) {
  return program.steps.map((step) => step.type);
}

describe("steps_in_range / replace_range / remove_range", () => {
  it("picks out an inclusive range of steps", () => {
    const program = program_of(["forward", "turn_left", "squeak", "backward"]);
    const picked = steps_in_range(program, 1, 2);
    assert.deepStrictEqual(picked, [{ type: "turn_left" }, { type: "squeak" }]);
  });

  it("swaps a range for new steps without mutating the original", () => {
    const program = program_of(["forward", "turn_left", "squeak", "backward"]);
    const replaced = replace_range(program, 1, 2, [{ type: "turn_right" }]);
    assert.deepStrictEqual(types_of(replaced), ["forward", "turn_right", "backward"]);
    assert.strictEqual(program.steps.length, 4);
  });

  it("removes a range, including the first and last steps", () => {
    const program = program_of(["forward", "turn_left", "squeak"]);
    assert.deepStrictEqual(types_of(remove_range(program, 0, 0)), ["turn_left", "squeak"]);
    assert.deepStrictEqual(types_of(remove_range(program, 1, 2)), ["forward"]);
  });
});

describe("replace_matching_sequences", () => {
  const frog = { type: "routine", icon: "frog", steps: [] };
  const three_forwards = [{ type: "forward" }, { type: "forward" }, { type: "forward" }];

  function labels_of(program) {
    return program.steps.map((step) => (step.type === "routine" ? step.icon : step.type));
  }

  it("replaces every copy of the pattern", () => {
    const program = program_of(["forward", "forward", "forward", "squeak", "forward", "forward", "forward"]);
    const result = replace_matching_sequences(program, three_forwards, frog);
    assert.deepStrictEqual(labels_of(result), ["frog", "squeak", "frog"]);
  });

  it("takes only the first three of five in a row and leaves the rest", () => {
    const program = program_of(["forward", "forward", "forward", "forward", "forward"]);
    const result = replace_matching_sequences(program, three_forwards, frog);
    assert.deepStrictEqual(labels_of(result), ["frog", "forward", "forward"]);
  });

  it("leaves near misses alone", () => {
    const program = program_of(["forward", "forward", "squeak", "forward", "forward"]);
    const result = replace_matching_sequences(program, three_forwards, frog);
    assert.deepStrictEqual(labels_of(result), ["forward", "forward", "squeak", "forward", "forward"]);
  });

  it("does not match a pattern that runs off the end", () => {
    const program = program_of(["squeak", "forward", "forward"]);
    const result = replace_matching_sequences(program, three_forwards, frog);
    assert.deepStrictEqual(labels_of(result), ["squeak", "forward", "forward"]);
  });

  it("tells routines apart by icon", () => {
    const bee = { type: "routine", icon: "bee", steps: [] };
    const other_frog = { type: "routine", icon: "frog", steps: [] };
    let program = create_program();
    program = add_step(program, bee);
    program = add_step(program, other_frog);
    const result = replace_matching_sequences(program, [other_frog], { type: "routine", icon: "fish", steps: [] });
    assert.deepStrictEqual(labels_of(result), ["bee", "fish"]);
  });

  it("does not mutate the original program", () => {
    const program = program_of(["forward", "forward", "forward"]);
    replace_matching_sequences(program, three_forwards, frog);
    assert.strictEqual(program.steps.length, 3);
  });
});

describe("selection_after_tap", () => {
  it("selects the tapped step when nothing is selected", () => {
    assert.deepStrictEqual(selection_after_tap(null, 2), { anchor: 2, focus: 2 });
  });

  it("stretches the selection from the first tap to a tap outside it", () => {
    const selection = selection_after_tap({ anchor: 2, focus: 2 }, 5);
    assert.deepStrictEqual(selection_range(selection), { start: 2, end: 5 });
  });

  it("stretches backward as well as forward", () => {
    const selection = selection_after_tap({ anchor: 4, focus: 4 }, 1);
    assert.deepStrictEqual(selection_range(selection), { start: 1, end: 4 });
  });

  it("clears the selection when a selected step is tapped", () => {
    assert.strictEqual(selection_after_tap({ anchor: 2, focus: 2 }, 2), null);
    assert.strictEqual(selection_after_tap({ anchor: 1, focus: 4 }, 3), null);
  });
});

describe("expand_program", () => {
  it("tags each plain step with its slot", () => {
    const program = program_of(["forward", "squeak"]);
    assert.deepStrictEqual(expand_program(program).steps, [
      { type: "forward", slot_index: 0 },
      { type: "squeak", slot_index: 1 },
    ]);
  });

  it("unpacks a routine into its steps, all pointing at the routine's slot", () => {
    const routine = { type: "routine", steps: [{ type: "forward" }, { type: "turn_right" }] };
    let program = program_of(["squeak"]);
    program = add_step(program, routine);
    assert.deepStrictEqual(expand_program(program).steps, [
      { type: "squeak", slot_index: 0 },
      { type: "forward", slot_index: 1 },
      { type: "turn_right", slot_index: 1 },
    ]);
  });

  it("unpacks routines saved inside other routines", () => {
    const inner = { type: "routine", steps: [{ type: "forward" }, { type: "forward" }] };
    const outer = { type: "routine", steps: [inner, { type: "squeak" }] };
    const program = add_step(create_program(), outer);
    const types = expand_program(program).steps.map((step) => step.type);
    assert.deepStrictEqual(types, ["forward", "forward", "squeak"]);
  });
});

describe("count_expanded_steps", () => {
  it("matches the length of the expanded program", () => {
    const inner = { type: "routine", steps: [{ type: "forward" }, { type: "forward" }] };
    const outer = { type: "routine", steps: [inner, { type: "squeak" }, inner] };
    let program = program_of(["squeak", "turn_left"]);
    program = add_step(program, outer);
    program = add_step(program, inner);
    assert.strictEqual(count_expanded_steps(program), expand_program(program).steps.length);
  });

  it("is zero for an empty program", () => {
    assert.strictEqual(count_expanded_steps(create_program()), 0);
  });

  it("counts deeply nested routines without unpacking them", () => {
    let routine = { type: "routine", steps: [{ type: "squeak" }] };
    for (let depth = 0; depth < 8; depth++) {
      routine = { type: "routine", steps: Array(10).fill(routine) };
    }
    const program = add_step(create_program(), routine);
    assert.strictEqual(count_expanded_steps(program), 100000000);
  });
});

describe("reached_cheese", () => {
  it("is true only when row and col both match", () => {
    const cheese = { row: 0, col: 6 };
    assert.strictEqual(reached_cheese(create_mouse(0, 6, 0), cheese), true);
    assert.strictEqual(reached_cheese(create_mouse(0, 5, 0), cheese), false);
    assert.strictEqual(reached_cheese(create_mouse(1, 6, 0), cheese), false);
  });
});

describe("start_playback", () => {
  it("returns null for an empty program", () => {
    assert.strictEqual(start_playback(create_program(), create_mouse(4, 0, 0), grid), null);
  });

  it("applies the first step and starts in the moving phase at tick zero", () => {
    let program = create_program();
    program = add_step(program, { type: "forward" });
    const state = start_playback(program, create_mouse(4, 0, 0), grid);
    assert.strictEqual(state.step_index, 0);
    assert.strictEqual(state.phase, "moving");
    assert.strictEqual(state.ticks_in_phase, 0);
    assert.deepStrictEqual(state.from, { row: 4, col: 0, direction: 0, level: 0 });
    assert.deepStrictEqual(state.to, { row: 3, col: 0, direction: 0, level: 0 });
    assert.strictEqual(state.done, false);
  });
});

describe("playback_tick", () => {
  it("only counts ticks while below ticks_per_step", () => {
    let program = create_program();
    program = add_step(program, { type: "forward" });
    program = add_step(program, { type: "forward" });
    const state = start_playback(program, create_mouse(4, 0, 0), grid);
    const next = playback_tick(state, program, grid, 10, 5);
    assert.strictEqual(next.phase, "moving");
    assert.strictEqual(next.ticks_in_phase, 1);
    assert.strictEqual(next.step_index, 0);
    assert.deepStrictEqual(next.to, state.to);
    assert.strictEqual(next.done, false);
  });

  it("pauses once ticks_per_step is reached, holding at the arrived pose", () => {
    let program = create_program();
    program = add_step(program, { type: "forward" });
    program = add_step(program, { type: "turn_right" });
    let state = start_playback(program, create_mouse(4, 0, 0), grid);
    state = playback_tick(state, program, grid, 1, 5);
    assert.strictEqual(state.phase, "paused");
    assert.strictEqual(state.step_index, 0);
    assert.strictEqual(state.ticks_in_phase, 0);
    assert.deepStrictEqual(state.to, { row: 3, col: 0, direction: 0, level: 0 });
    assert.strictEqual(state.done, false);
  });

  it("advances to the next step once the pause elapses", () => {
    let program = create_program();
    program = add_step(program, { type: "forward" });
    program = add_step(program, { type: "turn_right" });
    let state = start_playback(program, create_mouse(4, 0, 0), grid);
    state = playback_tick(state, program, grid, 1, 1);
    state = playback_tick(state, program, grid, 1, 1);
    assert.strictEqual(state.step_index, 1);
    assert.strictEqual(state.phase, "moving");
    assert.strictEqual(state.ticks_in_phase, 0);
    assert.deepStrictEqual(state.from, { row: 3, col: 0, direction: 0, level: 0 });
    assert.deepStrictEqual(state.to, { row: 3, col: 0, direction: 1, level: 0 });
    assert.strictEqual(state.done, false);
  });

  it("reports done once the last step's pause elapses", () => {
    let program = create_program();
    program = add_step(program, { type: "forward" });
    let state = start_playback(program, create_mouse(4, 0, 0), grid);
    state = playback_tick(state, program, grid, 1, 1);
    state = playback_tick(state, program, grid, 1, 1);
    assert.strictEqual(state.done, true);
    assert.deepStrictEqual(state.to, { row: 3, col: 0, direction: 0, level: 0 });
  });
});

describe("angle_for_direction", () => {
  it("maps up, right, down, and left to 0, 90, 180, and 270", () => {
    assert.strictEqual(angle_for_direction(0), 0);
    assert.strictEqual(angle_for_direction(1), 90);
    assert.strictEqual(angle_for_direction(2), 180);
    assert.strictEqual(angle_for_direction(3), 270);
  });
});

describe("shortest_angle_delta", () => {
  it("takes the short way around instead of the long way", () => {
    assert.strictEqual(shortest_angle_delta(0, 90), 90);
    assert.strictEqual(shortest_angle_delta(270, 0), 90);
    assert.strictEqual(shortest_angle_delta(0, 270), -90);
  });

  it("returns zero for no change", () => {
    assert.strictEqual(shortest_angle_delta(180, 180), 0);
  });
});

describe("interpolated_pose", () => {
  it("returns the start pose at progress zero", () => {
    const pose = interpolated_pose({ row: 4, col: 0, direction: 0, level: 0 }, { row: 3, col: 0, direction: 0, level: 0 }, 0);
    assert.deepStrictEqual(pose, { row: 4, col: 0, angle: 0, level: 0 });
  });

  it("returns the end pose at progress one", () => {
    const pose = interpolated_pose({ row: 4, col: 0, direction: 0, level: 0 }, { row: 3, col: 0, direction: 0, level: 0 }, 1);
    assert.deepStrictEqual(pose, { row: 3, col: 0, angle: 0, level: 0 });
  });

  it("eases position and angle halfway through a move and turn", () => {
    const pose = interpolated_pose({ row: 4, col: 0, direction: 0, level: 0 }, { row: 3, col: 0, direction: 1, level: 0 }, 0.5);
    assert.strictEqual(pose.row, 3.5);
    assert.strictEqual(pose.col, 0);
    assert.strictEqual(pose.angle, 45);
  });

  it("turns the short way across the 0/270 seam", () => {
    const pose = interpolated_pose({ row: 0, col: 0, direction: 3, level: 0 }, { row: 0, col: 0, direction: 0, level: 0 }, 1);
    assert.strictEqual(pose.angle, 360);
  });
});
