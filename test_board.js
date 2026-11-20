const { describe, it } = require("node:test");
const assert = require("node:assert");
const { parse_board, cell_at } = require("./board.js");
const { create_mouse, apply_step, plan_run, create_program, add_step } = require("./mouse.js");

const forward = { type: "forward" };
const backward = { type: "backward" };
const turn_right = { type: "turn_right" };

function board_from(lines) {
  return parse_board(lines).board;
}

function run_all(board, start, steps) {
  let program = create_program();
  steps.forEach((step) => {
    program = add_step(program, step);
  });
  const plan = plan_run(program, start, board);
  let mouse = start;
  plan.steps.forEach((beat) => {
    mouse = apply_step(mouse, beat, board);
  });
  return { mouse, plan };
}

describe("walls", () => {
  const board = board_from(["...", ".#.", "..."]);

  it("block a mouse on the ground", () => {
    const start = create_mouse(2, 1, 0);
    assert.deepStrictEqual(apply_step(start, forward, board), start);
  });

  it("block backing into them too", () => {
    const start = create_mouse(0, 1, 2);
    assert.deepStrictEqual(apply_step(start, backward, board), start);
  });
});

describe("tunnels", () => {
  const board = board_from(["...", ".H.", "..."]);

  it("can be entered through an open end and stay on level zero", () => {
    const start = create_mouse(2, 1, 0);
    assert.deepStrictEqual(apply_step(start, forward, board), create_mouse(1, 1, 0));
  });

  it("block a mouse walking into the side", () => {
    const beside = create_mouse(1, 0, 1);
    assert.deepStrictEqual(apply_step(beside, forward, board), beside);
  });

  it("allow turning inside", () => {
    const inside = create_mouse(1, 1, 0);
    assert.strictEqual(apply_step(inside, turn_right, board).direction, 1);
  });

  it("do not let a mouse leave through the side after turning", () => {
    const facing_side = create_mouse(1, 1, 1);
    assert.deepStrictEqual(apply_step(facing_side, forward, board), facing_side);
  });

  it("let the mouse come out the far end", () => {
    const inside = create_mouse(1, 1, 0);
    assert.deepStrictEqual(apply_step(inside, forward, board), create_mouse(0, 1, 0));
  });

  it("join into longer runs", () => {
    const long_run = board_from(["....", "S==.", "...."]);
    const start = create_mouse(1, 0, 1);
    const result = run_all(long_run, start, [forward, forward, forward]);
    assert.deepStrictEqual(result.mouse, create_mouse(1, 3, 1, 0));
  });
});

describe("stairs", () => {
  const board = board_from([".", "#", "U", "S"]);

  it("lift the mouse when climbed from the low end", () => {
    const start = create_mouse(3, 0, 0);
    assert.deepStrictEqual(apply_step(start, forward, board), create_mouse(2, 0, 0, 1));
  });

  it("lead from the top step onto a wall", () => {
    const start = create_mouse(3, 0, 0);
    const result = run_all(board, start, [forward, forward]);
    assert.deepStrictEqual(result.mouse, create_mouse(1, 0, 0, 1));
  });

  it("can be walked back down to the ground", () => {
    const on_wall = create_mouse(1, 0, 2, 1);
    const result = run_all(board, on_wall, [forward, forward]);
    assert.deepStrictEqual(result.mouse, create_mouse(3, 0, 2, 0));
  });

  it("can be backed up as well as walked up", () => {
    const facing_down = create_mouse(3, 0, 2);
    assert.deepStrictEqual(apply_step(facing_down, backward, board), create_mouse(2, 0, 2, 1));
  });

  it("cannot be climbed from the top end while on the ground", () => {
    const above = board_from(["S", "U", "."]);
    const start = create_mouse(0, 0, 0);
    assert.deepStrictEqual(apply_step(start, backward, above), start);
  });

  it("cannot be entered or left from the side", () => {
    const sideways = board_from(["S.", "U."]);
    const beside = create_mouse(1, 1, 3);
    assert.deepStrictEqual(apply_step(beside, forward, sideways), beside);
    const on_stairs = create_mouse(1, 0, 1, 1);
    assert.deepStrictEqual(apply_step(on_stairs, forward, sideways), on_stairs);
  });
});

describe("the high level", () => {
  const board = board_from(["#=+.", "U#..", "S..."]);
  const up_the_stairs = [forward, forward];

  it("is reached only by stairs", () => {
    const result = run_all(board, create_mouse(2, 0, 0), up_the_stairs);
    assert.deepStrictEqual(result.mouse, create_mouse(0, 0, 0, 1));
  });

  it("lets the mouse walk between walls, tunnel tops and bridges in any direction", () => {
    const on_wall = create_mouse(0, 0, 1, 1);
    const result = run_all(board, on_wall, [forward, forward]);
    assert.deepStrictEqual(result.mouse, create_mouse(0, 2, 1, 1));
    const down_onto_wall = run_all(board, create_mouse(0, 1, 2, 1), [forward]);
    assert.deepStrictEqual(down_onto_wall.mouse, create_mouse(1, 1, 2, 1));
  });

  it("never lets the mouse step off onto the ground", () => {
    const on_bridge = create_mouse(0, 2, 1, 1);
    assert.deepStrictEqual(apply_step(on_bridge, forward, board), on_bridge);
    const on_wall = create_mouse(1, 1, 1, 1);
    assert.deepStrictEqual(apply_step(on_wall, forward, board), on_wall);
  });

  it("allows turning anywhere", () => {
    const on_bridge = create_mouse(0, 2, 1, 1);
    assert.strictEqual(apply_step(on_bridge, turn_right, board).direction, 2);
  });
});

describe("the ground under raised tiles", () => {
  it("is blocked by walls", () => {
    const board = board_from(["S#."]);
    const start = create_mouse(0, 0, 1);
    assert.deepStrictEqual(apply_step(start, forward, board), start);
  });

  it("is open through a tunnel only along its length", () => {
    const board = board_from([".H.", "S=."]);
    const along = run_all(board, create_mouse(1, 0, 1), [forward, forward]);
    assert.deepStrictEqual(along.mouse, create_mouse(1, 2, 1, 0));
    const across = create_mouse(0, 0, 1);
    assert.deepStrictEqual(apply_step(across, forward, board), across);
  });

  it("is open under a bridge in every direction", () => {
    const board = board_from([".+.", "S++"]);
    const along = run_all(board, create_mouse(1, 0, 1), [forward, forward]);
    assert.deepStrictEqual(along.mouse, create_mouse(1, 2, 1, 0));
    const turn_under = run_all(board, create_mouse(1, 0, 1), [forward, { type: "turn_left" }, forward]);
    assert.deepStrictEqual(turn_under.mouse, create_mouse(0, 1, 0, 0));
  });
});

describe("treadmills", () => {
  it("add push beats that carry the mouse to the end of the belt", () => {
    const board = board_from([".....", ".>>>.", "....."]);
    const start = create_mouse(1, 0, 1);
    const result = run_all(board, start, [forward]);
    assert.deepStrictEqual(result.mouse, create_mouse(1, 4, 1, 0));
    const push_beats = result.plan.steps.filter((beat) => beat.type === "push");
    assert.strictEqual(push_beats.length, 3);
  });

  it("stop pushing when the belt runs into a wall", () => {
    const board = board_from([">>#"]);
    const start = create_mouse(0, 0, 1);
    const result = run_all(board, start, [{ type: "squeak" }]);
    assert.deepStrictEqual(result.mouse, start);
  });

  it("carry the mouse along a belt of any length", () => {
    const board = board_from(["S>>>>>>>>."]);
    const result = run_all(board, create_mouse(0, 0, 1), [forward]);
    assert.deepStrictEqual(result.mouse, create_mouse(0, 9, 1, 0));
  });

  it("push a mouse walking against the belt back where it came from", () => {
    const board = board_from([".>S"]);
    const result = run_all(board, create_mouse(0, 2, 3), [forward]);
    assert.deepStrictEqual(result.mouse, create_mouse(0, 2, 3, 0));
  });

  it("stop before carrying the mouse round a loop again", () => {
    const board = board_from([">v", "^<"]);
    const result = run_all(board, create_mouse(1, 0, 0), [{ type: "squeak" }, forward]);
    assert.deepStrictEqual(result.mouse, create_mouse(1, 0, 0, 0));
    const looping = run_all(board, create_mouse(0, 0, 1), [{ type: "turn_left" }]);
    assert.deepStrictEqual(looping.mouse, create_mouse(1, 0, 0, 0));
  });

  it("stop on the second of two belts that face each other", () => {
    const board = board_from(["S><."]);
    const result = run_all(board, create_mouse(0, 0, 1), [forward]);
    assert.deepStrictEqual(result.mouse, create_mouse(0, 2, 1, 0));
  });
});

describe("parse_board", () => {
  it("reads symbols into cells and finds the start and cheese", () => {
    const parsed = parse_board(["S#C", "=H>", "+L."]);
    assert.deepStrictEqual(parsed.start, { row: 0, col: 0 });
    assert.deepStrictEqual(parsed.cheese, { row: 0, col: 2 });
    assert.strictEqual(cell_at(parsed.board, 0, 1).type, "wall");
    assert.strictEqual(cell_at(parsed.board, 1, 0).type, "tunnel");
    assert.strictEqual(cell_at(parsed.board, 1, 0).axis, "horizontal");
    assert.strictEqual(cell_at(parsed.board, 1, 1).axis, "vertical");
    assert.strictEqual(cell_at(parsed.board, 1, 2).direction, 1);
    assert.strictEqual(cell_at(parsed.board, 2, 0).type, "bridge");
    assert.strictEqual(cell_at(parsed.board, 2, 1).direction, 3);
  });
});
