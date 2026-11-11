
export function horizon_download(name, bytes) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes.slice()]));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
export function horizon_clipboard_image(png) {
    try {
        const item = new ClipboardItem({ "image/png": new Blob([png.slice()], { type: "image/png" }) });
        navigator.clipboard.write([item]).catch(() => {});
        return true;
    } catch (e) {
        return false;
    }
}
let recorder = null;
let recordState = 0;
let recordError = "";
let recordStart = 0;
export function horizon_recorder_supported() {
    return !!(globalThis.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
}
export function horizon_recorder_state() {
    return recordState;
}
export function horizon_recorder_error() {
    return recordError;
}
export function horizon_recorder_elapsed_ms() {
    return recordState === 2 ? performance.now() - recordStart : 0;
}
export function horizon_recorder_stop() {
    if (recorder && recorder.state !== "inactive") recorder.stop();
}
export function horizon_recorder_start(fps, kbps, gameVolume, mic, micVolume, name) {
    if (recordState !== 0) return;
    recordState = 1;
    recordError = "";
    (async () => {
        const canvas = document.querySelector("canvas");
        const video = canvas.captureStream(fps);
        const tracks = [...video.getVideoTracks()];
        const master = (globalThis.horizonAudioMasters || [])[0];
        let micStream = null;
        if (master) {
            const ctx = master.context;
            const out = ctx.createMediaStreamDestination();
            const game = ctx.createGain();
            game.gain.value = gameVolume;
            master.connect(game);
            game.connect(out);
            if (mic) {
                try {
                    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
                    const source = ctx.createMediaStreamSource(micStream);
                    const gain = ctx.createGain();
                    gain.gain.value = micVolume;
                    source.connect(gain);
                    gain.connect(out);
                } catch (e) {
                    recordError = "The microphone wasn't allowed: recording without it.";
                }
            }
            tracks.push(...out.stream.getAudioTracks());
        }
        const types = ["video/mp4;codecs=avc1,mp4a", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"];
        const type = types.find((t) => MediaRecorder.isTypeSupported(t)) || "";
        const chunks = [];
        recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: type, videoBitsPerSecond: kbps * 1000 });
        recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
        recorder.onstop = () => {
            const ext = (recorder.mimeType || type).startsWith("video/mp4") ? ".mp4" : ".webm";
            const a = document.createElement("a");
            a.href = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || type }));
            a.download = name + ext;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 60000);
            if (micStream) micStream.getTracks().forEach((t) => t.stop());
            video.getTracks().forEach((t) => t.stop());
            recorder = null;
            recordState = 0;
        };
        recorder.start(1000);
        recordStart = performance.now();
        recordState = 2;
    })().catch((e) => {
        recordError = "Recording didn't start: " + e;
        recordState = 0;
    });
}
export function horizon_utc_offset_ms() {
    return -new Date().getTimezoneOffset() * 60000;
}
export function horizon_open_url(url) {
    window.open(url, "_blank", "noopener,noreferrer");
}
export function horizon_console(level, message) {
    if (level <= 1) console.error(message);
    else if (level === 2) console.warn(message);
    else console.log(message);
}

let wantLock = false;
let lostLock = false;
let hooked = null;
export function horizon_pointer_lock_lost() {
    const lost = lostLock;
    lostLock = false;
    return lost;
}
function lock(canvas) {
    // Refused outside a click or key press: by a rejected promise, or a throw.
    try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => {});
    } catch (e) {}
}
export function horizon_pointer_locked() {
    const canvas = document.querySelector("canvas");
    return !!canvas && document.pointerLockElement === canvas;
}
export function horizon_pointer_lock(want) {
    wantLock = want;
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    if (hooked === null) {
        // Escape while the pointer is locked only releases the lock: the page
        // never sees the key, so the game hears of it as a lost lock.
        document.addEventListener("pointerlockchange", () => {
            if (wantLock && !document.pointerLockElement) lostLock = true;
        });
    }
    if (hooked !== canvas) {
        hooked = canvas;
        // Browsers refuse the lock asked with Escape (no user gesture), and for
        // a moment after Escape let it go: the game then waits for the next
        // click or key. The click that takes the lock only takes the lock, so
        // it doesn't swing a sword.
        let swallowUp = false;
        window.addEventListener("pointerdown", (e) => {
            if (wantLock && e.target === canvas && document.pointerLockElement !== canvas) {
                lock(canvas);
                swallowUp = true;
                e.stopImmediatePropagation();
            }
        }, true);
        window.addEventListener("pointerup", (e) => {
            if (swallowUp) {
                swallowUp = false;
                e.stopImmediatePropagation();
            }
        }, true);
        window.addEventListener("keydown", (e) => {
            if (wantLock && e.key !== "Escape" && document.pointerLockElement !== canvas) lock(canvas);
        }, true);
    }
    if (want) {
        if (document.pointerLockElement !== canvas) lock(canvas);
    } else if (document.pointerLockElement) {
        document.exitPointerLock();
    }
}

let picked = null;
export function horizon_pick_file(kind, accept) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.onchange = async () => {
        const file = input.files && input.files[0];
        if (file) picked = [kind, new Uint8Array(await file.arrayBuffer()), file.name];
    };
    input.click();
}
export function horizon_take_picked() {
    const p = picked;
    picked = null;
    return p;
}
export function horizon_picked_kind() {
    return picked ? picked[0] : undefined;
}
