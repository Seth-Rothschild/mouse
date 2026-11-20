var board_api = typeof require !== "undefined" ? require("./board.js") : window;
var mouse_api = typeof require !== "undefined" ? require("./mouse.js") : window;
var maze_api = typeof require !== "undefined" ? require("./maze.js") : window;
var {
  DIRECTIONS,
  FLOOR,
  WALL,
  BRIDGE,
  make_tunnel,
  make_stairs,
  opposite_direction,
  is_raised,
  create_board,
  is_inside,
  cell_at,
  set_cell,
  crossing_axis,
} = board_api;
var { create_mouse } = mouse_api;
var { reachable_cheese_cells, MAX_MAZE_ROWS, MAX_MAZE_COLS } = maze_api;

var BUILD_MIN_SIZE = 2;
var BUILD_MAX_ROWS = MAX_MAZE_ROWS;
var BUILD_MAX_COLS = MAX_MAZE_COLS;
var TURNABLE_TOOLS = ["tunnel", "stairs"];

function build_start_spot(board) {
  return { row: board.rows - 1, col: 0 };
}

function build_start_mouse(board) {
  var spot = build_start_spot(board);
  return create_mouse(spot.row, spot.col, 0);
}

function is_same_spot(first, second) {
  return first.row === second.row && first.col === second.col;
}

function is_turnable_tool(tool) {
  return TURNABLE_TOOLS.indexOf(tool) !== -1;
}

function tool_cell(tool, orientation) {
  if (tool === "wall") {
    return WALL;
  }
  if (tool === "tunnel") {
    return make_tunnel(orientation);
  }
  if (tool === "bridge") {
    return BRIDGE;
  }
  if (tool === "stairs") {
    return make_stairs(orientation);
  }
  return FLOOR;
}

function tool_at(board, spot) {
  if (is_same_spot(build_start_spot(board), spot)) {
    return { tool: "mouse", orientation: null };
  }
  var cell = cell_at(board, spot.row, spot.col);
  if (cell.type === "tunnel") {
    return { tool: "tunnel", orientation: cell.axis };
  }
  if (cell.type === "stairs") {
    return { tool: "stairs", orientation: cell.direction };
  }
  return { tool: cell.type, orientation: null };
}

function next_orientation(tool, orientation) {
  if (tool === "tunnel") {
    return crossing_axis(orientation);
  }
  return (orientation + 1) % 4;
}

function neighbor_spot(spot, direction) {
  var delta = DIRECTIONS[direction];
  return { row: spot.row + delta.row_delta, col: spot.col + delta.col_delta };
}

function is_raised_toward(board, spot, direction) {
  var neighbor = neighbor_spot(spot, direction);
  var cell = cell_at(board, neighbor.row, neighbor.col);
  if (cell === null) {
    return false;
  }
  if (is_raised(cell)) {
    return true;
  }
  var stairs_top_faces_spot = cell.type === "stairs" && cell.direction === opposite_direction(direction);
  return stairs_top_faces_spot;
}

function stairs_direction(board, spot, preferred_direction) {
  for (var turns = 0; turns < 4; turns++) {
    var direction = (preferred_direction + turns) % 4;
    if (is_raised_toward(board, spot, direction)) {
      return direction;
    }
  }
  return null;
}

function cell_for_placement(board, spot, tool, orientation) {
  if (tool !== "stairs") {
    return tool_cell(tool, orientation);
  }
  var direction = stairs_direction(board, spot, orientation);
  if (direction === null) {
    return null;
  }
  return make_stairs(direction);
}

function place_tool(board, spot, tool, orientation) {
  if (!is_inside(board, spot.row, spot.col)) {
    return false;
  }
  if (is_same_spot(build_start_spot(board), spot)) {
    return false;
  }
  var cell = cell_for_placement(board, spot, tool, orientation);
  if (cell === null) {
    return false;
  }
  var before = tool_at(board, spot);
  set_cell(board, spot.row, spot.col, cell);
  var after = tool_at(board, spot);
  var tool_changed = before.tool !== after.tool;
  var orientation_changed = before.orientation !== after.orientation;
  return tool_changed || orientation_changed;
}

function turn_at(board, spot) {
  var found = tool_at(board, spot);
  if (!is_turnable_tool(found.tool)) {
    return null;
  }
  var orientation = next_orientation(found.tool, found.orientation);
  var turned = place_tool(board, spot, found.tool, orientation);
  if (!turned) {
    return null;
  }
  return tool_at(board, spot).orientation;
}

function resize_board(board, rows, cols) {
  var resized = create_board(rows, cols);
  var shared_rows = Math.min(board.rows, rows);
  var shared_cols = Math.min(board.cols, cols);
  for (var row = 0; row < shared_rows; row++) {
    for (var col = 0; col < shared_cols; col++) {
      set_cell(resized, row, col, cell_at(board, row, col));
    }
  }
  var start = build_start_spot(resized);
  set_cell(resized, start.row, start.col, FLOOR);
  return resized;
}

function cheese_choices(board) {
  return reachable_cheese_cells(board, build_start_mouse(board));
}

function has_room_for_cheese(board) {
  var start = build_start_spot(board);
  var spots_away_from_start = cheese_choices(board).filter(function (spot) {
    return !is_same_spot(spot, start);
  });
  return spots_away_from_start.length > 0;
}

function pick_build_cheese(board, previous_cheese, random) {
  var choices = cheese_choices(board);
  var fresh_choices = choices.filter(function (spot) {
    return previous_cheese === null || !is_same_spot(spot, previous_cheese);
  });
  if (fresh_choices.length > 0) {
    choices = fresh_choices;
  }
  if (choices.length === 0) {
    return null;
  }
  return choices[Math.floor(random() * choices.length)];
}

var BUILD_HASH_PREFIX = "#build=";
var ROW_SEPARATOR = "-";
var TUNNEL_CODES = { horizontal: "h", vertical: "v" };
var STAIRS_CODES = ["u", "r", "d", "l"];
var PLAIN_CODES = { floor: ".", wall: "w", bridge: "b" };
var CELLS_BY_CODE = {
  ".": FLOOR,
  w: WALL,
  b: BRIDGE,
  h: make_tunnel("horizontal"),
  v: make_tunnel("vertical"),
  u: make_stairs(0),
  r: make_stairs(1),
  d: make_stairs(2),
  l: make_stairs(3),
};

function cell_code(cell) {
  if (cell.type === "tunnel") {
    return TUNNEL_CODES[cell.axis];
  }
  if (cell.type === "stairs") {
    return STAIRS_CODES[cell.direction];
  }
  return PLAIN_CODES[cell.type];
}

function encode_board(board) {
  var row_codes = [];
  for (var row = 0; row < board.rows; row++) {
    var row_code = "";
    for (var col = 0; col < board.cols; col++) {
      row_code += cell_code(cell_at(board, row, col));
    }
    row_codes.push(row_code);
  }
  return row_codes.join(ROW_SEPARATOR);
}

function is_allowed_size(rows, cols) {
  var rows_ok = rows >= BUILD_MIN_SIZE && rows <= BUILD_MAX_ROWS;
  var cols_ok = cols >= BUILD_MIN_SIZE && cols <= BUILD_MAX_COLS;
  return rows_ok && cols_ok;
}

function decode_board(code) {
  if (!code) {
    return null;
  }
  var row_codes = code.split(ROW_SEPARATOR);
  var rows = row_codes.length;
  var cols = row_codes[0].length;
  if (!is_allowed_size(rows, cols)) {
    return null;
  }
  var board = create_board(rows, cols);
  for (var row = 0; row < rows; row++) {
    if (row_codes[row].length !== cols) {
      return null;
    }
    for (var col = 0; col < cols; col++) {
      var symbol = row_codes[row][col];
      if (!(symbol in CELLS_BY_CODE)) {
        return null;
      }
      set_cell(board, row, col, CELLS_BY_CODE[symbol]);
    }
  }
  var start = build_start_spot(board);
  set_cell(board, start.row, start.col, FLOOR);
  return board;
}

function build_hash(board) {
  return BUILD_HASH_PREFIX + encode_board(board);
}

function board_from_hash(hash) {
  if (!hash.startsWith(BUILD_HASH_PREFIX)) {
    return null;
  }
  var code = hash.slice(BUILD_HASH_PREFIX.length);
  return decode_board(code);
}

if (typeof module !== "undefined") {
  module.exports = {
    BUILD_MIN_SIZE,
    BUILD_MAX_ROWS,
    BUILD_MAX_COLS,
    build_start_spot,
    build_start_mouse,
    is_same_spot,
    is_turnable_tool,
    tool_cell,
    tool_at,
    next_orientation,
    is_raised_toward,
    place_tool,
    turn_at,
    resize_board,
    has_room_for_cheese,
    pick_build_cheese,
    is_allowed_size,
    encode_board,
    decode_board,
    build_hash,
    board_from_hash,
  };
}
