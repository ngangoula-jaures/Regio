// Pilotage d'OBS Studio via obs-websocket v5.
// Toutes les scènes/sources créées ici sont préfixées « Regio - » pour ne pas toucher
// à la configuration personnelle de l'utilisateur.

import OBSWebSocket, { EventSubscription, type OBSRequestTypes } from "obs-websocket-js";
import type { BusMessage } from "../shared/content";

export const SCENE = "Regio - Sortie";
export const BACKGROUND = "Regio - Fond";
export const OVERLAY = "Regio - Contenu";
export const CAMERA_PREFIX = "Regio - Caméra";
/** Préfixe des caméras téléphone « sans application » (QR code + WebRTC). */
export const PHONE_QR_PREFIX = "Regio - Téléphone QR";

export const CANVAS_W = 1920;
export const CANVAS_H = 1080;

/**
 * Préfixe de l'ancien nom du projet (« DiffChurch »). Les scènes et sources qui le portent
 * sont supprimées à la connexion, APRÈS la mise en place de la scène Regio (jamais d'écran vide).
 */
const LEGACY_PREFIX = "DiffChurch - ";

/** Serveur de Facebook Live (RTMPS, port 443 : passe même derrière les pare-feux stricts). */
export const FACEBOOK_SERVER = "rtmps://live-api-s.facebook.com:443/rtmp/";

/** État du direct et de l'enregistrement, tel qu'OBS le donne. */
export interface LiveStatus {
  active: boolean;
  reconnecting: boolean;
  /** Durée du direct (ms). */
  durationMs: number;
  /** Octets envoyés depuis le début (pour calculer le débit). */
  bytes: number;
  /** Encombrement de la connexion, 0 (fluide) à 1 (saturée). */
  congestion: number;
  skippedFrames: number;
  totalFrames: number;
  recording: boolean;
}

export interface ConnectionSettings {
  host: string;
  port: number;
  password: string;
}

export interface Monitor {
  index: number;
  width: number;
  height: number;
  /** Écran principal de Windows (celui de l'opérateur) : jamais utilisé pour la projection automatique. */
  primary: boolean;
}

export interface VideoDevice {
  id: string;
  name: string;
}

export interface CameraSource {
  name: string;
  kind: "device" | "phone-qr" | "other";
}

/** Une source vidéo de l'utilisateur, déjà présente dans OBS (hors Regio). */
const VIDEO_INPUT_KINDS = new Set([
  "dshow_input", // Windows : webcams, boîtiers de capture HDMI, webcam USB des téléphones
  "av_capture_input", // macOS
  "av_capture_input_v2",
  "v4l2_input", // Linux
]);

export class ObsController {
  readonly ws = new OBSWebSocket();
  /** Adresse du serveur qui sert les pages à OBS (serveur Rust de l'application, ou Vite en développement). */
  localBase = window.location.origin;
  private settings: ConnectionSettings | null = null;

  async connect(s: ConnectionSettings): Promise<string> {
    this.settings = s;
    const { obsWebSocketVersion } = await this.ws.connect(`ws://${s.host}:${s.port}`, s.password || undefined, {
      // + niveaux sonores (événement fréquent, non inclus par défaut) : le vumètre.
      eventSubscriptions: EventSubscription.All | EventSubscription.InputVolumeMeters,
    });
    const { obsVersion } = await this.ws.call("GetVersion");
    return `OBS ${obsVersion} (websocket ${obsWebSocketVersion})`;
  }

  async disconnect() {
    await this.ws.disconnect();
  }

  // ---------------------------------------------------------------- Le direct

  /** Destination du direct : Facebook, avec la clé de stream de l'église. */
  async setFacebookKey(key: string): Promise<void> {
    await this.ws.call("SetStreamServiceSettings", {
      streamServiceType: "rtmp_custom",
      streamServiceSettings: { server: FACEBOOK_SERVER, key: key.trim(), use_auth: false },
    });
  }

  /** Lance le direct (et l'enregistrement sur ce PC si demandé). */
  async startLive(record: boolean): Promise<void> {
    await this.ws.call("StartStream");
    if (record) await this.ws.call("StartRecord").catch(() => {});
  }

  /** Arrête le direct et l'enregistrement ; renvoie le chemin du fichier enregistré (s'il y en a un). */
  async stopLive(): Promise<string | null> {
    await this.ws.call("StopStream").catch(() => {});
    const rec = await this.ws.call("GetRecordStatus").catch(() => null);
    if (!rec?.outputActive) return null;
    const { outputPath } = await this.ws.call("StopRecord");
    return outputPath;
  }

  async liveStatus(): Promise<LiveStatus> {
    const st = await this.ws.call("GetStreamStatus");
    const rec = await this.ws.call("GetRecordStatus").catch(() => null);
    return {
      active: st.outputActive,
      reconnecting: st.outputReconnecting,
      durationMs: st.outputDuration,
      bytes: st.outputBytes,
      congestion: st.outputCongestion,
      skippedFrames: st.outputSkippedFrames,
      totalFrames: st.outputTotalFrames,
      recording: !!rec?.outputActive,
    };
  }

  /** URL de la page d'affichage chargée par OBS comme Browser Source. */
  renderUrl(): string {
    const s = this.settings;
    if (!s) throw new Error("Non connecté");
    // OBS ne peut pas charger tauri:// : la page vient du serveur local (voir localBase).
    const params = new URLSearchParams({ port: String(s.port), password: s.password });
    return `${this.localBase}/render.html?${params}`;
  }

  // ---------- Installation de la scène de sortie ----------

  /**
   * Crée (ou répare) la scène de sortie :
   *   [haut]  Contenu (page render, transparente)
   *           Caméra(s)
   *   [bas]   Fond de secours
   * Idempotent : peut être relancé sans risque.
   */
  async ensureSetup(): Promise<void> {
    await this.trySetCanvas1080p();

    const { scenes } = await this.ws.call("GetSceneList");
    if (!scenes.some((sc) => sc.sceneName === SCENE)) {
      await this.ws.call("CreateScene", { sceneName: SCENE });
    }

    // Fond de secours : visible si aucune caméra (jamais d'écran « vide » incontrôlé).
    if (!(await this.inputExists(BACKGROUND))) {
      await this.ws.call("CreateInput", {
        sceneName: SCENE,
        inputName: BACKGROUND,
        inputKind: "color_source_v3",
        inputSettings: { color: 0xff1a1410, width: CANVAS_W, height: CANVAS_H }, // ABGR
      });
    } else {
      await this.ensureInScene(BACKGROUND);
    }

    const overlaySettings = {
      url: this.renderUrl(),
      width: CANVAS_W,
      height: CANVAS_H,
      fps_custom: false,
      shutdown: false, // garder la page vivante même si masquée
      restart_when_active: false,
      reroute_audio: false,
    };
    if (!(await this.inputExists(OVERLAY))) {
      await this.ws.call("CreateInput", {
        sceneName: SCENE,
        inputName: OVERLAY,
        inputKind: "browser_source",
        inputSettings: overlaySettings,
      });
    } else {
      const { inputSettings } = await this.ws.call("GetInputSettings", { inputName: OVERLAY });
      if ((inputSettings as { url?: string }).url !== overlaySettings.url) {
        await this.ws.call("SetInputSettings", { inputName: OVERLAY, inputSettings: overlaySettings });
      }
      await this.ensureInScene(OVERLAY);
    }

    await this.reorder();
    await this.ws.call("SetCurrentProgramScene", { sceneName: SCENE });
    await this.removeLegacy();
  }

  /** Passe OBS en 1920×1080 seulement si nécessaire : chaque changement recharge les sources. */
  /** Supprime les scènes et sources laissées par les versions « DiffChurch ». */
  private async removeLegacy() {
    const { scenes } = await this.ws.call("GetSceneList");
    for (const sc of scenes as Array<{ sceneName: string }>) {
      if (sc.sceneName.startsWith(LEGACY_PREFIX)) await this.ws.call("RemoveScene", { sceneName: sc.sceneName }).catch(() => {});
    }
    const { inputs } = await this.ws.call("GetInputList");
    for (const i of inputs as Array<{ inputName: string }>) {
      if (i.inputName.startsWith(LEGACY_PREFIX)) await this.ws.call("RemoveInput", { inputName: i.inputName }).catch(() => {});
    }
  }

  private async trySetCanvas1080p() {
    const v = await this.ws.call("GetVideoSettings");
    if (v.baseWidth === CANVAS_W && v.baseHeight === CANVAS_H && v.outputWidth === CANVAS_W && v.outputHeight === CANVAS_H) return;
    try {
      await this.ws.call("SetVideoSettings", {
        baseWidth: CANVAS_W,
        baseHeight: CANVAS_H,
        outputWidth: CANVAS_W,
        outputHeight: CANVAS_H,
      });
    } catch {
      // Refusé si une sortie (direct/enregistrement) est active : on garde la config actuelle.
    }
  }

  private async inputExists(name: string): Promise<boolean> {
    const { inputs } = await this.ws.call("GetInputList");
    return inputs.some((i) => i.inputName === name);
  }

  private async sceneItems() {
    const { sceneItems } = await this.ws.call("GetSceneItemList", { sceneName: SCENE });
    return sceneItems as Array<{ sceneItemId: number; sourceName: string; sceneItemIndex: number; sceneItemEnabled: boolean }>;
  }

  private async ensureInScene(sourceName: string): Promise<number> {
    const existing = (await this.sceneItems()).find((it) => it.sourceName === sourceName);
    if (existing) return existing.sceneItemId;
    const { sceneItemId } = await this.ws.call("CreateSceneItem", { sceneName: SCENE, sourceName });
    return sceneItemId;
  }

  /** Fond tout en bas, contenu tout en haut, caméras entre les deux. */
  private async reorder() {
    const items = await this.sceneItems();
    const bg = items.find((i) => i.sourceName === BACKGROUND);
    const ov = items.find((i) => i.sourceName === OVERLAY);
    if (bg) await this.ws.call("SetSceneItemIndex", { sceneName: SCENE, sceneItemId: bg.sceneItemId, sceneItemIndex: 0 });
    if (ov) await this.ws.call("SetSceneItemIndex", { sceneName: SCENE, sceneItemId: ov.sceneItemId, sceneItemIndex: items.length - 1 });
  }

  // ---------- Caméras ----------

  /** Liste les périphériques vidéo (webcams, boîtiers HDMI, téléphones en USB). Windows uniquement pour l'instant. */
  async listVideoDevices(): Promise<VideoDevice[]> {
    // OBS ne liste les périphériques qu'à travers une source existante : on utilise une source sonde.
    const probe = `${CAMERA_PREFIX} (sonde)`;
    if (!(await this.inputExists(probe))) {
      await this.ws.call("CreateInput", {
        sceneName: SCENE,
        inputName: probe,
        inputKind: "dshow_input",
        inputSettings: {},
        sceneItemEnabled: false,
      });
    }
    try {
      const { propertyItems } = await this.ws.call("GetInputPropertiesListPropertyItems", {
        inputName: probe,
        propertyName: "video_device_id",
      });
      return (propertyItems as Array<{ itemName: string; itemValue: string; itemEnabled: boolean }>)
        .filter((p) => p.itemEnabled && p.itemValue)
        .map((p) => ({ id: p.itemValue, name: p.itemName }));
    } finally {
      await this.ws.call("RemoveInput", { inputName: probe }).catch(() => {});
    }
  }

  /** Liste les caméras présentes dans la scène de sortie + les sources vidéo existantes de l'utilisateur. */
  async listCameraSources(): Promise<CameraSource[]> {
    const { inputs } = await this.ws.call("GetInputList");
    return (inputs as Array<{ inputName: string; inputKind: string }>)
      .filter(
        (i) =>
          (VIDEO_INPUT_KINDS.has(i.inputKind) && !i.inputName.endsWith("(sonde)")) ||
          (i.inputKind === "browser_source" && i.inputName.startsWith(PHONE_QR_PREFIX)),
      )
      .map((i) => ({
        name: i.inputName,
        kind: i.inputName.startsWith(PHONE_QR_PREFIX)
          ? "phone-qr"
          : i.inputName.startsWith(CAMERA_PREFIX)
            ? "device"
            : "other",
      }));
  }

  /** Crée (ou met à jour) une source caméra pour un périphérique ; l'affiche si `activate`. */
  async useVideoDevice(device: VideoDevice, activate = true): Promise<string> {
    const name = `${CAMERA_PREFIX} : ${device.name}`;
    const settings = { video_device_id: device.id, active: true, deactivate_when_not_showing: false };
    if (!(await this.inputExists(name))) {
      await this.ws.call("CreateInput", { sceneName: SCENE, inputName: name, inputKind: "dshow_input", inputSettings: settings, sceneItemEnabled: false });
    } else {
      await this.ws.call("SetInputSettings", { inputName: name, inputSettings: settings });
    }
    if (activate) await this.activateCamera(name);
    return name;
  }

  /**
   * Téléphone « sans application » : OBS charge une page qui reçoit la caméra du téléphone en WebRTC.
   * Le téléphone ouvre simplement une page web (QR code). Le son du téléphone arrive dans OBS.
   */
  async usePhoneQr(cam = "1", activate = true): Promise<string> {
    const name = `${PHONE_QR_PREFIX} ${cam}`;
    const settings = {
      url: `${this.localBase}/receiver.html?cam=${encodeURIComponent(cam)}`,
      width: CANVAS_W,
      height: CANVAS_H,
      fps_custom: false,
      shutdown: false,
      restart_when_active: false,
      reroute_audio: true, // le son du téléphone apparaît dans le mélangeur audio d'OBS
    };
    if (!(await this.inputExists(name))) {
      await this.ws.call("CreateInput", { sceneName: SCENE, inputName: name, inputKind: "browser_source", inputSettings: settings, sceneItemEnabled: false });
    } else {
      const { inputSettings } = await this.ws.call("GetInputSettings", { inputName: name });
      // Ne pas réécrire l'adresse si elle est identique : cela rechargerait la page et couperait le téléphone.
      if ((inputSettings as { url?: string }).url !== settings.url) await this.ws.call("SetInputSettings", { inputName: name, inputSettings: settings });
    }
    if (activate) await this.activateCamera(name);
    return name;
  }

  /** Masque toutes les caméras : le fond de secours s'affiche. */
  async deactivateCameras(): Promise<void> {
    for (const it of await this.sceneItems()) {
      if (it.sourceName === BACKGROUND || it.sourceName === OVERLAY || !it.sceneItemEnabled) continue;
      await this.ws.call("SetSceneItemEnabled", { sceneName: SCENE, sceneItemId: it.sceneItemId, sceneItemEnabled: false });
    }
  }

  /** Vignette d'une source (aperçu d'une caméra). */
  async sourceShot(sourceName: string, width = 480): Promise<string> {
    const { imageData } = await this.ws.call("GetSourceScreenshot", { sourceName, imageFormat: "jpg", imageWidth: width, imageCompressionQuality: 70 });
    return imageData;
  }

  /** Affiche cette caméra (ajustée au cadre 16:9) et masque les autres caméras de la scène. */
  async activateCamera(sourceName: string): Promise<void> {
    const itemId = await this.ensureInScene(sourceName);
    await this.ws.call("SetSceneItemTransform", {
      sceneName: SCENE,
      sceneItemId: itemId,
      sceneItemTransform: {
        positionX: 0,
        positionY: 0,
        alignment: 5, // haut-gauche
        boundsType: "OBS_BOUNDS_SCALE_INNER", // garder les proportions (téléphone vertical = bandes)
        boundsAlignment: 0, // centré
        boundsWidth: CANVAS_W,
        boundsHeight: CANVAS_H,
      },
    });
    for (const it of await this.sceneItems()) {
      if (it.sourceName === BACKGROUND || it.sourceName === OVERLAY) continue;
      const enabled = it.sourceName === sourceName;
      if (it.sceneItemEnabled !== enabled) {
        await this.ws.call("SetSceneItemEnabled", { sceneName: SCENE, sceneItemId: it.sceneItemId, sceneItemEnabled: enabled });
      }
    }
    await this.reorder();
  }

  // ---------- Écrans / projection ----------

  async listMonitors(): Promise<Monitor[]> {
    const { monitors } = await this.ws.call("GetMonitorList");
    return (monitors as Array<{ monitorIndex: number; monitorWidth: number; monitorHeight: number; monitorPositionX: number; monitorPositionY: number }>).map((m) => ({
      index: m.monitorIndex,
      width: m.monitorWidth,
      height: m.monitorHeight,
      primary: m.monitorPositionX === 0 && m.monitorPositionY === 0,
    }));
  }

  /** Ouvre la sortie (programme) en plein écran sur le moniteur choisi (ex. projecteur HDMI). */
  async project(monitorIndex: number): Promise<void> {
    await this.ws.call("OpenVideoMixProjector", {
      videoMixType: "OBS_WEBSOCKET_VIDEO_MIX_TYPE_PROGRAM",
      monitorIndex,
    });
  }

  /** Projection dans une fenêtre (pour tester sans second écran). */
  async projectWindowed(): Promise<void> {
    await this.ws.call("OpenVideoMixProjector", { videoMixType: "OBS_WEBSOCKET_VIDEO_MIX_TYPE_PROGRAM" });
  }

  /** Recharge la page de sortie dans OBS (vide le cache). */
  async reloadOverlay(): Promise<void> {
    await this.ws.call("PressInputPropertiesButton", { inputName: OVERLAY, propertyName: "refreshnocache" });
  }

  /** URL actuellement configurée dans la source « Contenu » (diagnostic). */
  async overlayUrl(): Promise<string> {
    const { inputSettings } = await this.ws.call("GetInputSettings", { inputName: OVERLAY });
    return String((inputSettings as { url?: string }).url ?? "");
  }

  // ---------- Contenu & aperçu ----------

  async broadcast(message: BusMessage): Promise<void> {
    type EventData = OBSRequestTypes["BroadcastCustomEvent"]["eventData"];
    await this.ws.call("BroadcastCustomEvent", { eventData: message as unknown as EventData });
  }

  /** Image miniature de ce qui sort réellement (pour l'aperçu dans la régie). */
  async screenshot(width = 640): Promise<string> {
    const { imageData } = await this.ws.call("GetSourceScreenshot", {
      sourceName: SCENE,
      imageFormat: "jpg",
      imageWidth: width,
      imageCompressionQuality: 70,
    });
    return imageData;
  }
}
