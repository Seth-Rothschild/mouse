var DIRECTIONS = [
  { row_delta: -1, col_delta: 0 }, // up
  { row_delta: 0, col_delta: 1 }, // right
  { row_delta: 1, col_delta: 0 }, // down
  { row_delta: 0, col_delta: -1 }, // left
];

var FLOOR = { type: "floor" };
var WALL = { type: "wall" };
function make_tunnel(axis) {
  return { type: "tunnel", axis: axis };
}

var BRIDGE = { type: "bridge" };

function make_treadmill(direction) {
  return { type: "treadmill", direction: direction };
}

function make_stairs(direction) {
  return { type: "stairs", direction: direction };
}

function create_board(rows, cols) {
  var cells = [];
  for (var row = 0; row < rows; row++) {
    var cell_row = [];
    for (var col = 0; col < cols; col++) {
      cell_row.push(FLOOR);
    }
    cells.push(cell_row);
  }
  return { rows: rows, cols: cols, cells: cells };
}

function is_inside(board, row, col) {
  var row_ok = row >= 0 && row < board.rows;
  var col_ok = col >= 0 && col < board.cols;
  return row_ok && col_ok;
}

function cell_at(board, row, col) {
  if (!is_inside(board, row, col)) {
    return null;
  }
  if (!board.cells) {
    return FLOOR;
  }
  return board.cells[row][col];
}

function set_cell(board, row, col, cell) {
  board.cells[row][col] = cell;
}

function axis_of_direction(direction) {
  if (direction % 2 === 0) {
    return "vertical";
  }
  return "horizontal";
}

function crossing_axis(axis) {
  if (axis === "vertical") {
    return "horizontal";
  }
  return "vertical";
}

var RAISED_TYPES = ["wall", "tunnel", "bridge"];

function is_raised(cell) {
  return RAISED_TYPES.indexOf(cell.type) !== -1;
}

function opposite_direction(direction) {
  return (direction + 2) % 4;
}

function exit_level(here, move_direction, level) {
  if (here.type !== "stairs") {
    return level;
  }
  if (move_direction === here.direction) {
    return 1;
  }
  return 0;
}

function level_after_entering_stairs(stairs, move_direction, level) {
  var climbing = move_direction === stairs.direction;
  var descending = move_direction === opposite_direction(stairs.direction);
  if (climbing && level === 0) {
    return 1;
  }
  if (descending && level === 1) {
    return 1;
  }
  return null;
}

function level_after_entering(target, move_direction, level) {
  var move_axis = axis_of_direction(move_direction);
  if (target.type === "stairs") {
    return level_after_entering_stairs(target, move_direction, level);
  }

  if (level === 1) {
    if (is_raised(target)) {
      return 1;
    }
    return null;
  }

  if (target.type === "wall") {
    return null;
  }
  if (target.type === "tunnel" && move_axis !== target.axis) {
    return null;
  }
  return 0;
}

function can_leave(here, move_axis, level) {
  if (here.type === "tunnel" && level === 0) {
    return move_axis === here.axis;
  }
  if (here.type === "stairs") {
    return move_axis === axis_of_direction(here.direction);
  }
  return true;
}

function try_move(mouse, board, move_direction) {
  var unmoved = { row: mouse.row, col: mouse.col, direction: mouse.direction, level: mouse.level };
  var move_axis = axis_of_direction(move_direction);
  var here = cell_at(board, mouse.row, mouse.col);
  if (!can_leave(here, move_axis, mouse.level)) {
    return unmoved;
  }

  var delta = DIRECTIONS[move_direction];
  var row = mouse.row + delta.row_delta;
  var col = mouse.col + delta.col_delta;
  var target = cell_at(board, row, col);
  if (target === null) {
    return unmoved;
  }

  var level_at_edge = exit_level(here, move_direction, mouse.level);
  var level = level_after_entering(target, move_direction, level_at_edge);
  if (level === null) {
    return unmoved;
  }
  return { row: row, col: col, direction: mouse.direction, level: level };
}

function push_direction(board, mouse) {
  if (mouse.level !== 0) {
    return null;
  }
  var here = cell_at(board, mouse.row, mouse.col);
  if (here.type !== "treadmill") {
    return null;
  }
  return here.direction;
}

function spot_key(row, col) {
  return row + "," + col;
}

function stairs_tops(board) {
  var mice = [];
  for (var row = 0; row < board.rows; row++) {
    for (var col = 0; col < board.cols; col++) {
      if (cell_at(board, row, col).type === "stairs") {
        mice.push({ row: row, col: col, direction: 0, level: 1 });
      }
    }
  }
  return mice;
}

function walkable_tops(board) {
  var queue = stairs_tops(board);
  var seen = {};
  queue.forEach(function (mouse) {
    seen[spot_key(mouse.row, mouse.col)] = true;
  });
  var next_index = 0;
  while (next_index < queue.length) {
    var mouse = queue[next_index];
    next_index += 1;
    for (var direction = 0; direction < 4; direction++) {
      var moved = try_move(mouse, board, direction);
      var key = spot_key(moved.row, moved.col);
      if (moved.level === 1 && !seen[key]) {
        seen[key] = true;
        queue.push(moved);
      }
    }
  }
  return seen;
}

function has_walkable_top(tops, row, col) {
  return tops[spot_key(row, col)] === true;
}

var CELLS_BY_SYMBOL = {
  ".": FLOOR,
  S: FLOOR,
  C: FLOOR,
  "#": WALL,
  "=": make_tunnel("horizontal"),
  H: make_tunnel("vertical"),
  "+": BRIDGE,
  "^": make_treadmill(0),
  ">": make_treadmill(1),
  v: make_treadmill(2),
  "<": make_treadmill(3),
  U: make_stairs(0),
  R: make_stairs(1),
  D: make_stairs(2),
  L: make_stairs(3),
};

function parse_board(lines) {
  var board = create_board(lines.length, lines[0].length);
  var start = null;
  var cheese = null;
  for (var row = 0; row < lines.length; row++) {
    for (var col = 0; col < lines[row].length; col++) {
      var symbol = lines[row][col];
      set_cell(board, row, col, CELLS_BY_SYMBOL[symbol]);
      if (symbol === "S") {
        start = { row: row, col: col };
      }
      if (symbol === "C") {
        cheese = { row: row, col: col };
      }
    }
  }
  return { board: board, start: start, cheese: cheese };
}

if (typeof module !== "undefined") {
  module.exports = {
    DIRECTIONS,
    FLOOR,
    WALL,
    BRIDGE,
    make_tunnel,
    make_treadmill,
    make_stairs,
    opposite_direction,
    axis_of_direction,
    create_board,
    is_inside,
    cell_at,
    set_cell,
    crossing_axis,
    is_raised,
    try_move,
    push_direction,
    walkable_tops,
    has_walkable_top,
    parse_board,
  };
}
