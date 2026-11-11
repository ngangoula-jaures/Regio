// Faux OBS (obs-websocket v5, sans mot de passe) pour tester la régie sans Windows.
// IMPORTANT : reproduit le comportement réel vérifié sur OBS 33 — l'événement CustomEvent
// porte directement les données envoyées (pas d'enveloppe { eventData }).
import { WebSocketServer } from "ws";

export function startFakeObs(port = 4466) {
  const calls = [];
  const state = { scenes: [], inputs: [], items: {}, nextId: 1 };
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
        case "GetInputList": r = { inputs: state.inputs }; break;
        case "GetInputSettings": r = { inputSettings: state.inputs.find((i) => i.inputName === d.inputName)?.settings ?? {} }; break;
        case "SetInputSettings": { const i = state.inputs.find((x) => x.inputName === d.inputName); if (i) i.settings = { ...i.settings, ...d.inputSettings }; break; }
        case "CreateInput":
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
          r = { propertyItems: [{ itemName: "Cam Link 4K", itemValue: "camlink:1", itemEnabled: true }, { itemName: "Webcam intégrée", itemValue: "int:0", itemEnabled: true }] };
          break;
        case "GetMonitorList":
          r = { monitors: [{ monitorIndex: 0, monitorWidth: 1920, monitorHeight: 1080, monitorPositionX: 0 }, { monitorIndex: 1, monitorWidth: 1280, monitorHeight: 720, monitorPositionX: 1920 }] };
          break;
        case "GetSourceScreenshot":
          r = { imageData: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==" };
          break;
        case "BroadcastCustomEvent":
          for (const c of clients) c.send(JSON.stringify({ op: 5, d: { eventType: "CustomEvent", eventIntent: 1, eventData: d.eventData } }));
          break;
      }
      ws.send(JSON.stringify({ op: 7, d: { requestType: t, requestId, requestStatus: { result: true, code: 100 }, responseData: r } }));
    });
    ws.on("close", () => clients.delete(ws));
  });
  return { state, calls, close: () => wss.close() };
}
