var board_api = typeof require !== "undefined" ? require("./board.js") : window;
var { try_move, can_turn_at, push_direction } = board_api;

var MAX_PUSHES_PER_STEP = 6;

function create_mouse(row, col, direction, level) {
  return { row: row, col: col, direction: direction, level: level || 0 };
}

function copy_mouse(mouse) {
  return create_mouse(mouse.row, mouse.col, mouse.direction, mouse.level);
}

function same_pose(first, second) {
  return (
    first.row === second.row &&
    first.col === second.col &&
    first.direction === second.direction &&
    first.level === second.level
  );
}

function turn_right(mouse) {
  return create_mouse(mouse.row, mouse.col, (mouse.direction + 1) % 4, mouse.level);
}

function turn_left(mouse) {
  return create_mouse(mouse.row, mouse.col, (mouse.direction + 3) % 4, mouse.level);
}

function step_forward(mouse, board) {
  return try_move(mouse, board, mouse.direction);
}

function step_backward(mouse, board) {
  var opposite_direction = (mouse.direction + 2) % 4;
  return try_move(mouse, board, opposite_direction);
}

function turn_if_allowed(mouse, board, turn) {
  if (!can_turn_at(board, mouse)) {
    return copy_mouse(mouse);
  }
  return turn(mouse);
}

function push_mouse(mouse, board) {
  var direction = push_direction(board, mouse);
  if (direction === null) {
    return copy_mouse(mouse);
  }
  return try_move(mouse, board, direction);
}

function apply_step(mouse, step, board) {
  if (step.type === "forward") {
    return step_forward(mouse, board);
  }
  if (step.type === "backward") {
    return step_backward(mouse, board);
  }
  if (step.type === "turn_right") {
    return turn_if_allowed(mouse, board, turn_right);
  }
  if (step.type === "turn_left") {
    return turn_if_allowed(mouse, board, turn_left);
  }
  if (step.type === "push") {
    return push_mouse(mouse, board);
  }
  return copy_mouse(mouse);
}

function apply_with_pushes(mouse, step, board) {
  var beats = [step];
  var current = apply_step(mouse, step, board);
  if (step.type === "squeak") {
    return { beats: beats, mouse: current };
  }

  var push_step = { type: "push", slot_index: step.slot_index };
  for (var push_count = 0; push_count < MAX_PUSHES_PER_STEP; push_count++) {
    var pushed = apply_step(current, push_step, board);
    if (same_pose(pushed, current)) {
      break;
    }
    beats.push(push_step);
    current = pushed;
  }
  return { beats: beats, mouse: current };
}

function create_program() {
  return { steps: [] };
}

function add_step(program, step) {
  return { steps: program.steps.concat([step]) };
}

function clear_program() {
  return { steps: [] };
}

function steps_in_range(program, start, end) {
  return program.steps.slice(start, end + 1);
}

function replace_range(program, start, end, replacement_steps) {
  var steps_before = program.steps.slice(0, start);
  var steps_after = program.steps.slice(end + 1);
  return { steps: steps_before.concat(replacement_steps, steps_after) };
}

function remove_range(program, start, end) {
  return replace_range(program, start, end, []);
}

function steps_match(first, second) {
  if (first.type !== second.type) {
    return false;
  }
  if (first.type === "routine") {
    return first.icon === second.icon;
  }
  return true;
}

function sequence_starts_at(program, index, pattern) {
  if (index + pattern.length > program.steps.length) {
    return false;
  }
  for (var offset = 0; offset < pattern.length; offset++) {
    if (!steps_match(program.steps[index + offset], pattern[offset])) {
      return false;
    }
  }
  return true;
}

function replace_matching_sequences(program, pattern, replacement) {
  var result = [];
  var index = 0;
  while (index < program.steps.length) {
    if (sequence_starts_at(program, index, pattern)) {
      result.push(replacement);
      index += pattern.length;
    } else {
      result.push(program.steps[index]);
      index += 1;
    }
  }
  return { steps: result };
}

function selection_range(selection) {
  var start = Math.min(selection.anchor, selection.focus);
  var end = Math.max(selection.anchor, selection.focus);
  return { start: start, end: end };
}

function selection_after_tap(selection, tapped_index) {
  if (!selection) {
    return { anchor: tapped_index, focus: tapped_index };
  }
  var range = selection_range(selection);
  var tapped_inside = tapped_index >= range.start && tapped_index <= range.end;
  if (tapped_inside) {
    return null;
  }
  return { anchor: selection.anchor, focus: tapped_index };
}

function append_expanded_step(step, slot_index, expanded) {
  if (step.type === "routine") {
    step.steps.forEach(function (inner_step) {
      append_expanded_step(inner_step, slot_index, expanded);
    });
    return;
  }
  expanded.push({ type: step.type, slot_index: slot_index });
}

function expand_program(program) {
  var expanded = [];
  for (var slot_index = 0; slot_index < program.steps.length; slot_index++) {
    append_expanded_step(program.steps[slot_index], slot_index, expanded);
  }
  return { steps: expanded };
}

function count_expanded_steps(program) {
  var counts_by_routine = new Map();

  function count_step(step) {
    if (step.type !== "routine") {
      return 1;
    }
    if (!counts_by_routine.has(step)) {
      var inner_counts = step.steps.map(count_step);
      var total = inner_counts.reduce(function (sum, count) {
        return sum + count;
      }, 0);
      counts_by_routine.set(step, total);
    }
    return counts_by_routine.get(step);
  }

  var slot_counts = program.steps.map(count_step);
  return slot_counts.reduce(function (sum, count) {
    return sum + count;
  }, 0);
}

var ATTEMPT_TYPES = ["forward", "backward", "turn_right", "turn_left"];

function step_is_blocked(mouse, step, board) {
  if (ATTEMPT_TYPES.indexOf(step.type) === -1) {
    return false;
  }
  var attempted = apply_step(mouse, step, board);
  return same_pose(attempted, mouse);
}

function has_infinity(program) {
  function step_has_infinity(step) {
    if (step.type === "infinity") {
      return true;
    }
    if (step.type === "routine") {
      return step.steps.some(step_has_infinity);
    }
    return false;
  }
  return program.steps.some(step_has_infinity);
}

function run_plain_step(step, mouse, slot_index, board) {
  var tagged_step = { type: step.type, slot_index: slot_index };
  var blocked = step_is_blocked(mouse, tagged_step, board);
  var result = apply_with_pushes(mouse, tagged_step, board);
  return { beats: result.beats, mouse: result.mouse, hit_wall: blocked, loop_start: null };
}

function run_item(item, mouse, slot_index, board) {
  if (item.type === "routine") {
    return run_sequence(item.steps, mouse, slot_index, board);
  }
  return run_plain_step(item, mouse, slot_index, board);
}

function earlier_beat_count_at_pose(visits, mouse) {
  var visit = visits.find(function (candidate) {
    return same_pose(candidate.pose, mouse);
  });
  if (visit === undefined) {
    return null;
  }
  return visit.beat_count;
}

function run_infinity(repeated, mouse, slot_index, board) {
  var no_change = { beats: [], mouse: mouse, hit_wall: false, loop_start: null };
  if (!repeated || repeated.type === "infinity") {
    return no_change;
  }

  var beats = [];
  var current = mouse;
  var visits = [{ pose: mouse, beat_count: 0 }];
  while (true) {
    var beats_before = beats.length;
    var result = run_item(repeated, current, slot_index, board);
    beats = beats.concat(result.beats);
    current = result.mouse;

    if (result.loop_start !== null) {
      return { beats: beats, mouse: current, hit_wall: false, loop_start: beats_before + result.loop_start };
    }
    if (result.hit_wall) {
      return { beats: beats, mouse: current, hit_wall: true, loop_start: null };
    }

    var loop_start = earlier_beat_count_at_pose(visits, current);
    if (loop_start !== null) {
      return { beats: beats, mouse: current, hit_wall: false, loop_start: loop_start };
    }
    visits.push({ pose: current, beat_count: beats.length });
  }
}

function run_sequence(steps, mouse, forced_slot_index, board) {
  var beats = [];
  var current = mouse;
  var hit_wall = false;
  for (var index = 0; index < steps.length; index++) {
    var step = steps[index];
    var slot_index = forced_slot_index === null ? index : forced_slot_index;
    var result;
    if (step.type === "infinity") {
      result = run_infinity(steps[index - 1], current, slot_index, board);
    } else {
      result = run_item(step, current, slot_index, board);
    }
    var beats_before = beats.length;
    beats = beats.concat(result.beats);
    current = result.mouse;

    if (result.loop_start !== null) {
      return { beats: beats, mouse: current, hit_wall: hit_wall, loop_start: beats_before + result.loop_start };
    }
    hit_wall = hit_wall || result.hit_wall;
  }
  return { beats: beats, mouse: current, hit_wall: hit_wall, loop_start: null };
}

function plan_run(program, start_mouse, board) {
  var result = run_sequence(program.steps, start_mouse, null, board);
  return { steps: result.beats, loop_start: result.loop_start };
}

function reached_cheese(mouse, cheese) {
  return mouse.row === cheese.row && mouse.col === cheese.col;
}

function start_playback(program, start_mouse, board) {
  if (program.steps.length === 0) {
    return null;
  }
  var to = apply_step(start_mouse, program.steps[0], board);
  return { step_index: 0, beat_count: 0, phase: "moving", ticks_in_phase: 0, from: start_mouse, to: to, done: false };
}

function playback_tick(state, program, board, ticks_per_step, ticks_per_pause) {
  var next_ticks = state.ticks_in_phase + 1;

  if (state.phase === "moving") {
    if (next_ticks < ticks_per_step) {
      return {
        step_index: state.step_index,
      beat_count: state.beat_count,
        phase: "moving",
        ticks_in_phase: next_ticks,
        from: state.from,
        to: state.to,
        done: false,
      };
    }
    return {
      step_index: state.step_index,
      beat_count: state.beat_count,
      phase: "paused",
      ticks_in_phase: 0,
      from: state.from,
      to: state.to,
      done: false,
    };
  }

  if (next_ticks < ticks_per_pause) {
    return {
      step_index: state.step_index,
      beat_count: state.beat_count,
      phase: "paused",
      ticks_in_phase: next_ticks,
      from: state.from,
      to: state.to,
      done: false,
    };
  }

  var next_step_index = state.step_index + 1;
  var loops_forever = program.loop_start !== undefined && program.loop_start !== null;
  if (next_step_index >= program.steps.length && loops_forever) {
    next_step_index = program.loop_start;
  }
  if (next_step_index >= program.steps.length) {
    return {
      step_index: state.step_index,
      beat_count: state.beat_count,
      phase: "paused",
      ticks_in_phase: next_ticks,
      from: state.from,
      to: state.to,
      done: true,
    };
  }

  var next_to = apply_step(state.to, program.steps[next_step_index], board);
  return {
    step_index: next_step_index,
    beat_count: state.beat_count + 1,
    phase: "moving",
    ticks_in_phase: 0,
    from: state.to,
    to: next_to,
    done: false,
  };
}

function angle_for_direction(direction) {
  return direction * 90;
}

function shortest_angle_delta(from_angle, to_angle) {
  var raw_delta = to_angle - from_angle;
  return (((raw_delta + 180) % 360 + 360) % 360) - 180;
}

function interpolated_pose(from, to, progress) {
  var from_angle = angle_for_direction(from.direction);
  var to_angle = angle_for_direction(to.direction);
  var angle_delta = shortest_angle_delta(from_angle, to_angle);
  var level = from.level;
  if (progress >= 0.5) {
    level = to.level;
  }
  return {
    row: from.row + (to.row - from.row) * progress,
    col: from.col + (to.col - from.col) * progress,
    angle: from_angle + angle_delta * progress,
    level: level,
  };
}

if (typeof module !== "undefined") {
  module.exports = {
    create_mouse,
    copy_mouse,
    same_pose,
    turn_right,
    turn_left,
    step_forward,
    step_backward,
    apply_step,
    apply_with_pushes,
    plan_run,
    has_infinity,
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
  };
}
