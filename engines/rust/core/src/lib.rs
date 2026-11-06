//! The review game's rules in Rust. Charon and Aeneas translate this file into Lean
//! (`verify/Rust/`), and `verify/RustGame.lean` proves the translation computes what
//! the model in `model/Game/` computes, for every input in range.

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Phase {
    Intro,
    Asking,
    Revealed,
    Done,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Event {
    Start,
    Call,
    Depends,
    NotMine,
    Next,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Session {
    pub phase: Phase,
    pub index: u32,
    pub length: u32,
}

/// Move past the current case. The first test keeps the addition from overflowing.
pub fn advance(s: Session) -> Session {
    if s.index < s.length && s.length - s.index > 1 {
        Session { phase: Phase::Asking, index: s.index + 1, length: s.length }
    } else {
        Session { phase: Phase::Done, index: s.index, length: s.length }
    }
}

pub fn step(s: Session, e: Event) -> Option<Session> {
    match (s.phase, e) {
        (Phase::Intro, Event::Start) => {
            if s.length == 0 {
                Some(Session { phase: Phase::Done, index: s.index, length: s.length })
            } else {
                Some(Session { phase: Phase::Asking, index: s.index, length: s.length })
            }
        }
        (Phase::Asking, Event::Call) => Some(Session { phase: Phase::Revealed, index: s.index, length: s.length }),
        (Phase::Asking, Event::Depends) => Some(Session { phase: Phase::Revealed, index: s.index, length: s.length }),
        (Phase::Asking, Event::NotMine) => Some(advance(s)),
        (Phase::Revealed, Event::Next) => Some(advance(s)),
        _ => None,
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum CardKind {
    Predict,
    Confirm,
    Decide,
    Check,
    FollowUp,
    Reconcile,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Response {
    Agrees,
    Differs,
    Depends,
    NotMine,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Outcome {
    SameCall,
    PossibleCatch,
    Exception,
    DecisionSent,
    CheckPassed,
    CheckMissed,
    Routed,
}

pub fn judge(k: CardKind, r: Response) -> Outcome {
    match (k, r) {
        (_, Response::NotMine) => Outcome::Routed,
        (_, Response::Depends) => Outcome::Exception,
        (CardKind::Decide, _) => Outcome::DecisionSent,
        (CardKind::Reconcile, _) => Outcome::DecisionSent,
        (CardKind::Check, Response::Differs) => Outcome::CheckPassed,
        (CardKind::Check, Response::Agrees) => Outcome::CheckMissed,
        (_, Response::Agrees) => Outcome::SameCall,
        (_, Response::Differs) => Outcome::PossibleCatch,
    }
}

pub fn loudness(o: Outcome) -> u32 {
    match o {
        Outcome::PossibleCatch | Outcome::CheckPassed => 3,
        Outcome::DecisionSent => 2,
        Outcome::SameCall | Outcome::Exception => 1,
        Outcome::CheckMissed | Outcome::Routed => 0,
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Title {
    ShiftLead,
    DutyManager,
    StationManager,
}

pub fn title(upheld: u32, checks: u32) -> Title {
    if 6 <= upheld && 6 <= checks {
        Title::StationManager
    } else if 3 <= upheld && 3 <= checks {
        Title::DutyManager
    } else {
        Title::ShiftLead
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum RevealRule {
    EverySeat,
    EveryoneAvailable,
}

pub fn revealed(rule: RevealRule, answered: u32, not_mine: u32, on_leave: u32, waiting: u32) -> bool {
    match rule {
        RevealRule::EverySeat => waiting == 0 && not_mine == 0 && on_leave == 0 && 0 < answered,
        RevealRule::EveryoneAvailable => waiting == 0 && 0 < answered,
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct Streak {
    pub weeks: u32,
    pub passes: u32,
}

/// The first branch adds one to the weeks. The proof holds below the type's limit,
/// which is more than 80 million years of weekly answers.
pub fn close_week(s: Streak, answered: bool) -> Streak {
    if answered {
        Streak { weeks: s.weeks + 1, passes: s.passes }
    } else if 0 < s.passes {
        Streak { weeks: s.weeks, passes: s.passes - 1 }
    } else {
        Streak { weeks: 0, passes: s.passes }
    }
}

/// How many cases a shift holds when this many are on offer.
pub fn shift_length(cases: u32) -> u32 {
    if cases < 5 {
        cases
    } else {
        5
    }
}

pub fn follow_up_shown(r: Response) -> bool {
    match r {
        Response::Agrees | Response::Differs => true,
        Response::Depends | Response::NotMine => false,
    }
}

pub fn yes_stays_right(k: CardKind) -> bool {
    match k {
        CardKind::Confirm | CardKind::Check | CardKind::FollowUp => true,
        CardKind::Predict | CardKind::Decide | CardKind::Reconcile => false,
    }
}

pub fn sides_swapped(k: CardKind, seed: u32, index: u32) -> bool {
    if yes_stays_right(k) {
        false
    } else {
        (seed % 2 + index % 2) % 2 == 1
    }
}
