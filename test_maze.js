const { describe, it } = require("node:test");
const assert = require("node:assert");
const {
  reachable_floor_cells,
  generate_maze,
  move_cheese,
  choose_growth,
  grow_maze,
  MAX_MAZE_ROWS,
  MAX_MAZE_COLS,
} = require("./maze.js");
const { create_mouse } = require("./mouse.js");
const { cell_at } = require("./board.js");

function seeded_random(seed) {
  let state = seed;
  return function () {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

describe("generate_maze", () => {
  it("always puts the cheese on a floor cell the mouse can reach", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const start = create_mouse(2, 0, 0);
      const maze = generate_maze(3, 4, start, seeded_random(seed));
      const reachable = reachable_floor_cells(maze.board, start);
      const found = reachable.some((cell) => cell.row === maze.cheese.row && cell.col === maze.cheese.col);
      assert.ok(found, "seed " + seed);
      assert.strictEqual(cell_at(maze.board, 2, 0).type, "floor");
    }
  });
});

describe("full size boards", () => {
  it("only use walls and always have a reachable cheese", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const start = create_mouse(MAX_MAZE_ROWS - 1, 0, 0);
      const puzzle = generate_maze(MAX_MAZE_ROWS, MAX_MAZE_COLS, start, seeded_random(seed));
      assert.strictEqual(puzzle.board.rows, MAX_MAZE_ROWS);
      assert.strictEqual(puzzle.board.cols, MAX_MAZE_COLS);
      puzzle.board.cells.forEach((row) => {
        row.forEach((cell) => {
          assert.ok(cell.type === "floor" || cell.type === "wall");
        });
      });
      const reachable = reachable_floor_cells(puzzle.board, start);
      const found = reachable.some((cell) => cell.row === puzzle.cheese.row && cell.col === puzzle.cheese.col);
      assert.ok(found, "seed " + seed);
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
      const reachable = reachable_floor_cells(grown.board, shifted);
      const found = reachable.some((cell) => cell.row === grown.cheese.row && cell.col === grown.cheese.col);
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
  it("picks a new reachable floor cell away from the mouse on the same board", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const random = seeded_random(seed);
      const start = create_mouse(MAX_MAZE_ROWS - 1, 0, 0);
      const puzzle = generate_maze(MAX_MAZE_ROWS, MAX_MAZE_COLS, start, random);
      const mouse = create_mouse(puzzle.cheese.row, puzzle.cheese.col, 0);
      const moved = move_cheese(puzzle.board, mouse, random);
      const same_cell = moved.row === puzzle.cheese.row && moved.col === puzzle.cheese.col;
      assert.ok(!same_cell, "seed " + seed);
      assert.strictEqual(cell_at(puzzle.board, moved.row, moved.col).type, "floor");
      const reachable = reachable_floor_cells(puzzle.board, mouse);
      assert.ok(reachable.some((cell) => cell.row === moved.row && cell.col === moved.col));
    }
  });
});
