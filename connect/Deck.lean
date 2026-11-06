import Game.Session
import Game.Evidence
import Rules.OfferOrder.Examples
import Rules.OneOrder.Payment.Examples
import Airline.Theorems

/-!
# Where the app's model meets the airline's

This is the only Lean that sees both. The game's model imports nothing from the airline,
and the airline's rules import nothing from the game, so neither can break the other's
build. Dependencies run one way, from here to both, as in a system package.

Three things cross this seam:

* A card's outcome is the rule's own computed value, with the rule's own type. The game
  treats that type as opaque, so its guarantees hold without change.
* A policy card reads the `Airline` library, which stands in for an airline's policy library:
  the layer that fixes the readings an airline has decided.
* An answer carries the rule's fingerprint, and the most the game produces is the text of
  an `@[confirmed]` attribute for a modeller to review. Nothing here can change a status.
-/

namespace Connect

open Rules.OfferOrder

/-- A prediction card on the standard's rule. Its outcome is the rule's own result. -/
def expiryCard : Game.Card (Except Rejection Order) := ⟨0, acceptAtExpiry⟩

/-- The card reveals what the rule computes. Change the rule, and this stops compiling. -/
theorem expiry_card_reveals_the_rule :
    expiryCard.outcome = accept sampleOffer sampleOffer.expiresAt "ORD-2" := rfl

#guard expiryCard.outcome == .error .expired

/-- The game's blind-call guarantee, proved knowing nothing about airlines, holds for this
card: while the case is showing, the screen cannot depend on the rule's result. -/
theorem expiry_face_hides_the_rule (other : Except Rejection Order) (s : Game.Session)
    (h : s.phase = .asking) :
    Game.view (fun _ => expiryCard) s = Game.view (fun _ => ⟨0, other⟩) s :=
  Game.face_hides_outcome _ _ s h rfl

/-- A decision card on a point the standard leaves open. -/
def lateCaptureCard : Game.Card Rules.OneOrder.Payment.LateCapture :=
  ⟨1, Rules.OneOrder.Payment.lateRedirectCapture⟩

/-- This is why it is a decision: the two readings of the standard give different results.
An expert's answer would become a choice of reading in the airline's policy library. -/
theorem late_capture_turns_on_a_reading :
    lateCaptureCard.outcome.underFinalReading ≠ lateCaptureCard.outcome.underLateCaptureReading := by
  decide +kernel

-- A policy card reads the airline's own library, and its result is that library's theorem.
example := @Airline.main_cancel_noShow

/-- The fingerprint of `Rules.OfferOrder.accept` in verified-air's `build/status.json`.
`scripts/check-connected.sh` stops if this no longer matches. -/
def acceptFingerprint : String := "ff9c88a326438001"

def threeAnswers : List Game.Answer :=
  [⟨1, acceptFingerprint, true⟩, ⟨2, acceptFingerprint, true⟩, ⟨3, acceptFingerprint, true⟩]

-- Three independent answers and the owner produce a line of text for a modeller.
#guard (Game.propose "Rules.OfferOrder.accept" acceptFingerprint threeAnswers true).map
    (·.attribute "2026-11-05" "Payment crew" "Accepting at expiry is rejected") ==
  some "@[confirmed sme \"2026-11-05\" \"Payment crew\" \"Accepting at expiry is rejected\" \"ff9c88a326438001\"]"

-- After the rule changes, the same answers propose nothing.
#guard (Game.propose "Rules.OfferOrder.accept" "0000000000000000" threeAnswers true).isNone

end Connect
