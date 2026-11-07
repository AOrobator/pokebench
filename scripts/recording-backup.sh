#!/bin/zsh
# Copies a run's finished recording files and new events to a backup folder every few minutes, at low priority.
#
#   recording-backup.sh <recording dir> <runs dir> <run name glob> <backup root> <watched pid> [interval seconds]
#
# Copies only: nothing in the recording or the run is moved, changed or deleted, and a failed copy
# is logged and retried on the next pass. The file being written is left alone until the watched
# recorder pid has gone; then one last pass copies everything and the job exits.
set -u
recording=$1 runs=$2 glob=$3 root=$4 watched=$5 interval=${6:-600}
log="$recording/backup.log"
say() { print -r -- "$(date '+%Y-%m-%dT%H:%M:%S%z') $*" >>"$log"; }
renice -n 19 $$ >/dev/null 2>&1
started=$(date +%s)

run_folder() {
  local dir
  for dir in "$runs"/${~glob}(N/om); do
    [[ -f "$dir/events.jsonl" ]] || continue
    (( $(stat -f %B "$dir") + 600 >= started )) || continue
    print -r -- "$dir"
    return 0
  done
  return 1
}

copy() {
  rsync -t "$1" "$2/" >>"$log" 2>&1 && return 0
  say "copy failed: $1"
  return 1
}

pass() {
  local final=$1 dir name dest stem newest file
  dir=$(run_folder) || { say "run folder not found yet"; return 0; }
  name=${dir:t}
  dest="$root/$name"
  mkdir -p "$dest" || { say "cannot make $dest"; return 0; }
  for stem in ${(u)${(f)"$(cd "$recording" && ls video-p*-*.mkv audio-p*-*.mka 2>/dev/null | sed -E 's/-[0-9]+\.mk[av]$//')"}}; do
    newest=$(cd "$recording" && ls "$stem"-* | sort | tail -1)
    for file in "$recording/$stem"-*; do
      [[ $final == 0 && ${file:t} == $newest ]] && continue
      [[ -f "$dest/${file:t}" && $(stat -f %z "$dest/${file:t}") == $(stat -f %z "$file") ]] && continue
      copy "$file" "$dest" && say "copied ${file:t}"
    done
  done
  for file in "$recording/recording.jsonl" "$recording/segments.json"; do
    [[ -f $file ]] && copy "$file" "$dest"
  done
  [[ -f "$dir/events.jsonl" ]] && copy_new_events "$dir/events.jsonl" "$dest"
}

# events.jsonl only grows and reaches gigabytes, so each pass sends just its new bytes as the next
# numbered part. `cat events-*.part` rebuilds the file.
copy_new_events() {
  local source=$1 dest=$2 sent=0 count=0 part size
  for part in "$dest"/events-*.part(N); do
    sent=$(( sent + $(stat -f %z "$part") ))
    count=$(( count + 1 ))
  done
  size=$(stat -f %z "$source")
  (( size > sent )) || return 0
  part=$(printf 'events-%06d.part' $(( count + 1 )))
  if tail -c +$(( sent + 1 )) "$source" | head -c $(( size - sent )) >"$dest/$part.tmp" && mv "$dest/$part.tmp" "$dest/$part"; then
    say "copied $part, $(( size - sent )) bytes"
  else
    say "copy failed: $part"
    rm -f "$dest/$part.tmp"
  fi
}

say "started: watching pid $watched, every $interval s, into $root"
while kill -0 "$watched" 2>/dev/null; do
  pass 0
  for (( waited = 0; waited < interval; waited += 5 )); do
    kill -0 "$watched" 2>/dev/null || break
    sleep 5
  done
done
pass 1
say "finished"
