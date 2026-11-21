const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  reachable_cheese_cells,
  generate_maze,
  generate_tutorial,
  pick_tunnel,
  move_cheese,
  choose_growth,
  grow_maze,
  MAX_MAZE_ROWS,
  MAX_MAZE_COLS,
} = require("./maze.js");
const { create_mouse } = require("./mouse.js");
const { cell_at, parse_board, DIRECTIONS } = require("./board.js");

function cells_of_type(board, type) {
  const found = [];
  for (let row = 0; row < board.rows; row++) {
    for (let col = 0; col < board.cols; col++) {
      if (cell_at(board, row, col).type === type) {
        found.push({ row, col });
      }
    }
  }
  return found;
}

function can_reach_cheese(board, mouse, cheese) {
  const reachable = reachable_cheese_cells(board, mouse);
  return reachable.some((spot) => spot.row === cheese.row && spot.col === cheese.col && spot.level === cheese.level);
}

function tunnel_end_cells(board, cell) {
  const tunnel = cell_at(board, cell.row, cell.col);
  let directions = [0, 2];
  if (tunnel.axis === "horizontal") {
    directions = [1, 3];
  }
  return directions.map((direction) => {
    const delta = DIRECTIONS[direction];
    return cell_at(board, cell.row + delta.row_delta, cell.col + delta.col_delta);
  });
}

function has_clear_ends(board, cell) {
  const axis = cell_at(board, cell.row, cell.col).axis;
  return tunnel_end_cells(board, cell).every((neighbor) => {
    const continues = neighbor !== null && neighbor.type === "tunnel" && neighbor.axis === axis;
    const is_floor = neighbor !== null && neighbor.type === "floor";
    return continues || is_floor;
  });
}

function seeded_random(seed) {
  let state = seed;
  return function () {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("generate_maze", () => {
  it("always puts the cheese somewhere the mouse can reach", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const start = create_mouse(2, 0, 0);
      const maze = generate_maze(3, 4, start, seeded_random(seed));
      const found = can_reach_cheese(maze.board, start, maze.cheese);
      assert.ok(found, "seed " + seed);
      assert.strictEqual(cell_at(maze.board, 2, 0).type, "floor");
    }
  });
});

describe("full size boards", () => {
  it("use walls and a few tunnels with clear ends, and always have a reachable cheese", () => {
    let boards_with_tunnels = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const start = create_mouse(MAX_MAZE_ROWS - 1, 0, 0);
      const puzzle = generate_maze(MAX_MAZE_ROWS, MAX_MAZE_COLS, start, seeded_random(seed));
      assert.strictEqual(puzzle.board.rows, MAX_MAZE_ROWS);
      assert.strictEqual(puzzle.board.cols, MAX_MAZE_COLS);
      puzzle.board.cells.forEach((row) => {
        row.forEach((cell) => {
          assert.ok(cell.type === "floor" || cell.type === "wall" || cell.type === "tunnel");
        });
      });
      const tunnels = cells_of_type(puzzle.board, "tunnel");
      assert.ok(tunnels.length <= 4, "seed " + seed);
      tunnels.forEach((cell) => {
        assert.ok(has_clear_ends(puzzle.board, cell), "seed " + seed);
      });
      if (tunnels.length > 0) {
        boards_with_tunnels += 1;
      }
      const found = can_reach_cheese(puzzle.board, start, puzzle.cheese);
      assert.ok(found, "seed " + seed);
    }
    assert.ok(boards_with_tunnels >= 15);
  });
});

describe("pick_tunnel", () => {
  it("prefers digging through a wall into a region the mouse cannot reach", () => {
    const board = parse_board(["..#..", "..#..", "..#.."]).board;
    const mouse = create_mouse(0, 0, 0);
    for (let seed = 1; seed <= 20; seed++) {
      const run = pick_tunnel(board, { first_row: 0, last_row: 2, first_col: 0, last_col: 4 }, mouse, [1], seeded_random(seed));
      assert.strictEqual(run.axis, "horizontal");
      assert.strictEqual(run.cells[0].col, 2);
    }
  });

  it("falls back to a spot the mouse can reach when everything is connected", () => {
    const board = parse_board(["....", "....", "...."]).board;
    const mouse = create_mouse(0, 0, 0);
    const run = pick_tunnel(board, { first_row: 0, last_row: 2, first_col: 0, last_col: 3 }, mouse, [1, 2], seeded_random(3));
    assert.ok(run !== null);
    assert.strictEqual(cell_at(board, run.before.row, run.before.col).type, "floor");
    assert.strictEqual(cell_at(board, run.after.row, run.after.col).type, "floor");
  });
});

describe("generate_tutorial", () => {
  it("has one wall, one single tunnel the mouse can walk into, and a reachable cheese", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const start = create_mouse(3, 0, 0);
      const tutorial = generate_tutorial(4, 5, start, seeded_random(seed));
      const walls = cells_of_type(tutorial.board, "wall");
      const tunnels = cells_of_type(tutorial.board, "tunnel");
      assert.strictEqual(walls.length, 1, "seed " + seed);
      assert.strictEqual(tunnels.length, 1, "seed " + seed);
      assert.ok(has_clear_ends(tutorial.board, tunnels[0]), "seed " + seed);
      assert.strictEqual(cell_at(tutorial.board, 3, 0).type, "floor");

      const cheese_found = can_reach_cheese(tutorial.board, start, tutorial.cheese);
      assert.ok(cheese_found, "seed " + seed);
    }
  });
});

describe("grow_maze", () => {
  it("adds a column or a row, keeps old cells, and puts the cheese in the new strip", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const random = seeded_random(seed);
      const start = create_mouse(2, 0, 0);
      const maze = generate_maze(3, 4, start, random);
      const mouse = create_mouse(maze.cheese.row, maze.cheese.col, 0);
      const grown = grow_maze(maze.board, mouse, random);

      const rows_added = grown.board.rows - maze.board.rows;
      const cols_added = grown.board.cols - maze.board.cols;
      assert.strictEqual(rows_added + cols_added, 1);
      assert.strictEqual(grown.row_shift, rows_added);

      for (let row = 0; row < maze.board.rows; row++) {
        for (let col = 0; col < maze.board.cols; col++) {
          const old_cell = cell_at(maze.board, row, col);
          const new_cell = cell_at(grown.board, row + grown.row_shift, col);
          assert.deepStrictEqual(new_cell, old_cell);
        }
      }

      const shifted = create_mouse(mouse.row + grown.row_shift, mouse.col, 0);
      const found = can_reach_cheese(grown.board, shifted, grown.cheese);
      assert.ok(found, "seed " + seed);
    }
  });

  it("alternates between columns and rows and stops at the maximum size", () => {
    let board = { rows: 3, cols: 4 };
    for (let count = 0; count < 20; count++) {
      const side = choose_growth(board);
      if (side === "right") {
        board = { rows: board.rows, cols: board.cols + 1 };
      } else if (side === "top") {
        board = { rows: board.rows + 1, cols: board.cols };
      }
    }
    assert.strictEqual(board.rows, MAX_MAZE_ROWS);
    assert.strictEqual(board.cols, MAX_MAZE_COLS);
    assert.strictEqual(choose_growth(board), null);
  });
});

describe("move_cheese", () => {
  it("picks a new reachable spot away from the mouse on the same board", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const random = seeded_random(seed);
      const start = create_mouse(MAX_MAZE_ROWS - 1, 0, 0);
      const puzzle = generate_maze(MAX_MAZE_ROWS, MAX_MAZE_COLS, start, random);
      const mouse = create_mouse(puzzle.cheese.row, puzzle.cheese.col, 0);
      const moved = move_cheese(puzzle.board, mouse, random);
      const same_cell = moved.row === puzzle.cheese.row && moved.col === puzzle.cheese.col;
      assert.ok(!same_cell, "seed " + seed);
      assert.ok(can_reach_cheese(puzzle.board, mouse, moved), "seed " + seed);
    }
  });
});
