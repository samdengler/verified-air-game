import Design.Contrast

/-! # The design tokens: the only values the UI may use -/

namespace Design

inductive Token where
  | deltaBlue | navy | navyRaised | bright | red | redDark | ice | paper | white | mute | tint
  | rookieCheek
  deriving DecidableEq, Repr, Inhabited

def Token.all : List Token :=
  [.deltaBlue, .navy, .navyRaised, .bright, .red, .redDark, .ice, .paper, .white, .mute, .tint,
    .rookieCheek]

def Token.color : Token → Color
  | .deltaBlue => ⟨0x00, 0x32, 0x68⟩
  | .navy => ⟨0x00, 0x21, 0x4A⟩
  | .navyRaised => ⟨0x0B, 0x3A, 0x75⟩
  | .bright => ⟨0x0C, 0x5F, 0xB8⟩
  | .red => ⟨0xE3, 0x13, 0x2C⟩
  | .redDark => ⟨0x9B, 0x16, 0x31⟩
  | .ice => ⟨0xE4, 0xEE, 0xF9⟩
  | .paper => ⟨0xFB, 0xFC, 0xFE⟩
  | .white => ⟨0xFF, 0xFF, 0xFF⟩
  | .mute => ⟨0x4D, 0x5F, 0x7D⟩
  | .tint => ⟨0xE3, 0xEC, 0xF7⟩
  | .rookieCheek => ⟨0xFF, 0x7A, 0x8A⟩

/-- The token's name in every generated format. -/
def Token.name : Token → String
  | .deltaBlue => "delta-blue" | .navy => "navy" | .navyRaised => "navy-raised"
  | .bright => "bright" | .red => "red" | .redDark => "red-dark" | .ice => "ice"
  | .paper => "paper" | .white => "white" | .mute => "mute" | .tint => "tint"
  | .rookieCheek => "rookie-cheek"

/-- What the token is for, in the generated documentation. -/
def Token.purpose : Token → String
  | .deltaBlue => "Ground while a case is asking"
  | .navy => "Ink on light grounds, and the ground for decisions and the report"
  | .navyRaised => "Tracks and lines on navy"
  | .bright => "Ground for a same call"
  | .red => "Ground for a possible catch, main buttons and stamps"
  | .redDark => "The lip of a red button"
  | .ice => "Ground for a computed consequence"
  | .paper => "Tickets and panels"
  | .white => "Ink on dark and red grounds, and the choice buttons"
  | .mute => "Secondary text on paper"
  | .tint => "Tags and highlights on paper"
  | .rookieCheek => "Rookie's cheeks, drawn decoration only"

/-- How a pair of colours is used, and the contrast WCAG 2.2 asks of it, times 100. -/
inductive Use where
  | text | largeText | graphic
  deriving DecidableEq, Repr, Inhabited

def Use.required : Use → Nat
  | .text => 450 | .largeText => 300 | .graphic => 300

def Use.name : Use → String
  | .text => "text" | .largeText => "large text" | .graphic => "graphics"

structure Pair where
  fg : Token
  bg : Token
  use : Use
  deriving DecidableEq, Repr

def Pair.low (p : Pair) : Nat := contrastLow p.fg.color p.bg.color
def Pair.passes (p : Pair) : Bool := p.use.required ≤ p.low
/-- Fails even on the most generous rounding. -/
def Pair.fails (p : Pair) : Bool := contrastHigh p.fg.color p.bg.color < p.use.required

/-- The surfaces of the game, one per kind of screen. -/
inductive Surface where
  | asking | decision | sameCall | possibleCatch | consequence | report | panel
  deriving DecidableEq, Repr, Inhabited

def Surface.all : List Surface :=
  [.asking, .decision, .sameCall, .possibleCatch, .consequence, .report, .panel]

def Surface.name : Surface → String
  | .asking => "asking" | .decision => "decision" | .sameCall => "same-call"
  | .possibleCatch => "possible-catch" | .consequence => "consequence"
  | .report => "report" | .panel => "panel"

def Surface.ground : Surface → Token
  | .asking => .deltaBlue
  | .decision | .report => .navy
  | .sameCall => .bright
  | .possibleCatch => .red
  | .consequence => .ice
  | .panel => .paper

/-- The ink for text on each surface. -/
def Surface.ink : Surface → Token
  | .asking | .decision | .report | .sameCall | .possibleCatch => .white
  | .consequence | .panel => .navy

/-- The focus ring, which has to show on every surface. -/
def Surface.focusRing : Surface → Token
  | .asking | .decision | .report | .sameCall | .possibleCatch => .white
  | .consequence | .panel => .navy

/-- The smallest a touch target may be, in CSS pixels. -/
def minTouchTarget : Nat := 44
/-- The smallest text the UI may use, in CSS pixels. -/
def minTextPx : Nat := 13
/-- Text from this size up counts as large for contrast, in CSS pixels. -/
def largeTextPx : Nat := 24

inductive TypeRole where
  | display | heading | caseText | body | label
  deriving DecidableEq, Repr, Inhabited

def TypeRole.all : List TypeRole := [.display, .heading, .caseText, .body, .label]

def TypeRole.name : TypeRole → String
  | .display => "display" | .heading => "heading" | .caseText => "case"
  | .body => "body" | .label => "label"

def TypeRole.px : TypeRole → Nat
  | .display => 62 | .heading => 48 | .caseText => 27 | .body => 17 | .label => 14

structure Control where
  name : String
  height : Nat
  deriving DecidableEq, Repr

def controls : List Control :=
  [⟨"choice", 112⟩, ⟨"option", 56⟩, ⟨"pill", 48⟩, ⟨"primary button", 64⟩, ⟨"text link", 44⟩]

/-- One animation, with what replaces it when someone asks for reduced motion. -/
structure Motion where
  name : String
  ms : Nat
  reducedMs : Nat
  deriving DecidableEq, Repr

/-- The longest any animation may hold up the next case. -/
def maxMotionMs : Nat := 300

def motions : List Motion :=
  [⟨"stamp-landing", 180, 0⟩, ⟨"card-exit", 220, 0⟩, ⟨"ground-change", 160, 0⟩, ⟨"rookie-react", 240, 0⟩]

end Design
