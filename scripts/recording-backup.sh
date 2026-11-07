#!/bin/zsh
# Copies a run's finished recording files and new events to a backup folder every few minutes, at low priority.
#
#   recording-backup.sh <recording dir> <runs dir> <run name glob> <backup root> <watched pid> [interval seconds] [earliest run time]
#
# Copies only: nothing in the recording or the run is moved, changed or deleted, and a failed copy
# is logged and retried on the next pass. The file being written is left alone until the watched
# recorder pid has gone; then it copies everything, retrying until that works or it has tried for
# an hour, and exits.
set -u
recording=$1 runs=$2 glob=$3 root=$4 watched=$5 interval=${6:-600}
started=${7:-$(date +%s)}
failures=0
log="$recording/backup.log"
say() { print -r -- "$(date '+%Y-%m-%dT%H:%M:%S%z') $*" >>"$log"; }
renice -n 19 $$ >/dev/null 2>&1

# The run this job backs up: the oldest one created since `started`, kept for good once found, so a
# later run of the same model cannot take over. Kept in a file so a restarted job finds it again.
pinned="$recording/backup.run"
run_folder() {
  local dir
  if [[ -f $pinned ]]; then
    print -r -- "$(<"$pinned")"
    return 0
  fi
  for dir in "$runs"/${~glob}(N/Om); do
    [[ -f "$dir/events.jsonl" ]] || continue
    (( $(stat -f %B "$dir" 2>/dev/null || print 0) >= started )) || continue
    print -r -- "$dir" >"$pinned"
    print -r -- "$dir"
    return 0
  done
  return 1
}

copy() {
  rsync -t "$1" "$2/" >>"$log" 2>&1 && return 0
  say "copy failed: $1"
  failures=$(( failures + 1 ))
  return 1
}

pass() {
  local final=$1 dir name dest stem newest file have sent
  local -a files stems parts
  failures=0
  dir=$(run_folder) || { say "run folder not found yet"; failures=1; return 0; }
  name=${dir:t}
  dest="$root/$name"
  mkdir -p "$dest" || { say "cannot make $dest"; failures=1; return 0; }
  files=("$recording"/video-p*-*.mkv(N) "$recording"/audio-p*-*.mka(N))
  stems=()
  for file in $files; do stems+=("${${file:t}%-*}"); done
  for stem in ${(u)stems}; do
    parts=("$recording/$stem"-*(N))
    newest=${${(On)parts}[1]:t}
    for file in $parts; do
      [[ $final == 0 && ${file:t} == $newest ]] && continue
      have=$(stat -f %z "$file" 2>/dev/null) || { say "cannot read $file"; failures=$(( failures + 1 )); continue; }
      if [[ -f "$dest/${file:t}" ]]; then
        sent=$(stat -f %z "$dest/${file:t}" 2>/dev/null) || sent=-1
        [[ $sent == $have ]] && continue
      fi
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
    size=$(stat -f %z "$part" 2>/dev/null) || { say "cannot read $part"; failures=$(( failures + 1 )); return 1; }
    sent=$(( sent + size ))
    count=$(( count + 1 ))
  done
  size=$(stat -f %z "$source" 2>/dev/null) || { say "cannot read $source"; failures=$(( failures + 1 )); return 1; }
  (( size > sent )) || return 0
  part=$(printf 'events-%06d.part' $(( count + 1 )))
  if tail -c +$(( sent + 1 )) "$source" | head -c $(( size - sent )) >"$dest/$part.tmp" && mv "$dest/$part.tmp" "$dest/$part"; then
    say "copied $part, $(( size - sent )) bytes"
  else
    say "copy failed: $part"
    failures=$(( failures + 1 ))
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
for (( try = 1; try <= 12; try++ )); do
  pass 1
  (( failures == 0 )) && break
  say "last pass had failures, try $try of 12"
  sleep 300
done
say "finished with $failures failures"
