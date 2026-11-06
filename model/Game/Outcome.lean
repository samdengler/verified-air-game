/-! # What an answer means -/

namespace Game

inductive CardKind where
  | predict | confirm | decide | check | followUp | reconcile
  deriving DecidableEq, Repr, Inhabited

inductive Response where
  | agrees | differs | depends | notMine
  deriving DecidableEq, Repr, Inhabited

inductive Outcome where
  | sameCall | possibleCatch | exception | decisionSent | checkPassed | checkMissed | routed
  deriving DecidableEq, Repr, Inhabited

def CardKind.all : List CardKind := [.predict, .confirm, .decide, .check, .followUp, .reconcile]
def Response.all : List Response := [.agrees, .differs, .depends, .notMine]
def Outcome.all : List Outcome :=
  [.sameCall, .possibleCatch, .exception, .decisionSent, .checkPassed, .checkMissed, .routed]

/-- What each answer on each kind of card means. A check card holds a rule changed
to be wrong, so disagreeing with it is the right call. -/
def judge : CardKind → Response → Outcome
  | _, .notMine => .routed
  | _, .depends => .exception
  | .decide, _ | .reconcile, _ => .decisionSent
  | .check, .differs => .checkPassed
  | .check, .agrees => .checkMissed
  | _, .agrees => .sameCall
  | _, .differs => .possibleCatch

/-- How big a moment the screen makes of an outcome, from 0 to 3. -/
def Outcome.loudness : Outcome → Nat
  | .possibleCatch | .checkPassed => 3
  | .decisionSent => 2
  | .sameCall | .exception => 1
  | .checkMissed | .routed => 0

/-- A disagreement is the biggest moment in the game. -/
theorem catch_is_loudest (o : Outcome) : o.loudness ≤ Outcome.possibleCatch.loudness := by
  cases o <;> decide

/-- Agreeing is never the big moment, so the game does not teach agreement. -/
theorem same_call_is_quieter_than_catch :
    Outcome.sameCall.loudness < Outcome.possibleCatch.loudness := by decide

/-- It depends counts the same as a same call: the game does not push false certainty. -/
theorem depends_is_as_loud_as_same_call :
    Outcome.exception.loudness = Outcome.sameCall.loudness := rfl

/-- It depends and Not my area mean the same on every kind of card. -/
theorem escapes_mean_the_same (k : CardKind) :
    judge k .depends = .exception ∧ judge k .notMine = .routed := by
  cases k <;> exact ⟨rfl, rfl⟩

/-- Missing a check card gets no reaction: the game never tells an expert they are wrong. -/
theorem missed_check_is_silent : Outcome.checkMissed.loudness = 0 := rfl

/-- A follow-up exists only if the expert made a call on the case it follows. -/
def followUpShown : Response → Bool
  | .agrees | .differs => true
  | .depends | .notMine => false

theorem follow_up_needs_a_call (r : Response) :
    followUpShown r = true ↔ r = .agrees ∨ r = .differs := by
  cases r <;> decide

/-- Yes or no cards keep yes on the right, so the gesture stays learnable. -/
def CardKind.yesStaysRight : CardKind → Bool
  | .confirm | .check | .followUp => true
  | .predict | .decide | .reconcile => false

/-- Other cards swap sides by seed, so a habit of swiping one way makes no pattern of agreement. -/
def sidesSwapped (k : CardKind) (seed index : Nat) : Bool :=
  !k.yesStaysRight && (seed % 2 + index % 2) % 2 == 1

theorem yes_stays_on_the_right (k : CardKind) (seed index : Nat) (h : k.yesStaysRight = true) :
    sidesSwapped k seed index = false := by
  simp [sidesSwapped, h]

/-- Across two seeds, a prediction card sits on each side once. -/
theorem sides_balance_across_seeds (seed index : Nat) :
    sidesSwapped .predict seed index != sidesSwapped .predict (seed + 1) index := by
  simp only [sidesSwapped, CardKind.yesStaysRight]
  have h : seed % 2 = 0 ∨ seed % 2 = 1 := by omega
  have hi : index % 2 = 0 ∨ index % 2 = 1 := by omega
  rcases h with h | h <;> rcases hi with hi | hi <;>
    have h2 : (seed + 1) % 2 = 1 - seed % 2 := by omega
  all_goals simp [h, hi, h2]

end Game
