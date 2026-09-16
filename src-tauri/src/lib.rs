use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::fs;
use std::path::PathBuf;
use std::time::Duration;
use tauri::Manager;

const QUOTA_URL: &str = "https://api.z.ai/api/monitor/usage/quota/limit";

/// zcode providers that receive the active token. On a fresh machine zcode
/// resolves the z.ai provider through either of these entries, so the key is
/// written to both and stale "not authenticated" flags are cleared. Adjust
/// this list if zcode changes its provider ids.
const ZCODE_PROVIDER_IDS: &[&str] = &["builtin:zai", "builtin:zai-coding-plan"];

/// OpenCode auth.json provider ids that receive the active token (the store
/// written by `opencode auth login` / `/connect`). "zai-coding-plan" is the
/// GLM Coding Plan entry, "zai" the pay-per-use API one.
const OPENCODE_PROVIDER_IDS: &[&str] = &["zai-coding-plan", "zai"];

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct TokenEntry {
    pub id: String,
    pub label: String,
    pub token: String,
}

/// Which coding agents the active token is applied to.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct SwitchTargets {
    pub zcode: bool,
    pub opencode: bool,
}

impl Default for SwitchTargets {
    fn default() -> Self {
        Self {
            zcode: true,
            opencode: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct AppState {
    pub tokens: Vec<TokenEntry>,
    pub active_id: Option<String>,
    pub targets: SwitchTargets,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentPath {
    pub agent: String,
    pub path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppliedTarget {
    pub agent: String,
    pub path: String,
    pub backup_path: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyResult {
    pub applied: Vec<AppliedTarget>,
}

/// zcode config location per OS (resolved from the user home directory):
///   Linux:   /home/<user>/.zcode/v2/config.json
///   Windows: C:\Users\<user>\.zcode\v2\config.json
///   macOS:   /Users/<user>/.zcode/v2/config.json
fn zcode_config_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "could not resolve the user home directory".to_string())?;
    Ok(home.join(".zcode").join("v2").join("config.json"))
}

/// OpenCode credential store (same XDG-style location on all platforms,
/// written by `opencode auth login` / `/connect`):
///   <home>/.local/share/opencode/auth.json
fn opencode_auth_path() -> Result<PathBuf, String> {
    let home = dirs::home_dir()
        .ok_or_else(|| "could not resolve the user home directory".to_string())?;
    Ok(home
        .join(".local")
        .join("share")
        .join("opencode")
        .join("auth.json"))
}

fn state_file_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_config_dir()
        .map_err(|e| format!("could not resolve app config dir: {e}"))?;
    fs::create_dir_all(&dir).map_err(|e| format!("could not create app config dir: {e}"))?;
    Ok(dir.join("tokens.json"))
}

fn write_json_atomic(path: &PathBuf, value: &Value) -> Result<(), String> {
    let tmp = path.with_extension("tmp");
    let data = serde_json::to_string_pretty(value).map_err(|e| e.to_string())?;
    fs::write(&tmp, data).map_err(|e| format!("could not write {}: {e}", tmp.display()))?;
    fs::rename(&tmp, path).map_err(|e| format!("could not replace {}: {e}", path.display()))?;
    // The file holds API keys; keep it private where the OS supports it.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = fs::set_permissions(path, fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

fn read_json_or_empty(path: &PathBuf, what: &str) -> Result<Value, String> {
    if !path.exists() {
        return Ok(json!({}));
    }
    let raw = fs::read_to_string(path)
        .map_err(|e| format!("could not read {} ({}): {e}", what, path.display()))?;
    serde_json::from_str(&raw).map_err(|e| format!("{} is not valid JSON: {e}", what))
}

fn backup(path: &PathBuf) -> Result<Option<String>, String> {
    if !path.exists() {
        return Ok(None);
    }
    let bak = path.with_extension("json.bak");
    fs::copy(path, &bak).map_err(|e| format!("could not back up {}: {e}", path.display()))?;
    Ok(Some(bak.display().to_string()))
}

#[tauri::command]
async fn load_state(app: tauri::AppHandle) -> Result<AppState, String> {
    let path = state_file_path(&app)?;
    if !path.exists() {
        return Ok(AppState::default());
    }
    let raw =
        fs::read_to_string(&path).map_err(|e| format!("could not read stored state: {e}"))?;
    serde_json::from_str(&raw).map_err(|e| format!("stored state is corrupt: {e}"))
}

#[tauri::command]
async fn save_state(app: tauri::AppHandle, state: AppState) -> Result<(), String> {
    let path = state_file_path(&app)?;
    let value = serde_json::to_value(&state).map_err(|e| e.to_string())?;
    write_json_atomic(&path, &value)
}

#[tauri::command]
async fn target_paths() -> Result<Vec<AgentPath>, String> {
    let zcode = zcode_config_path()?.display().to_string();
    let opencode = opencode_auth_path()?.display().to_string();
    Ok(vec![
        AgentPath {
            agent: "zcode".into(),
            path: zcode,
        },
        AgentPath {
            agent: "opencode".into(),
            path: opencode,
        },
    ])
}

/// Write the token into zcode's config without touching anything else.
/// A one-shot `config.json.bak` backup is kept from the previous version.
fn apply_zcode(token: &str) -> Result<AppliedTarget, String> {
    let path = zcode_config_path()?;
    let parent = path
        .parent()
        .ok_or_else(|| "invalid zcode config path".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|e| format!("could not create {}: {e}", parent.display()))?;

    let mut config = read_json_or_empty(&path, "zcode config")?;
    let backup_path = backup(&path)?;

    let root = config
        .as_object_mut()
        .ok_or_else(|| "zcode config root is not a JSON object".to_string())?;
    let providers = root
        .entry("provider".to_string())
        .or_insert_with(|| Value::Object(Map::new()));
    let providers = providers
        .as_object_mut()
        .ok_or_else(|| "\"provider\" section is not a JSON object".to_string())?;

    for id in ZCODE_PROVIDER_IDS {
        let entry = providers
            .entry((*id).to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        let entry = entry
            .as_object_mut()
            .ok_or_else(|| format!("provider \"{id}\" is not a JSON object"))?;
        let options = entry
            .entry("options".to_string())
            .or_insert_with(|| Value::Object(Map::new()));
        options
            .as_object_mut()
            .ok_or_else(|| format!("provider \"{id}\" options is not a JSON object"))?
            .insert("apiKey".to_string(), Value::String(token.to_string()));
        // Drop stale auth flags so zcode does not keep the provider disabled.
        entry.remove("systemDisabledReason");
    }

    write_json_atomic(&path, &config)?;
    Ok(AppliedTarget {
        agent: "zcode".into(),
        path: path.display().to_string(),
        backup_path,
    })
}

/// Write the token into OpenCode's credential store (auth.json). Only the
/// known z.ai provider entries are touched; everything else is preserved.
fn apply_opencode(token: &str) -> Result<AppliedTarget, String> {
    let path = opencode_auth_path()?;
    let parent = path
        .parent()
        .ok_or_else(|| "invalid opencode auth path".to_string())?;
    fs::create_dir_all(parent)
        .map_err(|e| format!("could not create {}: {e}", parent.display()))?;

    let mut config = read_json_or_empty(&path, "opencode auth")?;
    let backup_path = backup(&path)?;

    let root = config
        .as_object_mut()
        .ok_or_else(|| "opencode auth root is not a JSON object".to_string())?;

    for id in OPENCODE_PROVIDER_IDS {
        let entry = root
            .entry((*id).to_string())
            .or_insert_with(|| json!({ "type": "api" }));
        let entry = entry
            .as_object_mut()
            .ok_or_else(|| format!("auth entry \"{id}\" is not a JSON object"))?;
        // Preserve an existing auth type (e.g. oauth) if the entry had one.
        entry
            .entry("type".to_string())
            .or_insert_with(|| Value::String("api".into()));
        entry.insert("key".to_string(), Value::String(token.to_string()));
    }

    write_json_atomic(&path, &config)?;
    Ok(AppliedTarget {
        agent: "opencode".into(),
        path: path.display().to_string(),
        backup_path,
    })
}

/// Apply `token` to every agent selected in `targets`.
#[tauri::command]
async fn apply_token(token: String, targets: SwitchTargets) -> Result<ApplyResult, String> {
    let token = token.trim().to_string();
    if token.is_empty() {
        return Err("the token is empty".into());
    }
    if !targets.zcode && !targets.opencode {
        return Err("no target agent selected".into());
    }

    let mut applied = Vec::new();
    if targets.zcode {
        applied.push(apply_zcode(&token)?);
    }
    if targets.opencode {
        applied.push(apply_opencode(&token)?);
    }

    Ok(ApplyResult { applied })
}

#[tauri::command]
async fn fetch_quota(token: String) -> Result<Value, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("could not build HTTP client: {e}"))?;

    let resp = client
        .get(QUOTA_URL)
        .header("Authorization", format!("Bearer {}", token.trim()))
        .header("Accept", "application/json")
        .send()
        .await
        .map_err(|e| format!("request failed: {e}"))?;

    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let body: Value =
        serde_json::from_str(&text).unwrap_or(Value::String(text.trim().to_string()));

    if !status.is_success() {
        let snippet: String = text.chars().take(300).collect();
        return Err(format!("HTTP {status}: {snippet}"));
    }
    Ok(body)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_state,
            save_state,
            target_paths,
            apply_token,
            fetch_quota
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
