//! Gitaway's desktop shell.
//!
//! The game itself is the web app in `../dist`. This shell adds exactly two
//! things the browser cannot do, so the game can grow with the player's own
//! Git commits:
//!
//! * `pick_repository` opens a native folder picker and resolves the folder to
//!   its Git work tree's top level.
//! * `repository_activity` counts the player's own commits since a time, on
//!   local branches only, leaving out merges and empty commits.
//!
//! Privacy: only the folder the player picked, and counts and times, cross
//! into the web view. Commit messages, file names and diffs are never read,
//! commit hashes stay in the git-activity crate's memory, nothing is logged,
//! and the app makes no network requests (the dialog plugin is the only
//! plugin, and there is no updater).

use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::AppHandle;
use tauri_plugin_dialog::DialogExt;

/// Shown if a background task dies before it can report a result.
const TRY_AGAIN: &str = "Something went wrong while checking the repository. Please try again.";

/// Why a command failed, as the web view receives it: a stable `kind` it
/// words its heading by, the sentence to show, and the command that fixes
/// the problem, where one does.
#[derive(Debug, Serialize)]
struct CommandError {
    kind: &'static str,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    command: Option<String>,
}

impl CommandError {
    fn new(kind: &'static str, message: &str) -> CommandError {
        CommandError {
            kind,
            message: message.to_string(),
            command: None,
        }
    }
}

impl From<git_activity::Error> for CommandError {
    fn from(error: git_activity::Error) -> CommandError {
        CommandError {
            kind: error.kind(),
            message: error.to_string(),
            command: error.command(),
        }
    }
}

/// The repository the player picked.
#[derive(Debug, Serialize)]
struct PickedRepository {
    /// The work tree's top-level folder. Picking a subfolder of a project
    /// resolves to the same path as picking the project itself.
    path: String,
    /// That folder's name, for display.
    name: String,
}

/// The player's own commits since a point in time.
#[derive(Debug, Serialize)]
struct RepositoryActivity {
    /// Own commits that are new: not merges or empty, with `since < time`,
    /// where `time` is the earlier of the commit's author time and committer
    /// time, and not among those counted ahead of their dates before.
    count: u64,
    /// `time` (Unix seconds) of the newest of them, never later than now, or
    /// `since` when `count` is 0.
    latest: u64,
    /// Author times of commits counted ahead of their dates, to hand back as
    /// `ahead` next time. Left out when there are none.
    #[serde(skip_serializing_if = "Vec::is_empty")]
    ahead: Vec<u64>,
    /// Commits passed over because another watched folder (a worktree or
    /// clone of the same repository) counted them; `latest` has moved past
    /// them. Left out when there are none.
    #[serde(skip_serializing_if = "is_zero")]
    passed: u64,
}

fn is_zero(n: &u64) -> bool {
    *n == 0
}

/// Opens a native folder picker. Returns `None` if the player cancels, and a
/// friendly error if the folder is not inside a Git work tree, Git cannot be
/// run, or Git does not answer in time. A folder inside WSL
/// (`\\wsl.localhost\<distro>\…`) is read by the Git in that distribution.
#[tauri::command]
async fn pick_repository(app: AppHandle) -> Result<Option<PickedRepository>, CommandError> {
    // Blocks until the dialog closes. That is fine here: async commands run on
    // the async runtime, not on the main (UI) thread.
    let picked = app
        .dialog()
        .file()
        .set_title("Choose your Git repository")
        .blocking_pick_folder();

    let Some(picked) = picked else {
        return Ok(None);
    };
    let path: PathBuf = picked
        .into_path()
        .map_err(|_| CommandError::new("unusable-folder", "That folder cannot be used."))?;

    tauri::async_runtime::spawn_blocking(move || -> Result<Option<PickedRepository>, CommandError> {
        let repository = git_activity::resolve_repository(&path)?;
        Ok(Some(PickedRepository {
            path: repository.path.to_string_lossy().into_owned(),
            name: repository.name,
        }))
    })
    .await
    .map_err(|_| CommandError::new("interrupted", TRY_AGAIN))?
}

/// Counts the player's own commits in `path` that are newer than `since`
/// (Unix seconds), on local branches only, leaving out merges and empty
/// commits. A commit's time is the earlier of its author and committer time,
/// so rebased or amended work that was already counted is not counted again.
/// A commit dated ahead of the clock counts when it is first seen; `ahead`
/// (optional) is the last answer's `ahead`, so it isn't counted twice. A
/// commit another watched folder counted in this run is passed over.
#[tauri::command]
async fn repository_activity(
    path: String,
    since: f64,
    ahead: Option<Vec<f64>>,
) -> Result<RepositoryActivity, CommandError> {
    let since = unix_seconds(since);
    let ahead: Vec<u64> = ahead
        .unwrap_or_default()
        .into_iter()
        .take(git_activity::AHEAD_MAX)
        .map(unix_seconds)
        .collect();

    tauri::async_runtime::spawn_blocking(move || -> Result<RepositoryActivity, CommandError> {
        let activity = git_activity::own_activity(Path::new(&path), since, &ahead)?;
        Ok(RepositoryActivity {
            count: activity.count,
            latest: activity.latest,
            ahead: activity.ahead,
            passed: activity.passed,
        })
    })
    .await
    .map_err(|_| CommandError::new("interrupted", TRY_AGAIN))?
}

/// JavaScript numbers arrive as `f64`. Whole seconds are expected, but a
/// fractional or negative value is tolerated rather than rejected.
fn unix_seconds(value: f64) -> u64 {
    if value.is_finite() && value > 0.0 {
        value.floor() as u64
    } else {
        0
    }
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            pick_repository,
            repository_activity
        ])
        .run(tauri::generate_context!())
        .expect("error while running Gitaway");
}
