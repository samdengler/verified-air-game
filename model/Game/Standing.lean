import Game.Outcome

/-! # Titles and catches: what a person's standing rests on -/

namespace Game

/-- A disagreement waiting for the area owner. -/
inductive CatchState where
  | pending | upheld | dismissed
  deriving DecidableEq, Repr, Inhabited

structure Catch where
  finder : Nat
  state : CatchState
  deriving DecidableEq, Repr

/-- An owner's decision. Nobody reviews their own catch, and a decision is final. -/
def Catch.review (c : Catch) (owner : Nat) (uphold : Bool) : Option Catch :=
  if owner = c.finder then none
  else
    match c.state with
    | .pending => some { c with state := if uphold then .upheld else .dismissed }
    | _ => none

theorem finder_cannot_review (c : Catch) (uphold : Bool) : c.review c.finder uphold = none := by
  simp [Catch.review]

theorem review_is_final (c : Catch) (owner : Nat) (uphold : Bool) (h : c.state ≠ .pending) :
    c.review owner uphold = none := by
  unfold Catch.review
  split
  · rfl
  · cases hs : c.state <;> simp_all

structure Standing where
  answered : Nat
  upheld : Nat
  checksPassed : Nat
  deriving DecidableEq, Repr

inductive Title where
  | shiftLead | dutyManager | stationManager
  deriving DecidableEq, Repr, Inhabited

def Title.all : List Title := [.shiftLead, .dutyManager, .stationManager]

/-- Upheld catches and check cards a Duty manager needs. -/
def dutyManagerBar : Nat := 3
/-- Upheld catches and check cards a Station manager needs. -/
def stationManagerBar : Nat := 6

def Standing.title (s : Standing) : Title :=
  if stationManagerBar ≤ s.upheld ∧ stationManagerBar ≤ s.checksPassed then .stationManager
  else if dutyManagerBar ≤ s.upheld ∧ dutyManagerBar ≤ s.checksPassed then .dutyManager
  else .shiftLead

def Title.rank : Title → Nat
  | .shiftLead => 0 | .dutyManager => 1 | .stationManager => 2

/-- Answering a case adds to the count of cases answered and to nothing else,
except that passing a check card adds a passed check. -/
def Standing.record (s : Standing) (o : Outcome) : Standing :=
  { s with
    answered := s.answered + 1
    checksPassed := if o = .checkPassed then s.checksPassed + 1 else s.checksPassed }

/-- A catch earns credit only once it is upheld. -/
def Standing.credit (s : Standing) (c : Catch) : Standing :=
  if c.state = .upheld then { s with upheld := s.upheld + 1 } else s

/-- Going fast earns nothing: answering more cases cannot change a title. -/
theorem answering_keeps_title (s : Standing) (n : Nat) :
    { s with answered := s.answered + n }.title = s.title := rfl

/-- No outcome except a passed check moves a title when it is recorded. -/
theorem recording_keeps_title (s : Standing) (o : Outcome) (h : o ≠ .checkPassed) :
    (s.record o).title = s.title := by
  simp [Standing.record, h, Standing.title]

/-- A catch that is pending or dismissed earns nothing. -/
theorem unupheld_catch_earns_nothing (s : Standing) (c : Catch) (h : c.state ≠ .upheld) :
    s.credit c = s := by
  simp [Standing.credit, h]

/-- A title never falls when a catch is upheld or a check is passed. -/
theorem title_never_falls (a b : Standing) (hu : a.upheld ≤ b.upheld)
    (hc : a.checksPassed ≤ b.checksPassed) : a.title.rank ≤ b.title.rank := by
  simp only [Standing.title]
  repeat' split
  all_goals first | (simp [Title.rank]; done) | omega

end Game
