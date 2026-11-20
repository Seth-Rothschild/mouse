var board_api = typeof require !== "undefined" ? require("./board.js") : window;
var mouse_api = typeof require !== "undefined" ? require("./mouse.js") : window;
var { DIRECTIONS, WALL, make_tunnel, create_board, cell_at, set_cell } = board_api;
var { create_mouse, apply_with_pushes } = mouse_api;

var MAX_MAZE_ROWS = 7;
var MAX_MAZE_COLS = 10;
var GENERATION_ATTEMPTS = 60;
var WALL_CHANCE = 0.2;
var MAX_TUNNELS = 2;
var GROW_TUNNEL_CHANCE = 0.35;
var TUNNEL_LENGTHS = [1, 2];
var RUN_DIRECTIONS = [1, 2];

var SEARCH_STEPS = [{ type: "forward" }, { type: "backward" }, { type: "turn_right" }, { type: "turn_left" }];

function pose_key(pose) {
  return pose.row + "," + pose.col + "," + pose.direction + "," + pose.level;
}

function search_poses(board, start_mouse) {
  var found = {};
  found[pose_key(start_mouse)] = { pose: start_mouse, distance: 0 };
  var queue = [start_mouse];
  var next_index = 0;
  while (next_index < queue.length) {
    var pose = queue[next_index];
    next_index += 1;
    var distance = found[pose_key(pose)].distance;
    SEARCH_STEPS.forEach(function (step) {
      var next_pose = apply_with_pushes(pose, step, board).mouse;
      var key = pose_key(next_pose);
      if (found[key] === undefined) {
        found[key] = { pose: next_pose, distance: distance + 1 };
        queue.push(next_pose);
      }
    });
  }
  return found;
}

function reachable_floor_cells(board, start_mouse) {
  var found = search_poses(board, start_mouse);
  var seen = {};
  var cells = [];
  Object.keys(found).forEach(function (key) {
    var pose = found[key].pose;
    var cell_key = pose.row + "," + pose.col;
    var is_floor = cell_at(board, pose.row, pose.col).type === "floor";
    if (pose.level === 0 && is_floor && !seen[cell_key]) {
      seen[cell_key] = true;
      cells.push({ row: pose.row, col: pose.col });
    }
  });
  return cells;
}

function can_hold_cheese(cell, level) {
  var on_floor = cell.type === "floor" && level === 0;
  var on_top_of_wall = cell.type === "wall" && level === 1;
  return on_floor || on_top_of_wall;
}

function reachable_cheese_cells(board, start_mouse) {
  var found = search_poses(board, start_mouse);
  var seen = {};
  var cells = [];
  Object.keys(found).forEach(function (key) {
    var pose = found[key].pose;
    var cell_key = pose.row + "," + pose.col;
    var cell = cell_at(board, pose.row, pose.col);
    if (can_hold_cheese(cell, pose.level) && !seen[cell_key]) {
      seen[cell_key] = true;
      cells.push({ row: pose.row, col: pose.col });
    }
  });
  return cells;
}

function random_item(items, random) {
  return items[Math.floor(random() * items.length)];
}

function cells_in_region(region) {
  var cells = [];
  for (var row = region.first_row; row <= region.last_row; row++) {
    for (var col = region.first_col; col <= region.last_col; col++) {
      cells.push({ row: row, col: col });
    }
  }
  return cells;
}

function whole_board_region(board) {
  return { first_row: 0, last_row: board.rows - 1, first_col: 0, last_col: board.cols - 1 };
}

function contains_cell(cells, target) {
  return cells.some(function (cell) {
    return cell.row === target.row && cell.col === target.col;
  });
}

function pick_cheese(board, mouse, candidate_cells, random) {
  var reachable = reachable_cheese_cells(board, mouse);
  var choices = candidate_cells.filter(function (cell) {
    var is_mouse_cell = cell.row === mouse.row && cell.col === mouse.col;
    return contains_cell(reachable, cell) && !is_mouse_cell;
  });
  if (choices.length === 0) {
    return null;
  }
  return random_item(choices, random);
}

function move_cheese(board, mouse, random) {
  var all_cells = cells_in_region(whole_board_region(board));
  return pick_cheese(board, mouse, all_cells, random);
}

function scatter_terrain(board, region, protected_cells, random) {
  var cells = cells_in_region(region).filter(function (cell) {
    return !contains_cell(protected_cells, cell);
  });
  cells.forEach(function (cell) {
    if (random() < WALL_CHANCE) {
      set_cell(board, cell.row, cell.col, WALL);
    }
  });
}

function step_from(cell, direction, distance) {
  var delta = DIRECTIONS[direction];
  return { row: cell.row + delta.row_delta * distance, col: cell.col + delta.col_delta * distance };
}

function is_floor(board, cell) {
  var target = cell_at(board, cell.row, cell.col);
  return target !== null && target.type === "floor";
}

function touches_tunnel(board, cell) {
  return DIRECTIONS.some(function (delta, direction) {
    var neighbor = step_from(cell, direction, 1);
    var target = cell_at(board, neighbor.row, neighbor.col);
    return target !== null && target.type === "tunnel";
  });
}

function make_run(first_cell, direction, length) {
  var cells = [];
  for (var distance = 0; distance < length; distance++) {
    cells.push(step_from(first_cell, direction, distance));
  }
  var last_cell = cells[cells.length - 1];
  var axis = "vertical";
  if (direction === 1) {
    axis = "horizontal";
  }
  return {
    cells: cells,
    axis: axis,
    before: step_from(first_cell, direction, -1),
    after: step_from(last_cell, direction, 1),
  };
}

function run_fits(board, run, region_cells, protected_cells) {
  var cells_ok = run.cells.every(function (cell) {
    var in_region = contains_cell(region_cells, cell);
    var is_protected = contains_cell(protected_cells, cell);
    return in_region && !is_protected && !touches_tunnel(board, cell);
  });
  var ends_clear = is_floor(board, run.before) && is_floor(board, run.after);
  return cells_ok && ends_clear;
}

function tunnel_runs(board, region, protected_cells, lengths) {
  var region_cells = cells_in_region(region);
  var runs = [];
  region_cells.forEach(function (first_cell) {
    RUN_DIRECTIONS.forEach(function (direction) {
      lengths.forEach(function (length) {
        var run = make_run(first_cell, direction, length);
        if (run_fits(board, run, region_cells, protected_cells)) {
          runs.push(run);
        }
      });
    });
  });
  return runs;
}

function is_all_walls(board, run) {
  return run.cells.every(function (cell) {
    return cell_at(board, cell.row, cell.col).type === "wall";
  });
}

function pick_tunnel(board, region, mouse, lengths, random) {
  var runs = tunnel_runs(board, region, [mouse], lengths);
  var reachable = reachable_floor_cells(board, mouse);
  var usable = runs.filter(function (run) {
    return contains_cell(reachable, run.before) || contains_cell(reachable, run.after);
  });
  var connecting = usable.filter(function (run) {
    var both_reachable = contains_cell(reachable, run.before) && contains_cell(reachable, run.after);
    return is_all_walls(board, run) && !both_reachable;
  });
  if (connecting.length > 0) {
    return random_item(connecting, random);
  }
  if (usable.length > 0) {
    return random_item(usable, random);
  }
  return null;
}

function lay_tunnel(board, run) {
  run.cells.forEach(function (cell) {
    set_cell(board, cell.row, cell.col, make_tunnel(run.axis));
  });
}

function place_tunnels(board, region, mouse, count, lengths, random) {
  for (var placed = 0; placed < count; placed++) {
    var run = pick_tunnel(board, region, mouse, lengths, random);
    if (run === null) {
      return;
    }
    lay_tunnel(board, run);
  }
}

function random_tunnel_count(random) {
  return 1 + Math.floor(random() * MAX_TUNNELS);
}

function generate_maze(rows, cols, start_mouse, random) {
  var region = whole_board_region({ rows: rows, cols: cols });
  var all_cells = cells_in_region(region);
  for (var attempt = 0; attempt < GENERATION_ATTEMPTS; attempt++) {
    var board = create_board(rows, cols);
    scatter_terrain(board, region, [start_mouse], random);
    place_tunnels(board, region, start_mouse, random_tunnel_count(random), TUNNEL_LENGTHS, random);
    var cheese = pick_cheese(board, start_mouse, all_cells, random);
    if (cheese !== null) {
      return { board: board, cheese: cheese };
    }
  }
  var open_board = create_board(rows, cols);
  var open_cheese = pick_cheese(open_board, start_mouse, all_cells, random);
  return { board: open_board, cheese: open_cheese };
}

function generate_tutorial(rows, cols, start_mouse, random) {
  var region = whole_board_region({ rows: rows, cols: cols });
  var all_cells = cells_in_region(region);
  var wall_choices = all_cells.filter(function (cell) {
    return !contains_cell([start_mouse], cell);
  });
  for (var attempt = 0; attempt < GENERATION_ATTEMPTS; attempt++) {
    var board = create_board(rows, cols);
    var wall_cell = random_item(wall_choices, random);
    set_cell(board, wall_cell.row, wall_cell.col, WALL);
    var run = pick_tunnel(board, region, start_mouse, [1], random);
    if (run === null) {
      continue;
    }
    lay_tunnel(board, run);
    var cheese = pick_cheese(board, start_mouse, all_cells, random);
    if (cheese !== null) {
      return { board: board, cheese: cheese };
    }
  }
  var open_board = create_board(rows, cols);
  var open_cheese = pick_cheese(open_board, start_mouse, all_cells, random);
  return { board: open_board, cheese: open_cheese };
}

function choose_growth(board) {
  if (board.cols <= board.rows + 1 && board.cols < MAX_MAZE_COLS) {
    return "right";
  }
  if (board.rows < MAX_MAZE_ROWS) {
    return "top";
  }
  if (board.cols < MAX_MAZE_COLS) {
    return "right";
  }
  return null;
}

function expand_board(board, side) {
  var row_shift = 0;
  var new_rows = board.rows;
  var new_cols = board.cols;
  if (side === "top") {
    row_shift = 1;
    new_rows += 1;
  } else {
    new_cols += 1;
  }

  var bigger = create_board(new_rows, new_cols);
  for (var row = 0; row < board.rows; row++) {
    for (var col = 0; col < board.cols; col++) {
      set_cell(bigger, row + row_shift, col, board.cells[row][col]);
    }
  }

  var region = whole_board_region(bigger);
  if (side === "top") {
    region.last_row = 0;
  } else {
    region.first_col = new_cols - 1;
  }
  return { board: bigger, region: region, row_shift: row_shift };
}

function open_board_result(board, mouse, row_shift, random) {
  var cleared = create_board(board.rows, board.cols);
  var cheese = pick_cheese(cleared, mouse, cells_in_region(whole_board_region(cleared)), random);
  return { board: cleared, row_shift: row_shift, cheese: cheese };
}

function grow_maze(board, mouse, random) {
  var side = choose_growth(board);
  if (side === null) {
    var cheese = pick_cheese(board, mouse, cells_in_region(whole_board_region(board)), random);
    if (cheese === null) {
      return open_board_result(board, mouse, 0, random);
    }
    return { board: board, row_shift: 0, cheese: cheese };
  }

  for (var attempt = 0; attempt < GENERATION_ATTEMPTS; attempt++) {
    var expansion = expand_board(board, side);
    var shifted_mouse = create_mouse(mouse.row + expansion.row_shift, mouse.col, mouse.direction, mouse.level);
    scatter_terrain(expansion.board, expansion.region, [], random);
    var tunnel_count = 0;
    if (random() < GROW_TUNNEL_CHANCE) {
      tunnel_count = 1;
    }
    place_tunnels(expansion.board, expansion.region, shifted_mouse, tunnel_count, TUNNEL_LENGTHS, random);
    var new_cheese = pick_cheese(expansion.board, shifted_mouse, cells_in_region(expansion.region), random);
    if (new_cheese !== null) {
      return { board: expansion.board, row_shift: expansion.row_shift, cheese: new_cheese };
    }
  }

  var open_expansion = expand_board(board, side);
  var open_mouse = create_mouse(mouse.row + open_expansion.row_shift, mouse.col, mouse.direction, mouse.level);
  var open_cells = cells_in_region(whole_board_region(open_expansion.board));
  var open_cheese = pick_cheese(open_expansion.board, open_mouse, open_cells, random);
  if (open_cheese === null) {
    return open_board_result(open_expansion.board, open_mouse, open_expansion.row_shift, random);
  }
  return { board: open_expansion.board, row_shift: open_expansion.row_shift, cheese: open_cheese };
}

if (typeof module !== "undefined") {
  module.exports = {
    search_poses,
    reachable_floor_cells,
    reachable_cheese_cells,
    pick_cheese,
    generate_maze,
    generate_tutorial,
    pick_tunnel,
    move_cheese,
    choose_growth,
    expand_board,
    grow_maze,
    MAX_MAZE_ROWS,
    MAX_MAZE_COLS,
  };
}
