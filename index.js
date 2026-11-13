var canvas = document.getElementById("game");
var ctx = canvas.getContext("2d");

var game_mode = "tutorial";
var board = create_board(4, 5);
var cell_size = 64;
var board_origin_x = 0;
var board_origin_y = 0;
var max_cell_size = 72;

var start_mouse = create_mouse(3, 0, 0);
var mouse = copy_mouse(start_mouse);
var cheese = { row: 0, col: 0 };
var levels_completed = 0;
var celebration = null;

var program = create_program();
var run_plan = null;
var selection = null;
var routines = [];
var mode = "editing";
var playback_state = null;
var ticks_per_step = 26;
var ticks_per_pause = 16;

var squeak_effect = null;
var screen_shake = null;
var trail_particles = [];
var trail_spawn_counter = 0;
var confetti_particles = [];
var confetti_colors = ["#ff4136", "#2ecc40", "#ffdc00", "#0074d9", "#b10dc9", "#ff851b"];

var audio_context = null;
var motor = null;
var motor_running = false;

var message_timer = null;
var frame_ms = 1000 / 60;
var last_frame_at = null;
var frame_samples = [];
var frames_to_sample = 90;
var common_refresh_rates = [30, 60, 75, 90, 120, 144, 165, 240];
var counted_program = null;
var counted_steps = 0;

var mode_names = { tutorial: "Tutorial", puzzle: "Puzzle", maze: "Maze" };

var actions = {
  forward: { type: "forward", color: "#3498db", ink: "#fff" },
  backward: { type: "backward", color: "#ffdc00", ink: "#2d2a32" },
  turn_right: { type: "turn_right", color: "#9b59b6", ink: "#fff" },
  turn_left: { type: "turn_left", color: "#E67E22", ink: "#fff" },
  squeak: { type: "squeak", color: "#ff4136", ink: "#fff" },
};

var routine_looks = [
  { icon: "🐸", color: "#7bd389" },
  { icon: "🐝", color: "#ffe066" },
  { icon: "🐞", color: "#ff8fa3" },
  { icon: "🦋", color: "#8ecae6" },
  { icon: "🐢", color: "#b8e0a0" },
  { icon: "🐙", color: "#d0a8f0" },
];

function random_cell_excluding(excluded_cells) {
  var excluded_keys = excluded_cells.map(function (cell) {
    return cell.row + "," + cell.col;
  });
  var row, col;
  do {
    row = Math.floor(Math.random() * board.rows);
    col = Math.floor(Math.random() * board.cols);
  } while (excluded_keys.indexOf(row + "," + col) !== -1);
  return { row: row, col: col };
}

function layout_board() {
  var fit_width = Math.floor((canvas.width - 40) / board.cols);
  var fit_height = Math.floor((canvas.height - 40) / board.rows);
  cell_size = Math.min(fit_width, fit_height, max_cell_size);
  board_origin_x = (canvas.width - board.cols * cell_size) / 2;
  board_origin_y = (canvas.height - board.rows * cell_size) / 2;
}

function status_text() {
  var stars = "\u2605 " + levels_completed;
  if (game_mode === "puzzle") {
    return stars + " solved";
  }
  if (game_mode === "maze") {
    return "Maze " + board.rows + " \u00d7 " + board.cols + " \u00b7 " + stars + " found";
  }
  return stars + " found";
}

function update_status() {
  document.getElementById("level-counter").textContent = status_text();
}

function set_levels_completed(count) {
  levels_completed = count;
  update_status();
}

function setup_tutorial() {
  board = create_board(4, 5);
  start_mouse = create_mouse(3, 0, 0);
  cheese = random_cell_excluding([start_mouse]);
}

function setup_maze() {
  start_mouse = create_mouse(2, 0, 0);
  var maze = generate_maze(3, 4, start_mouse, Math.random);
  board = maze.board;
  cheese = maze.cheese;
}

function setup_puzzle() {
  start_mouse = create_mouse(MAX_MAZE_ROWS - 1, 0, 0);
  var puzzle = generate_maze(MAX_MAZE_ROWS, MAX_MAZE_COLS, start_mouse, Math.random);
  board = puzzle.board;
  cheese = puzzle.cheese;
}

function update_mode_menu() {
  document.getElementById("mode-chip-label").textContent = mode_names[game_mode];
  var options = document.querySelectorAll(".mode-option");
  for (var i = 0; i < options.length; i++) {
    options[i].classList.toggle("active", options[i].dataset.mode === game_mode);
  }
}

function set_mode_list_open(open) {
  document.getElementById("mode-list").hidden = !open;
  document.getElementById("mode-chip").setAttribute("aria-expanded", String(open));
}

function is_mode_list_open() {
  return !document.getElementById("mode-list").hidden;
}

function select_game_mode(new_mode) {
  game_mode = new_mode;
  if (game_mode === "puzzle") {
    setup_puzzle();
  } else if (game_mode === "maze") {
    setup_maze();
  } else {
    setup_tutorial();
  }
  mouse = copy_mouse(start_mouse);
  program = clear_program();
  selection = null;
  celebration = null;
  levels_completed = 0;
  layout_board();
  set_message("");
  update_status();
  update_mode_menu();
  rebuild_slots();
  refresh_buttons();
}

function advance_puzzle() {
  cheese = move_cheese(board, mouse, Math.random);
}

function grow_current_maze() {
  var grown = grow_maze(board, mouse, Math.random);
  board = grown.board;
  start_mouse = create_mouse(start_mouse.row + grown.row_shift, start_mouse.col, start_mouse.direction);
  mouse = create_mouse(mouse.row + grown.row_shift, mouse.col, mouse.direction, mouse.level);
  cheese = grown.cheese;
  layout_board();
  update_status();
}

function advance_to_next_level() {
  set_levels_completed(levels_completed + 1);
  if (game_mode === "puzzle") {
    advance_puzzle();
  } else if (game_mode === "maze") {
    grow_current_maze();
  } else {
    cheese = random_cell_excluding([cheese, mouse]);
  }
}

function set_message(text, tone) {
  var element = document.getElementById("message");
  clearTimeout(message_timer);
  element.classList.remove("shown", "win", "try");
  if (!text) {
    return;
  }
  element.textContent = text;
  void element.offsetWidth;
  element.classList.add("shown", tone);
  message_timer = setTimeout(function () {
    element.classList.remove("shown");
  }, 2600);
}

function step_appearance(step) {
  if (step.type === "routine") {
    return { color: step.color };
  }
  return actions[step.type];
}

function build_icon(name) {
  var svg_namespace = "http://www.w3.org/2000/svg";
  var svg = document.createElementNS(svg_namespace, "svg");
  svg.setAttribute("class", "icon");
  var use = document.createElementNS(svg_namespace, "use");
  use.setAttribute("href", "#icon-" + name);
  svg.appendChild(use);
  return svg;
}

function build_slot(step, slot_index) {
  var appearance = step_appearance(step);
  var slot = document.createElement("div");
  slot.className = "slot filled";
  slot.style.background = appearance.color;
  if (step.type === "routine") {
    slot.classList.add("routine");
    slot.textContent = step.icon;
  } else {
    slot.style.color = appearance.ink;
    slot.appendChild(build_icon(step.type));
  }
  slot.addEventListener("click", function () {
    tap_slot(slot_index);
  });
  return slot;
}

function rebuild_slots() {
  var container = document.getElementById("sequence-display");
  container.innerHTML = "";
  for (var i = 0; i < program.steps.length; i++) {
    container.appendChild(build_slot(program.steps[i], i));
  }
  update_active_slot();
  update_selected_slots();
}

function append_slot(step) {
  var container = document.getElementById("sequence-display");
  var slot_index = program.steps.length - 1;
  var slot = build_slot(step, slot_index);
  slot.classList.add("pop-in");
  container.appendChild(slot);
}

function active_slot_index() {
  if (mode !== "executing" || !playback_state) {
    return -1;
  }
  return run_plan.steps[playback_state.step_index].slot_index;
}

function update_active_slot() {
  var container = document.getElementById("sequence-display");
  var slots = container.children;
  var active_index = active_slot_index();
  for (var i = 0; i < slots.length; i++) {
    slots[i].classList.toggle("active", i === active_index);
  }
}

function is_slot_selected(slot_index) {
  if (!selection) {
    return false;
  }
  var range = selection_range(selection);
  return slot_index >= range.start && slot_index <= range.end;
}

function update_selected_slots() {
  var container = document.getElementById("sequence-display");
  var slots = container.children;
  for (var i = 0; i < slots.length; i++) {
    slots[i].classList.toggle("selected", is_slot_selected(i));
  }
}

function set_selection(new_selection) {
  selection = new_selection;
  update_selected_slots();
  refresh_buttons();
}

function tap_slot(slot_index) {
  if (mode === "executing") {
    return;
  }
  set_selection(selection_after_tap(selection, slot_index));
}

function delete_selected_steps() {
  if (mode === "executing" || !selection) {
    return;
  }
  var range = selection_range(selection);
  program = remove_range(program, range.start, range.end);
  selection = null;
  rebuild_slots();
  refresh_buttons();
  play_thud_sound();
}

function unused_routine_look() {
  var used_icons = routines.map(function (routine) {
    return routine.icon;
  });
  return routine_looks.find(function (look) {
    return used_icons.indexOf(look.icon) === -1;
  });
}

function save_selected_steps_as_routine() {
  if (mode === "executing" || !selection) {
    return;
  }
  var look = unused_routine_look();
  if (!look) {
    return;
  }
  var range = selection_range(selection);
  var picked_steps = steps_in_range(program, range.start, range.end);
  var routine = { type: "routine", icon: look.icon, color: look.color, steps: picked_steps };
  routines.push(routine);
  program = replace_range(program, range.start, range.end, [routine]);
  program = replace_matching_sequences(program, picked_steps, routine);
  selection = null;

  rebuild_slots();
  var container = document.getElementById("sequence-display");
  for (var i = 0; i < program.steps.length; i++) {
    if (program.steps[i] === routine) {
      container.children[i].classList.add("pop-in");
    }
  }

  rebuild_routine_row();
  var routine_row = document.getElementById("routine-row");
  routine_row.children[routines.length - 1].classList.add("pop-in");

  play_squeak_sound();
}

function forget_routine(routine_index) {
  if (mode === "executing") {
    return;
  }
  routines.splice(routine_index, 1);
  rebuild_routine_row();
}

function build_routine_preview(routine) {
  var preview = document.createElement("div");
  preview.className = "routine-preview";
  routine.steps.forEach(function (step) {
    var dot = document.createElement("span");
    dot.className = "preview-dot";
    dot.style.background = step_appearance(step).color;
    preview.appendChild(dot);
  });
  return preview;
}

function build_routine_button(routine, routine_index) {
  var holder = document.createElement("div");
  holder.className = "routine-holder";

  var button = document.createElement("button");
  button.className = "routine-button";
  button.style.background = routine.color;
  button.title = "Add these steps";
  var icon = document.createElement("span");
  icon.className = "routine-icon";
  icon.textContent = routine.icon;
  button.appendChild(icon);
  button.appendChild(build_routine_preview(routine));
  button.addEventListener("click", function (event) {
    flash_button(event.currentTarget);
    add_step_to_program(routine);
  });

  var forget_button = document.createElement("button");
  forget_button.className = "routine-forget";
  forget_button.title = "Throw away this button";
  forget_button.textContent = "✕";
  forget_button.addEventListener("click", function () {
    forget_routine(routine_index);
  });

  holder.appendChild(button);
  holder.appendChild(forget_button);
  return holder;
}

function build_empty_routine_spot() {
  var spot = document.createElement("div");
  spot.className = "routine-empty";
  return spot;
}

function rebuild_routine_row() {
  var routine_row = document.getElementById("routine-row");
  routine_row.innerHTML = "";
  for (var i = 0; i < routine_looks.length; i++) {
    if (i < routines.length) {
      routine_row.appendChild(build_routine_button(routines[i], i));
    } else {
      routine_row.appendChild(build_empty_routine_spot());
    }
  }
  routine_row.classList.toggle("hidden", routines.length === 0);
  refresh_buttons();
}

function flash_button(button) {
  button.classList.add("pressed");
  setTimeout(function () {
    button.classList.remove("pressed");
  }, 150);
}

function ensure_audio_context() {
  if (!audio_context) {
    audio_context = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audio_context.state === "suspended") {
    audio_context.resume();
  }
  return audio_context;
}

function play_click_sound() {
  var ctx_audio = ensure_audio_context();
  var oscillator = ctx_audio.createOscillator();
  var gain = ctx_audio.createGain();
  var now = ctx_audio.currentTime;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(900, now);
  oscillator.frequency.exponentialRampToValueAtTime(400, now + 0.04);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
  oscillator.connect(gain);
  gain.connect(ctx_audio.destination);
  oscillator.start();
  oscillator.stop(now + 0.05);
}

function buzz_on_press() {
  if (navigator.vibrate) {
    navigator.vibrate(8);
  }
}

function is_pressable(element) {
  var pressable = element.closest("button, .slot");
  if (!pressable) {
    return false;
  }
  return !pressable.disabled;
}

document.addEventListener("pointerdown", function (event) {
  if (is_pressable(event.target)) {
    play_click_sound();
    buzz_on_press();
  }
});

function play_squeak_sound() {
  var ctx_audio = ensure_audio_context();
  var oscillator = ctx_audio.createOscillator();
  var gain = ctx_audio.createGain();
  oscillator.type = "triangle";
  oscillator.frequency.setValueAtTime(600, ctx_audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(1400, ctx_audio.currentTime + 0.15);
  gain.gain.setValueAtTime(0.2, ctx_audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx_audio.currentTime + 0.15);
  oscillator.connect(gain);
  gain.connect(ctx_audio.destination);
  oscillator.start();
  oscillator.stop(ctx_audio.currentTime + 0.15);
}

function play_thud_sound() {
  var ctx_audio = ensure_audio_context();
  var oscillator = ctx_audio.createOscillator();
  var gain = ctx_audio.createGain();
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(170, ctx_audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(55, ctx_audio.currentTime + 0.12);
  gain.gain.setValueAtTime(0.28, ctx_audio.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx_audio.currentTime + 0.16);
  oscillator.connect(gain);
  gain.connect(ctx_audio.destination);
  oscillator.start();
  oscillator.stop(ctx_audio.currentTime + 0.16);
}

function play_fanfare_sound() {
  var ctx_audio = ensure_audio_context();
  var now = ctx_audio.currentTime;
  var notes = [
    { freq: 523.25, start: 0, duration: 0.14 },
    { freq: 523.25, start: 0.16, duration: 0.14 },
    { freq: 523.25, start: 0.32, duration: 0.14 },
    { freq: 783.99, start: 0.48, duration: 0.6 },
  ];
  notes.forEach(function (note) {
    var oscillator = ctx_audio.createOscillator();
    var filter = ctx_audio.createBiquadFilter();
    var gain = ctx_audio.createGain();
    oscillator.type = "sawtooth";
    oscillator.frequency.value = note.freq;
    filter.type = "lowpass";
    filter.frequency.value = 2200;

    var note_start = now + note.start;
    var note_end = note_start + note.duration;
    gain.gain.setValueAtTime(0, note_start);
    gain.gain.linearRampToValueAtTime(0.22, note_start + 0.02);
    gain.gain.setValueAtTime(0.22, Math.max(note_start + 0.02, note_end - 0.05));
    gain.gain.linearRampToValueAtTime(0, note_end);

    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(ctx_audio.destination);
    oscillator.start(note_start);
    oscillator.stop(note_end + 0.02);
  });
}

function ensure_motor() {
  if (motor) {
    return motor;
  }
  var ctx_audio = ensure_audio_context();

  var oscillator = ctx_audio.createOscillator();
  oscillator.type = "square";
  oscillator.frequency.value = 95;

  var gain = ctx_audio.createGain();
  gain.gain.value = 0;

  var vibrato = ctx_audio.createOscillator();
  vibrato.type = "sine";
  vibrato.frequency.value = 22;
  var vibrato_depth = ctx_audio.createGain();
  vibrato_depth.gain.value = 18;

  vibrato.connect(vibrato_depth);
  vibrato_depth.connect(oscillator.frequency);
  oscillator.connect(gain);
  gain.connect(ctx_audio.destination);

  oscillator.start();
  vibrato.start();

  motor = { oscillator: oscillator, gain: gain, vibrato: vibrato };
  return motor;
}

function ramp_motor_gain(target_gain) {
  var m = motor;
  var ctx_audio = audio_context;
  var now = ctx_audio.currentTime;
  m.gain.gain.cancelScheduledValues(now);
  m.gain.gain.setValueAtTime(m.gain.gain.value, now);
  m.gain.gain.setTargetAtTime(target_gain, now, 0.04);
}

function set_motor_running(running) {
  if (running === motor_running) {
    return;
  }
  motor_running = running;
  var just_created = !motor;
  ensure_motor();
  var target_gain = running ? 0.045 : 0;

  if (just_created && running) {
    // Fallback in case the motor wasn't warmed up ahead of time (see
    // ensure_motor() call in add_step_to_program): give the audio pipeline
    // a real moment to spin up before unmuting it, since ramping the gain
    // in the same tick the oscillator starts can produce an audible pop
    // the very first time it renders.
    setTimeout(function () {
      ramp_motor_gain(target_gain);
    }, 150);
  } else {
    ramp_motor_gain(target_gain);
  }
}

function should_motor_buzz(step_index) {
  return (
    playback_state.phase === "moving" &&
    !playback_state.done &&
    run_plan.steps[step_index].type !== "squeak"
  );
}

function trigger_squeak_effect() {
  squeak_effect = { started_at: performance.now(), duration: 400 };
  play_squeak_sound();
}

function trigger_shake(magnitude, duration) {
  screen_shake = { started_at: performance.now(), duration: duration, magnitude: magnitude };
}

function is_blocked_move(step, from, to) {
  var attempted_types = ["forward", "backward", "turn_right", "turn_left"];
  var attempted = attempted_types.indexOf(step.type) !== -1;
  return attempted && same_pose(from, to);
}

function activate_step_effects(step, from, to) {
  if (step.type === "squeak") {
    trigger_squeak_effect();
    return;
  }
  if (is_blocked_move(step, from, to)) {
    trigger_shake(6, 220);
    play_thud_sound();
  }
}

function add_step_to_program(step) {
  if (mode === "executing") {
    return;
  }
  // Warm up the motor oscillator (silently, at gain zero) as early as
  // possible. Queuing a move always happens well before GO is pressed, so
  // by the time the motor actually needs to be audible the audio pipeline
  // has already spun up and won't pop.
  ensure_motor();
  program = add_step(program, step);
  append_slot(step);
  set_selection(null);
}

function ease_out_back(t) {
  var overshoot = 1.70158;
  var scaled_overshoot = overshoot + 1;
  var p = t - 1;
  return 1 + scaled_overshoot * p * p * p + overshoot * p * p;
}

function current_pose() {
  if (mode === "executing" && playback_state) {
    if (playback_state.phase === "paused") {
      return {
        row: playback_state.to.row,
        col: playback_state.to.col,
        angle: angle_for_direction(playback_state.to.direction),
        level: playback_state.to.level,
      };
    }
    var linear_progress = Math.min(playback_state.ticks_in_phase / ticks_per_step, 1);
    var eased_progress = ease_out_back(linear_progress);
    return interpolated_pose(playback_state.from, playback_state.to, eased_progress);
  }
  return { row: mouse.row, col: mouse.col, angle: angle_for_direction(mouse.direction), level: mouse.level };
}

function current_motion_intensity() {
  if (mode !== "executing" || !playback_state || playback_state.phase !== "moving") {
    return 0;
  }
  var step = run_plan.steps[playback_state.step_index];
  var travel_types = ["forward", "backward", "push"];
  if (travel_types.indexOf(step.type) === -1) {
    return 0;
  }
  var progress = Math.min(playback_state.ticks_in_phase / ticks_per_step, 1);
  return Math.sin(progress * Math.PI);
}

function start_execution() {
  if (mode === "executing") {
    mouse = copy_mouse(playback_state.to);
    mode = "editing";
    playback_state = null;
    run_plan = null;
    set_motor_running(false);
    update_active_slot();
    refresh_buttons();
    document.getElementById("btn-go").textContent = "GO";
    return;
  }
  run_plan = plan_run(program, start_mouse, board);
  if (run_plan.steps.length === 0) {
    run_plan = null;
    return;
  }
  mouse = copy_mouse(start_mouse);
  set_message("");
  mode = "executing";
  set_selection(null);
  playback_state = start_playback(run_plan, mouse, board);
  activate_step_effects(run_plan.steps[0], playback_state.from, playback_state.to);
  set_motor_running(should_motor_buzz(0));
  refresh_buttons();
  document.getElementById("btn-go").textContent = "STOP";
  update_active_slot();
}

function reset_program() {
  mode = "editing";
  playback_state = null;
  run_plan = null;
  selection = null;
  program = clear_program(program);
  mouse = copy_mouse(start_mouse);
  set_message("");
  set_motor_running(false);
  refresh_buttons();
  document.getElementById("btn-go").textContent = "GO";
  rebuild_slots();
}

function refresh_buttons() {
  var executing = mode === "executing";
  var nothing_selected = !selection;
  var routine_row_is_full = routines.length >= routine_looks.length;

  var step_button_ids = ["btn-forward", "btn-backward", "btn-left", "btn-right", "btn-squeak"];
  for (var i = 0; i < step_button_ids.length; i++) {
    document.getElementById(step_button_ids[i]).disabled = executing;
  }
  document.getElementById("mode-chip").disabled = executing;
  if (executing) {
    set_mode_list_open(false);
  }
  var tray_actions = document.getElementById("tray-actions");
  tray_actions.classList.toggle("hidden", executing || nothing_selected);
  document.getElementById("btn-save").disabled = routine_row_is_full;

  var routine_row_buttons = document.querySelectorAll("#routine-row button");
  for (var j = 0; j < routine_row_buttons.length; j++) {
    routine_row_buttons[j].disabled = executing;
  }
}

document.getElementById("btn-forward").addEventListener("click", function (event) {
  flash_button(event.currentTarget);
  add_step_to_program(actions.forward);
});
document.getElementById("btn-backward").addEventListener("click", function (event) {
  flash_button(event.currentTarget);
  add_step_to_program(actions.backward);
});
document.getElementById("btn-left").addEventListener("click", function (event) {
  flash_button(event.currentTarget);
  add_step_to_program(actions.turn_left);
});
document.getElementById("btn-right").addEventListener("click", function (event) {
  flash_button(event.currentTarget);
  add_step_to_program(actions.turn_right);
});
document.getElementById("btn-squeak").addEventListener("click", function (event) {
  flash_button(event.currentTarget);
  add_step_to_program(actions.squeak);
});
document.getElementById("btn-delete").addEventListener("click", function (event) {
  flash_button(event.currentTarget);
  delete_selected_steps();
});
document.getElementById("btn-save").addEventListener("click", function (event) {
  flash_button(event.currentTarget);
  save_selected_steps_as_routine();
});
document.getElementById("btn-go").addEventListener("click", function (event) {
  flash_button(event.currentTarget);
  start_execution();
});
document.getElementById("btn-reset").addEventListener("click", function (event) {
  flash_button(event.currentTarget);
  reset_program();
});

function cell_center_x(col) {
  return board_origin_x + (col + 0.5) * cell_size;
}

function cell_center_y(row) {
  return board_origin_y + (row + 0.5) * cell_size;
}

function draw_floor() {
  for (var row = 0; row < board.rows; row++) {
    for (var col = 0; col < board.cols; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? "#fdf6e3" : "#f5ead0";
      ctx.fillRect(board_origin_x + col * cell_size, board_origin_y + row * cell_size, cell_size, cell_size);
    }
  }
  ctx.strokeStyle = "#e0d4ad";
  ctx.lineWidth = 1;
  for (var r = 0; r <= board.rows; r++) {
    var y = board_origin_y + r * cell_size;
    ctx.beginPath();
    ctx.moveTo(board_origin_x, y);
    ctx.lineTo(board_origin_x + board.cols * cell_size, y);
    ctx.stroke();
  }
  for (var c = 0; c <= board.cols; c++) {
    var x = board_origin_x + c * cell_size;
    ctx.beginPath();
    ctx.moveTo(x, board_origin_y);
    ctx.lineTo(x, board_origin_y + board.rows * cell_size);
    ctx.stroke();
  }
}

function cell_x(col) {
  return board_origin_x + col * cell_size;
}

function cell_y(row) {
  return board_origin_y + row * cell_size;
}

function draw_lift_shadow(x, y) {
  ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
  ctx.beginPath();
  ctx.ellipse(x + cell_size * 0.05, y + cell_size * 0.12, cell_size * 0.26, cell_size * 0.16, 0, 0, Math.PI * 2);
  ctx.fill();
}

function draw_treadmill(row, col, direction) {
  var x = cell_x(col);
  var y = cell_y(row);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, cell_size, cell_size);
  ctx.clip();
  ctx.fillStyle = "#6b7280";
  ctx.fillRect(x + 3, y + 3, cell_size - 6, cell_size - 6);

  ctx.translate(cell_center_x(col), cell_center_y(row));
  ctx.rotate((direction * Math.PI) / 2);
  var spacing = cell_size / 3;
  var offset = -((performance.now() / 600) % 1) * spacing;
  ctx.strokeStyle = "#d1d5db";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (var i = -2; i <= 2; i++) {
    var arrow_y = i * spacing + offset;
    ctx.beginPath();
    ctx.moveTo(-cell_size * 0.2, arrow_y + cell_size * 0.08);
    ctx.lineTo(0, arrow_y - cell_size * 0.08);
    ctx.lineTo(cell_size * 0.2, arrow_y + cell_size * 0.08);
    ctx.stroke();
  }
  ctx.restore();
}

function draw_treadmills() {
  for (var row = 0; row < board.rows; row++) {
    for (var col = 0; col < board.cols; col++) {
      var cell = cell_at(board, row, col);
      if (cell.type === "treadmill") {
        draw_treadmill(row, col, cell.direction);
      }
    }
  }
}

function draw_block(row, col, face_color) {
  var x = cell_x(col);
  var y = cell_y(row);
  ctx.fillStyle = "#5d4037";
  ctx.fillRect(x + 1, y + 1, cell_size - 2, cell_size - 2);
  ctx.fillStyle = face_color;
  ctx.fillRect(x + 3, y + 3, cell_size - 6, cell_size - 9);
}

function draw_passage(row, col, direction) {
  ctx.save();
  ctx.translate(cell_center_x(col), cell_center_y(row));
  ctx.rotate((direction * Math.PI) / 2);
  var width = cell_size * 0.44;
  ctx.fillRect(-width / 2, -cell_size / 2, width, cell_size / 2);
  ctx.restore();
}

function draw_tunnel(row, col) {
  draw_block(row, col, "#a1887f");
  ctx.fillStyle = "#3e2723";
  ctx.beginPath();
  ctx.arc(cell_center_x(col), cell_center_y(row), cell_size * 0.22, 0, Math.PI * 2);
  ctx.fill();
  for (var direction = 0; direction < 4; direction++) {
    var delta = DIRECTIONS[direction];
    var neighbor = cell_at(board, row + delta.row_delta, col + delta.col_delta);
    if (neighbor !== null && neighbor.type !== "wall") {
      draw_passage(row, col, direction);
    }
  }
}

function draw_bridge(row, col, axis) {
  ctx.save();
  ctx.translate(cell_center_x(col), cell_center_y(row));
  if (axis === "horizontal") {
    ctx.rotate(Math.PI / 2);
  }
  var width = cell_size * 0.58;
  ctx.fillStyle = "#7b4a1e";
  ctx.fillRect(-width / 2 - 2, -cell_size / 2, width + 4, cell_size);
  ctx.fillStyle = "#c68642";
  ctx.fillRect(-width / 2 + 3, -cell_size / 2, width - 6, cell_size);
  ctx.strokeStyle = "#7b4a1e";
  ctx.lineWidth = 1.5;
  for (var plank = 1; plank < 5; plank++) {
    var plank_y = -cell_size / 2 + (plank * cell_size) / 5;
    ctx.beginPath();
    ctx.moveTo(-width / 2 + 3, plank_y);
    ctx.lineTo(width / 2 - 3, plank_y);
    ctx.stroke();
  }
  ctx.restore();
}

function draw_terrain_tops(covered_cell) {
  for (var row = 0; row < board.rows; row++) {
    for (var col = 0; col < board.cols; col++) {
      var cell = cell_at(board, row, col);
      var is_covered = covered_cell !== null && covered_cell.row === row && covered_cell.col === col;
      ctx.globalAlpha = 1;
      if (is_covered) {
        ctx.globalAlpha = 0.4;
      }
      if (cell.type === "wall") {
        draw_block(row, col, "#8d6e63");
      } else if (cell.type === "tunnel") {
        draw_tunnel(row, col);
      } else if (cell.type === "bridge") {
        draw_bridge(row, col, cell.axis);
      }
    }
  }
  ctx.globalAlpha = 1;
}

function covered_cell_for(pose) {
  var row = Math.round(pose.row);
  var col = Math.round(pose.col);
  var cell = cell_at(board, row, col);
  if (cell === null || pose.level !== 0) {
    return null;
  }
  if (cell.type === "tunnel" || cell.type === "bridge") {
    return { row: row, col: col };
  }
  return null;
}

function draw_cheese() {
  var x = cell_center_x(cheese.col);
  var y = cell_center_y(cheese.row);
  var pulse = 1 + Math.sin(performance.now() / 320) * 0.05;
  var radius = cell_size * 0.32 * pulse;

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = "#f9c80e";
  ctx.strokeStyle = "#b8860b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -radius);
  ctx.arc(0, 0, radius, -Math.PI / 2, Math.PI / 6);
  ctx.arc(0, 0, radius, Math.PI / 6, (5 * Math.PI) / 6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#e0ab00";
  ctx.beginPath();
  ctx.arc(-radius * 0.25, -radius * 0.1, radius * 0.14, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(radius * 0.1, radius * 0.25, radius * 0.1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function draw_whisker(size, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1 * size, y1 * size);
  ctx.lineTo(x2 * size, y2 * size);
  ctx.stroke();
}

function draw_mouse(pose, options) {
  options = options || {};
  var x = cell_center_x(pose.col);
  var y = cell_center_y(pose.row);
  var size = cell_size * 0.38;

  ctx.save();
  if (options.lifted) {
    draw_lift_shadow(x, y);
    y -= cell_size * 0.08;
  }
  ctx.translate(x, y + (options.idle_bob || 0) * size);
  ctx.rotate(((pose.angle + (options.spin || 0)) * Math.PI) / 180);

  var stretch = options.stretch || 0;
  var idle_pulse = options.idle_pulse || 0;
  var scale_y = (1 + stretch * 0.22) * (1 + idle_pulse);
  var scale_x = (1 - stretch * 0.14) * (1 + idle_pulse);
  ctx.scale(scale_x, scale_y);

  var body_fill = "#9b59b6";
  var outline = "#5b2c6f";
  var pink = "#ff9ccc";

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.strokeStyle = pink;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.8);
  ctx.bezierCurveTo(size * 0.45, size * 1.1, -size * 0.35, size * 1.35, size * 0.2, size * 1.6);
  ctx.stroke();

  ctx.fillStyle = body_fill;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.95);
  ctx.bezierCurveTo(size * 0.3, -size * 0.9, size * 0.62, -size * 0.35, size * 0.62, size * 0.2);
  ctx.bezierCurveTo(size * 0.62, size * 0.7, size * 0.3, size * 0.88, 0, size * 0.88);
  ctx.bezierCurveTo(-size * 0.3, size * 0.88, -size * 0.62, size * 0.7, -size * 0.62, size * 0.2);
  ctx.bezierCurveTo(-size * 0.62, -size * 0.35, -size * 0.3, -size * 0.9, 0, -size * 0.95);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  draw_ear(size, -1, body_fill, outline, pink);
  draw_ear(size, 1, body_fill, outline, pink);

  draw_eye(size, -1);
  draw_eye(size, 1);

  ctx.fillStyle = pink;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.arc(0, -size * 0.93, size * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = outline;
  ctx.lineWidth = 1;
  draw_whisker(size, 0.12, -0.85, 0.55, -0.98);
  draw_whisker(size, 0.12, -0.8, 0.55, -0.75);
  draw_whisker(size, -0.12, -0.85, -0.55, -0.98);
  draw_whisker(size, -0.12, -0.8, -0.55, -0.75);

  ctx.lineCap = "butt";
  ctx.lineJoin = "miter";
  ctx.restore();
}

function draw_ear(size, side, body_fill, outline, pink) {
  var ear_x = side * size * 0.45;
  var ear_y = -size * 0.12;

  ctx.fillStyle = body_fill;
  ctx.strokeStyle = outline;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(ear_x, ear_y, size * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = pink;
  ctx.beginPath();
  ctx.arc(ear_x + side * size * 0.04, ear_y, size * 0.19, 0, Math.PI * 2);
  ctx.fill();
}

function draw_eye(size, side) {
  var eye_x = side * size * 0.2;
  var eye_y = -size * 0.58;

  ctx.fillStyle = "#2c3e50";
  ctx.beginPath();
  ctx.arc(eye_x, eye_y, size * 0.09, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(eye_x + size * 0.03, eye_y - size * 0.03, size * 0.03, 0, Math.PI * 2);
  ctx.fill();
}

function draw_squeak_effect(pose, elapsed) {
  var x = cell_center_x(pose.col);
  var y = cell_center_y(pose.row);
  var progress = elapsed / squeak_effect.duration;
  var radius = cell_size * 0.4 + progress * cell_size * 0.5;
  ctx.strokeStyle = "rgba(255, 65, 54, " + (1 - progress) + ")";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
}

function spawn_trail_particle(pose) {
  trail_particles.push({ x: cell_center_x(pose.col), y: cell_center_y(pose.row), born: performance.now(), life: 450 });
  if (trail_particles.length > 30) {
    trail_particles.shift();
  }
}

function draw_trail() {
  var now = performance.now();
  trail_particles = trail_particles.filter(function (particle) {
    return now - particle.born < particle.life;
  });
  trail_particles.forEach(function (particle) {
    var age = (now - particle.born) / particle.life;
    ctx.fillStyle = "rgba(155, 89, 182, " + (0.3 * (1 - age)) + ")";
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, cell_size * 0.1 * (1 - age * 0.5), 0, Math.PI * 2);
    ctx.fill();
  });
}

function spawn_confetti() {
  var x = cell_center_x(cheese.col);
  var y = cell_center_y(cheese.row);
  for (var i = 0; i < 36; i++) {
    var angle = Math.random() * Math.PI * 2;
    var speed = 1.5 + Math.random() * 3.5;
    confetti_particles.push({
      x: x,
      y: y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      rotation: Math.random() * Math.PI * 2,
      rotation_speed: (Math.random() - 0.5) * 0.3,
      color: confetti_colors[i % confetti_colors.length],
      born: performance.now(),
      life: 1200 + Math.random() * 400,
    });
  }
}

function update_and_draw_confetti() {
  var now = performance.now();
  confetti_particles = confetti_particles.filter(function (particle) {
    return now - particle.born < particle.life;
  });
  confetti_particles.forEach(function (particle) {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.12;
    particle.rotation += particle.rotation_speed;
    var age = (now - particle.born) / particle.life;

    ctx.save();
    ctx.translate(particle.x, particle.y);
    ctx.rotate(particle.rotation);
    ctx.globalAlpha = Math.max(0, 1 - age);
    ctx.fillStyle = particle.color;
    ctx.fillRect(-4, -4, 8, 8);
    ctx.restore();
  });
}

function current_shake_offset() {
  if (!screen_shake) {
    return { x: 0, y: 0 };
  }
  var elapsed = performance.now() - screen_shake.started_at;
  if (elapsed >= screen_shake.duration) {
    screen_shake = null;
    return { x: 0, y: 0 };
  }
  var remaining = 1 - elapsed / screen_shake.duration;
  var angle = Math.random() * Math.PI * 2;
  var magnitude = screen_shake.magnitude * remaining;
  return { x: Math.cos(angle) * magnitude, y: Math.sin(angle) * magnitude };
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  var shake = current_shake_offset();
  ctx.save();
  ctx.translate(shake.x, shake.y);

  draw_floor();
  draw_treadmills();
  draw_cheese();
  draw_trail();

  var pose = current_pose();
  var motion_intensity = current_motion_intensity();
  var draw_options = { stretch: motion_intensity };

  if (celebration) {
    var celebration_elapsed = performance.now() - celebration.started_at;
    if (celebration_elapsed >= celebration.duration) {
      celebration = null;
      advance_to_next_level();
    } else {
      var decay = 1 - celebration_elapsed / celebration.duration;
      draw_options.idle_bob = -Math.abs(Math.sin(celebration_elapsed / 100)) * 0.5 * decay;
      draw_options.idle_pulse = Math.abs(Math.sin(celebration_elapsed / 90)) * 0.08 * decay;
      draw_options.spin = Math.sin(celebration_elapsed / 60) * 40 * decay;
    }
  } else if (mode === "editing") {
    var idle_t = performance.now() / 500;
    draw_options.idle_bob = Math.sin(idle_t) * 0.04;
    draw_options.idle_pulse = Math.sin(idle_t * 1.3) * 0.015;
  }
  draw_options.lifted = pose.level === 1;
  if (!draw_options.lifted) {
    draw_mouse(pose, draw_options);
  }
  draw_terrain_tops(covered_cell_for(pose));
  if (draw_options.lifted) {
    draw_mouse(pose, draw_options);
  }

  if (motion_intensity > 0.3 && ++trail_spawn_counter % 3 === 0) {
    spawn_trail_particle(pose);
  }

  if (squeak_effect) {
    var elapsed = performance.now() - squeak_effect.started_at;
    if (elapsed >= squeak_effect.duration) {
      squeak_effect = null;
    } else {
      draw_squeak_effect(pose, elapsed);
    }
  }

  update_and_draw_confetti();

  ctx.restore();
}

function set_text(element_id, text) {
  var element = document.getElementById(element_id);
  if (element.textContent !== text) {
    element.textContent = text;
  }
}

function two_digits(number) {
  if (number < 10) {
    return "0" + number;
  }
  return String(number);
}

function duration_text(ticks) {
  var total_seconds = Math.ceil((ticks * frame_ms) / 1000);
  var seconds = total_seconds % 60;
  var total_minutes = Math.floor(total_seconds / 60);
  var minutes = total_minutes % 60;
  var total_hours = Math.floor(total_minutes / 60);
  var days = Math.floor(total_hours / 24);

  if (total_minutes < 60) {
    return total_minutes + ":" + two_digits(seconds);
  }
  if (total_hours < 24) {
    return total_hours + ":" + two_digits(minutes) + ":" + two_digits(seconds);
  }
  if (days === 1) {
    return "1 day";
  }
  return days.toLocaleString() + " days";
}

function program_step_count() {
  if (program !== counted_program) {
    counted_steps = count_expanded_steps(program);
    counted_program = program;
  }
  return counted_steps;
}

function ticks_per_beat() {
  return ticks_per_step + ticks_per_pause;
}

function ticks_into_current_beat() {
  if (playback_state.phase === "paused") {
    return ticks_per_step + playback_state.ticks_in_phase;
  }
  return playback_state.ticks_in_phase;
}

function update_running_hud() {
  var total_beats = run_plan.steps.length;
  var current_beat = playback_state.step_index + 1;
  var total_ticks = total_beats * ticks_per_beat();
  var elapsed_ticks = playback_state.step_index * ticks_per_beat() + ticks_into_current_beat();
  var remaining_ticks = Math.max(total_ticks - elapsed_ticks, 0);
  var progress_percent = Math.min((elapsed_ticks / total_ticks) * 100, 100);

  set_text("stat-steps", current_beat.toLocaleString() + " / " + total_beats.toLocaleString());
  set_text("stat-time", duration_text(remaining_ticks));
  document.getElementById("progress-fill").style.width = progress_percent + "%";
}

function update_editing_hud() {
  var step_count = program_step_count();
  set_text("stat-steps", step_count.toLocaleString());
  set_text("stat-time", duration_text(step_count * ticks_per_beat()));
  document.getElementById("progress-fill").style.width = "0%";
}

function update_hud() {
  if (mode === "executing" && playback_state) {
    update_running_hud();
  } else {
    update_editing_hud();
  }
}

function median(numbers) {
  var sorted = numbers.slice().sort(function (a, b) {
    return a - b;
  });
  return sorted[Math.floor(sorted.length / 2)];
}

function nearest_refresh_rate(measured_rate) {
  var nearest = common_refresh_rates[0];
  common_refresh_rates.forEach(function (rate) {
    var distance = Math.abs(rate - measured_rate);
    var nearest_distance = Math.abs(nearest - measured_rate);
    if (distance < nearest_distance) {
      nearest = rate;
    }
  });
  return nearest;
}

function track_frame_time() {
  if (frame_samples.length >= frames_to_sample) {
    return;
  }
  var now = performance.now();
  if (last_frame_at !== null) {
    frame_samples.push(now - last_frame_at);
  }
  last_frame_at = now;
  if (frame_samples.length === frames_to_sample) {
    var measured_rate = 1000 / median(frame_samples);
    frame_ms = 1000 / nearest_refresh_rate(measured_rate);
  }
}

function loop() {
  track_frame_time();
  if (mode === "executing" && playback_state) {
    var previous_step_index = playback_state.step_index;
    playback_state = playback_tick(playback_state, run_plan, board, ticks_per_step, ticks_per_pause);

    if (playback_state.step_index !== previous_step_index) {
      activate_step_effects(run_plan.steps[playback_state.step_index], playback_state.from, playback_state.to);
      update_active_slot();
    }

    set_motor_running(should_motor_buzz(playback_state.step_index));

    if (playback_state.done) {
      mouse = copy_mouse(playback_state.to);
      mode = "editing";
      refresh_buttons();
      document.getElementById("btn-go").textContent = "GO";
      if (reached_cheese(mouse, cheese)) {
        set_message("Squeak! Found the cheese!", "win");
        spawn_confetti();
        play_fanfare_sound();
        celebration = { started_at: performance.now(), duration: 1100 };
      } else {
        set_message("No cheese yet — try again!", "try");
      }
      playback_state = null;
      run_plan = null;
      update_active_slot();
    }
  }

  render();
  update_hud();
  requestAnimationFrame(loop);
}

document.getElementById("mode-chip").addEventListener("click", function () {
  set_mode_list_open(!is_mode_list_open());
});

var mode_options = document.querySelectorAll(".mode-option");
for (var mode_index = 0; mode_index < mode_options.length; mode_index++) {
  mode_options[mode_index].addEventListener("click", function (event) {
    set_mode_list_open(false);
    if (mode === "executing") {
      return;
    }
    select_game_mode(event.currentTarget.dataset.mode);
  });
}

document.addEventListener("click", function (event) {
  var clicked_inside_menu = event.target.closest(".mode-menu");
  if (!clicked_inside_menu) {
    set_mode_list_open(false);
  }
});

document.addEventListener("keydown", function (event) {
  if (event.key === "Escape") {
    set_mode_list_open(false);
  }
});

rebuild_routine_row();
select_game_mode("tutorial");
loop();
