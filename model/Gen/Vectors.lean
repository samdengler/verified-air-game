import Game.Engine

/-! `lake exe vectors [file]` writes the requests every engine must answer the way the
model does. The domains are small enough to cover every combination. -/

open Game.Engine

def line (f : String) (args : List Nat) (result : Int) : String :=
  let a := ",".intercalate (args.map toString)
  s!"\{\"f\":\"{f}\",\"a\":[{a}],\"r\":{result}}"

def upTo (n : Nat) : List Nat := List.range (n + 1)

def vectors : List String := Id.run do
  let mut out : List String := []
  for p in upTo 4 do for i in upTo 5 do for l in upTo 5 do for e in upTo 5 do
    out := line "session_step" [p, i, l, e] (sessionStep p i l e) :: out
  for k in upTo 6 do for r in upTo 4 do
    out := line "judge" [k, r] (judgeCode k r) :: out
  for o in upTo 7 do
    out := line "loudness" [o] (loudness o) :: out
  for u in upTo 8 do for c in upTo 8 do
    out := line "title" [u, c] (title u c) :: out
  for w in upTo 6 do for p in upTo 3 do for a in upTo 1 do
    out := line "streak_week" [w, p, a] (streakWeek w p a) :: out
  for r in upTo 2 do for a in upTo 5 do for n in upTo 5 do for l in upTo 5 do for w in upTo 5 do
    if a + n + l + w ≤ 5 then
      out := line "crew_revealed" [r, a, n, l, w] (crewRevealed r a n l w) :: out
  for c in upTo 12 do
    out := line "shift_length" [c] (shiftLength c) :: out
  for r in upTo 4 do
    out := line "follow_up_shown" [r] (followUpShownCode r) :: out
  for k in upTo 6 do for s in upTo 5 do for i in upTo 5 do
    out := line "sides_swapped" [k, s, i] (sidesSwappedCode k s i) :: out
  return out.reverse

def main (args : List String) : IO Unit := do
  let path := args.headD "../vectors/engine.jsonl"
  IO.FS.createDirAll "../vectors"
  IO.FS.writeFile path ("\n".intercalate vectors ++ "\n")
  IO.println s!"wrote {vectors.length} vectors to {path}"
