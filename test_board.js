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
  const board = board_from(["###", "#T#", "#.#"]);

  it("can be entered from the ground and stay on level zero", () => {
    const start = create_mouse(2, 1, 0);
    assert.deepStrictEqual(apply_step(start, forward, board), create_mouse(1, 1, 0));
  });

  it("allow turning inside", () => {
    const inside = create_mouse(1, 1, 0);
    assert.strictEqual(apply_step(inside, turn_right, board).direction, 1);
  });
});

describe("bridges", () => {
  const board = board_from(["...", ".|.", "..."]);

  it("lift the mouse onto the deck when entered along the bridge axis", () => {
    const start = create_mouse(2, 1, 0);
    assert.strictEqual(apply_step(start, forward, board).level, 1);
  });

  it("let the mouse pass underneath when entered across the bridge axis", () => {
    const start = create_mouse(1, 0, 1);
    const under = apply_step(start, forward, board);
    assert.strictEqual(under.col, 1);
    assert.strictEqual(under.level, 0);
  });

  it("refuse turns while on the bridge", () => {
    const on_deck = create_mouse(1, 1, 0, 1);
    assert.deepStrictEqual(apply_step(on_deck, turn_right, board), on_deck);
  });

  it("refuse to leave the deck sideways", () => {
    const on_deck = create_mouse(1, 1, 1, 1);
    assert.deepStrictEqual(apply_step(on_deck, forward, board), on_deck);
  });

  it("send the mouse back to the ground when it walks off the end", () => {
    const on_deck = create_mouse(1, 1, 0, 1);
    const landed = apply_step(on_deck, forward, board);
    assert.deepStrictEqual(landed, create_mouse(0, 1, 0, 0));
  });
});

describe("bridge hops over walls", () => {
  const board = board_from(["...", ".|.", ".#.", ".|.", "..."]);

  it("carry the mouse across a wall at level one", () => {
    const start = create_mouse(4, 1, 0);
    const result = run_all(board, start, [forward, forward, forward, forward, forward]);
    assert.deepStrictEqual(result.mouse, create_mouse(0, 1, 0, 0));
  });

  it("do not let a ground mouse walk onto a wall directly", () => {
    const beside = board_from(["...", "...", ".#."]);
    const start = create_mouse(2, 0, 1);
    assert.deepStrictEqual(apply_step(start, forward, beside), start);
  });

  it("do not let a mouse step off a wall top onto the ground", () => {
    const wide = board_from(["...", ".|.", ".#.", ".|.", "..."]);
    const on_wall = create_mouse(2, 1, 1, 1);
    assert.deepStrictEqual(apply_step(on_wall, forward, wide), on_wall);
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

  it("give up on endless loops after a few pushes", () => {
    const board = board_from([">v", "^<"]);
    const start = create_mouse(0, 0, 1);
    const result = run_all(board, start, [forward]);
    assert.ok(result.plan.steps.length <= 8);
  });
});

describe("parse_board", () => {
  it("reads symbols into cells and finds the start and cheese", () => {
    const parsed = parse_board(["S#C", "T|>"]);
    assert.deepStrictEqual(parsed.start, { row: 0, col: 0 });
    assert.deepStrictEqual(parsed.cheese, { row: 0, col: 2 });
    assert.strictEqual(cell_at(parsed.board, 0, 1).type, "wall");
    assert.strictEqual(cell_at(parsed.board, 1, 0).type, "tunnel");
    assert.strictEqual(cell_at(parsed.board, 1, 1).axis, "vertical");
    assert.strictEqual(cell_at(parsed.board, 1, 2).direction, 1);
  });
});
