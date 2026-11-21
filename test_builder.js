const { describe, it } = require("node:test");
const assert = require("node:assert");
const { WALL, create_board, cell_at, parse_board } = require("./board.js");
const { create_mouse } = require("./mouse.js");
const { allow_hidden_cheese } = require("./maze.js");
const {
  build_start_mouse,
  tool_at,
  place_tool,
  turn_at,
  resize_board,
  has_room_for_cheese,
  pick_build_cheese,
  encode_board,
  decode_board,
  build_hash,
  board_from_hash,
  trial_goal_from_hash,
} = require("./builder.js");

function board_from(lines) {
  return parse_board(lines).board;
}

function always(value) {
  return () => value;
}

function every_cheese_spot(board, previous_cheese) {
  const spots = new Set();
  for (let roll = 0; roll < 1; roll += 0.01) {
    const cheese = pick_build_cheese(board, previous_cheese, always(roll));
    spots.add(cheese.row + "," + cheese.col + "," + cheese.level);
  }
  return [...spots].sort();
}

describe("the start spot", () => {
  it("is the bottom left corner with the mouse facing up", () => {
    assert.deepStrictEqual(build_start_mouse(create_board(4, 6)), create_mouse(3, 0, 0));
  });

  it("can never be painted over", () => {
    const board = create_board(3, 3);
    assert.strictEqual(place_tool(board, { row: 2, col: 0 }, "wall", null), false);
    assert.strictEqual(cell_at(board, 2, 0).type, "floor");
    assert.deepStrictEqual(tool_at(board, { row: 2, col: 0 }), { tool: "mouse", orientation: null });
  });
});

describe("place_tool", () => {
  it("paints terrain and reports the change", () => {
    const board = create_board(3, 3);
    assert.strictEqual(place_tool(board, { row: 1, col: 1 }, "tunnel", "vertical"), true);
    assert.deepStrictEqual(tool_at(board, { row: 1, col: 1 }), { tool: "tunnel", orientation: "vertical" });
  });

  it("reports no change when painting the same thing twice", () => {
    const board = create_board(3, 3);
    place_tool(board, { row: 1, col: 1 }, "wall", null);
    assert.strictEqual(place_tool(board, { row: 1, col: 1 }, "wall", null), false);
  });

  it("ignores spots outside the board", () => {
    assert.strictEqual(place_tool(create_board(3, 3), { row: 5, col: 0 }, "wall", null), false);
  });
});

describe("placing stairs", () => {
  it("refuses stairs with nothing raised beside them", () => {
    const board = create_board(3, 3);
    assert.strictEqual(place_tool(board, { row: 1, col: 1 }, "stairs", 0), false);
    assert.strictEqual(cell_at(board, 1, 1).type, "floor");
  });

  it("keeps the chosen direction when it leads somewhere", () => {
    const board = board_from([".#.", "...", "S.."]);
    place_tool(board, { row: 1, col: 1 }, "stairs", 0);
    assert.deepStrictEqual(tool_at(board, { row: 1, col: 1 }), { tool: "stairs", orientation: 0 });
  });

  it("turns to face the only raised tile beside them", () => {
    const board = board_from(["...", "..+", "S.."]);
    place_tool(board, { row: 1, col: 1 }, "stairs", 0);
    assert.deepStrictEqual(tool_at(board, { row: 1, col: 1 }), { tool: "stairs", orientation: 1 });
  });

  it("can climb onto the top of other stairs but not their bottom", () => {
    const top_side = board_from(["...", "R..", "S.."]);
    assert.strictEqual(place_tool(top_side, { row: 1, col: 1 }, "stairs", 0), true);
    assert.strictEqual(cell_at(top_side, 1, 1).direction, 3);
    const bottom_side = board_from(["...", "L..", "S.."]);
    assert.strictEqual(place_tool(bottom_side, { row: 1, col: 1 }, "stairs", 0), false);
  });
});

describe("placing bridges", () => {
  it("works anywhere, with nothing to turn", () => {
    const board = create_board(3, 3);
    assert.strictEqual(place_tool(board, { row: 1, col: 1 }, "bridge", null), true);
    assert.deepStrictEqual(tool_at(board, { row: 1, col: 1 }), { tool: "bridge", orientation: null });
    assert.strictEqual(turn_at(board, { row: 1, col: 1 }), null);
  });
});

describe("turn_at", () => {
  it("flips tunnels between axes", () => {
    const board = create_board(3, 3);
    place_tool(board, { row: 1, col: 1 }, "tunnel", "horizontal");
    assert.strictEqual(turn_at(board, { row: 1, col: 1 }), "vertical");
    assert.strictEqual(cell_at(board, 1, 1).axis, "vertical");
  });

  it("turns stairs to the next raised tile clockwise", () => {
    const board = board_from([".#.", "#U.", "S.."]);
    assert.strictEqual(turn_at(board, { row: 1, col: 1 }), 3);
    assert.strictEqual(turn_at(board, { row: 1, col: 1 }), 0);
  });

  it("leaves stairs alone when there is only one way up", () => {
    const board = board_from([".#.", ".U.", "S.."]);
    assert.strictEqual(turn_at(board, { row: 1, col: 1 }), null);
  });

  it("does nothing to walls, floor or the mouse", () => {
    const board = board_from(["#..", "...", "S.."]);
    assert.strictEqual(turn_at(board, { row: 0, col: 0 }), null);
    assert.strictEqual(turn_at(board, { row: 1, col: 1 }), null);
    assert.strictEqual(turn_at(board, { row: 2, col: 0 }), null);
  });
});

describe("resize_board", () => {
  it("keeps terrain that still fits and adds open floor", () => {
    const board = board_from([".#", ".."]);
    const bigger = resize_board(board, 3, 4);
    assert.strictEqual(bigger.rows, 3);
    assert.strictEqual(bigger.cols, 4);
    assert.strictEqual(cell_at(bigger, 0, 1), WALL);
    assert.strictEqual(cell_at(bigger, 2, 3).type, "floor");
  });

  it("clears the new start spot", () => {
    const board = board_from(["...", "#..", "..."]);
    const shorter = resize_board(board, 2, 3);
    assert.strictEqual(cell_at(shorter, 1, 0).type, "floor");
  });
});

describe("cheese placement", () => {
  it("has room on an open board", () => {
    assert.strictEqual(has_room_for_cheese(create_board(2, 2)), true);
  });

  it("has no room when the mouse is boxed in", () => {
    assert.strictEqual(has_room_for_cheese(board_from(["...", "##.", "S#."])), false);
  });

  it("only picks floor the mouse can reach", () => {
    const board = board_from(["..#.", "..#.", "S.#."]);
    for (let roll = 0; roll < 1; roll += 0.05) {
      const cheese = pick_build_cheese(board, null, always(roll));
      assert.ok(cheese.col < 2, "cheese landed behind the wall");
    }
  });

  it("can land on the start", () => {
    assert.deepStrictEqual(every_cheese_spot(board_from(["S."]), null), ["0,0,0", "0,1,0"]);
  });

  it("lands on top of a wall the mouse can climb, never on the stairs", () => {
    assert.deepStrictEqual(every_cheese_spot(board_from(["#", "U", "S"]), null), ["0,0,1", "2,0,0"]);
  });

  it("stays out of tunnels and from under bridges unless hidden cheese is allowed", () => {
    assert.deepStrictEqual(every_cheese_spot(board_from([".", "H", "S"]), null), ["0,0,0", "2,0,0"]);
    assert.deepStrictEqual(every_cheese_spot(board_from(["...", "SR+"]), null), ["0,0,0", "0,1,0", "0,2,0", "1,0,0", "1,2,1"]);
  });

  it("can land inside a tunnel when hidden cheese is allowed", () => {
    allow_hidden_cheese(true);
    const spots = every_cheese_spot(board_from([".", "H", "S"]), null);
    allow_hidden_cheese(false);
    assert.deepStrictEqual(spots, ["0,0,0", "1,0,0", "2,0,0"]);
  });

  it("can land under a bridge when hidden cheese is allowed, or up on its deck either way", () => {
    allow_hidden_cheese(true);
    const spots = every_cheese_spot(board_from(["...", "SR+"]), null);
    allow_hidden_cheese(false);
    assert.deepStrictEqual(spots, ["0,0,0", "0,1,0", "0,2,0", "1,0,0", "1,2,0", "1,2,1"]);
  });

  it("can land on top of a tunnel the mouse can climb onto", () => {
    assert.deepStrictEqual(every_cheese_spot(board_from(["...", "SRH"]), null), ["0,0,0", "0,1,0", "0,2,0", "1,0,0", "1,2,1"]);
  });

  it("has room when the only spot away from the start is up some stairs", () => {
    assert.strictEqual(has_room_for_cheese(board_from(["#", "U", "S"])), true);
  });

  it("moves somewhere new after being found", () => {
    const board = board_from(["..", "S."]);
    for (let roll = 0; roll < 1; roll += 0.1) {
      assert.notDeepStrictEqual(pick_build_cheese(board, { row: 0, col: 0, level: 0 }, always(roll)), { row: 0, col: 0, level: 0 });
    }
  });

  it("goes back to the start when that is the only other spot", () => {
    const corridor = board_from(["S."]);
    assert.deepStrictEqual(pick_build_cheese(corridor, { row: 0, col: 1, level: 0 }, always(0)), { row: 0, col: 0, level: 0 });
  });

  it("stays put when there is nowhere else to go", () => {
    const boxed_in = board_from(["#.", "S#"]);
    assert.deepStrictEqual(pick_build_cheese(boxed_in, { row: 1, col: 0, level: 0 }, always(0)), { row: 1, col: 0, level: 0 });
  });
});

describe("sharing a build", () => {
  it("writes every kind of terrain as one letter per square", () => {
    const board = board_from(["#=H+", "URDL", "S..."]);
    assert.strictEqual(encode_board(board), "whvb-urdl-ffff");
  });

  it("never ends a link in punctuation that chat apps strip", () => {
    const board = board_from(["#.", "S."]);
    const hash = build_hash(board, 5);
    assert.match(hash, /[a-z0-9]$/);
  });

  it("carries the time trial goal in the link", () => {
    const board = board_from(["#.", "S="]);
    const hash = build_hash(board, 10);
    assert.strictEqual(trial_goal_from_hash(hash), 10);
  });

  it("has no trial goal for links shared before trials were added", () => {
    assert.strictEqual(trial_goal_from_hash("#build=w.-.h"), null);
    assert.strictEqual(trial_goal_from_hash("#build=wf-fh&trial=lots"), null);
    assert.strictEqual(trial_goal_from_hash("#other=5"), null);
  });

  it("still reads the board from a link with a trial goal", () => {
    const board = board_from(["#.", "S="]);
    const hash = build_hash(board, 3);
    assert.deepStrictEqual(board_from_hash(hash), board);
  });

  it("still reads links shared before floors were letters", () => {
    const old_board = decode_board("w.-.h");
    const new_board = decode_board("wf-fh");
    assert.deepStrictEqual(old_board, new_board);
  });

  it("reads back the same board it wrote", () => {
    const board = board_from(["#=H+.", "URDL#", "S...."]);
    assert.deepStrictEqual(decode_board(encode_board(board)), board);
  });

  it("round trips through the address bar", () => {
    const board = board_from(["#.", "S="]);
    const hash = build_hash(board, 5);
    assert.strictEqual(hash, "#build=wf-fh&trial=5");
    assert.deepStrictEqual(board_from_hash(hash), board);
  });

  it("always clears the start spot for the mouse", () => {
    const board = decode_board("..-w.");
    assert.strictEqual(cell_at(board, 1, 0).type, "floor");
  });

  it("refuses codes that are not a level", () => {
    assert.strictEqual(decode_board(""), null);
    assert.strictEqual(decode_board(null), null);
    assert.strictEqual(decode_board("..-..."), null);
    assert.strictEqual(decode_board("..-.x"), null);
    assert.strictEqual(decode_board("."), null);
    assert.strictEqual(decode_board("..........................................."), null);
  });

  it("ignores hashes that are not builds", () => {
    assert.strictEqual(board_from_hash(""), null);
    assert.strictEqual(board_from_hash("#other=..-.."), null);
  });
});
