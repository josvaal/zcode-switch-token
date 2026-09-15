// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // WebKitGTK's DMABUF renderer fails on NVIDIA/VM setups (black window and
    // "Failed to create GBM buffer"); force the classic GL path on Linux.
    // Pre-set env vars always win, so the user can still override this.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    zcode_switch_token_lib::run()
}
