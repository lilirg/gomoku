//! 五子棋竞赛版 · 本地服务管理器
//!
//! 应用启动后自动完成两件事：
//!   1. 在 8080 端口托管内置的前端构建产物（dist），供本机与局域网浏览器访问；
//!   2. 在 8787 端口启动局域网对战 WebSocket 服务，可在管理界面随时启停。
//!
//! 前端 `src/stores/lan.ts` 默认连接 `ws://<当前主机>:8787`，因此在浏览器中打开
//! `http://<主机地址>:8080` 后无需任何额外配置即可联机。

use std::collections::HashMap;
use std::sync::Arc;

use axum::{
    extract::{
        ws::{Message, WebSocket, WebSocketUpgrade},
        State as AxumState,
    },
    http::{header, StatusCode, Uri},
    response::{IntoResponse, Response},
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use rand::Rng;
use rust_embed::RustEmbed;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Emitter, Manager as _, State};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, Mutex};
use tokio_util::sync::CancellationToken;

/// 端口配置
const HTTP_PORT: u16 = 8080;
const LAN_PORT: u16 = 8787;

/// 编译期内嵌前端构建产物（`dist` 目录，相对 src-tauri）。
#[derive(RustEmbed)]
#[folder = "../dist/"]
struct Assets;

/// 静态资源处理：命中则返回；未命中回退 `index.html`（支持前端路由）。
async fn serve_asset(uri: Uri) -> Response {
    let raw = uri.path().trim_start_matches('/');
    let path = if raw.is_empty() { "index.html" } else { raw };
    if let Some(content) = Assets::get(path) {
        let mime = mime_guess::from_path(path).first_or_octet_stream();
        return (
            [(header::CONTENT_TYPE, mime.as_ref().to_string())],
            content.data.into_owned(),
        )
            .into_response();
    }
    match Assets::get("index.html") {
        Some(content) => (
            [(header::CONTENT_TYPE, "text/html; charset=utf-8".to_string())],
            content.data.into_owned(),
        )
            .into_response(),
        None => (StatusCode::NOT_FOUND, "Not Found").into_response(),
    }
}

// ---------------------------------------------------------------------------
// 局域网对战（WebSocket）服务
// ---------------------------------------------------------------------------

/// 房间与连接状态
#[derive(Default)]
struct LanHub {
    next_id: u64,
    conns: HashMap<u64, mpsc::UnboundedSender<Message>>,
    rooms: HashMap<String, Vec<u64>>,
}

type Hub = Arc<Mutex<LanHub>>;

fn gen_code(rooms: &HashMap<String, Vec<u64>>) -> String {
    const CHARS: &[u8] = b"ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    let mut rng = rand::thread_rng();
    loop {
        let code: String = (0..4)
            .map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char)
            .collect();
        if !rooms.contains_key(&code) {
            return code;
        }
    }
}

fn json_msg(v: &Value) -> Message {
    Message::Text(v.to_string())
}

async fn ws_upgrade(
    ws: WebSocketUpgrade,
    AxumState(hub): AxumState<Hub>,
) -> Response {
    ws.on_upgrade(move |socket| handle_ws(socket, hub))
}

async fn handle_ws(socket: WebSocket, hub: Hub) {
    let (mut sink, mut stream) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<Message>();

    let id = {
        let mut h = hub.lock().await;
        let id = h.next_id;
        h.next_id += 1;
        h.conns.insert(id, tx);
        id
    };

    let mut room: Option<String> = None;
    let mut side: Option<u8> = None;

    // 发送任务：把队列里的消息写回该连接
    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sink.send(msg).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = stream.next().await {
        let text = match msg {
            Message::Text(t) => t,
            Message::Close(_) => break,
            _ => continue,
        };
        let val: Value = match serde_json::from_str(&text) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let kind = val.get("t").and_then(|x| x.as_str()).unwrap_or("");

        match kind {
            "create" => {
                let mut h = hub.lock().await;
                let code = gen_code(&h.rooms);
                h.rooms.insert(code.clone(), vec![id]);
                room = Some(code.clone());
                side = Some(0);
                let payload = json!({ "t": "created", "room": code, "side": 0 });
                if let Some(s) = h.conns.get(&id) {
                    let _ = s.send(json_msg(&payload));
                }
            }
            "join" => {
                let code = val
                    .get("room")
                    .and_then(|x| x.as_str())
                    .unwrap_or("")
                    .to_uppercase();
                let mut h = hub.lock().await;
                let full = h.rooms.get(&code).map(|v| v.len() >= 2).unwrap_or(false);
                if !h.rooms.contains_key(&code) {
                    let payload = json!({ "t": "error", "message": "房间不存在" });
                    if let Some(s) = h.conns.get(&id) {
                        let _ = s.send(json_msg(&payload));
                    }
                } else if full {
                    let payload = json!({ "t": "error", "message": "房间已满" });
                    if let Some(s) = h.conns.get(&id) {
                        let _ = s.send(json_msg(&payload));
                    }
                } else {
                    if let Some(v) = h.rooms.get_mut(&code) {
                        v.push(id);
                    }
                    room = Some(code.clone());
                    side = Some(1);
                    let joined = json!({ "t": "joined", "room": code, "side": 1 });
                    if let Some(s) = h.conns.get(&id) {
                        let _ = s.send(json_msg(&joined));
                    }
                    let ids = h.rooms.get(&code).cloned().unwrap_or_default();
                    for oid in ids {
                        if oid != id {
                            if let Some(s) = h.conns.get(&oid) {
                                let _ = s.send(json_msg(&json!({ "t": "peer-joined", "side": 1 })));
                            }
                        }
                    }
                }
            }
            "action" | "control" => {
                let h = hub.lock().await;
                if let Some(code) = room.as_ref() {
                    let out = if kind == "action" {
                        json!({
                            "t": "action",
                            "action": val.get("action").cloned().unwrap_or(Value::Null)
                        })
                    } else {
                        let mut m = val.clone();
                        m["t"] = json!("control");
                        m
                    };
                    let ids = h.rooms.get(code).cloned().unwrap_or_default();
                    for oid in ids {
                        if oid != id {
                            if let Some(s) = h.conns.get(&oid) {
                                let _ = s.send(json_msg(&out));
                            }
                        }
                    }
                }
            }
            "ping" => {
                let h = hub.lock().await;
                if let Some(s) = h.conns.get(&id) {
                    let _ = s.send(json_msg(&json!({ "t": "pong" })));
                }
            }
            _ => {}
        }
    }

    // 清理连接
    send_task.abort();
    let mut h = hub.lock().await;
    h.conns.remove(&id);
    if let Some(code) = room {
        let remaining = if let Some(v) = h.rooms.get_mut(&code) {
            v.retain(|&x| x != id);
            let r = v.clone();
            if v.is_empty() {
                h.rooms.remove(&code);
            }
            r
        } else {
            Vec::new()
        };
        for oid in remaining {
            if let Some(s) = h.conns.get(&oid) {
                let _ = s.send(json_msg(&json!({
                    "t": "peer-left",
                    "side": side
                })));
            }
        }
    }
}

// ---------------------------------------------------------------------------
// 服务生命周期
// ---------------------------------------------------------------------------

struct Service {
    token: CancellationToken,
    handle: tauri::async_runtime::JoinHandle<()>,
}

struct Services {
    http: Mutex<Option<Service>>,
    lan: Mutex<Option<Service>>,
    hub: Hub,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Status {
    http_running: bool,
    http_port: u16,
    lan_running: bool,
    lan_port: u16,
    addresses: Vec<String>,
}

fn lan_addresses() -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(ip) = local_ip_address::local_ip() {
        out.push(ip.to_string());
    }
    out
}

async fn spawn_http(port: u16) -> Result<Service, String> {
    let token = CancellationToken::new();
    let app = Router::new().fallback(serve_asset);
    let listener = TcpListener::bind(("0.0.0.0", port))
        .await
        .map_err(|e| format!("无法绑定 {port} 端口: {e}"))?;
    let tk = token.clone();
    let handle = tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async move { tk.cancelled().await })
            .await;
    });
    Ok(Service { token, handle })
}

async fn spawn_lan(port: u16, hub: Hub) -> Result<Service, String> {
    let token = CancellationToken::new();
    let app = Router::new().route("/", get(ws_upgrade)).with_state(hub);
    let listener = TcpListener::bind(("0.0.0.0", port))
        .await
        .map_err(|e| format!("无法绑定 {port} 端口: {e}"))?;
    let tk = token.clone();
    let handle = tauri::async_runtime::spawn(async move {
        let _ = axum::serve(listener, app)
            .with_graceful_shutdown(async move { tk.cancelled().await })
            .await;
    });
    Ok(Service { token, handle })
}

async fn status_of(svc: &Services) -> Status {
    Status {
        http_running: svc.http.lock().await.is_some(),
        http_port: HTTP_PORT,
        lan_running: svc.lan.lock().await.is_some(),
        lan_port: LAN_PORT,
        addresses: lan_addresses(),
    }
}

#[tauri::command]
async fn get_status(state: State<'_, Services>) -> Result<Status, String> {
    Ok(status_of(state.inner()).await)
}

#[tauri::command]
async fn start_lan(app: AppHandle, state: State<'_, Services>) -> Result<Status, String> {
    {
        let mut guard = state.lan.lock().await;
        if guard.is_none() {
            let svc = spawn_lan(LAN_PORT, state.hub.clone()).await?;
            *guard = Some(svc);
        }
    }
    let st = status_of(state.inner()).await;
    let _ = app.emit("lan-status", &st);
    Ok(st)
}

#[tauri::command]
async fn stop_lan(app: AppHandle, state: State<'_, Services>) -> Result<Status, String> {
    {
        let mut guard = state.lan.lock().await;
        if let Some(svc) = guard.take() {
            svc.token.cancel();
            svc.handle.abort();
        }
    }
    let st = status_of(state.inner()).await;
    let _ = app.emit("lan-status", &st);
    Ok(st)
}

#[tauri::command]
async fn open_browser(url: String) -> Result<(), String> {
    if !url.starts_with("http://") && !url.starts_with("https://") {
        return Err("仅允许打开 http(s) 地址".into());
    }
    #[cfg(windows)]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", &url])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(&url)
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let hub: Hub = Arc::new(Mutex::new(LanHub::default()));
            app.manage(Services {
                http: Mutex::new(None),
                lan: Mutex::new(None),
                hub: hub.clone(),
            });

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let state = handle.state::<Services>();
                if let Ok(svc) = spawn_http(HTTP_PORT).await {
                    *state.http.lock().await = Some(svc);
                }
                if let Ok(svc) = spawn_lan(LAN_PORT, hub).await {
                    *state.lan.lock().await = Some(svc);
                }
                let st = status_of(&state).await;
                let _ = handle.emit("lan-status", st);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_status,
            start_lan,
            stop_lan,
            open_browser
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
