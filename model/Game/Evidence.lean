/-! # From answers to a proposed confirmation

The game never changes a rule's status. At most it proposes the attribute a
modeller may add to the Lean, tied to the fingerprint of the rule as it stood. -/

namespace Game

structure Answer where
  person : Nat
  fingerprint : String
  agrees : Bool
  deriving DecidableEq, Repr

/-- An answer counts toward a confirmation only if it agrees with the rule as it stands now. -/
def Answer.counts (current : String) (a : Answer) : Bool :=
  a.fingerprint == current && a.agrees

/-- How many different people agree with the rule as it stands now. -/
def agreement (current : String) (answers : List Answer) : Nat :=
  ((answers.filter (·.counts current)).map (·.person)).eraseDups.length

/-- The independent answers a proposal needs. -/
def confirmationBar : Nat := 3

structure Proposal where
  rule : String
  fingerprint : String
  deriving DecidableEq, Repr

def propose (rule current : String) (answers : List Answer) (ownerUpheld : Bool) : Option Proposal :=
  if ownerUpheld ∧ confirmationBar ≤ agreement current answers then some ⟨rule, current⟩ else none

/-- The line a modeller would review and add. The game writes text and nothing more. -/
def Proposal.attribute (p : Proposal) (date who what : String) : String :=
  s!"@[confirmed sme \"{date}\" \"{who}\" \"{what}\" \"{p.fingerprint}\"]"

/-- An answer given before the rule changed does not count. -/
theorem stale_answers_do_not_count (current : String) (answers : List Answer)
    (h : ∀ a ∈ answers, a.fingerprint ≠ current) : agreement current answers = 0 := by
  have : answers.filter (·.counts current) = [] := by
    apply List.filter_eq_nil_iff.mpr
    intro a ha
    simp [Answer.counts, h a ha]
  simp [agreement, this]

/-- No proposal without the owner, however many people agree. -/
theorem no_proposal_without_owner (rule current : String) (answers : List Answer) :
    propose rule current answers false = none := by
  simp [propose]

/-- A proposal always names the rule as it stands now. -/
theorem proposal_names_current_fingerprint (rule current : String) (answers : List Answer)
    (p : Proposal) (h : propose rule current answers true = some p) : p.fingerprint = current := by
  unfold propose at h
  split at h
  · cases h; rfl
  · simp at h

/-- One person answering many times counts once. -/
theorem same_person_counts_once (current : String) (a : Answer) :
    agreement current [a, a, a] ≤ 1 := by
  by_cases h : a.counts current = true <;> simp [agreement, List.filter, h, List.eraseDups_cons]

end Game
