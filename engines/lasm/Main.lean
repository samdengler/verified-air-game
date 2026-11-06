import Game.Engine
import Lasm.JS
open Lasm.JS Game.Engine

/-! The game's model compiled to WebAssembly: this file only exposes the model's
engine functions to JavaScript. The rules are `model/Game`, the same source the
proofs are about. Lasm's compiler and runtime and Lean's compiler are trusted. -/

def natAt (args : Array Data) (i : Nat) : Nat :=
  match (args[i]? : Option Data) with
  | some (Data.number n) => n.toUInt64.toNat
  | _ => 0

def call (args : Array Data) : Int :=
  let a := natAt args
  match (args[0]? : Option Data) with
  | some (Data.string "session_step") => sessionStep (a 1) (a 2) (a 3) (a 4)
  | some (Data.string "judge") => judgeCode (a 1) (a 2)
  | some (Data.string "loudness") => loudness (a 1)
  | some (Data.string "title") => title (a 1) (a 2)
  | some (Data.string "streak_week") => streakWeek (a 1) (a 2) (a 3)
  | some (Data.string "crew_revealed") => crewRevealed (a 1) (a 2) (a 3) (a 4) (a 5)
  | some (Data.string "shift_length") => shiftLength (a 1)
  | some (Data.string "follow_up_shown") => followUpShownCode (a 1)
  | some (Data.string "sides_swapped") => sidesSwappedCode (a 1) (a 2) (a 3)
  | _ => -3

def main : IO Unit := do
  let f ← Function.ofSyncFn fun args => do
    return Data.number (Float.ofInt (call args))
  let g ← global
  g.set "__leanEngine" f
