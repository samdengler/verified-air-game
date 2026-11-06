import Game.Session
import Game.Outcome
import Game.Standing
import Game.Streak
import Game.Crew

/-! # The engine interface: the model over whole numbers

Every engine exposes these functions over integers, so the same vectors can check
JavaScript, Rust compiled to WebAssembly, and this Lean compiled to WebAssembly. -/

namespace Game.Engine

def phaseCode : Phase → Int | .intro => 0 | .asking => 1 | .revealed => 2 | .done => 3
def phaseOf : Nat → Option Phase
  | 0 => some .intro | 1 => some .asking | 2 => some .revealed | 3 => some .done | _ => none
def eventOf : Nat → Option Event
  | 0 => some .start | 1 => some .call | 2 => some .depends | 3 => some .notMine | 4 => some .next
  | _ => none
def kindOf : Nat → Option CardKind
  | 0 => some .predict | 1 => some .confirm | 2 => some .decide | 3 => some .check
  | 4 => some .followUp | 5 => some .reconcile | _ => none
def responseOf : Nat → Option Response
  | 0 => some .agrees | 1 => some .differs | 2 => some .depends | 3 => some .notMine | _ => none
def outcomeCode : Outcome → Int
  | .sameCall => 0 | .possibleCatch => 1 | .exception => 2 | .decisionSent => 3
  | .checkPassed => 4 | .checkMissed => 5 | .routed => 6
def titleCode : Title → Int | .shiftLead => 0 | .dutyManager => 1 | .stationManager => 2
def ruleOf : Nat → Option RevealRule
  | 0 => some .everySeat | 1 => some .everyoneAvailable | _ => none

/-- The next session as `phase * 256 + index`; -1 if the event does nothing; -2 for a bad code. -/
def sessionStep (phase index length event : Nat) : Int :=
  match phaseOf phase, eventOf event with
  | some p, some e =>
    match Session.step ⟨p, index, length⟩ e with
    | some t => phaseCode t.phase * 256 + t.index
    | none => -1
  | _, _ => -2

def judgeCode (kind response : Nat) : Int :=
  match kindOf kind, responseOf response with
  | some k, some r => outcomeCode (judge k r)
  | _, _ => -2

def loudness (outcome : Nat) : Int :=
  match Outcome.all[outcome]? with
  | some o => o.loudness
  | none => -2

def title (upheld checks : Nat) : Int :=
  titleCode (Standing.title ⟨0, upheld, checks⟩)

/-- The streak after a week, as `weeks * 256 + passes`. -/
def streakWeek (weeks passes answered : Nat) : Int :=
  let s := Streak.closeWeek ⟨weeks, passes⟩ (answered != 0)
  s.weeks * 256 + s.passes

def crewRevealed (rule answered notMine onLeave waiting : Nat) : Int :=
  match ruleOf rule with
  | some r => if revealed r ⟨answered, notMine, onLeave, waiting⟩ then 1 else 0
  | none => -2

/-- How many cases a shift holds when this many are on offer. -/
def shiftLength (cases : Nat) : Int := (Session.new cases).length

def followUpShownCode (response : Nat) : Int :=
  match responseOf response with
  | some r => if followUpShown r then 1 else 0
  | none => -2

def sidesSwappedCode (kind seed index : Nat) : Int :=
  match kindOf kind with
  | some k => if sidesSwapped k seed index then 1 else 0
  | none => -2

end Game.Engine
