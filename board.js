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

function make_bridge(axis) {
  return { type: "bridge", axis: axis };
}

function make_treadmill(direction) {
  return { type: "treadmill", direction: direction };
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

function axis_open_on_bridge(bridge, level) {
  if (level === 1) {
    return bridge.axis;
  }
  return crossing_axis(bridge.axis);
}

function level_after_entering(here, target, move_axis, level) {
  if (level === 0) {
    if (target.type === "wall") {
      return null;
    }
    if (target.type === "tunnel" && move_axis !== target.axis) {
      return null;
    }
    if (target.type === "bridge" && move_axis === target.axis) {
      return 1;
    }
    return 0;
  }

  if (target.type === "wall" || target.type === "tunnel") {
    return 1;
  }
  if (target.type === "bridge") {
    if (move_axis === target.axis) {
      return 1;
    }
    return null;
  }
  if (here.type === "bridge") {
    return 0;
  }
  return null;
}

function can_leave(here, move_axis, level) {
  if (here.type === "bridge") {
    return move_axis === axis_open_on_bridge(here, level);
  }
  if (here.type === "tunnel" && level === 0) {
    return move_axis === here.axis;
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

  var level = level_after_entering(here, target, move_axis, mouse.level);
  if (level === null) {
    return unmoved;
  }
  return { row: row, col: col, direction: mouse.direction, level: level };
}

function can_turn_at(board, mouse) {
  var here = cell_at(board, mouse.row, mouse.col);
  return here.type !== "bridge";
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

var CELLS_BY_SYMBOL = {
  ".": FLOOR,
  S: FLOOR,
  C: FLOOR,
  "#": WALL,
  "=": make_tunnel("horizontal"),
  H: make_tunnel("vertical"),
  "-": make_bridge("horizontal"),
  "|": make_bridge("vertical"),
  "^": make_treadmill(0),
  ">": make_treadmill(1),
  v: make_treadmill(2),
  "<": make_treadmill(3),
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
    make_tunnel,
    make_bridge,
    make_treadmill,
    create_board,
    is_inside,
    cell_at,
    set_cell,
    try_move,
    can_turn_at,
    push_direction,
    parse_board,
  };
}
