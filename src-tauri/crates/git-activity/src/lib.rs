//! Reads the player's own Git activity from a local repository.
//!
//! Gitaway grows with the player's work, so it needs one number from a
//! repository: how many of *their* commits landed since the last time it
//! looked. This crate answers that by running the `git` the player already has
//! installed. It has no dependencies beyond `std` and makes no network calls.
//!
//! A folder inside WSL (`\\wsl.localhost\<distro>\…`) is read by the Git in
//! that distribution, through `wsl.exe`, so its owner, identity and linked
//! worktrees are the ones the player uses there. Every other folder is read by
//! the Git on the PATH.
//!
//! Privacy: the only things that leave this crate are counts, timestamps and
//! the folder the player picked. Commit messages, file names and diffs are
//! never requested from Git (the log format is the commit hash, two timestamps
//! and the author email). Hashes only tell commits apart, in memory, so one
//! reached from two watched folders counts once; they are never passed on,
//! saved or logged, and nothing else is logged. Git's own error output is
//! inspected but never passed on: every error is a fixed, friendly sentence.
//! The one thing taken from it is the folder Git names when it refuses one it
//! does not trust, so the fix can name that folder.
//!
//! Only local branches (and a detached HEAD) are read. Remote-tracking
//! branches, tags, the stash and notes are ignored. Merge commits and empty
//! commits (ones that change no files) don't count.

use std::collections::{HashMap, HashSet};
use std::error::Error as StdError;
use std::ffi::OsString;
use std::fmt;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Output, Stdio};
use std::sync::{Mutex, OnceLock, PoisonError};
use std::thread::{self, JoinHandle};
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

/// How long a single Git call may run before it is killed.
const GIT_TIMEOUT: Duration = Duration::from_secs(20);

/// What runs Git inside a WSL distribution.
const WSL_PROGRAM: &str = "wsl.exe";

/// Options for every Git call: no pager, no lock files taken just to look, no
/// signature checks and no file-system monitor started.
const GIT_OPTIONS: [&str; 6] = [
    "--no-pager",
    "--no-optional-locks",
    "-c",
    "log.showSignature=false",
    "-c",
    "core.fsmonitor=false",
];

/// Variables that point Git at a repository. One inherited from a hook would
/// override the folder Gitaway names and point Git at the wrong repository.
const GIT_REPOSITORY_VARIABLES: [&str; 4] =
    ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"];

/// How often a running Git call is checked on.
const POLL_INTERVAL: Duration = Duration::from_millis(5);

/// Git's `--since` only reads a bare number as a Unix time from about 1973 on
/// (smaller numbers are parsed as something else), and a bare number past 2100
/// is not worth the risk. Outside this range the pre-filter is skipped; the
/// exact check in [`summarize`] decides either way.
const SINCE_ARG_RANGE: std::ops::RangeInclusive<u64> = 100_000_000..=4_102_444_800;

/// The most author times [`Activity::ahead`] keeps, earliest first. Only
/// commits dated well ahead of the clock end up there, so it is short unless
/// someone dates commits ahead on purpose.
pub const AHEAD_MAX: usize = 512;

/// How many of the player's commits are new since the last look.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Activity {
    /// Number of the player's own commits that are new in this look: their
    /// time is after `since`, they are not merges or empty, and they were not
    /// counted before. A commit counts the first time it is seen, whatever
    /// its dates say, so one dated ahead of the clock counts today.
    pub count: u64,
    /// Time (Unix seconds) of the newest of those commits, but never later
    /// than now, so it can be the next look's `since`; `since` when `count`
    /// is 0.
    pub latest: u64,
    /// Author times (Unix seconds) still later than `latest`: commits dated
    /// ahead of the clock that have been counted. Pass them back as `ahead`
    /// next time, so neither they nor amended or rebased copies of them are
    /// counted again when their dates come round.
    pub ahead: Vec<u64>,
    /// Commits that would be new here but were already counted from another
    /// watched folder (another worktree or clone of the same repository).
    /// They are not in `count`, but `latest` has moved past them.
    pub passed: u64,
}

/// Where a folder lives, which decides which Git reads it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Location {
    /// An ordinary path (`C:\…`, `D:\…`, `\\server\share\…`), read by the Git
    /// on the PATH.
    Native(PathBuf),
    /// A folder inside a WSL distribution (`\\wsl.localhost\<distro>\…` or
    /// `\\wsl$\<distro>\…`), read by the Git installed in that distribution.
    Wsl {
        /// The host as the path spelled it (`wsl.localhost` or `wsl$`, in
        /// any case), so paths Git reports can be written back the same way.
        host: String,
        /// The distribution's name, as the path spelled it.
        distro: String,
        /// The same folder inside the distribution: `/` and the rest of the
        /// path, `/`-separated.
        linux_path: String,
    },
}

impl Location {
    /// Reads `path` the same way on every platform. Anything that is not a
    /// WSL path is [`Location::Native`], unchanged.
    pub fn parse(path: &str) -> Location {
        parse_wsl(path).unwrap_or_else(|| Location::Native(PathBuf::from(path)))
    }

    /// Where `path` lives on this computer. Only Windows has WSL paths, so on
    /// any other system every path is native.
    pub fn of(path: &Path) -> Location {
        #[cfg(windows)]
        if let Some(location) = path.to_str().and_then(parse_wsl) {
            return location;
        }
        Location::Native(path.to_path_buf())
    }

    /// The repository whose top level Git printed as `top_level`, from a
    /// folder at this location. Inside WSL, Git prints a Linux path; it is
    /// written back as the WSL path it was picked as (same host, same
    /// distribution), so the app keeps a Windows path it can show and reuse.
    fn repository(&self, top_level: &str) -> Repository {
        match self {
            Location::Native(_) => {
                let path = native_path(top_level);
                Repository {
                    name: repository_name(&path),
                    path,
                }
            }
            Location::Wsl { host, distro, .. } => {
                let parts: Vec<&str> = top_level.split('/').filter(|part| !part.is_empty()).collect();
                let path = format!(r"\\{host}\{distro}\{}", parts.join(r"\"));
                Repository {
                    // At the distribution's root there is no folder name.
                    name: parts.last().map_or_else(|| path.clone(), |name| name.to_string()),
                    path: PathBuf::from(path),
                }
            }
        }
    }
}

fn is_separator(c: char) -> bool {
    c == '\\' || c == '/'
}

/// `\\wsl.localhost\<distro>\rest` or `\\wsl$\<distro>\rest`, in any case and
/// with either slash, or the same behind `\\?\UNC\` or `\\.\UNC\`.
fn parse_wsl(path: &str) -> Option<Location> {
    let mut parts = unc_body(path)?.split(is_separator);
    let host = parts.next()?;
    if !host.eq_ignore_ascii_case("wsl.localhost") && !host.eq_ignore_ascii_case("wsl$") {
        return None;
    }
    let distro = parts.next().filter(|distro| !distro.is_empty())?;
    let rest: Vec<&str> = parts.filter(|part| !part.is_empty()).collect();
    Some(Location::Wsl {
        host: host.to_string(),
        distro: distro.to_string(),
        linux_path: format!("/{}", rest.join("/")),
    })
}

/// The `server\share\…` part of a UNC path: after `\\`, or after the long
/// forms `\\?\UNC\` and `\\.\UNC\`. `None` for anything else.
fn unc_body(path: &str) -> Option<&str> {
    let mut chars = path.chars();
    if !(chars.next().is_some_and(is_separator) && chars.next().is_some_and(is_separator)) {
        return None;
    }
    let after = &path[2..];
    let long_form = after.get(..6).filter(|head| head.is_ascii()).is_some_and(|head| {
        let bytes = head.as_bytes();
        matches!(bytes[0], b'?' | b'.')
            && is_separator(char::from(bytes[1]))
            && head[2..5].eq_ignore_ascii_case("unc")
            && is_separator(char::from(bytes[5]))
    });
    let body = if long_form { &after[6..] } else { after };
    // A third slash is not a server name.
    if body.is_empty() || body.starts_with(is_separator) {
        return None;
    }
    Some(body)
}

/// A Git work tree.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Repository {
    /// The work tree's top-level folder.
    pub path: PathBuf,
    /// The name of that folder, for display.
    pub name: String,
}

/// Which Git a problem is about, so the fix can say where to run it.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WhichGit {
    /// The Git on the PATH: Windows Git, or the Mac's own.
    Native,
    /// The Git inside this WSL distribution.
    Wsl { distro: String },
}

/// Why a repository could not be read. `Display` is a short message that is
/// safe to show to the player as is; [`Error::kind`] names the problem for
/// code, and [`Error::command`] is the command that fixes it, if one does.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Error {
    /// The path does not exist or is not a folder.
    NotAFolder,
    /// `git` could not be started (not installed, or not on the PATH), or it
    /// is macOS's stand-in for Git and the developer tools are missing.
    GitUnavailable,
    /// The folder is not inside a Git work tree.
    NotARepository,
    /// Git refuses to read the folder because another user owns it.
    UntrustedFolder {
        /// The repository's folder as Git names it: `C:/code/api`,
        /// `//server/share/api`, or `/home/me/api` inside WSL.
        folder: String,
        git: WhichGit,
    },
    /// `user.email` is not configured for this repository.
    NoUserEmail { git: WhichGit },
    /// Git did not answer within [`GIT_TIMEOUT`] and was stopped.
    GitTimedOut,
    /// Git ran but failed for some other reason.
    GitFailed,
    /// `wsl.exe` could not be started, or WSL itself failed.
    WslUnavailable,
    /// WSL has no distribution by this name.
    WslDistroNotFound { distro: String },
    /// The distribution runs, but has no `git`.
    WslGitMissing { distro: String },
}

/// Sets the email Git signs commits with, to a placeholder to replace.
const SET_EMAIL: &str = r#"git config --global user.email "you@example.com""#;

impl Error {
    /// A stable name for the problem, for code to pick its wording by.
    pub fn kind(&self) -> &'static str {
        match self {
            Error::NotAFolder => "not-a-folder",
            Error::GitUnavailable => "git-unavailable",
            Error::NotARepository => "not-a-repository",
            Error::UntrustedFolder { .. } => "untrusted-folder",
            Error::NoUserEmail { .. } => "no-user-email",
            Error::GitTimedOut => "git-timed-out",
            Error::GitFailed => "git-failed",
            Error::WslUnavailable => "wsl-unavailable",
            Error::WslDistroNotFound { .. } => "wsl-distro-not-found",
            Error::WslGitMissing { .. } => "wsl-git-missing",
        }
    }

    /// The command that fixes the problem, where one does. [`WhichGit`]
    /// says where to run it, and the message says so too.
    pub fn command(&self) -> Option<String> {
        match self {
            Error::UntrustedFolder { folder, git } => Some(safe_directory_command(folder, git)),
            Error::NoUserEmail { .. } => Some(SET_EMAIL.to_string()),
            Error::WslDistroNotFound { .. } => Some("wsl --list --verbose".to_string()),
            Error::WslGitMissing { .. } => Some("sudo apt install git".to_string()),
            _ => None,
        }
    }
}

/// Where to run a fix for `git` on `os` (a [`std::env::consts::OS`] value).
fn run_in<'a>(git: &'a WhichGit, os: &str) -> &'a str {
    match git {
        WhichGit::Native if os == "windows" => "PowerShell or Git Bash",
        WhichGit::Native if os == "macos" => "Terminal",
        WhichGit::Native => "a terminal",
        WhichGit::Wsl { distro } => distro,
    }
}

impl Error {
    /// The message as it reads on `os` (a [`std::env::consts::OS`] value).
    /// `Display` shows it for the computer the app runs on.
    fn message_on(&self, os: &str) -> String {
        let message = match self {
            Error::NotAFolder => "That folder could not be found.",
            Error::GitUnavailable => git_unavailable_message(os),
            Error::NotARepository => {
                "That folder is not inside a Git repository. Pick a folder from your project."
            }
            Error::UntrustedFolder { folder, git } => {
                let whose = match git {
                    WhichGit::Native => "Git".to_string(),
                    WhichGit::Wsl { distro } => format!("Git in {distro}"),
                };
                return format!(
                    "{whose} won't read {} because another user owns it. If the folder is yours, \
                     mark it as safe by running `{}` in {}, then try again.",
                    windows_form(folder),
                    safe_directory_command(folder, git),
                    run_in(git, os),
                );
            }
            Error::NoUserEmail { git } => {
                // Only Windows has a second Git, inside WSL, to tell apart.
                let which = match git {
                    WhichGit::Native if os == "windows" => "Windows Git".to_string(),
                    WhichGit::Native => "Git".to_string(),
                    WhichGit::Wsl { distro } => format!("Git inside {distro}"),
                };
                return format!(
                    "{which} has no user.email for this repository, so your commits can't be told \
                     apart. Set the email you commit with by running `{SET_EMAIL}` in {}, then try \
                     again.",
                    run_in(git, os),
                );
            }
            Error::GitTimedOut => "Git took too long to answer for this repository.",
            Error::GitFailed => "Git could not read that repository.",
            Error::WslUnavailable => {
                "WSL could not be started, so folders inside Linux can't be read. Check that WSL \
                 is installed and working, or pick a folder on a Windows drive."
            }
            Error::WslDistroNotFound { distro } => {
                return format!(
                    "WSL has no distribution called {distro}. Run `wsl --list --verbose` to see \
                     the ones you have, or pick a folder on a Windows drive."
                );
            }
            Error::WslGitMissing { distro } => {
                return format!(
                    "Git isn't installed in {distro}. Install it there with `sudo apt install git`, \
                     or pick a folder on a Windows drive."
                );
            }
        };
        message.to_string()
    }
}

impl fmt::Display for Error {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message_on(std::env::consts::OS))
    }
}

/// Whether `path` is written the Windows way: a UNC path (`\\server\…`,
/// `//server/…`) or one on a drive (`C:\…`, `C:/…`).
fn is_windows_form(path: &str) -> bool {
    let bytes = path.as_bytes();
    let unc = bytes.len() >= 2 && bytes[..2].iter().all(|&b| b == b'\\' || b == b'/');
    let drive = bytes.len() >= 2 && bytes[0].is_ascii_alphabetic() && bytes[1] == b':';
    unc || drive
}

/// A Windows path as Windows shows it, with backslashes. Linux paths stay.
fn windows_form(path: &str) -> String {
    if is_windows_form(path) {
        path.replace('/', "\\")
    } else {
        path.to_string()
    }
}

/// A Windows path as Git writes it, with forward slashes. Linux paths stay.
fn git_form(path: &str) -> String {
    if is_windows_form(path) {
        path.replace('\\', "/")
    } else {
        path.to_string()
    }
}

/// The command that tells `git` to trust `folder` (as Git names it). Git
/// reads a value starting `//` as a Unix path, so a UNC folder takes Git's
/// `%(prefix)/` in front, as Git's own advice does.
fn safe_directory_command(folder: &str, git: &WhichGit) -> String {
    let value = if folder.starts_with("//") {
        format!("%(prefix)/{folder}")
    } else {
        folder.to_string()
    };
    let quoted = match git {
        // Run in bash.
        WhichGit::Wsl { .. } => format!("'{}'", value.replace('\'', r"'\''")),
        // Run in PowerShell or Git Bash, which quote a quote differently.
        // A Windows path cannot hold a double quote.
        WhichGit::Native if value.contains('\'') => format!("\"{value}\""),
        WhichGit::Native => format!("'{value}'"),
    };
    format!("git config --global --add safe.directory {quoted}")
}

impl StdError for Error {}

/// What [`Error::GitUnavailable`] says on `os` (a [`std::env::consts::OS`] value).
///
/// On a Mac, an app opened from the Finder runs with a minimal PATH (not the
/// one a shell sets up), so it finds `/usr/bin/git`: Apple's stand-in, which
/// only works once the command line developer tools are installed. Pointing
/// at the PATH there would send the player the wrong way.
fn git_unavailable_message(os: &str) -> &'static str {
    match os {
        "macos" => {
            "Git could not be run. On a Mac, Git comes with Apple's command line developer tools: \
             run \"xcode-select --install\" in Terminal, then try again."
        }
        _ => "Git could not be run. Check that Git is installed and available on your PATH.",
    }
}

/// Finds the Git work tree that `path` is in, so that picking any folder inside
/// a project (not just its root) selects the same repository.
///
/// `path` is used exactly as given. It is deliberately not canonicalized: on
/// Windows that produces `\\?\` paths, which Git does not understand. A WSL
/// path resolves to a top level written the same way (`\\wsl.localhost\…`).
pub fn resolve_repository(path: &Path) -> Result<Repository, Error> {
    resolve(&Runner::for_path(path))
}

fn resolve(git: &Runner) -> Result<Repository, Error> {
    git.check_folder()?;
    let output = git.run(&["rev-parse", "--is-inside-work-tree", "--show-toplevel"])?;
    if !output.status.success() {
        // Not a repository at all, or inside a .git folder or a bare
        // repository, where there is no work tree to show.
        return Err(git.failure_for(&output, Error::NotARepository));
    }
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut lines = stdout.lines();
    let inside = lines.next().map(str::trim) == Some("true");
    let top_level = lines.next().map(str::trim_end).filter(|line| !line.is_empty());
    match (inside, top_level) {
        (true, Some(top_level)) => Ok(git.location.repository(top_level)),
        _ => Err(Error::NotARepository),
    }
}

/// Git prints Windows paths with forward slashes (`C:/Users/me/game`); show
/// them the way Windows does.
#[cfg(windows)]
fn native_path(path: &str) -> PathBuf {
    PathBuf::from(path.replace('/', "\\"))
}

#[cfg(not(windows))]
fn native_path(path: &str) -> PathBuf {
    PathBuf::from(path)
}

/// A short, friendly name for the repository: the name of the folder.
pub fn repository_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().into_owned())
        .filter(|name| !name.is_empty())
        // A drive root such as `C:\` has no folder name; fall back to the path.
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

/// The repository's `git config user.email` (local, global or system), as
/// the Git that reads the folder sees it: inside WSL, the distribution's.
pub fn user_email(path: &Path) -> Result<String, Error> {
    email(&Runner::for_path(path))
}

fn email(git: &Runner) -> Result<String, Error> {
    let output = git.run(&["config", "--get", "user.email"])?;
    if !output.status.success() {
        return Err(user_email_failure(
            output.status.code(),
            &String::from_utf8_lossy(&output.stderr),
            &git.location,
        ));
    }
    let email = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if email.is_empty() {
        Err(git.no_user_email())
    } else {
        Ok(email)
    }
}

/// Why `git config --get user.email` failed, from its exit code and stderr.
fn user_email_failure(code: Option<i32>, stderr: &str, location: &Location) -> Error {
    match failure_from(stderr, Error::GitFailed, location) {
        // `git config --get` exits with 1 when the key is simply not set.
        Error::GitFailed if code == Some(1) => Error::NoUserEmail { git: location.git() },
        failure => failure,
    }
}

/// Counts the player's own commits that are new since `since` (Unix seconds),
/// judged against the system clock. `ahead` is what the last look returned
/// in [`Activity::ahead`].
///
/// See [`activity_at`] for exactly what counts. A folder inside WSL is read
/// by the Git in its distribution, every time, as it was when it was added.
pub fn own_activity(path: &Path, since: u64, ahead: &[u64]) -> Result<Activity, Error> {
    static LEDGER: OnceLock<Mutex<Ledger>> = OnceLock::new();
    let ledger = LEDGER.get_or_init(Default::default);
    activity_at(&Runner::for_path(path), since, ahead, now_seconds(), ledger)
}

/// A look with a ledger of its own, so tests never see each other's commits.
#[cfg(test)]
fn own_activity_at(path: &Path, since: u64, now: u64) -> Result<Activity, Error> {
    activity_at(&Runner::for_path(path), since, &[], now, &Mutex::default())
}

/// How long the [`Ledger`] remembers a commit it counted. Two folders that
/// share commits are looked at minutes apart, so a week is plenty.
const LEDGER_KEEP_SECONDS: u64 = 7 * 86_400;

/// The commits counted in this run of the app, by hash, with the folder that
/// counted each, so a commit reached from two watched folders (two worktrees
/// of one repository, or two clones of it) counts once. It lives in memory
/// only: hashes are never passed on, saved or logged.
#[derive(Debug, Default)]
struct Ledger {
    counted: HashMap<String, Counted>,
}

#[derive(Debug)]
struct Counted {
    /// The folder that counted it (see [`Location::key`]).
    folder: String,
    /// When it was counted (Unix seconds).
    at: u64,
}

impl Ledger {
    /// Whether another folder has counted the commit with this hash.
    fn counted_elsewhere(&self, hash: &str, folder: &str) -> bool {
        self.counted.get(hash).is_some_and(|counted| counted.folder != folder)
    }

    /// Notes that `folder` counted the commit with this hash at `at`. The first
    /// folder to count a commit keeps it.
    fn note(&mut self, hash: &str, folder: &str, at: u64) {
        self.counted.entry(hash.to_string()).or_insert_with(|| Counted {
            folder: folder.to_string(),
            at,
        });
    }

    /// Forgets the commits counted before `cutoff` (Unix seconds).
    fn forget_before(&mut self, cutoff: u64) {
        self.counted.retain(|_, counted| counted.at >= cutoff);
    }
}

/// The current time in Unix seconds (0 if the clock is before 1970).
fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|elapsed| elapsed.as_secs())
        .unwrap_or(0)
}

/// Counts the player's own commits with `since < t`, where `t` is the earlier
/// of the commit's author time and committer time, leaving out the ones
/// counted ahead of their dates before (`ahead`).
///
/// * "Own" means the author email equals the repository's `user.email`.
/// * Only local branches and the current HEAD are searched. Merge commits are
///   skipped, and so are empty commits: ones with the same tree as their
///   parent, or a first commit with no files.
/// * The earlier of the two times is used because rebasing, amending and
///   cherry-picking keep the original author time but stamp a new committer
///   time, and work that was already counted must not pay out again.
/// * A commit counts the first time it is seen, even one dated ahead of
///   `now`: the day it counts on is the day the game sees it, so dates can't
///   move work into another day's allowance. `latest` never goes past `now`,
///   and the commit's author time is remembered in `ahead` so it is not
///   counted again when its date comes round.
/// * A commit is counted once, however it is reached: Git lists a commit on
///   several branches once, and a commit another watched folder has counted
///   (by hash, in `ledger`) is passed over, though `latest` still moves past
///   it so this folder's cursor keeps up.
fn activity_at(
    git: &Runner,
    since: u64,
    ahead: &[u64],
    now: u64,
    ledger: &Mutex<Ledger>,
) -> Result<Activity, Error> {
    git.check_folder()?;
    let email = email(git)?;

    // A repository with no commits yet has no HEAD to name. Local branches
    // are still read, because `git checkout --orphan` can leave some behind.
    let has_head = git
        .run(&["rev-parse", "--verify", "--quiet", "HEAD"])?
        .status
        .success();

    // `--author` is only a cheap pre-filter: it does a substring match, so
    // "me@x.com" would also match "someone@x.com". `--since` (on committer
    // time, which is never earlier than the time we count) is a pre-filter
    // too. The exact checks in `summarize` are what decide.
    let author = format!("--author={email}");
    let since_arg = Some(since.saturating_add(1))
        .filter(|from| SINCE_ARG_RANGE.contains(from))
        .map(|from| format!("--since={from}"));

    // The player's own submodule setting must not hide a commit that only
    // moves a submodule along (see the pathspec below).
    let mut args = vec!["-c", "diff.ignoreSubmodules=none", "log", "--branches"];
    if has_head {
        args.push("HEAD");
    }
    args.extend([
        "--no-merges",
        // Walk every branch of history, so the pathspec below only ever
        // drops a commit for being empty, never a side branch.
        "--full-history",
        "--fixed-strings",
        "--regexp-ignore-case",
        author.as_str(),
    ]);
    if let Some(since_arg) = since_arg.as_deref() {
        args.push(since_arg);
    }
    // The hash only tells commits apart (see `Ledger`); it is never passed on.
    args.push("--format=%H%x09%at%x09%ct%x09%ae");
    // The whole work tree as a pathspec: Git then leaves out every commit
    // whose tree is the same as its parent's (for a first commit, one with no
    // files), so empty commits don't count. Git compares the trees itself;
    // no file names or contents are read out.
    args.extend(["--", ":/"]);

    let output = git.run(&args)?;
    if !output.status.success() {
        return Err(git.failure_for(&output, Error::GitFailed));
    }
    let look = Look {
        email: &email,
        since,
        ahead,
        now,
        folder: git.location.key(),
    };
    let mut ledger = ledger.lock().unwrap_or_else(PoisonError::into_inner);
    Ok(summarize(&String::from_utf8_lossy(&output.stdout), &look, &mut ledger))
}

/// What one look at a folder goes by.
struct Look<'a> {
    /// The repository's `user.email`.
    email: &'a str,
    since: u64,
    ahead: &'a [u64],
    now: u64,
    /// The folder looked at (see [`Location::key`]).
    folder: String,
}

/// Reduces `git log --format=%H%x09%at%x09%ct%x09%ae` output to an
/// [`Activity`], noting the commits it counts in `ledger`.
fn summarize(log: &str, look: &Look, ledger: &mut Ledger) -> Activity {
    ledger.forget_before(look.now.saturating_sub(LEDGER_KEEP_SECONDS));
    let counted_ahead: HashSet<u64> = look.ahead.iter().copied().collect();
    let mut count = 0u64;
    let mut passed = 0u64;
    let mut latest = look.since;
    // Author times to remember: the ones handed in, and the new commits'.
    let mut remember = look.ahead.to_vec();
    for line in log.lines() {
        let Some(commit) = own_commit(line, look.email) else {
            continue;
        };
        let time = commit.author_time.min(commit.committer_time);
        // Counted already, or made before the repository was watched.
        if time <= look.since {
            continue;
        }
        // Counted before, ahead of its date: this commit, or an amended or
        // rebased copy of it, which keeps the author time.
        if counted_ahead.contains(&commit.author_time) {
            continue;
        }
        if ledger.counted_elsewhere(commit.hash, &look.folder) {
            passed += 1;
        } else {
            count += 1;
            ledger.note(commit.hash, &look.folder, look.now);
        }
        // The cursor never goes past the clock, so a commit dated ahead
        // can't hold back the ones made after it.
        latest = latest.max(time.min(look.now));
        remember.push(commit.author_time);
    }
    // Anything at or before the cursor is kept out by the cursor itself.
    remember.retain(|&time| time > latest);
    remember.sort_unstable();
    remember.dedup();
    remember.truncate(AHEAD_MAX);
    Activity {
        count,
        latest,
        ahead: remember,
        passed,
    }
}

/// One of the player's commits, as `git log` listed it.
struct Commit<'a> {
    hash: &'a str,
    author_time: u64,
    committer_time: u64,
}

/// A `%H<TAB>%at<TAB>%ct<TAB>%ae` line, if it is well formed and the player's.
fn own_commit<'a>(line: &'a str, email: &str) -> Option<Commit<'a>> {
    let mut fields = line.split('\t');
    let (Some(hash), Some(author_time), Some(committer_time), Some(author)) =
        (fields.next(), fields.next(), fields.next(), fields.next())
    else {
        return None;
    };
    let hash = hash.trim();
    if hash.is_empty() || !author.trim().eq_ignore_ascii_case(email) {
        return None;
    }
    Some(Commit {
        hash,
        author_time: author_time.trim().parse().ok()?,
        committer_time: committer_time.trim().parse().ok()?,
    })
}

/// Runs Git for one [`Location`]: the Git on the PATH for a native folder, or
/// the Git inside the distribution, through `wsl.exe`, for a WSL folder.
#[derive(Debug, Clone)]
struct Runner {
    location: Location,
    /// The program that runs Git inside WSL: `wsl.exe`, or a stand-in in tests.
    wsl: OsString,
}

impl Runner {
    fn new(location: Location) -> Runner {
        Runner {
            location,
            wsl: WSL_PROGRAM.into(),
        }
    }

    fn for_path(path: &Path) -> Runner {
        Runner::new(Location::of(path))
    }

    /// A native folder must exist before Git is asked about it.
    fn check_folder(&self) -> Result<(), Error> {
        match &self.location {
            Location::Native(path) if !path.is_dir() => Err(Error::NotAFolder),
            _ => Ok(()),
        }
    }

    /// The Git call for `args`, without a console window, a pager, a terminal
    /// prompt or background side effects:
    ///
    /// * native: `git <options> -C <path> <args…>`
    /// * WSL: `wsl.exe -d <distro> --cd <linux path> --exec git <options> <args…>`
    fn command(&self, args: &[&str]) -> Command {
        let mut command;
        match &self.location {
            Location::Native(path) => {
                command = Command::new("git");
                command.args(GIT_OPTIONS).arg("-C").arg(path).args(args);
            }
            Location::Wsl {
                distro, linux_path, ..
            } => {
                // `--exec` starts Git without a shell, so every argument
                // arrives exactly as given.
                command = Command::new(&self.wsl);
                command
                    .args(["-d", distro, "--cd", linux_path, "--exec", "git"])
                    .args(GIT_OPTIONS)
                    .args(args)
                    // Hand the two variables below on into Linux.
                    .env("WSLENV", "GIT_TERMINAL_PROMPT:LC_ALL")
                    // wsl.exe's own messages in UTF-8, not UTF-16.
                    .env("WSL_UTF8", "1");
            }
        }
        command
            .stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .env("GIT_TERMINAL_PROMPT", "0")
            // English messages, so the checks in `failure_for` work on any locale.
            .env("LC_ALL", "C");
        for variable in GIT_REPOSITORY_VARIABLES {
            command.env_remove(variable);
        }
        hide_console_window(&mut command);
        command
    }

    /// Runs Git (see [`Runner::run_within`]) with the standard time limit.
    fn run(&self, args: &[&str]) -> Result<Output, Error> {
        self.run_within(args, GIT_TIMEOUT)
    }

    /// Runs Git for `args` and kills it if it has not finished within
    /// `timeout`. Inside WSL, problems wsl.exe reports itself (no such
    /// distribution, no Git there, no such folder) come back as errors.
    fn run_within(&self, args: &[&str], timeout: Duration) -> Result<Output, Error> {
        match &self.location {
            Location::Native(_) => run_within(self.command(args), timeout, Error::GitUnavailable),
            Location::Wsl { distro, .. } => {
                let output = run_within(self.command(args), timeout, Error::WslUnavailable)?;
                match wsl_problem(
                    output.status.success(),
                    &String::from_utf8_lossy(&output.stdout),
                    &String::from_utf8_lossy(&output.stderr),
                    distro,
                ) {
                    Some(problem) => Err(problem),
                    None => Ok(output),
                }
            }
        }
    }

    fn no_user_email(&self) -> Error {
        Error::NoUserEmail {
            git: self.location.git(),
        }
    }

    /// Turns a failed Git run into a friendly error, using `fallback` when
    /// the cause is not recognised.
    fn failure_for(&self, output: &Output, fallback: Error) -> Error {
        failure_from(&String::from_utf8_lossy(&output.stderr), fallback, &self.location)
    }
}

impl Location {
    /// The Git that reads this location.
    fn git(&self) -> WhichGit {
        match self {
            Location::Native(_) => WhichGit::Native,
            Location::Wsl { distro, .. } => WhichGit::Wsl {
                distro: distro.clone(),
            },
        }
    }

    /// Tells watched folders apart in the [`Ledger`]: the folder as it was
    /// picked, and which Git reads it.
    fn key(&self) -> String {
        match self {
            Location::Native(path) => format!("native:{}", path.to_string_lossy()),
            Location::Wsl {
                distro, linux_path, ..
            } => format!("wsl:{distro}:{linux_path}"),
        }
    }

    /// The folder as the Git that reads it would write it.
    fn git_folder(&self) -> String {
        match self {
            Location::Native(path) => git_form(&path.to_string_lossy()),
            Location::Wsl { linux_path, .. } => linux_path.clone(),
        }
    }
}

/// [`Runner::failure_for`] on Git's stderr. Git's stderr is only inspected
/// here, and nothing from it is passed on except the folder Git names when
/// it refuses one it does not trust: the player's own folder, which the fix
/// has to name.
fn failure_from(stderr: &str, fallback: Error, location: &Location) -> Error {
    // macOS's /usr/bin/git without the developer tools: it starts, so the
    // spawn succeeds, but it prints this and exits instead of running Git.
    if stderr.contains("xcode-select: ") || stderr.contains("xcrun: error") {
        Error::GitUnavailable
    } else if stderr.contains("dubious ownership") {
        Error::UntrustedFolder {
            // Git names the repository's top level, which is what it checks;
            // the folder that was picked may be inside it.
            folder: untrusted_folder(stderr).unwrap_or_else(|| location.git_folder()),
            git: location.git(),
        }
    } else if stderr.contains("not a git repository") {
        Error::NotARepository
    } else {
        fallback
    }
}

/// The folder in Git's "detected dubious ownership in repository at '…'".
fn untrusted_folder(stderr: &str) -> Option<String> {
    stderr.lines().find_map(|line| {
        let (_, rest) = line.split_once("dubious ownership in repository at '")?;
        let folder = rest.trim_end().strip_suffix('\'')?;
        (!folder.is_empty()).then(|| folder.to_string())
    })
}

/// What `wsl.exe` itself reports, apart from Git's own output, as wsl.exe
/// 2.x writes it (in UTF-8, with WSL_UTF8=1): no such distribution, no `git`
/// in it, a `--cd` folder it could not enter, or WSL failing some other way.
fn wsl_problem(succeeded: bool, stdout: &str, stderr: &str, distro: &str) -> Option<Error> {
    // The relay's own lines: `<3>WSL (1234 - Relay) ERROR: …`.
    let relay_said = |what: &str| stderr.lines().any(|line| line.contains("WSL (") && line.contains(what));
    if relay_said("execvpe(git) failed") {
        return Some(Error::WslGitMissing {
            distro: distro.to_string(),
        });
    }
    // wsl.exe goes on in `/` when it cannot enter the folder, so this counts
    // even when Git then succeeded.
    if relay_said("chdir(") {
        return Some(Error::NotAFolder);
    }
    // wsl.exe's own errors end with a code such as
    // `Error code: Wsl/Service/WSL_E_DISTRO_NOT_FOUND`, on stdout.
    let said = |what: &str| stdout.contains(what) || stderr.contains(what);
    if !succeeded && said("WSL_E_DISTRO_NOT_FOUND") {
        return Some(Error::WslDistroNotFound {
            distro: distro.to_string(),
        });
    }
    if !succeeded && said("Error code: Wsl/") {
        return Some(Error::WslUnavailable);
    }
    None
}

/// Runs `command`, draining its output, and kills it if it has not finished
/// within `timeout`. `unavailable` is the error if it cannot be started.
fn run_within(mut command: Command, timeout: Duration, unavailable: Error) -> Result<Output, Error> {
    let mut child = command.spawn().map_err(|_| unavailable)?;
    // Drain both pipes while waiting, so a chatty Git can never block on a
    // full pipe and look like a hang.
    let stdout = child.stdout.take().map(read_in_background);
    let stderr = child.stderr.take().map(read_in_background);

    let deadline = Instant::now() + timeout;
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if Instant::now() < deadline => thread::sleep(POLL_INTERVAL),
            Ok(None) => {
                stop(&mut child);
                // The reader threads are left to finish on their own: a
                // grandchild process could still hold the pipes open.
                return Err(Error::GitTimedOut);
            }
            Err(_) => {
                stop(&mut child);
                return Err(Error::GitFailed);
            }
        }
    };
    Ok(Output {
        status,
        stdout: collect(stdout),
        stderr: collect(stderr),
    })
}

/// Reads a pipe to the end on its own thread.
fn read_in_background<R: Read + Send + 'static>(mut pipe: R) -> JoinHandle<Vec<u8>> {
    thread::spawn(move || {
        let mut bytes = Vec::new();
        let _ = pipe.read_to_end(&mut bytes);
        bytes
    })
}

/// The bytes a [`read_in_background`] thread read (empty if it panicked).
fn collect(reader: Option<JoinHandle<Vec<u8>>>) -> Vec<u8> {
    reader
        .and_then(|reader| reader.join().ok())
        .unwrap_or_default()
}

/// Kills a child process and reaps it.
fn stop(child: &mut Child) {
    let _ = child.kill();
    let _ = child.wait();
}

/// Windows: stop a console window flashing up for every Git call.
#[cfg(windows)]
fn hide_console_window(command: &mut Command) {
    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    command.creation_flags(CREATE_NO_WINDOW);
}

#[cfg(not(windows))]
fn hide_console_window(_command: &mut Command) {}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};

    /// A throwaway folder under the system temp dir, removed on drop.
    struct TempDir(PathBuf);

    impl TempDir {
        fn new(tag: &str) -> TempDir {
            static NEXT: AtomicU64 = AtomicU64::new(0);
            let nanos = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .map(|elapsed| elapsed.as_nanos())
                .unwrap_or(0);
            let unique = NEXT.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "gitaway-git-activity-{tag}-{}-{nanos}-{unique}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create temp dir");
            TempDir(path)
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TempDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    /// Runs Git for test setup and returns its stdout, ignoring the machine's
    /// own Git configuration (signing, default identity) so results are
    /// repeatable. The optional times set GIT_AUTHOR_DATE and
    /// GIT_COMMITTER_DATE, in Unix seconds.
    fn git_at(
        dir: &Path,
        args: &[&str],
        author_time: Option<u64>,
        committer_time: Option<u64>,
    ) -> String {
        let null_device = if cfg!(windows) { "NUL" } else { "/dev/null" };
        let mut command = Command::new("git");
        command
            .arg("-C")
            .arg(dir)
            .args(["-c", "commit.gpgsign=false"])
            .args(args)
            .stdin(Stdio::null())
            .env("GIT_CONFIG_NOSYSTEM", "1")
            .env("GIT_CONFIG_GLOBAL", null_device)
            .env("GIT_TERMINAL_PROMPT", "0")
            .env("GIT_EDITOR", "true")
            .env_remove("GIT_DIR")
            .env_remove("GIT_WORK_TREE")
            .env_remove("GIT_INDEX_FILE");
        if let Some(time) = author_time {
            command.env("GIT_AUTHOR_DATE", format!("{time} +0000"));
        }
        if let Some(time) = committer_time {
            command.env("GIT_COMMITTER_DATE", format!("{time} +0000"));
        }
        hide_console_window(&mut command);
        let output = command.output().expect("run git");
        assert!(
            output.status.success(),
            "git {args:?} failed: {}",
            String::from_utf8_lossy(&output.stderr)
        );
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    }

    fn git(dir: &Path, args: &[&str]) -> String {
        git_at(dir, args, None, None)
    }

    /// A commit by `author_email` with separate author and committer times.
    /// The committer is always the repository's configured user. Each one adds
    /// a file of its own, so it is never empty and branches merge cleanly.
    fn commit_at(
        dir: &Path,
        author_email: &str,
        author_time: u64,
        committer_time: u64,
        message: &str,
    ) {
        static NEXT_FILE: AtomicU64 = AtomicU64::new(0);
        let file = format!("work-{}.txt", NEXT_FILE.fetch_add(1, Ordering::Relaxed));
        fs::write(dir.join(file), message).expect("write file");
        git(dir, &["add", "-A"]);
        let author = format!("Somebody <{author_email}>");
        git_at(
            dir,
            &["commit", "-m", message, "--author", author.as_str()],
            Some(author_time),
            Some(committer_time),
        );
    }

    /// A commit by `author_email` where both times are `time`.
    fn commit(dir: &Path, author_email: &str, time: u64, message: &str) {
        commit_at(dir, author_email, time, time, message);
    }

    /// A commit by [`PLAYER`] that changes nothing: the same tree as its
    /// parent (or no files at all, as a first commit), at `time`.
    fn empty_commit(dir: &Path, time: u64, message: &str) {
        let author = format!("Somebody <{PLAYER}>");
        git_at(
            dir,
            &["commit", "--allow-empty", "-m", message, "--author", author.as_str()],
            Some(time),
            Some(time),
        );
    }

    /// Commits whatever is staged, by [`PLAYER`], at `time`.
    fn commit_staged(dir: &Path, time: u64, message: &str) {
        let author = format!("Somebody <{PLAYER}>");
        git_at(
            dir,
            &["commit", "-m", message, "--author", author.as_str()],
            Some(time),
            Some(time),
        );
    }

    /// A commit that changes a file (so it can be rebased without becoming
    /// empty), by [`PLAYER`], with both times set to `time`.
    fn commit_file(dir: &Path, name: &str, time: u64) {
        fs::write(dir.join(format!("{name}.txt")), name).expect("write file");
        git(dir, &["add", "."]);
        let author = format!("Somebody <{PLAYER}>");
        git_at(
            dir,
            &["commit", "-m", name, "--author", author.as_str()],
            Some(time),
            Some(time),
        );
    }

    const PLAYER: &str = "dev+test@example.com";
    const T0: u64 = 1_700_000_000;
    /// A "now" comfortably after every commit time used below.
    const NOW: u64 = T0 + 1_000_000;

    /// A repository whose `user.email` is [`PLAYER`], on branch `main`.
    fn new_repo(tag: &str) -> TempDir {
        let dir = TempDir::new(tag);
        git(dir.path(), &["init", "--quiet", "-b", "main"]);
        git(dir.path(), &["config", "user.email", PLAYER]);
        git(dir.path(), &["config", "user.name", "Dev Test"]);
        dir
    }

    fn activity(count: u64, latest: u64) -> Activity {
        ahead_of(count, latest, &[])
    }

    /// An [`Activity`] that also remembers commits dated ahead of `latest`.
    fn ahead_of(count: u64, latest: u64, ahead: &[u64]) -> Activity {
        Activity {
            count,
            latest,
            ahead: ahead.to_vec(),
            passed: 0,
        }
    }

    /// A look at `dir` from `since`, remembering `ahead`, at `now`, with a
    /// ledger of its own.
    fn look(dir: &Path, since: u64, ahead: &[u64], now: u64) -> Result<Activity, Error> {
        look_in(dir, since, ahead, now, &Mutex::default())
    }

    /// The same, sharing `ledger` with other looks, as the app's folders do.
    fn look_in(dir: &Path, since: u64, ahead: &[u64], now: u64, ledger: &Mutex<Ledger>) -> Result<Activity, Error> {
        activity_at(&Runner::for_path(dir), since, ahead, now, ledger)
    }

    #[test]
    fn counts_only_own_non_merge_commits_on_local_branches() {
        let repo = new_repo("count");
        let dir = repo.path();

        commit(dir, PLAYER, T0, "first");
        commit(dir, PLAYER, T0 + 1000, "second");
        // Look-alikes that a loose --author match would let through.
        commit(dir, "devvtest@example.com", T0 + 1500, "regex look-alike");
        commit(dir, "not-dev+test@example.com", T0 + 1600, "substring look-alike");
        commit(dir, "other@example.com", T0 + 2000, "someone else");

        // A commit on a side branch, merged back with a merge commit.
        git(dir, &["checkout", "--quiet", "-b", "side"]);
        commit(dir, PLAYER, T0 + 3000, "on side");
        git(dir, &["checkout", "--quiet", "main"]);
        commit(dir, PLAYER, T0 + 4000, "on main");
        git_at(
            dir,
            &["merge", "--quiet", "--no-ff", "side", "-m", "merge side"],
            Some(T0 + 5000),
            Some(T0 + 5000),
        );

        // A commit only reachable from a local branch that is not checked out.
        git(dir, &["checkout", "--quiet", "-b", "elsewhere"]);
        commit(dir, PLAYER, T0 + 6000, "elsewhere");
        git(dir, &["checkout", "--quiet", "main"]);

        // Own, non-merge commits at: T0, +1000, +3000, +4000, +6000.
        assert_eq!(own_activity_at(dir, 0, NOW), Ok(activity(5, T0 + 6000)));
        assert_eq!(own_activity_at(dir, T0 - 1, NOW), Ok(activity(5, T0 + 6000)));
        // Strictly greater than `since`.
        assert_eq!(own_activity_at(dir, T0, NOW), Ok(activity(4, T0 + 6000)));
        assert_eq!(own_activity_at(dir, T0 + 3000, NOW), Ok(activity(2, T0 + 6000)));
        assert_eq!(own_activity_at(dir, T0 + 5999, NOW), Ok(activity(1, T0 + 6000)));
        // Nothing newer: latest falls back to `since`.
        assert_eq!(own_activity_at(dir, T0 + 6000, NOW), Ok(activity(0, T0 + 6000)));
        assert_eq!(
            own_activity_at(dir, 4_000_000_000, NOW),
            Ok(activity(0, 4_000_000_000))
        );
        assert_eq!(own_activity_at(dir, u64::MAX, NOW), Ok(activity(0, u64::MAX)));
    }

    #[test]
    fn empty_commits_do_not_count() {
        let repo = new_repo("empty-commits");
        let dir = repo.path();
        empty_commit(dir, T0, "an empty first commit");
        commit(dir, PLAYER, T0 + 100, "real work");
        empty_commit(dir, T0 + 200, "nudge the build");
        commit(dir, PLAYER, T0 + 300, "more work");
        empty_commit(dir, T0 + 400, "empty again");
        // An empty commit on another local branch is left out too.
        git(dir, &["checkout", "--quiet", "-b", "side"]);
        empty_commit(dir, T0 + 500, "empty on a side branch");
        git(dir, &["checkout", "--quiet", "main"]);

        assert_eq!(own_activity_at(dir, 0, NOW), Ok(activity(2, T0 + 300)));
        assert_eq!(own_activity_at(dir, T0 + 100, NOW), Ok(activity(1, T0 + 300)));
        // The empty commits after the last real one never move the cursor.
        assert_eq!(own_activity_at(dir, T0 + 300, NOW), Ok(activity(0, T0 + 300)));
    }

    #[test]
    fn changes_without_new_lines_still_count() {
        let repo = new_repo("no-new-lines");
        let dir = repo.path();
        // A first commit counts even if the player's config hides root diffs,
        // and whatever their submodule setting says.
        git(dir, &["config", "log.showRoot", "false"]);
        git(dir, &["config", "diff.ignoreSubmodules", "all"]);
        commit_file(dir, "first", T0);
        // A rename, a binary file and a mode change: no lines added, but real
        // changes all the same.
        git(dir, &["mv", "first.txt", "renamed.txt"]);
        commit_staged(dir, T0 + 100, "rename");
        fs::write(dir.join("picture.bin"), [0u8, 1, 2, 255]).unwrap();
        git(dir, &["add", "-A"]);
        commit_staged(dir, T0 + 200, "binary");
        git(dir, &["update-index", "--chmod=+x", "renamed.txt"]);
        commit_staged(dir, T0 + 300, "mode");

        assert_eq!(own_activity_at(dir, 0, NOW), Ok(activity(4, T0 + 300)));
    }

    #[test]
    fn work_and_its_revert_both_count() {
        // Two commits that cancel out are two pieces of work, not empty ones.
        let repo = new_repo("revert");
        let dir = repo.path();
        commit_file(dir, "base", T0);
        fs::write(dir.join("base.txt"), "changed").unwrap();
        git(dir, &["add", "-A"]);
        commit_staged(dir, T0 + 100, "change");
        git_at(dir, &["revert", "--no-edit", "HEAD"], Some(T0 + 200), Some(T0 + 200));
        assert_eq!(own_activity_at(dir, T0, NOW), Ok(activity(2, T0 + 200)));
    }

    #[test]
    fn remote_tracking_refs_tags_and_notes_do_not_count() {
        let repo = new_repo("local-only");
        let dir = repo.path();
        commit(dir, PLAYER, T0, "on main");

        // Counted: a local branch that is not checked out.
        git(dir, &["checkout", "--quiet", "-b", "other"]);
        commit(dir, PLAYER, T0 + 100, "on other");
        git(dir, &["checkout", "--quiet", "main"]);

        // Not counted: a commit that only a remote-tracking ref points at.
        git(dir, &["checkout", "--quiet", "-b", "tmp-remote"]);
        commit(dir, PLAYER, T0 + 200, "only on a remote");
        let sha = git(dir, &["rev-parse", "tmp-remote"]);
        git(dir, &["checkout", "--quiet", "main"]);
        git(dir, &["branch", "--quiet", "-D", "tmp-remote"]);
        git(dir, &["update-ref", "refs/remotes/origin/x", sha.as_str()]);

        // Not counted: a commit that only a tag points at.
        git(dir, &["checkout", "--quiet", "-b", "tmp-tag"]);
        commit(dir, PLAYER, T0 + 300, "only on a tag");
        git(dir, &["tag", "only-tag"]);
        git(dir, &["checkout", "--quiet", "main"]);
        git(dir, &["branch", "--quiet", "-D", "tmp-tag"]);

        // Not counted: Git notes live on their own ref.
        git_at(
            dir,
            &["notes", "add", "-m", "a note", "HEAD"],
            Some(T0 + 400),
            Some(T0 + 400),
        );

        assert_eq!(own_activity_at(dir, 0, NOW), Ok(activity(2, T0 + 100)));
    }

    #[test]
    fn a_detached_head_counts_while_it_is_checked_out() {
        let repo = new_repo("detached");
        let dir = repo.path();
        commit(dir, PLAYER, T0, "on main");
        git(dir, &["checkout", "--quiet", "--detach"]);
        commit(dir, PLAYER, T0 + 100, "detached");
        assert_eq!(own_activity_at(dir, 0, NOW), Ok(activity(2, T0 + 100)));
    }

    #[test]
    fn an_empty_repository_has_no_activity() {
        let repo = new_repo("empty");
        assert!(resolve_repository(repo.path()).is_ok());
        assert_eq!(own_activity_at(repo.path(), 123, NOW), Ok(activity(0, 123)));
    }

    #[test]
    fn the_earlier_of_author_and_committer_time_counts() {
        let repo = new_repo("earlier-time");
        let dir = repo.path();
        // Authored at T0 but committed much later (as a rebase would).
        commit_at(dir, PLAYER, T0, T0 + 5000, "authored early");
        // Committed at T0 + 100 but with an author date set in the future.
        commit_at(dir, PLAYER, T0 + 7000, T0 + 100, "authored late");

        // The later author date is remembered, so a copy of that commit is
        // not counted again.
        assert_eq!(own_activity_at(dir, 0, NOW), Ok(ahead_of(2, T0 + 100, &[T0 + 7000])));
        assert_eq!(own_activity_at(dir, T0, NOW), Ok(ahead_of(1, T0 + 100, &[T0 + 7000])));
        assert_eq!(own_activity_at(dir, T0 + 100, NOW), Ok(activity(0, T0 + 100)));
    }

    #[test]
    fn an_amended_commit_is_not_counted_again() {
        let repo = new_repo("amend");
        let dir = repo.path();
        commit(dir, PLAYER, T0, "work");
        assert_eq!(own_activity_at(dir, 0, NOW), Ok(activity(1, T0)));

        // Amending keeps the author time and stamps a new committer time.
        git_at(
            dir,
            &["commit", "--amend", "--no-edit", "--allow-empty"],
            None,
            Some(T0 + 9000),
        );
        // Counted work is not paid again...
        assert_eq!(own_activity_at(dir, T0, NOW), Ok(activity(0, T0)));
        // ...and the amended commit still counts at its original time.
        assert_eq!(own_activity_at(dir, T0 - 1, NOW), Ok(activity(1, T0)));
    }

    #[test]
    fn a_rebased_commit_is_not_counted_again() {
        let repo = new_repo("rebase");
        let dir = repo.path();
        commit_file(dir, "base", T0);
        git(dir, &["checkout", "--quiet", "-b", "feature"]);
        commit_file(dir, "feature", T0 + 100);
        git(dir, &["checkout", "--quiet", "main"]);
        commit_file(dir, "main-work", T0 + 200);

        // Before the rebase: base, feature and main-work. Remember the cursor.
        let before = own_activity_at(dir, 0, NOW).unwrap();
        assert_eq!(before, activity(3, T0 + 200));

        // Rebasing rewrites the feature commit with a much later committer
        // time but the same author time.
        git(dir, &["checkout", "--quiet", "feature"]);
        git_at(dir, &["rebase", "--quiet", "main"], None, Some(T0 + 9000));
        git(dir, &["checkout", "--quiet", "main"]);

        assert_eq!(own_activity_at(dir, before.latest, NOW), Ok(activity(0, before.latest)));
        assert_eq!(own_activity_at(dir, 0, NOW), Ok(activity(3, T0 + 200)));
    }

    #[test]
    fn a_commit_dated_ahead_of_the_clock_counts_the_first_time_it_is_seen() {
        // The day a commit counts on is the day it is first seen, so dating
        // one ahead can't move it into tomorrow's allowance.
        let repo = new_repo("future");
        let dir = repo.path();
        commit(dir, PLAYER, T0, "past");
        commit(dir, PLAYER, T0 + 1000, "recent");
        commit(dir, PLAYER, T0 + 5000, "dated ahead");

        // Seen at T0 + 2000: all three count now. The cursor stops at the
        // clock, and the commit dated ahead is remembered.
        let first = look(dir, 0, &[], T0 + 2000).unwrap();
        assert_eq!(first, ahead_of(3, T0 + 2000, &[T0 + 5000]));

        // Looked at again, with what that look remembered, it is never counted
        // again: not before its date, not on it, and not after it.
        for now in [T0 + 2060, T0 + 4999, T0 + 5000, NOW] {
            assert_eq!(look(dir, first.latest, &first.ahead, now), Ok(ahead_of(0, T0 + 2000, &[T0 + 5000])), "at {now}");
        }

        // Once newer work moves the cursor past its date, it is forgotten.
        commit(dir, PLAYER, T0 + 6000, "newer work");
        assert_eq!(look(dir, first.latest, &first.ahead, NOW), Ok(activity(1, T0 + 6000)));
    }

    #[test]
    fn a_commit_amended_ahead_of_its_author_date_is_counted_once() {
        // Authored "tomorrow" but committed now: it counts now.
        let repo = new_repo("amend-ahead");
        let dir = repo.path();
        commit_at(dir, PLAYER, T0 + 86_400, T0, "dated tomorrow");
        let first = look(dir, T0 - 1, &[], T0 + 10).unwrap();
        assert_eq!((first.count, first.latest), (1, T0));

        // Amending keeps the author date and stamps a new committer time,
        // again and again. None of the copies counts.
        for (i, at) in [T0 + 600, T0 + 1200, T0 + 1800].into_iter().enumerate() {
            git_at(dir, &["commit", "--amend", "--no-edit"], None, Some(at));
            let again = look(dir, first.latest, &first.ahead, at + 10).unwrap();
            assert_eq!(again.count, 0, "amend {i} counted again");
            assert_eq!(again, ahead_of(0, T0, &[T0 + 86_400]), "amend {i}");
        }
        assert_eq!(first, ahead_of(1, T0, &[T0 + 86_400]));
    }

    #[test]
    fn a_commit_on_several_branches_counts_once() {
        let repo = new_repo("branches");
        let dir = repo.path();
        commit(dir, PLAYER, T0, "shared");
        git(dir, &["branch", "copy-one"]);
        git(dir, &["branch", "copy-two"]);
        git(dir, &["checkout", "--quiet", "--detach"]);
        assert_eq!(own_activity_at(dir, 0, NOW), Ok(activity(1, T0)));
    }

    #[test]
    fn a_commit_reached_from_two_worktrees_counts_once() {
        let repo = new_repo("worktrees");
        let dir = repo.path();
        commit(dir, PLAYER, T0, "base");
        let other = TempDir::new("worktrees-second");
        let second = other.path().join("second");
        git(dir, &["worktree", "add", "--quiet", "-b", "feature", &second.to_string_lossy()]);
        commit(&second, PLAYER, T0 + 100, "in the second worktree");
        commit(dir, PLAYER, T0 + 200, "in the first");

        // Both folders read the same branches, so both find all three. The
        // app looks at each in turn, sharing one ledger.
        let ledger = Mutex::default();
        assert_eq!(look_in(dir, T0 - 1, &[], NOW, &ledger), Ok(activity(3, T0 + 200)));
        let again = look_in(&second, T0 - 1, &[], NOW, &ledger).unwrap();
        assert_eq!(again.count, 0, "counted again from the second worktree");
        // Passed over, with the second folder's cursor moved past them.
        assert_eq!(again, Activity { passed: 3, ..activity(0, T0 + 200) });

        // New work counts once, in whichever folder is looked at first.
        commit(&second, PLAYER, T0 + 300, "more");
        assert_eq!(look_in(&second, T0 + 200, &[], NOW, &ledger), Ok(activity(1, T0 + 300)));
        assert_eq!(look_in(dir, T0 + 200, &[], NOW, &ledger), Ok(Activity { passed: 1, ..activity(0, T0 + 300) }));
    }

    #[test]
    fn a_commit_pulled_into_a_clone_counts_once() {
        let repo = new_repo("clone-source");
        let dir = repo.path();
        commit(dir, PLAYER, T0, "pushed and pulled");
        let other = TempDir::new("clone-copy");
        git(other.path(), &["clone", "--quiet", &dir.to_string_lossy(), "copy"]);
        let copy = other.path().join("copy");
        git(&copy, &["config", "user.email", PLAYER]);

        let ledger = Mutex::default();
        assert_eq!(look_in(dir, 0, &[], NOW, &ledger), Ok(activity(1, T0)));
        assert_eq!(look_in(&copy, 0, &[], NOW, &ledger), Ok(Activity { passed: 1, ..activity(0, T0) }));
    }

    #[test]
    fn a_commit_dated_before_the_cursor_is_not_counted() {
        // Back-dated work can't land on a day that has gone: what is older
        // than the cursor was counted already, or came before watching.
        let repo = new_repo("back-dated");
        let dir = repo.path();
        commit(dir, PLAYER, T0 + 1000, "counted");
        commit_at(dir, PLAYER, T0 + 500, T0 + 500, "dated before it");
        assert_eq!(look(dir, T0 + 1000, &[], NOW), Ok(activity(0, T0 + 1000)));
    }

    #[test]
    fn the_system_clock_is_used_by_default() {
        let repo = new_repo("clock");
        let dir = repo.path();
        let now = now_seconds();
        commit(dir, PLAYER, now - 60, "a minute ago");
        let ahead = now + 2 * 86_400;
        commit(dir, PLAYER, ahead, "dated in two days");
        // Both count now; the cursor stops at the clock as the look read it.
        let found = own_activity(dir, T0, &[]).unwrap();
        assert_eq!((found.count, found.ahead.as_slice()), (2, &[ahead][..]));
        assert!((now..now + 60).contains(&found.latest), "{found:?}");
    }

    #[test]
    fn email_matching_ignores_case() {
        let repo = new_repo("case");
        commit(repo.path(), "DEV+Test@Example.com", T0, "shouty email");
        assert_eq!(own_activity_at(repo.path(), 0, NOW), Ok(activity(1, T0)));
    }

    #[test]
    fn reads_the_configured_email() {
        let repo = new_repo("email");
        assert_eq!(user_email(repo.path()).as_deref(), Ok(PLAYER));
    }

    #[test]
    fn a_blank_email_is_a_friendly_error() {
        let repo = new_repo("blank-email");
        git(repo.path(), &["config", "user.email", ""]);
        let missing = Error::NoUserEmail {
            git: WhichGit::Native,
        };
        assert_eq!(user_email(repo.path()), Err(missing.clone()));
        assert_eq!(own_activity_at(repo.path(), 0, NOW), Err(missing.clone()));
        assert!(missing.to_string().contains("user.email"));
    }

    #[test]
    fn a_folder_that_is_not_a_repository_is_rejected() {
        let dir = TempDir::new("not-a-repo");
        assert_eq!(resolve_repository(dir.path()), Err(Error::NotARepository));
    }

    #[test]
    fn the_git_folder_itself_is_not_a_work_tree() {
        let repo = new_repo("dot-git");
        assert_eq!(
            resolve_repository(&repo.path().join(".git")),
            Err(Error::NotARepository)
        );
    }

    #[test]
    fn a_missing_folder_or_a_file_is_rejected() {
        let dir = TempDir::new("missing");
        assert_eq!(
            resolve_repository(&dir.path().join("nope")),
            Err(Error::NotAFolder)
        );
        let file = dir.path().join("file.txt");
        fs::write(&file, "hello").unwrap();
        assert_eq!(resolve_repository(&file), Err(Error::NotAFolder));
        assert_eq!(own_activity(&file, 0, &[]), Err(Error::NotAFolder));
    }

    #[test]
    fn a_subfolder_resolves_to_the_top_level() {
        let repo = new_repo("top-level");
        let sub = repo.path().join("src").join("deep");
        fs::create_dir_all(&sub).unwrap();

        let from_sub = resolve_repository(&sub).unwrap();
        let from_root = resolve_repository(repo.path()).unwrap();
        assert_eq!(from_sub, from_root);

        // Compare canonical forms: the temp folder may be reached through a
        // symlink or a Windows short (8.3) name.
        assert_eq!(
            fs::canonicalize(&from_sub.path).unwrap(),
            fs::canonicalize(repo.path()).unwrap()
        );
        let folder_name = repo.path().file_name().unwrap().to_string_lossy().into_owned();
        assert_eq!(from_sub.name, folder_name);
    }

    #[test]
    fn the_name_is_the_folder_name() {
        assert_eq!(repository_name(Path::new("/home/me/projects/my-game")), "my-game");
        assert_eq!(repository_name(Path::new("relative/farm")), "farm");
    }

    #[test]
    fn a_slow_git_is_stopped_with_a_friendly_error() {
        let repo = new_repo("timeout");
        let started = Instant::now();
        // An alias that just sleeps stands in for a Git call that hangs.
        let result = Runner::for_path(repo.path()).run_within(
            &["-c", "alias.nap=!sleep 10", "nap"],
            Duration::from_millis(300),
        );
        assert_eq!(result.map(|_| ()), Err(Error::GitTimedOut));
        assert!(started.elapsed() < Duration::from_secs(8));
        assert_eq!(
            Error::GitTimedOut.to_string(),
            "Git took too long to answer for this repository."
        );
    }

    #[test]
    fn the_git_unavailable_message_fits_the_platform() {
        // An app opened from the Finder gets a minimal PATH, not the shell's,
        // and its Git is the one in Apple's command line developer tools.
        let mac = git_unavailable_message("macos");
        assert!(mac.starts_with("Git could not be run."), "{mac}");
        assert!(mac.contains("xcode-select --install"), "{mac}");
        assert!(mac.contains("Terminal"), "{mac}");
        assert!(!mac.contains("PATH"), "{mac}");
        for os in ["windows", "linux"] {
            assert_eq!(
                git_unavailable_message(os),
                "Git could not be run. Check that Git is installed and available on your PATH."
            );
        }
        assert_eq!(
            Error::GitUnavailable.to_string(),
            git_unavailable_message(std::env::consts::OS)
        );
    }

    #[test]
    fn missing_developer_tools_on_a_mac_mean_git_is_unavailable() {
        // Without the developer tools, macOS's /usr/bin/git still starts, but
        // it only prints one of these (and offers to install the tools).
        let not_installed = "xcode-select: note: No developer tools were found, requesting install.\n\
            If developer tools are located at a non-default location on disk, use `sudo xcode-select \
            --switch path/to/Xcode.app` to specify the Xcode that you wish to use for command line \
            developer tools, and cancel the installation dialog.\n\
            See `man xcode-select` for more details.\n";
        let removed = "xcrun: error: invalid active developer path (/Library/Developer/CommandLineTools), \
            missing xcrun at: /Library/Developer/CommandLineTools/usr/bin/xcrun\n";
        let folder = native("/Users/me/game");
        for stderr in [not_installed, removed] {
            assert_eq!(
                failure_from(stderr, Error::NotARepository, &folder),
                Error::GitUnavailable
            );
            assert_eq!(failure_from(stderr, Error::GitFailed, &folder), Error::GitUnavailable);
        }
        // Git's own errors keep their meaning.
        assert_eq!(
            failure_from(
                "fatal: not a git repository (or any of the parent directories): .git\n",
                Error::GitFailed,
                &folder
            ),
            Error::NotARepository
        );
        assert!(matches!(
            failure_from(
                "fatal: detected dubious ownership in repository at '/x'\n",
                Error::NotARepository,
                &folder
            ),
            Error::UntrustedFolder { .. }
        ));
        assert_eq!(
            failure_from("fatal: something else\n", Error::GitFailed, &folder),
            Error::GitFailed
        );
    }

    #[test]
    fn missing_developer_tools_are_not_mistaken_for_a_missing_email() {
        // The stand-in Git exits with 1, as `git config --get` does for an
        // unset key. A repository already added, on a Mac whose update removed
        // the tools, must not be told to set its user.email.
        let removed = "xcrun: error: invalid active developer path (/Library/Developer/CommandLineTools), \
            missing xcrun at: /Library/Developer/CommandLineTools/usr/bin/xcrun\n";
        let folder = native("/Users/me/game");
        assert_eq!(user_email_failure(Some(1), removed, &folder), Error::GitUnavailable);
        assert_eq!(
            user_email_failure(Some(1), "", &folder),
            Error::NoUserEmail {
                git: WhichGit::Native
            }
        );
        assert_eq!(user_email_failure(Some(128), "fatal: oops\n", &folder), Error::GitFailed);
        assert_eq!(user_email_failure(None, "", &folder), Error::GitFailed);
    }

    /// [`summarize`] for folder `A`, with a ledger of its own.
    fn summed(log: &str, since: u64, ahead: &[u64], now: u64) -> Activity {
        let look = Look {
            email: "a@x.com",
            since,
            ahead,
            now,
            folder: "A".to_string(),
        };
        summarize(log, &look, &mut Ledger::default())
    }

    #[test]
    fn summarize_uses_the_earlier_time_and_ignores_bad_lines() {
        // hash, author time, committer time, author email
        let log = "h1\t300\t300\ta@x.com\n\
                   h2\t200\t900\ta@x.com\n\
                   h3\t950\t100\ta@x.com\n\
                   h4\t400\t400\tb@x.com\n\
                   h5\tnot-a-number\t300\ta@x.com\n\
                   h6\ttoo\tfew\n\
                   \t600\t600\ta@x.com\n\
                   no tabs at all\n\
                   h7\t500\t500\tA@X.com\n";
        // Times for a@x.com: 300, 200, 100, 500 (the malformed lines are
        // skipped). The one authored at 950 is remembered past the cursor.
        assert_eq!(summed(log, 0, &[], 1000), ahead_of(4, 500, &[950]));
        assert_eq!(summed(log, 100, &[], 1000), activity(3, 500));
        assert_eq!(summed(log, 500, &[], 1000), activity(0, 500));
        // Commits dated after `now` count now, and the cursor stops at `now`.
        assert_eq!(summed(log, 0, &[], 300), ahead_of(4, 300, &[500, 950]));
        // Ones remembered from before are passed over.
        assert_eq!(summed(log, 300, &[500, 950], 1000), ahead_of(0, 300, &[500, 950]));
        assert_eq!(summed("", 7, &[], 1000), activity(0, 7));
        // Remembered times the cursor has passed are dropped.
        assert_eq!(summed("", 7, &[3, 7, 9], 1000), ahead_of(0, 7, &[9]));
    }

    #[test]
    fn the_ledger_passes_over_what_another_folder_counted_and_forgets_after_a_week() {
        let mut ledger = Ledger::default();
        let at = |folder: &str, now: u64| Look {
            email: "a@x.com",
            since: 0,
            ahead: &[],
            now,
            folder: folder.to_string(),
        };
        let log = "h1\t100\t100\ta@x.com\nh2\t200\t200\ta@x.com\n";
        assert_eq!(summarize(log, &at("A", 1000), &mut ledger), activity(2, 200));
        // Folder B reaches the same two commits, and a new one of its own.
        let both = "h3\t300\t300\ta@x.com\n".to_string() + log;
        let passed = Activity {
            passed: 2,
            ..activity(1, 300)
        };
        assert_eq!(summarize(&both, &at("B", 1060), &mut ledger), passed);
        // Folder A looking again from the same cursor still counts its own:
        // its cursor, not the ledger, says what it has been paid for.
        assert_eq!(summarize(log, &at("A", 1120), &mut ledger), activity(2, 200));
        // A week on, the ledger has forgotten them.
        let later = 1000 + LEDGER_KEEP_SECONDS + 1;
        assert_eq!(summarize(log, &at("C", later), &mut ledger), activity(2, 200));
    }

    fn wsl(host: &str, distro: &str, linux_path: &str) -> Location {
        Location::Wsl {
            host: host.to_string(),
            distro: distro.to_string(),
            linux_path: linux_path.to_string(),
        }
    }

    fn native(path: &str) -> Location {
        Location::Native(PathBuf::from(path))
    }

    #[test]
    fn wsl_paths_are_read_as_wsl_locations() {
        assert_eq!(
            Location::parse(r"\\wsl.localhost\Ubuntu-24.04\home\me\Projects\gitaway"),
            wsl("wsl.localhost", "Ubuntu-24.04", "/home/me/Projects/gitaway")
        );
        assert_eq!(
            Location::parse(r"\\wsl$\Ubuntu\home\me\api"),
            wsl("wsl$", "Ubuntu", "/home/me/api")
        );
    }

    #[test]
    fn wsl_paths_keep_their_spelling_in_any_case() {
        assert_eq!(
            Location::parse(r"\\WSL.LocalHost\ubuntu\Home\Me"),
            wsl("WSL.LocalHost", "ubuntu", "/Home/Me")
        );
        assert_eq!(Location::parse(r"\\WSL$\Debian\srv"), wsl("WSL$", "Debian", "/srv"));
    }

    #[test]
    fn wsl_paths_take_forward_or_mixed_slashes() {
        assert_eq!(
            Location::parse("//wsl.localhost/Ubuntu/home/me/api"),
            wsl("wsl.localhost", "Ubuntu", "/home/me/api")
        );
        assert_eq!(
            Location::parse(r"\/wsl$/Ubuntu\home/me\api"),
            wsl("wsl$", "Ubuntu", "/home/me/api")
        );
    }

    #[test]
    fn long_unc_forms_of_wsl_paths_are_wsl_locations() {
        assert_eq!(
            Location::parse(r"\\?\UNC\wsl.localhost\Ubuntu\home\me\api"),
            wsl("wsl.localhost", "Ubuntu", "/home/me/api")
        );
        assert_eq!(
            Location::parse(r"\\?\unc\wsl$\Ubuntu\home"),
            wsl("wsl$", "Ubuntu", "/home")
        );
        assert_eq!(
            Location::parse("//?/UNC/wsl.localhost/Ubuntu/srv"),
            wsl("wsl.localhost", "Ubuntu", "/srv")
        );
        assert_eq!(
            Location::parse(r"\\.\UNC\wsl.localhost\Ubuntu\srv"),
            wsl("wsl.localhost", "Ubuntu", "/srv")
        );
    }

    #[test]
    fn a_distro_root_and_trailing_slashes_tidy_up() {
        assert_eq!(Location::parse(r"\\wsl.localhost\Ubuntu"), wsl("wsl.localhost", "Ubuntu", "/"));
        assert_eq!(Location::parse(r"\\wsl.localhost\Ubuntu\"), wsl("wsl.localhost", "Ubuntu", "/"));
        assert_eq!(Location::parse("//wsl$/Ubuntu//"), wsl("wsl$", "Ubuntu", "/"));
        assert_eq!(
            Location::parse(r"\\wsl.localhost\Ubuntu\home\me\api\\"),
            wsl("wsl.localhost", "Ubuntu", "/home/me/api")
        );
        assert_eq!(
            Location::parse(r"\\wsl.localhost\Ubuntu\home\\me//api/"),
            wsl("wsl.localhost", "Ubuntu", "/home/me/api")
        );
    }

    #[test]
    fn distro_names_with_dots_dashes_and_spaces_are_kept_whole() {
        assert_eq!(
            Location::parse(r"\\wsl.localhost\Ubuntu-24.04\srv"),
            wsl("wsl.localhost", "Ubuntu-24.04", "/srv")
        );
        assert_eq!(
            Location::parse(r"\\wsl$\my.distro_2-test\home\me"),
            wsl("wsl$", "my.distro_2-test", "/home/me")
        );
        assert_eq!(
            Location::parse(r"\\wsl.localhost\Ubuntu\home\me\my game"),
            wsl("wsl.localhost", "Ubuntu", "/home/me/my game")
        );
    }

    #[test]
    fn ordinary_paths_are_native_and_unchanged() {
        for path in [
            r"C:\Users\me\code\api",
            r"D:\work",
            "C:/Users/me/code",
            r"\\server\share\code\api",
            "//server/share/code",
            r"\\?\C:\Users\me\code",
            r"\\?\UNC\server\share\code",
            "/home/me/api",
            r"relative\api",
            r"wsl.localhost\Ubuntu\home",
            "",
        ] {
            assert_eq!(Location::parse(path), native(path), "{path}");
        }
    }

    #[test]
    fn near_misses_of_wsl_paths_are_native() {
        for path in [
            // No distribution: not a folder Git can be run in.
            r"\\wsl$",
            r"\\wsl$\",
            r"\\wsl.localhost",
            r"\\wsl.localhost\",
            // Hosts that only look like WSL's.
            r"\\wsl.localhost.example.com\Ubuntu\home",
            r"\\wsl\Ubuntu\home",
            r"\\my-wsl$\Ubuntu\home",
            // Three slashes is not a UNC path.
            r"\\\wsl.localhost\Ubuntu\home",
            // An empty distribution name.
            r"\\wsl.localhost\\Ubuntu\home",
        ] {
            assert_eq!(Location::parse(path), native(path), "{path}");
        }
    }

    #[test]
    fn paths_beyond_ascii_are_read_without_tripping() {
        for path in [r"\\é\share", r"\\?é\UNC\x", r"\\?\ÜNC\wsl$\Ubuntu", "\\\\"] {
            assert_eq!(Location::parse(path), native(path), "{path}");
        }
        assert_eq!(
            Location::parse(r"\\wsl.localhost\Übuntu\home\zoë\café"),
            wsl("wsl.localhost", "Übuntu", "/home/zoë/café")
        );
    }

    #[test]
    fn wsl_paths_only_mean_wsl_on_windows() {
        let path = Path::new(r"\\wsl.localhost\Ubuntu\home\me\api");
        let expected = if cfg!(windows) {
            wsl("wsl.localhost", "Ubuntu", "/home/me/api")
        } else {
            Location::Native(path.to_path_buf())
        };
        assert_eq!(Location::of(path), expected);
        assert_eq!(Location::of(Path::new(r"C:\code\api")), native(r"C:\code\api"));
        assert_eq!(Location::of(Path::new("/home/me/api")), native("/home/me/api"));
    }

    /// The program and arguments of `command`, as text.
    fn argv(command: &Command) -> Vec<String> {
        std::iter::once(command.get_program())
            .chain(command.get_args())
            .map(|arg| arg.to_string_lossy().into_owned())
            .collect()
    }

    /// `Some(Some(value))` if `command` sets `name`, `Some(None)` if it
    /// removes it, `None` if it leaves it as inherited.
    fn env_of(command: &Command, name: &str) -> Option<Option<String>> {
        command
            .get_envs()
            .find(|(key, _)| *key == name)
            .map(|(_, value)| value.map(|value| value.to_string_lossy().into_owned()))
    }

    fn set(value: &str) -> Option<Option<String>> {
        Some(Some(value.to_string()))
    }

    const OPTIONS: [&str; 6] = [
        "--no-pager",
        "--no-optional-locks",
        "-c",
        "log.showSignature=false",
        "-c",
        "core.fsmonitor=false",
    ];

    #[test]
    fn a_native_folder_is_read_by_the_git_on_the_path() {
        let runner = Runner::new(native(r"C:\code\my api"));
        let command = runner.command(&["rev-parse", "--is-inside-work-tree", "--show-toplevel"]);
        let mut expected = vec!["git"];
        expected.extend(OPTIONS);
        expected.extend(["-C", r"C:\code\my api"]);
        expected.extend(["rev-parse", "--is-inside-work-tree", "--show-toplevel"]);
        assert_eq!(argv(&command), expected);

        assert_eq!(env_of(&command, "GIT_TERMINAL_PROMPT"), set("0"));
        assert_eq!(env_of(&command, "LC_ALL"), set("C"));
        for variable in ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"] {
            assert_eq!(env_of(&command, variable), Some(None), "{variable}");
        }
        assert_eq!(env_of(&command, "WSLENV"), None);
    }

    #[test]
    fn a_wsl_folder_is_read_by_the_git_inside_its_distro() {
        let runner = Runner::new(wsl("wsl.localhost", "Ubuntu-24.04", "/home/me/my api"));
        let command = runner.command(&["log", "--author=me@example.com", "--since=1700000001"]);
        let mut expected = vec![
            "wsl.exe",
            "-d",
            "Ubuntu-24.04",
            "--cd",
            "/home/me/my api",
            "--exec",
            "git",
        ];
        expected.extend(OPTIONS);
        expected.extend(["log", "--author=me@example.com", "--since=1700000001"]);
        assert_eq!(argv(&command), expected);

        // The same environment, handed on into Linux, and wsl.exe's own
        // messages in UTF-8 rather than UTF-16.
        assert_eq!(env_of(&command, "GIT_TERMINAL_PROMPT"), set("0"));
        assert_eq!(env_of(&command, "LC_ALL"), set("C"));
        assert_eq!(env_of(&command, "WSLENV"), set("GIT_TERMINAL_PROMPT:LC_ALL"));
        assert_eq!(env_of(&command, "WSL_UTF8"), set("1"));
    }

    #[test]
    fn a_wsl_top_level_is_written_back_the_way_it_was_picked() {
        let picked = wsl("wsl.localhost", "Ubuntu-24.04", "/home/me/Projects/gitaway/src");
        assert_eq!(
            picked.repository("/home/me/Projects/gitaway"),
            Repository {
                path: PathBuf::from(r"\\wsl.localhost\Ubuntu-24.04\home\me\Projects\gitaway"),
                name: "gitaway".to_string(),
            }
        );
        // The host and the distribution keep the spelling they were picked with.
        assert_eq!(
            wsl("WSL$", "ubuntu", "/srv/game").repository("/srv/game"),
            Repository {
                path: PathBuf::from(r"\\WSL$\ubuntu\srv\game"),
                name: "game".to_string(),
            }
        );
        // A repository at the distribution's root has no folder name.
        assert_eq!(
            wsl("wsl.localhost", "Ubuntu", "/").repository("/"),
            Repository {
                path: PathBuf::from(r"\\wsl.localhost\Ubuntu\"),
                name: r"\\wsl.localhost\Ubuntu\".to_string(),
            }
        );
        // What is saved reads back as the same place.
        let saved = picked.repository("/home/me/Projects/gitaway").path;
        assert_eq!(
            Location::parse(&saved.to_string_lossy()),
            wsl("wsl.localhost", "Ubuntu-24.04", "/home/me/Projects/gitaway")
        );
    }

    /// Stands in for wsl.exe on Linux and macOS. It takes
    /// `-d <distro> --cd <dir> --exec <program> <args…>`, notes the
    /// distribution in `calls` beside itself, and answers the failures Gitaway
    /// tells apart the way wsl.exe 2.x does: distribution `NoSuchDistro` does
    /// not exist, distribution `NoGit` has no `git`, and a missing `--cd`
    /// folder is reported on stderr while the program still runs, in `/`.
    #[cfg(unix)]
    fn fake_wsl(dir: &Path) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let script = r#"#!/bin/sh
if [ "$1" != "-d" ] || [ "$3" != "--cd" ] || [ "$5" != "--exec" ]; then
  echo "unexpected arguments: $*" >&2
  exit 90
fi
distro=$2
folder=$4
shift 5
echo "$distro $*" >> "$(dirname "$0")/calls"
if [ "$distro" = "NoSuchDistro" ]; then
  printf 'There is no distribution with the supplied name.\r\nError code: Wsl/Service/WSL_E_DISTRO_NOT_FOUND\r\n'
  exit 127
fi
if [ "$distro" = "NoGit" ]; then
  PATH=/nonexistent
fi
if ! cd "$folder" 2>/dev/null; then
  echo "<3>WSL (4242 - Relay) ERROR: CreateProcessCommon:810: chdir($folder) failed 2" >&2
  cd /
fi
if ! command -v "$1" >/dev/null 2>&1; then
  echo "<3>WSL (4242 - Relay) ERROR: CreateProcessCommon:818: execvpe($1) failed: No such file or directory" >&2
  exit 1
fi
exec "$@"
"#;
        let program = dir.join("wsl.exe");
        fs::write(&program, script).expect("write fake wsl.exe");
        fs::set_permissions(&program, fs::Permissions::from_mode(0o755)).expect("chmod");
        program
    }

    /// A runner for `linux_path` in `distro`, through the fake wsl.exe.
    #[cfg(unix)]
    fn through_fake_wsl(fake: &Path, distro: &str, linux_path: &Path) -> Runner {
        Runner {
            location: wsl("wsl.localhost", distro, &linux_path.to_string_lossy()),
            wsl: fake.as_os_str().to_os_string(),
        }
    }

    #[cfg(unix)]
    #[test]
    fn a_wsl_folder_is_added_and_checked_inside_wsl() {
        let tools = TempDir::new("fake-wsl");
        let fake = fake_wsl(tools.path());
        let repo = new_repo("wsl-repo");
        commit(repo.path(), PLAYER, T0, "first");
        commit(repo.path(), PLAYER, T0 + 100, "second");
        let sub = repo.path().join("src");
        fs::create_dir_all(&sub).unwrap();

        // Adding: picking a subfolder resolves to the top level, written as
        // the WSL path it was picked with.
        let top = fs::canonicalize(repo.path()).unwrap();
        let added = resolve(&through_fake_wsl(&fake, "Ubuntu", &sub)).unwrap();
        let expected = format!(r"\\wsl.localhost\Ubuntu{}", top.to_string_lossy().replace('/', "\\"));
        assert_eq!(added.path, PathBuf::from(&expected));
        assert_eq!(added.name, repo.path().file_name().unwrap().to_string_lossy());

        // Checking: the saved path is read inside WSL again.
        let saved = Runner {
            location: Location::parse(&added.path.to_string_lossy()),
            wsl: fake.as_os_str().to_os_string(),
        };
        assert_eq!(activity_at(&saved, 0, &[], NOW, &Mutex::default()), Ok(activity(2, T0 + 100)));
        assert_eq!(activity_at(&saved, T0, &[], NOW, &Mutex::default()), Ok(activity(1, T0 + 100)));

        // Every Git call went through wsl.exe, into Ubuntu.
        let calls = fs::read_to_string(tools.path().join("calls")).unwrap();
        assert!(calls.lines().count() >= 7, "{calls}");
        assert!(calls.lines().all(|call| call.starts_with("Ubuntu git --no-pager ")), "{calls}");
    }

    #[cfg(unix)]
    #[test]
    fn wsl_failures_are_told_apart_through_wsl_exe() {
        let tools = TempDir::new("fake-wsl-failures");
        let fake = fake_wsl(tools.path());
        let repo = new_repo("wsl-failures");
        commit(repo.path(), PLAYER, T0, "first");
        let plain = TempDir::new("wsl-plain");

        let resolved = |distro: &str, path: &Path| resolve(&through_fake_wsl(&fake, distro, path));
        assert_eq!(
            resolved("NoSuchDistro", repo.path()),
            Err(Error::WslDistroNotFound {
                distro: "NoSuchDistro".to_string()
            })
        );
        assert_eq!(
            resolved("NoGit", repo.path()),
            Err(Error::WslGitMissing {
                distro: "NoGit".to_string()
            })
        );
        // wsl.exe runs Git in `/` when the folder is missing; that must not
        // count as reading it.
        assert_eq!(resolved("Ubuntu", &repo.path().join("gone")), Err(Error::NotAFolder));
        assert_eq!(
            activity_at(&through_fake_wsl(&fake, "Ubuntu", &repo.path().join("gone")), 0, &[], NOW, &Mutex::default()),
            Err(Error::NotAFolder)
        );
        assert_eq!(resolved("Ubuntu", plain.path()), Err(Error::NotARepository));

        // No wsl.exe at all.
        let mut no_wsl = through_fake_wsl(&fake, "Ubuntu", repo.path());
        no_wsl.wsl = tools.path().join("missing-wsl.exe").into_os_string();
        assert_eq!(resolve(&no_wsl), Err(Error::WslUnavailable));

        // The email comes from the Git inside the distribution.
        git(repo.path(), &["config", "user.email", ""]);
        assert_eq!(
            activity_at(&through_fake_wsl(&fake, "Ubuntu", repo.path()), 0, &[], NOW, &Mutex::default()),
            Err(Error::NoUserEmail {
                git: WhichGit::Wsl {
                    distro: "Ubuntu".to_string()
                }
            })
        );
    }

    /// What wsl.exe 2.x printed on Windows 10 for each failure (WSL_UTF8=1).
    const DISTRO_NOT_FOUND: &str = "There is no distribution with the supplied name.\r\n\
                                    Error code: Wsl/Service/WSL_E_DISTRO_NOT_FOUND\r\n";
    const NO_GIT: &str = "<3>WSL (178902 - Relay) ERROR: CreateProcessCommon:818: \
                          execvpe(git) failed: No such file or directory\n";
    const NO_FOLDER: &str =
        "<3>WSL (179040 - Relay) ERROR: CreateProcessCommon:810: chdir(/no/such/dir) failed 2\n";

    #[test]
    fn wsl_exe_problems_are_told_apart_from_git_ones() {
        let ubuntu = || "Ubuntu".to_string();
        assert_eq!(
            wsl_problem(false, DISTRO_NOT_FOUND, "", "Ubuntu"),
            Some(Error::WslDistroNotFound { distro: ubuntu() })
        );
        assert_eq!(
            wsl_problem(false, "", NO_GIT, "Ubuntu"),
            Some(Error::WslGitMissing { distro: ubuntu() })
        );
        // wsl.exe goes on in `/` after a failed chdir, so Git may even succeed.
        assert_eq!(wsl_problem(true, "true\n/\n", NO_FOLDER, "Ubuntu"), Some(Error::NotAFolder));
        assert_eq!(wsl_problem(false, "", NO_FOLDER, "Ubuntu"), Some(Error::NotAFolder));
        assert_eq!(
            wsl_problem(false, "The service failed.\r\nError code: Wsl/Service/E_UNEXPECTED\r\n", "", "Ubuntu"),
            Some(Error::WslUnavailable)
        );
        // Git's own output is left to Git's own checks.
        assert_eq!(
            wsl_problem(
                false,
                "",
                "fatal: not a git repository (or any of the parent directories): .git\n",
                "Ubuntu"
            ),
            None
        );
        assert_eq!(wsl_problem(true, "true\n/home/me/api\n", "", "Ubuntu"), None);
        assert_eq!(wsl_problem(false, "", "error: chdir(x) failed\n", "Ubuntu"), None);
        assert_eq!(wsl_problem(true, "Error code: Wsl/Service/WSL_E_DISTRO_NOT_FOUND\n", "", "Ubuntu"), None);
    }

    /// What Windows Git printed for \\wsl.localhost\Ubuntu-24.04\home\me\Projects\gitaway.
    const DUBIOUS_UNC: &str = "fatal: detected dubious ownership in repository at \
        '//wsl.localhost/Ubuntu-24.04/home/me/Projects/gitaway'\n\
        To add an exception for this directory, call:\n\n\
        \tgit config --global --add safe.directory \
        '%(prefix)///wsl.localhost/Ubuntu-24.04/home/me/Projects/gitaway'\n";

    fn untrusted(stderr: &str, location: &Location) -> Error {
        failure_from(stderr, Error::GitFailed, location)
    }

    #[test]
    fn an_untrusted_unc_folder_gets_the_exact_safe_directory_command() {
        let error = untrusted(DUBIOUS_UNC, &native(r"\\wsl.localhost\Ubuntu-24.04\home\me\Projects\gitaway\src"));
        assert_eq!(
            error,
            Error::UntrustedFolder {
                folder: "//wsl.localhost/Ubuntu-24.04/home/me/Projects/gitaway".to_string(),
                git: WhichGit::Native,
            }
        );
        let command = "git config --global --add safe.directory \
                       '%(prefix)///wsl.localhost/Ubuntu-24.04/home/me/Projects/gitaway'";
        assert_eq!(error.command().as_deref(), Some(command));
        assert_eq!(
            error.message_on("windows"),
            format!(
                r"Git won't read \\wsl.localhost\Ubuntu-24.04\home\me\Projects\gitaway because another user owns it. If the folder is yours, mark it as safe by running `{command}` in PowerShell or Git Bash, then try again."
            )
        );
    }

    #[test]
    fn an_untrusted_drive_folder_gets_the_exact_safe_directory_command() {
        let stderr = "fatal: detected dubious ownership in repository at 'D:/shared/api'\n\
                      'D:/shared/api' is owned by:\n\tBUILTIN/Administrators (S-1-5-32-544)\n";
        let error = untrusted(stderr, &native(r"D:\shared\api"));
        assert_eq!(error.command().as_deref(), Some("git config --global --add safe.directory 'D:/shared/api'"));
        assert_eq!(
            error.message_on("windows"),
            r"Git won't read D:\shared\api because another user owns it. If the folder is yours, mark it as safe by running `git config --global --add safe.directory 'D:/shared/api'` in PowerShell or Git Bash, then try again."
        );
        // PowerShell and Git Bash both read an apostrophe inside double quotes.
        let stderr = "fatal: detected dubious ownership in repository at 'C:/Users/O'Neil/api'\n";
        assert_eq!(
            untrusted(stderr, &native(r"C:\Users\O'Neil\api")).command().as_deref(),
            Some(r#"git config --global --add safe.directory "C:/Users/O'Neil/api""#)
        );
    }

    #[test]
    fn an_untrusted_folder_inside_wsl_is_fixed_inside_wsl() {
        let stderr = "fatal: detected dubious ownership in repository at '/home/o'neil/api'\n";
        let error = untrusted(stderr, &wsl("wsl.localhost", "Ubuntu", "/home/o'neil/api/src"));
        assert_eq!(
            error,
            Error::UntrustedFolder {
                folder: "/home/o'neil/api".to_string(),
                git: WhichGit::Wsl {
                    distro: "Ubuntu".to_string()
                },
            }
        );
        let command = r"git config --global --add safe.directory '/home/o'\''neil/api'";
        assert_eq!(error.command().as_deref(), Some(command));
        assert_eq!(
            error.to_string(),
            format!("Git in Ubuntu won't read /home/o'neil/api because another user owns it. If the folder is yours, mark it as safe by running `{command}` in Ubuntu, then try again.")
        );
    }

    #[test]
    fn an_untrusted_folder_git_does_not_name_falls_back_to_the_picked_one() {
        let stderr = "fatal: detected dubious ownership in repository\n";
        assert_eq!(
            untrusted(stderr, &native(r"\\server\share\api")).command().as_deref(),
            Some("git config --global --add safe.directory '%(prefix)///server/share/api'")
        );
        assert_eq!(
            untrusted(stderr, &native(r"C:\code\api")).command().as_deref(),
            Some("git config --global --add safe.directory 'C:/code/api'")
        );
        assert_eq!(
            untrusted(stderr, &wsl("wsl$", "Debian", "/srv/api")).command().as_deref(),
            Some("git config --global --add safe.directory '/srv/api'")
        );
    }

    #[test]
    fn fixes_on_a_mac_or_linux_name_their_terminal_not_windows() {
        // Only Windows has PowerShell, Git Bash and a second Git inside WSL.
        let command = r#"git config --global user.email "you@example.com""#;
        let no_email = Error::NoUserEmail {
            git: WhichGit::Native,
        };
        assert_eq!(
            no_email.message_on("macos"),
            format!("Git has no user.email for this repository, so your commits can't be told apart. Set the email you commit with by running `{command}` in Terminal, then try again.")
        );
        assert_eq!(
            no_email.message_on("linux"),
            format!("Git has no user.email for this repository, so your commits can't be told apart. Set the email you commit with by running `{command}` in a terminal, then try again.")
        );

        let stderr = "fatal: detected dubious ownership in repository at '/Users/me/game'\n";
        let refused = untrusted(stderr, &native("/Users/me/game/src"));
        let fix = "git config --global --add safe.directory '/Users/me/game'";
        assert_eq!(refused.command().as_deref(), Some(fix));
        assert_eq!(
            refused.message_on("macos"),
            format!("Git won't read /Users/me/game because another user owns it. If the folder is yours, mark it as safe by running `{fix}` in Terminal, then try again.")
        );
        assert_eq!(
            refused.message_on("linux"),
            format!("Git won't read /Users/me/game because another user owns it. If the folder is yours, mark it as safe by running `{fix}` in a terminal, then try again.")
        );

        // The app shows the wording for the computer it runs on.
        for error in [&no_email, &refused] {
            assert_eq!(error.to_string(), error.message_on(std::env::consts::OS));
        }
    }

    #[test]
    fn a_missing_email_says_which_git_needs_it() {
        let command = r#"git config --global user.email "you@example.com""#;
        let windows = Error::NoUserEmail {
            git: WhichGit::Native,
        };
        assert_eq!(windows.command().as_deref(), Some(command));
        assert_eq!(
            windows.message_on("windows"),
            format!("Windows Git has no user.email for this repository, so your commits can't be told apart. Set the email you commit with by running `{command}` in PowerShell or Git Bash, then try again.")
        );
        let inside = Error::NoUserEmail {
            git: WhichGit::Wsl {
                distro: "Ubuntu-24.04".to_string(),
            },
        };
        assert_eq!(inside.command().as_deref(), Some(command));
        assert_eq!(
            inside.to_string(),
            format!("Git inside Ubuntu-24.04 has no user.email for this repository, so your commits can't be told apart. Set the email you commit with by running `{command}` in Ubuntu-24.04, then try again.")
        );
    }

    #[test]
    fn wsl_problems_say_what_to_do() {
        let no_git = Error::WslGitMissing {
            distro: "Ubuntu-24.04".to_string(),
        };
        assert_eq!(
            no_git.to_string(),
            "Git isn't installed in Ubuntu-24.04. Install it there with `sudo apt install git`, or pick a folder on a Windows drive."
        );
        assert_eq!(no_git.command().as_deref(), Some("sudo apt install git"));

        let no_distro = Error::WslDistroNotFound {
            distro: "Ubuntu".to_string(),
        };
        assert_eq!(
            no_distro.to_string(),
            "WSL has no distribution called Ubuntu. Run `wsl --list --verbose` to see the ones you have, or pick a folder on a Windows drive."
        );
        assert_eq!(no_distro.command().as_deref(), Some("wsl --list --verbose"));

        assert_eq!(
            Error::WslUnavailable.to_string(),
            "WSL could not be started, so folders inside Linux can't be read. Check that WSL is installed and working, or pick a folder on a Windows drive."
        );
        assert_eq!(Error::WslUnavailable.command(), None);
    }

    /// Reads a real repository inside WSL. Off by default, since CI has no
    /// WSL distribution. On Windows with one, run for example
    /// `set GITAWAY_LIVE_WSL_REPO=\\wsl.localhost\Ubuntu\home\me\project`
    /// then `cargo test -p git-activity -- --ignored live_wsl`.
    #[test]
    #[ignore = "needs Windows, WSL and a repository in it (GITAWAY_LIVE_WSL_REPO)"]
    fn live_wsl_repository_is_read_inside_wsl() {
        let Ok(picked) = std::env::var("GITAWAY_LIVE_WSL_REPO") else {
            return;
        };
        if !cfg!(windows) {
            return;
        }
        let picked = PathBuf::from(picked);
        assert!(matches!(Location::of(&picked), Location::Wsl { .. }), "{picked:?}");
        let repository = resolve_repository(&picked).expect("resolve inside WSL");
        assert!(repository.path.to_string_lossy().starts_with(r"\\"), "{repository:?}");
        let email = user_email(&repository.path).expect("the distribution's user.email");
        assert!(email.contains('@'));
        own_activity(&repository.path, 0, &[]).expect("count inside WSL");
    }

    #[test]
    fn every_error_has_a_stable_kind() {
        let distro = || "Ubuntu".to_string();
        let kinds: Vec<(&str, Option<String>)> = [
            Error::NotAFolder,
            Error::GitUnavailable,
            Error::NotARepository,
            Error::UntrustedFolder {
                folder: "C:/code/api".to_string(),
                git: WhichGit::Native,
            },
            Error::NoUserEmail {
                git: WhichGit::Native,
            },
            Error::GitTimedOut,
            Error::GitFailed,
            Error::WslUnavailable,
            Error::WslDistroNotFound { distro: distro() },
            Error::WslGitMissing { distro: distro() },
        ]
        .iter()
        .map(|error| (error.kind(), error.command()))
        .collect();
        let kinds: Vec<(&str, bool)> = kinds.into_iter().map(|(kind, command)| (kind, command.is_some())).collect();
        assert_eq!(
            kinds,
            [
                ("not-a-folder", false),
                ("git-unavailable", false),
                ("not-a-repository", false),
                ("untrusted-folder", true),
                ("no-user-email", true),
                ("git-timed-out", false),
                ("git-failed", false),
                ("wsl-unavailable", false),
                ("wsl-distro-not-found", true),
                ("wsl-git-missing", true),
            ]
        );
    }
}
