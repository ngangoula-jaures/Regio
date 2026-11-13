// Faux OBS (obs-websocket v5, sans mot de passe) pour tester la régie sans Windows.
// IMPORTANT : reproduit le comportement réel vérifié sur OBS 33 — l'événement CustomEvent
// porte directement les données envoyées (pas d'enveloppe { eventData }).
import { WebSocketServer } from "ws";

export function startFakeObs(port = 4466) {
  const calls = [];
  const state = {
    scenes: [], inputs: [], items: {}, nextId: 1,
    // Le direct : comme OBS, un débit envoyé qui grandit, et un enregistrement dont on renvoie le chemin.
    service: null, stream: null, record: null, congestion: 0, reconnecting: false, level: 0.3,
  };
  const meterClients = new Set();
  // Niveaux sonores (~20/s dans OBS) : envoyés seulement aux clients abonnés à InputVolumeMeters (1 << 16).
  const meterTimer = setInterval(() => {
    const l = state.level * (0.7 + Math.random() * 0.3);
    for (const c of meterClients) c.send(JSON.stringify({ op: 5, d: { eventType: "InputVolumeMeters", eventIntent: 1 << 16, eventData: { inputs: [{ inputName: "Micro/Aux", inputLevelsMul: [[l * 0.6, l, l], [l * 0.5, l * 0.9, l * 0.9]] }] } } }));
  }, 100);
  const clients = new Set();
  const wss = new WebSocketServer({ port });
  const items = (s) => (state.items[s] ??= []);
  const addItem = (scene, src, enabled = true) => {
    const id = state.nextId++;
    items(scene).push({ sceneItemId: id, sourceName: src, sceneItemEnabled: enabled });
    return id;
  };

  wss.on("connection", (ws) => {
    ws.send(JSON.stringify({ op: 0, d: { obsWebSocketVersion: "5.5.0", rpcVersion: 1 } }));
    ws.on("message", (raw) => {
      const m = JSON.parse(raw);
      if (m.op === 1) {
        clients.add(ws);
        if ((m.d.eventSubscriptions ?? 0) & (1 << 16)) meterClients.add(ws);
        return ws.send(JSON.stringify({ op: 2, d: { negotiatedRpcVersion: 1 } }));
      }
      if (m.op !== 6) return;
      const { requestType: t, requestId, requestData: d = {} } = m.d;
      calls.push(t);
      let r = {};
      switch (t) {
        case "GetVersion": r = { obsVersion: "33.0.1" }; break;
        case "GetVideoSettings": r = { baseWidth: 1280, baseHeight: 720, outputWidth: 1280, outputHeight: 720 }; break;
        case "GetSceneList": r = { scenes: state.scenes.map((n) => ({ sceneName: n })) }; break;
        case "CreateScene": state.scenes.push(d.sceneName); break;
        case "RemoveScene": state.scenes = state.scenes.filter((n) => n !== d.sceneName); delete state.items[d.sceneName]; break;
        case "GetInputList": r = { inputs: state.inputs }; break;
        case "GetInputSettings": r = { inputSettings: state.inputs.find((i) => i.inputName === d.inputName)?.settings ?? {} }; break;
        case "SetInputSettings": { const i = state.inputs.find((x) => x.inputName === d.inputName); if (i) i.settings = { ...i.settings, ...d.inputSettings }; break; }
        case "CreateInput":
          // Comme le vrai OBS : un nom de source déjà pris est refusé (code 601).
          if (state.inputs.some((i) => i.inputName === d.inputName)) {
            ws.send(JSON.stringify({ op: 7, d: { requestType: t, requestId, requestStatus: { result: false, code: 601, comment: "A source already exists by that input name." } } }));
            return;
          }
          state.inputs.push({ inputName: d.inputName, inputKind: d.inputKind, settings: d.inputSettings });
          r = { sceneItemId: addItem(d.sceneName, d.inputName, d.sceneItemEnabled ?? true) };
          break;
        case "RemoveInput":
          state.inputs = state.inputs.filter((i) => i.inputName !== d.inputName);
          for (const k in state.items) state.items[k] = state.items[k].filter((i) => i.sourceName !== d.inputName);
          break;
        case "GetSceneItemList": r = { sceneItems: items(d.sceneName).map((it, idx) => ({ ...it, sceneItemIndex: idx })) }; break;
        case "CreateSceneItem": r = { sceneItemId: addItem(d.sceneName, d.sourceName) }; break;
        case "SetSceneItemIndex": {
          const a = items(d.sceneName);
          const [it] = a.splice(a.findIndex((x) => x.sceneItemId === d.sceneItemId), 1);
          a.splice(d.sceneItemIndex, 0, it);
          break;
        }
        case "SetSceneItemEnabled": items(d.sceneName).find((x) => x.sceneItemId === d.sceneItemId).sceneItemEnabled = d.sceneItemEnabled; break;
        case "GetInputPropertiesListPropertyItems":
          r = { propertyItems: [{ itemName: "Cam Link 4K", itemValue: "camlink:1", itemEnabled: true }, { itemName: "Webcam intégrée HP TrueVision HD Camera", itemValue: "int:0", itemEnabled: true }] };
          break;
        case "GetMonitorList":
          r = { monitors: [{ monitorIndex: 0, monitorWidth: 1920, monitorHeight: 1080, monitorPositionX: 0, monitorPositionY: 0 }, { monitorIndex: 1, monitorWidth: 1280, monitorHeight: 720, monitorPositionX: 1920, monitorPositionY: 0 }] };
          break;
        case "OpenVideoMixProjector":
          state.projector = d.monitorIndex ?? "window";
          break;
        case "GetSourceScreenshot":
          {
            // Comme le vrai OBS : une image de la largeur demandée (ex. 480 px), en 16:9.
            const w = d.imageWidth ?? 1920, h = Math.round((w * 9) / 16);
            const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#2a3355"/></svg>`;
            r = { imageData: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64") };
          }
          break;
        case "SetStreamServiceSettings": state.service = d; break;
        case "StartStream": state.stream = { start: Date.now() }; break;
        case "StopStream": state.stream = null; break;
        case "GetStreamStatus": {
          const ms = state.stream ? Date.now() - state.stream.start : 0;
          r = { outputActive: !!state.stream, outputReconnecting: state.reconnecting, outputDuration: ms, outputBytes: Math.round((ms / 1000) * 375000), outputCongestion: state.congestion, outputSkippedFrames: 0, outputTotalFrames: Math.round(ms / 33) };
          break;
        }
        case "StartRecord": state.record = { start: Date.now() }; break;
        case "GetRecordStatus": r = { outputActive: !!state.record }; break;
        case "StopRecord": state.record = null; r = { outputPath: "C:/Users/Eglise/Videos/Regio/Culte 2026-11-16 10-02.mp4" }; break;
        case "BroadcastCustomEvent":
          for (const c of clients) c.send(JSON.stringify({ op: 5, d: { eventType: "CustomEvent", eventIntent: 1, eventData: d.eventData } }));
          break;
      }
      ws.send(JSON.stringify({ op: 7, d: { requestType: t, requestId, requestStatus: { result: true, code: 100 }, responseData: r } }));
    });
    ws.on("close", () => {
      clients.delete(ws);
      meterClients.delete(ws);
    });
  });
  return { state, calls, close: () => { clearInterval(meterTimer); wss.close(); } };
}
