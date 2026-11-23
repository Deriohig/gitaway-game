// Hide the extra console window that Windows opens for release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    gitaway_lib::run()
}
