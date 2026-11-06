/-! # A crew's answers: hidden until the reveal -/

namespace Game

inductive SeatState where
  | waiting | answered | notMine | onLeave
  deriving DecidableEq, Repr, Inhabited

structure Seat where
  state : SeatState
  choice : Option Nat
  deriving DecidableEq, Repr

/-- How many seats are in each state. -/
structure Tally where
  answered : Nat
  notMine : Nat
  onLeave : Nat
  waiting : Nat
  deriving DecidableEq, Repr

def tally (states : List SeatState) : Tally :=
  { answered := states.countP (· = .answered)
    notMine := states.countP (· = .notMine)
    onLeave := states.countP (· = .onLeave)
    waiting := states.countP (· = .waiting) }

/-- The undecided point: when a crew sees its split. The mockup says every seat. -/
inductive RevealRule where
  | everySeat | everyoneAvailable
  deriving DecidableEq, Repr, Inhabited

def RevealRule.all : List RevealRule := [.everySeat, .everyoneAvailable]

def revealed : RevealRule → Tally → Bool
  | .everySeat, t => t.waiting == 0 && t.notMine == 0 && t.onLeave == 0 && 0 < t.answered
  | .everyoneAvailable, t => t.waiting == 0 && 0 < t.answered

/-- What a person sees of the crew's choices. -/
def crewView (r : RevealRule) (seats : List Seat) : Option (List Nat) :=
  if revealed r (tally (seats.map (·.state))) then some (seats.filterMap (·.choice)) else none

/-- Before the reveal, what you see cannot depend on what anyone chose, under
either rule. That is the guard against herding. -/
theorem choices_stay_hidden (r : RevealRule) (a b : List Seat)
    (hs : a.map (·.state) = b.map (·.state))
    (h : revealed r (tally (a.map (·.state))) = false) : crewView r a = crewView r b := by
  have hb : revealed r (tally (b.map (·.state))) = false := hs ▸ h
  simp [crewView, h, hb]

/-- Everyone is settled when nobody is still waiting. -/
def Tally.settled (t : Tally) : Prop := t.waiting = 0

/-- The hole in the mockup: if the reveal waits for every seat, one person on
leave hides the split from four people who answered. -/
theorem everySeat_can_stall :
    ∃ t : Tally, t.settled ∧ 0 < t.answered ∧ revealed .everySeat t = false :=
  ⟨⟨4, 0, 1, 0⟩, rfl, by decide, rfl⟩

/-- The same goes for one person who says Not my area. -/
theorem everySeat_stalls_on_notMine :
    ∃ t : Tally, t.settled ∧ 0 < t.answered ∧ 0 < t.notMine ∧ revealed .everySeat t = false :=
  ⟨⟨4, 1, 0, 0⟩, rfl, by decide, by decide, rfl⟩

/-- The proposed fix: reveal once nobody is still waiting and someone answered. -/
theorem everyoneAvailable_of_settled (t : Tally) (hs : t.settled) (ha : 0 < t.answered) :
    revealed .everyoneAvailable t = true := by
  simp only [Tally.settled] at hs
  simp [revealed, hs, ha]

/-- A quest deadline: anyone still waiting counts as away. -/
def Tally.closeRound (t : Tally) : Tally :=
  { t with onLeave := t.onLeave + t.waiting, waiting := 0 }

/-- A person who ignores the game cannot hold up the split past the deadline. -/
theorem deadline_settles (t : Tally) (ha : 0 < t.answered) :
    revealed .everyoneAvailable t.closeRound = true := by
  simp [Tally.closeRound, revealed, ha]

/-- Decided on 2026-11-05: a crew sees its split once nobody is still waiting and someone
answered. A quest's deadline turns anyone still waiting into someone away. -/
def revealRule : RevealRule := .everyoneAvailable

/-- A settled crew always reaches its split, so nobody can be left waiting on someone away. -/
theorem chosen_rule_cannot_stall (t : Tally) (hs : t.settled) (ha : 0 < t.answered) :
    revealed revealRule t = true :=
  everyoneAvailable_of_settled t hs ha

/-- Saying Not my area does not hold up the others, however many people say it. -/
theorem not_my_area_holds_nobody_up (t : Tally) (hs : t.settled) (ha : 0 < t.answered) :
    revealed revealRule { t with notMine := t.notMine + 1 } = true :=
  everyoneAvailable_of_settled _ hs ha

/-- The same holds after a quest's deadline, for anyone who ignored the game. -/
theorem chosen_rule_settles_at_deadline (t : Tally) (ha : 0 < t.answered) :
    revealed revealRule t.closeRound = true :=
  deadline_settles t ha

end Game
